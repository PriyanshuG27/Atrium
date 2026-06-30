"""
backend/services/ocr_service.py
===============================
Local PaddleOCR service wrapper.
Replaces pytesseract with PaddleOCR for scanning PDFs and images.
Runs local PaddleOCR inside an isolated subprocess to prevent C++ level FD hijacking
and GIL thread deadlocks from muting or breaking Uvicorn's logging output.
"""

import os
import sys
import json
import logging
import asyncio

logger = logging.getLogger(__name__)

def check_paddleocr_available() -> bool:
    """Check if paddleocr and paddlepaddle are installed and available without importing them."""
    import importlib.util
    try:
        paddleocr_spec = importlib.util.find_spec("paddleocr")
        paddle_spec = importlib.util.find_spec("paddle")
        return paddleocr_spec is not None and paddle_spec is not None
    except Exception:
        return False

def run_ocr_subprocess(cmd):
    import subprocess
    return subprocess.run(cmd, capture_output=True)

async def perform_ocr(img_or_path) -> str:
    """
    Runs local PaddleOCR inside an isolated subprocess.
    Supports PIL Image or file path string.
    """
    if not check_paddleocr_available():
        logger.warning("PaddleOCR/PaddlePaddle not installed. OCR skipped.")
        return ""

    temp_img_path = None
    if not isinstance(img_or_path, str):
        from PIL import Image
        import uuid
        temp_dir = os.path.join(os.path.dirname(__file__), "..", "tmp")
        os.makedirs(temp_dir, exist_ok=True)
        temp_img_path = os.path.join(temp_dir, f"ocr_tmp_{uuid.uuid4()}.jpg")
        img_or_path.save(temp_img_path)
        img_path = temp_img_path
    else:
        img_path = img_or_path

    try:
        worker_script = os.path.join(os.path.dirname(__file__), "ocr_worker.py")
        cmd = [sys.executable, worker_script, img_path]
        
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(None, run_ocr_subprocess, cmd)
        
        if res.returncode != 0:
            logger.error("OCR subprocess failed with exit code %d: %s", res.returncode, res.stderr.decode(errors="ignore"))
            return ""
            
        try:
            res_data = json.loads(res.stdout.decode().strip())
            if "error" in res_data:
                logger.error("OCR worker returned error: %s", res_data["error"])
                return ""
            return res_data.get("text", "")
        except Exception as parse_err:
            logger.error("Failed to parse OCR subprocess JSON output: %s", parse_err)
            return ""
    except Exception as e:
        logger.error("Error executing OCR subprocess: %s", e)
        return ""
    finally:
        if temp_img_path and os.path.exists(temp_img_path):
            try:
                os.remove(temp_img_path)
            except Exception:
                pass
