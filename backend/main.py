from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from detector import score_sentences
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AI Text Detector Backend")

# Allow requests from the Chrome extension (chrome-extension:// origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Tighten this in production if desired
    allow_methods=["POST"],
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