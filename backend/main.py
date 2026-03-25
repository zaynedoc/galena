from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(__file__)
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, "..", ".env"))

from detector import score_sentences
from api_detector import is_api_key_available, enhanced_detect

app = FastAPI(title="AI Text Detector Backend")

# Allow requests from the Chrome extension (chrome-extension:// origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Tighten this in production if desired
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

AI_THRESHOLD = float(os.getenv("AI_THRESHOLD", "0.9"))


class DetectRequest(BaseModel):
    sentences: list[str]


class SentenceResult(BaseModel):
    text: str
    ai_probability: float
    is_ai: bool


class DetectResponse(BaseModel):
    results: list[SentenceResult]
    overall_ai_percentage: float
    threshold_used: float


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api-key-status")
def api_key_status():
    return {"available": is_api_key_available()}


@app.post("/detect", response_model=DetectResponse)
def detect(request: DetectRequest):
    if not request.sentences:
        return DetectResponse(results=[], overall_ai_percentage=0.0, threshold_used=AI_THRESHOLD)

    scored = score_sentences(request.sentences)

    results = [
        SentenceResult(
            text=s["text"],
            ai_probability=s["ai_probability"],
            is_ai=s["ai_probability"] >= AI_THRESHOLD
        )
        for s in scored
    ]

    ai_sentences = [r for r in results if r.is_ai]
    overall = len(ai_sentences) / len(results) * 100 if results else 0.0

    return DetectResponse(
        results=results,
        overall_ai_percentage=round(overall, 1),
        threshold_used=AI_THRESHOLD
    )


class EnhancedDetectRequest(BaseModel):
    sentences: list[str]
    overall_ai_percentage: float


class EnhancedSentenceResult(BaseModel):
    text: str
    ai_probability: float
    is_ai: bool


class EnhancedDetectResponse(BaseModel):
    summary: str
    results: list[EnhancedSentenceResult]
    overall_ai_percentage: float


@app.post("/detect-enhanced", response_model=EnhancedDetectResponse)
def detect_enhanced(request: EnhancedDetectRequest):
    if not is_api_key_available():
        raise HTTPException(status_code=403, detail="AI API key is not configured.")

    if not request.sentences:
        return EnhancedDetectResponse(summary="Nothing to analyze!", results=[], overall_ai_percentage=0.0)

    import logging
    logger = logging.getLogger("detect-enhanced")
    logger.info("Enhanced scan: %d sentences, %.1f%% AI", len(request.sentences), request.overall_ai_percentage)
    try:
        llm_result = enhanced_detect(request.sentences, request.overall_ai_percentage)
    except Exception as e:
        logger.exception("LLM analysis failed")
        raise HTTPException(status_code=502, detail=f"LLM analysis failed: {e}")

    results = [
        EnhancedSentenceResult(
            text=r["text"],
            ai_probability=r["ai_probability"],
            is_ai=r["is_ai"]
        )
        for r in llm_result.get("results", [])
    ]

    return EnhancedDetectResponse(
        summary=llm_result.get("summary", ""),
        results=results,
        overall_ai_percentage=llm_result.get("overall_ai_percentage", 0.0)
    )