"""
PaddleOCR pipeline with structured logging for failure-pattern analysis.

Goal: after a week of real usage, you should be able to answer:
  - What % of screenshots fall below the confidence threshold?
  - Is failure correlated with dark mode? Low resolution? Long text?
  - Are URLs specifically getting mangled even when overall confidence is OK?

This logs every screenshot's outcome to a JSONL file (or swap the
write_log function for a DB insert / Modal volume write — whatever
fits your existing storage).
"""

import time
import uuid
import json
import re
from dataclasses import dataclass, asdict
from typing import Optional


LOG_PATH = "/data/ocr_logs.jsonl"  # point this at a Modal volume in prod
CONFIDENCE_THRESHOLD = 0.75


@dataclass
class OCRLogEntry:
    id: str
    timestamp: float
    image_bytes_size: int
    was_dark_mode: bool
    avg_confidence: float
    min_line_confidence: float
    num_lines_detected: int
    text_length: int
    urls_found: int
    url_strings: list
    urls_needing_review: int
    passed_threshold: bool
    full_text_preview: str  # first 200 chars, for spot-checking without storing everything
    error: Optional[str] = None


def write_log(entry: OCRLogEntry):
    """Append one log line. Swap this for a DB/volume write in prod."""
    try:
        with open(LOG_PATH, "a") as f:
            f.write(json.dumps(asdict(entry)) + "\n")
    except Exception as e:
        # Logging should never break the pipeline itself
        print(f"[ocr_logging] failed to write log: {e}")


def detect_dark_mode(img) -> bool:
    import cv2
    import numpy as np
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return bool(np.mean(gray) < 128)


def preprocess_whatsapp(img):
    import cv2
    import numpy as np

    is_dark = detect_dark_mode(img)
    if is_dark:
        img = cv2.bitwise_not(img)

    img = cv2.fastNlMeansDenoisingColored(img, None, 6, 6, 7, 21)

    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    img = cv2.filter2D(img, -1, kernel)

    return img, is_dark


URL_LINE_CONFIDENCE_THRESHOLD = 0.95  # tighter than the batch threshold — URLs need near-perfect reads
_URL_PATTERN = re.compile(r'https?://[^\s]+|www\.[^\s]+|youtu\.be/[^\s]+')
_URL_START_PATTERN = re.compile(r'(https?://\S+|www\.\S+)$')
_CONTINUATION_PATTERN = re.compile(r'^[A-Za-z0-9_=&%+./-]+$')
_TIME_PATTERN = re.compile(r'^\d{1,2}:\d{2}$')


def merge_and_extract_urls(lines: list, confidences: list) -> list:
    """
    PaddleOCR returns one line per detected text region. A long URL often
    gets split across two+ lines (e.g. the path on one line, the ?query=
    on the next) because the line break in the source image cuts it.
    A plain regex over the joined text misses everything after that break.

    This walks the lines, and when a line looks like a truncated URL
    (ends in / ? & =), it merges forward into subsequent lines that look
    like continuations (path/query characters, no spaces) until it hits
    something that looks like a new field (a timestamp, "am"/"pm", etc).

    Each merged URL also carries the MINIMUM confidence of the lines that
    built it — a URL is only as trustworthy as its least-confident
    fragment. This is the real signal for "might be corrupted", not
    guessing from which characters are visually ambiguous.
    """
    results = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        conf = confidences[i] if i < len(confidences) else 1.0
        m = _URL_START_PATTERN.search(line)

        if m and line.rstrip().endswith(('/', '?', '&', '=')):
            combined = line
            combined_confs = [conf]
            j = i + 1
            while j < n:
                nxt = lines[j].strip()
                if not nxt or _TIME_PATTERN.match(nxt) or nxt.lower() in ('am', 'pm'):
                    break
                if not _CONTINUATION_PATTERN.match(nxt):
                    break
                combined += nxt
                combined_confs.append(confidences[j] if j < len(confidences) else 1.0)
                j += 1
            found = _URL_PATTERN.findall(combined)
            for url in found:
                results.append({
                    "url": url,
                    "min_confidence": round(min(combined_confs), 4),
                    "needs_review": min(combined_confs) < URL_LINE_CONFIDENCE_THRESHOLD,
                })
            i = j
        else:
            found = _URL_PATTERN.findall(line)
            for url in found:
                results.append({
                    "url": url,
                    "min_confidence": round(conf, 4),
                    "needs_review": conf < URL_LINE_CONFIDENCE_THRESHOLD,
                })
            i += 1

    return results


def extract_urls(text: str) -> list:
    """Kept for backwards compat / simple cases where line confidence isn't available."""
    return _URL_PATTERN.findall(text)


class OCRModel:
    """
    Same shape as the Modal-deployed class from before, with logging
    wired into the extract() method. In actual Modal code this would
    keep the @app.cls / @modal.enter / @modal.method decorators —
    omitted here so this file can be unit-tested without Modal installed.
    """

    def load(self):
        from paddleocr import PaddleOCR
        # PaddleOCR 3.x API: use_angle_cls/show_log are gone.
        # use_textline_orientation replaces use_angle_cls.
        self.ocr = PaddleOCR(use_textline_orientation=True, lang='en')

    def extract(self, image_bytes: bytes) -> dict:
        import numpy as np
        import cv2

        entry_id = str(uuid.uuid4())
        start = time.time()

        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                raise ValueError("cv2 failed to decode image bytes")

            img, was_dark = preprocess_whatsapp(img)

            # PaddleOCR 3.x: .predict() instead of .ocr(), returns a list of
            # result objects (one per image) with dict-like access via keys
            # such as 'rec_texts' and 'rec_scores' instead of nested [box,(text,conf)] tuples.
            results = self.ocr.predict(img)

            if not results or len(results) == 0:
                log = OCRLogEntry(
                    id=entry_id,
                    timestamp=start,
                    image_bytes_size=len(image_bytes),
                    was_dark_mode=was_dark,
                    avg_confidence=0.0,
                    min_line_confidence=0.0,
                    num_lines_detected=0,
                    text_length=0,
                    urls_found=0,
                    url_strings=[],
                    urls_needing_review=0,
                    passed_threshold=False,
                    full_text_preview="",
                )
                write_log(log)
                return {"id": entry_id, "text": "", "confidence": 0.0, "urls": [], "passed_threshold": False}

            res = results[0]
            lines = list(res.get("rec_texts", []))
            confidences = list(res.get("rec_scores", []))

            if not lines:
                log = OCRLogEntry(
                    id=entry_id,
                    timestamp=start,
                    image_bytes_size=len(image_bytes),
                    was_dark_mode=was_dark,
                    avg_confidence=0.0,
                    min_line_confidence=0.0,
                    num_lines_detected=0,
                    text_length=0,
                    urls_found=0,
                    url_strings=[],
                    urls_needing_review=0,
                    passed_threshold=False,
                    full_text_preview="",
                )
                write_log(log)
                return {"id": entry_id, "text": "", "confidence": 0.0, "urls": [], "passed_threshold": False}

            avg_confidence = sum(confidences) / len(confidences)
            min_confidence = min(confidences)
            full_text = "\n".join(lines)
            url_results = merge_and_extract_urls(lines, confidences)
            urls_needing_review = sum(1 for u in url_results if u["needs_review"])
            passed = avg_confidence >= CONFIDENCE_THRESHOLD

            log = OCRLogEntry(
                id=entry_id,
                timestamp=start,
                image_bytes_size=len(image_bytes),
                was_dark_mode=was_dark,
                avg_confidence=round(avg_confidence, 4),
                min_line_confidence=round(min_confidence, 4),
                num_lines_detected=len(lines),
                text_length=len(full_text),
                urls_found=len(url_results),
                url_strings=[u["url"] for u in url_results],
                urls_needing_review=urls_needing_review,
                passed_threshold=passed,
                full_text_preview=full_text[:200],
            )
            write_log(log)

            return {
                "id": entry_id,
                "text": full_text,
                "confidence": avg_confidence,
                "urls": url_results,  # list of {url, min_confidence, needs_review}
                "passed_threshold": passed,
            }

        except Exception as e:
            log = OCRLogEntry(
                id=entry_id,
                timestamp=start,
                image_bytes_size=len(image_bytes),
                was_dark_mode=False,
                avg_confidence=0.0,
                min_line_confidence=0.0,
                num_lines_detected=0,
                text_length=0,
                urls_found=0,
                url_strings=[],
                urls_needing_review=0,
                passed_threshold=False,
                full_text_preview="",
                error=str(e),
            )
            write_log(log)
            return {"id": entry_id, "text": "", "confidence": 0.0, "urls": [], "passed_threshold": False, "error": str(e)}
