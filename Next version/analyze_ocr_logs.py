"""
Run this after a week of real usage:

    python analyze_ocr_logs.py

Reads /data/ocr_logs.jsonl and prints a breakdown so you can answer:
  - What % failed the confidence threshold?
  - Is failure correlated with dark mode?
  - Are URLs surviving even on passing screenshots?
  - Are failures clustered in image-size buckets (compression proxy)?

This is the data that tells you whether Florence-2 / Qwen2-VL is worth
adding, or whether PaddleOCR's failure tail is small enough to just
handle with the "send as text" fallback.
"""

import json
from collections import defaultdict

LOG_PATH = "/data/ocr_logs.jsonl"


def load_entries(path=LOG_PATH):
    entries = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries


def bucket_by_size(size_bytes):
    kb = size_bytes / 1024
    if kb < 50:
        return "<50KB"
    elif kb < 150:
        return "50-150KB"
    elif kb < 400:
        return "150-400KB"
    else:
        return ">400KB"


def main():
    entries = load_entries()
    total = len(entries)
    if total == 0:
        print("No log entries found yet. Run the pipeline on some real screenshots first.")
        return

    passed = sum(1 for e in entries if e.get("passed_threshold"))
    failed = total - passed
    errors = sum(1 for e in entries if e.get("error"))

    print(f"=== OCR Pipeline Report ({total} screenshots) ===\n")
    print(f"Passed threshold:  {passed} ({passed/total*100:.1f}%)")
    print(f"Failed threshold:  {failed} ({failed/total*100:.1f}%)")
    print(f"Hard errors:       {errors} ({errors/total*100:.1f}%)\n")

    # Dark mode correlation
    dark = [e for e in entries if e.get("was_dark_mode")]
    light = [e for e in entries if not e.get("was_dark_mode")]
    if dark:
        dark_pass_rate = sum(1 for e in dark if e.get("passed_threshold")) / len(dark) * 100
        print(f"Dark mode screenshots:  {len(dark)} total, {dark_pass_rate:.1f}% passed")
    if light:
        light_pass_rate = sum(1 for e in light if e.get("passed_threshold")) / len(light) * 100
        print(f"Light mode screenshots: {len(light)} total, {light_pass_rate:.1f}% passed")

    # URL survival on passing screenshots
    passing_with_text = [e for e in entries if e.get("passed_threshold") and e.get("text_length", 0) > 0]
    with_urls = sum(1 for e in passing_with_text if e.get("urls_found", 0) > 0)
    print(f"\nPassing screenshots with URLs detected: {with_urls}/{len(passing_with_text)}")

    total_urls = sum(e.get("urls_found", 0) for e in entries)
    flagged_urls = sum(e.get("urls_needing_review", 0) for e in entries)
    if total_urls > 0:
        print(f"URLs flagged for review (low-confidence fragment): {flagged_urls}/{total_urls} "
              f"({flagged_urls/total_urls*100:.1f}%)")
        print("  -> These are URLs where the OCR confidence on at least one line was below 0.95.")
        print("     A flagged URL passing the overall screenshot threshold does NOT mean the URL is safe to fetch blind.")

    # Size bucket breakdown (proxy for compression / resolution issues)
    size_buckets = defaultdict(lambda: {"total": 0, "passed": 0})
    for e in entries:
        b = bucket_by_size(e.get("image_bytes_size", 0))
        size_buckets[b]["total"] += 1
        if e.get("passed_threshold"):
            size_buckets[b]["passed"] += 1

    print("\nPass rate by image size:")
    for bucket, stats in sorted(size_buckets.items()):
        rate = stats["passed"] / stats["total"] * 100 if stats["total"] else 0
        print(f"  {bucket:>12}: {stats['passed']}/{stats['total']} ({rate:.1f}%)")

    # Lowest-confidence failures, for spot-checking
    failures = sorted(
        [e for e in entries if not e.get("passed_threshold") and not e.get("error")],
        key=lambda e: e.get("avg_confidence", 0),
    )[:10]

    if failures:
        print("\n10 worst failures (spot-check these manually):")
        for e in failures:
            print(
                f"  id={e['id'][:8]} conf={e.get('avg_confidence', 0):.2f} "
                f"dark={e.get('was_dark_mode')} size={e.get('image_bytes_size', 0)//1024}KB "
                f"preview={e.get('full_text_preview', '')[:60]!r}"
            )

    print("\n--- Decision guide ---")
    if failed / total < 0.10:
        print("Failure rate <10%: PaddleOCR is doing its job. Keep the 'send as text' fallback, don't add a heavier model.")
    elif failed / total < 0.20:
        print("Failure rate 10-20%: borderline. Check if failures cluster (dark mode / small size) — a targeted fix")
        print("(e.g. better dark-mode inversion) may be cheaper than swapping the whole model.")
    else:
        print("Failure rate >20%: worth benchmarking Florence-2 or Qwen2-VL on the failing subset specifically,")
        print("rather than swapping the whole pipeline. Use the failure id list above as your test set.")


if __name__ == "__main__":
    main()
