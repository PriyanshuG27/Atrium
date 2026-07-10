import os
import sys
import base64
import logging
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Setup root path to enable backend imports if needed
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Setup simple logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_service")

app = FastAPI(title="Recall Split AI Microservice")

# Lazy loaders for models
_embedding_model = None
_reranker_model = None
_ocr_client = None

class EmbedRequest(BaseModel):
    text: str

class EmbedBatchRequest(BaseModel):
    texts: List[str]

class RerankRequest(BaseModel):
    query: str
    passages: List[str]

class OCRRequest(BaseModel):
    image: str  # Base64 encoded image bytes

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/embed")
async def embed(req: EmbedRequest):
    if os.environ.get("MOCK_AI") == "True":
        # Return a mock 384-dimensional vector
        val = 1.0 / (384 ** 0.5)
        return {"embedding": [val] * 384}
        
    global _embedding_model
    try:
        if _embedding_model is None:
            logger.info("Loading TextEmbedding model...")
            from fastembed import TextEmbedding
            _embedding_model = TextEmbedding("BAAI/bge-small-en-v1.5")
        
        # Run embedding
        embeddings = list(_embedding_model.embed([req.text]))
        if not embeddings:
            raise HTTPException(status_code=500, detail="Failed to generate embedding")
        return {"embedding": [float(x) for x in embeddings[0]]}
    except Exception as e:
        logger.error("Embedding failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/embed-batch")
async def embed_batch(req: EmbedBatchRequest):
    if os.environ.get("MOCK_AI") == "True":
        val = 1.0 / (384 ** 0.5)
        return {"embeddings": [[val] * 384 for _ in req.texts]}
        
    global _embedding_model
    try:
        if _embedding_model is None:
            logger.info("Loading TextEmbedding model...")
            from fastembed import TextEmbedding
            _embedding_model = TextEmbedding("BAAI/bge-small-en-v1.5")
            
        embeddings = list(_embedding_model.embed(req.texts))
        return {"embeddings": [[float(x) for x in emb] for emb in embeddings]}
    except Exception as e:
        logger.error("Batch embedding failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/rerank")
async def rerank(req: RerankRequest):
    if os.environ.get("MOCK_AI") == "True":
        # Return uniform mock scores
        return {"scores": [0.95] * len(req.passages)}
        
    global _reranker_model
    try:
        if _reranker_model is None:
            logger.info("Loading TextCrossEncoder reranker model...")
            from fastembed.rerank.cross_encoder import TextCrossEncoder
            _reranker_model = TextCrossEncoder(model_name="Xenova/ms-marco-MiniLM-L-6-v2")
            
        scores = list(_reranker_model.rerank(req.query, req.passages))
        return {"scores": [float(x) for x in scores]}
    except Exception as e:
        logger.error("Reranking failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ocr")
async def ocr(req: OCRRequest):
    if os.environ.get("MOCK_AI") == "True":
        return {"ocr_text": "Extracted text from mock OCR API endpoint."}
        
    global _ocr_client
    try:
        import numpy as np
        import cv2
        
        if _ocr_client is None:
            logger.info("Loading PaddleOCR engine...")
            from paddleocr import PaddleOCR
            _ocr_client = PaddleOCR(lang="en", show_log=False)
            
        # Decode base64 image
        img_data = base64.b64decode(req.image)
        nparr = np.frombuffer(img_data, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img_bgr is None:
            raise HTTPException(status_code=400, detail="Invalid image payload")
            
        result = _ocr_client.ocr(img_bgr)
        words = []
        if result and result[0]:
            for line in result[0]:
                if line and len(line) > 1 and line[1]:
                    words.append(line[1][0])
                    
        return {"ocr_text": " ".join(words)}
    except Exception as e:
        logger.error("OCR failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/split-sentences")
async def split_sentences(req: EmbedRequest):
    try:
        import re
        # Split on sentence boundaries: periods, exclamation/question marks followed by spaces
        sents = [s.strip() for s in re.split(r'(?<=[.!?])\s+(?=[A-Za-z0-9])', req.text) if s.strip()]
        return {"sentences": sents}
    except Exception as e:
        logger.error("Sentence splitting failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Allow port to be configured via environment
    port = int(os.environ.get("AI_SERVICE_PORT", 8001))
    logger.info("Starting AI Service on port %d...", port)
    uvicorn.run(app, host="127.0.0.1", port=port)
