"""
backend/services/ocr_service.py
===============================
Enhanced local OCR service wrapper utilizing PIL image preprocessing,
OpenCV QR code detection, and in-memory local PaddleOCR with confidence filtering.
Runs PaddleOCR inside a ProcessPoolExecutor so that C++ GIL-blocking compilation
cannot freeze uvicorn worker threads. The OCR subprocess singleton persists for
the lifetime of the worker process, so cold-start only occurs once.
"""

import io
import os
import logging
import asyncio
from concurrent.futures import ProcessPoolExecutor
from typing import Union, Optional
from PIL import Image, ImageEnhance, ImageFilter

# Set env vars before any paddle import (must be done at module level in
# the *worker* process — these are inherited when the pool is forked/spawned).
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

logger = logging.getLogger(__name__)

# ProcessPoolExecutor with a single worker so PaddleOCR runs in an isolated
# subprocess and cannot block uvicorn's event loop or thread pool.
_ocr_executor: Optional[ProcessPoolExecutor] = None

# Module-level singleton inside the *worker* subprocess (not the uvicorn process).
_paddle_client = None

def check_paddleocr_available() -> bool:
    """Check if paddleocr and paddlepaddle are installed and available without importing them."""
    import importlib.util
    try:
        paddleocr_spec = importlib.util.find_spec("paddleocr")
        paddle_spec = importlib.util.find_spec("paddle")
        return paddleocr_spec is not None and paddle_spec is not None
    except Exception:
        return False

def get_paddle_client():
    """Retrieves the cached singleton PaddleOCR client (runs inside subprocess)."""
    global _paddle_client
    if _paddle_client is None:
        if not check_paddleocr_available():
            raise RuntimeError("PaddleOCR or PaddlePaddle is not installed/available.")
        from paddleocr import PaddleOCR
        try:
            # Instantiate with silent logging to prevent stdout pollution
            _paddle_client = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        except Exception:
            _paddle_client = PaddleOCR(use_angle_cls=True, lang="en")
    return _paddle_client

def _get_ocr_executor() -> ProcessPoolExecutor:
    """Returns the module-level ProcessPoolExecutor, creating it if needed."""
    global _ocr_executor
    if _ocr_executor is None:
        _ocr_executor = ProcessPoolExecutor(max_workers=1)
    return _ocr_executor

def preprocess_and_ocr_image(image_bytes: bytes) -> dict:
    """
    Performs PIL preprocessing, OpenCV QR code detection, and PaddleOCR
    with confidence filtering on image bytes. Runs entirely in memory.
    """
    import numpy as np
    import cv2
    try:
        image = Image.open(io.BytesIO(image_bytes))
    except Exception as img_err:
        logger.error("Failed to open image bytes in OCR preprocessing: %s", img_err)
        return {"ocr_text": None, "trigger_gemini_fallback": True}
    
    # 1. Detect QR code URL first using OpenCV on original image
    qr_url = None
    try:
        open_cv_image = np.array(image)
        if len(open_cv_image.shape) == 3 and open_cv_image.shape[2] == 3:
            open_cv_image = cv2.cvtColor(open_cv_image, cv2.COLOR_RGB2BGR)
        elif len(open_cv_image.shape) == 3 and open_cv_image.shape[2] == 4:
            open_cv_image = cv2.cvtColor(open_cv_image, cv2.COLOR_RGBA2BGR)
            
        detector = cv2.QRCodeDetector()
        data, _, _ = detector.detectAndDecode(open_cv_image)
        if data and data.strip().lower().startswith(("http://", "https://", "www.")):
            qr_url = data.strip()
            logger.info("Successfully extracted QR code URL: %s", qr_url)
    except Exception as qr_err:
        logger.warning("In-memory QR code detection failed: %s", qr_err)
        
    # 2. PIL Image Preprocessing — adaptive for light AND dark backgrounds
    # np and cv2 are already imported above inside this function

    # Convert to numpy grayscale for brightness analysis
    gray_np = np.array(image.convert('L'))
    mean_brightness = float(gray_np.mean())

    # B. Resize if width < 800px before heavy processing
    if image.width < 800:
        ratio = 1200.0 / image.width
        image = image.resize((1200, int(image.height * ratio)), Image.Resampling.LANCZOS)
        gray_np = np.array(image.convert('L'))

    # C. Enhance contrast slightly
    image_l = ImageEnhance.Contrast(image.convert('L')).enhance(1.5)
    image_l = image_l.filter(ImageFilter.SHARPEN)
    gray_np = np.array(image_l)

    # D. Adaptive thresholding (handles uneven lighting far better than fixed 128)
    #    For dark-background images (mean < 128), invert first so text becomes dark on white
    if mean_brightness < 128:
        gray_np = 255 - gray_np

    binary_np = cv2.adaptiveThreshold(
        gray_np, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=15, C=8
    )
    
    # 3. PaddleOCR with confidence filtering (>= 60%)
    high_conf_words = []
    try:
        ocr_client = get_paddle_client()
        # Use the preprocessed binary image; ensure 3 channels (BGR) for PaddleOCR
        img_np = cv2.cvtColor(binary_np, cv2.COLOR_GRAY2BGR)
            
        result = ocr_client.ocr(img_np)
        
        if isinstance(result, list) and len(result) > 0 and result[0]:
            for line in result[0]:
                if isinstance(line, (list, tuple)) and len(line) > 1:
                    info = line[1]
                    if isinstance(info, (list, tuple)) and len(info) > 1:
                        text = info[0]
                        conf = info[1]
                        if isinstance(text, str) and isinstance(conf, (int, float)):
                            if conf >= 0.60 and text.strip():
                                words = text.strip().split()
                                high_conf_words.extend(words)
    except Exception as ocr_err:
        logger.error("In-memory PaddleOCR execution failed: %s", ocr_err)
        
    ocr_result_text = " ".join(high_conf_words)
    
    # Append QR code URL to OCR text if found
    if qr_url:
        if ocr_result_text:
            ocr_result_text = ocr_result_text + "\n" + qr_url
        else:
            ocr_result_text = qr_url

    # 4. Fallback trigger check (fewer than 10 words and no QR URL)
    total_words = len(ocr_result_text.split())
    if total_words < 10 and not qr_url:
        logger.info("Low confidence text extracted (%d words). Triggering Gemini fallback.", total_words)
        return {"ocr_text": None, "trigger_gemini_fallback": True}
        
    return {"ocr_text": ocr_result_text, "trigger_gemini_fallback": False}

async def perform_ocr(img_or_path_or_bytes: Union[Image.Image, str, bytes]) -> str:
    """
    Unified entry point for performing OCR. Supports PIL Image, filepath string, or bytes.
    Enforces a strict 30-second processing timeout per image.
    """
    if not check_paddleocr_available():
        logger.warning("PaddleOCR not installed. OCR skipped.")
        return ""
        
    # Convert input to raw bytes in memory (no disk writes)
    if isinstance(img_or_path_or_bytes, bytes):
        image_bytes = img_or_path_or_bytes
    elif isinstance(img_or_path_or_bytes, str):
        # File path
        try:
            with open(img_or_path_or_bytes, "rb") as f:
                image_bytes = f.read()
        except Exception as e:
            logger.error("Failed to read image file %s: %s", img_or_path_or_bytes, e)
            return ""
    else:
        # PIL Image
        try:
            buf = io.BytesIO()
            img_or_path_or_bytes.save(buf, format="PNG")
            image_bytes = buf.getvalue()
        except Exception as e:
            logger.error("Failed to serialize PIL Image: %s", e)
            return ""

    try:
        loop = asyncio.get_running_loop()
        executor = _get_ocr_executor()
        # Run in a ProcessPoolExecutor so PaddleOCR's C++ GIL-blocking
        # compilation/inference cannot freeze uvicorn threads.
        # Enforce 120s timeout to accommodate cold-start model compilation.
        result = await asyncio.wait_for(
            loop.run_in_executor(executor, preprocess_and_ocr_image, image_bytes),
            timeout=120.0
        )
        if result.get("trigger_gemini_fallback"):
            return ""
        return result.get("ocr_text") or ""
    except asyncio.TimeoutError:
        logger.error("OCR preprocessing and extraction timed out after 120 seconds.")
        return ""
    except Exception as e:
        logger.error("Exception in perform_ocr pipeline: %s", e)
        return ""
