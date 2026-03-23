from transformers import pipeline
import torch

MODEL_NAME = "Hello-SimpleAI/chatgpt-detector-roberta"

# Load once at startup — not on every request
_classifier = None


def get_classifier():
    global _classifier
    if _classifier is None:
        device = 0 if torch.cuda.is_available() else -1
        _classifier = pipeline(
            "text-classification",
            model=MODEL_NAME,
            device=device,
            truncation=True,
            max_length=512
        )
    return _classifier


def score_sentences(sentences: list[str]) -> list[dict]:
    """
    Given a list of sentences, return a list of dicts:
      { "text": str, "ai_probability": float }

    Sentences longer than 512 tokens are truncated by the model automatically.
    Sentences shorter than ~10 chars are skipped (punctuation, headings, etc.).
    """
    classifier = get_classifier()
    results = []

    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) < 10:
            results.append({"text": sentence, "ai_probability": 0.0})
            continue

        prediction = classifier(sentence)[0]
        # LABEL_1 = AI-generated in this model
        if prediction["label"] == "LABEL_1":
            ai_prob = prediction["score"]
        else:
            ai_prob = 1.0 - prediction["score"]

        results.append({
            "text": sentence,
            "ai_probability": round(ai_prob, 4)
        })

    return results