import os
import json
import logging
from anthropic import Anthropic

logger = logging.getLogger(__name__)

_client = None
_client_key = None


def _get_api_key() -> str:
    return os.getenv("AI_API_KEY", "").strip()


def _get_model() -> str:
    return os.getenv("AI_MODEL", "claude-3-haiku-20240307")


def _get_client() -> Anthropic:
    global _client, _client_key
    api_key = _get_api_key()
    if not api_key:
        raise ValueError("AI_API_KEY is not configured.")
    if _client is None or _client_key != api_key:
        _client = Anthropic(api_key=api_key)
        _client_key = api_key
    return _client


def is_api_key_available() -> bool:
    return bool(_get_api_key())


SYSTEM_PROMPT = """\
You are Galena's AI second-opinion assistant. You analyze website text that has \
already been scanned by a local AI-detection model.

You have a comedic, casual tone; think "tech-savvy friend who's brutally honest." \
Keep it punchy and short. Examples of your vibe:
- "holy cow bro, there's a STRONG chance this site was written by AI"
- "this reads like a human poured their heart out, so I'd trust it"
- "ehhh, lowkey giving half-bot half-human vibes"

You will receive:
1. The full list of sentences from the page.
2. The local model's overall AI percentage.

Respond with ONLY valid JSON (no markdown fences) in this exact schema:
{
  "summary": "<your comedic 1-2 sentence summary>",
  "results": [
    { "i": <sentence_index>, "p": <0.0-1.0> }
  ],
  "overall_ai_percentage": <0.0-100.0>
}

Rules:
- "summary" is your comedic take on how AI-generated the page is.
- "results" must contain one entry per sentence, in the same order. Use the sentence number as "i" (1-based) and your estimated AI probability as "p".
- "overall_ai_percentage" is the percentage of sentences where p >= 0.75, from 0-100.\
"""


MAX_SENTENCES_FOR_LLM = 80


def enhanced_detect(sentences: list[str], local_ai_percentage: float) -> dict:
    """
    Send all sentences to the LLM in one call and return the parsed response.
    Caps at MAX_SENTENCES_FOR_LLM to avoid token overflow.
    Raises on network/parsing errors. Caller should handle.
    """
    client = _get_client()

    # Cap sentences to avoid exceeding token limits on large pages
    capped = sentences[:MAX_SENTENCES_FOR_LLM]
    was_capped = len(sentences) > MAX_SENTENCES_FOR_LLM

    user_content = (
        f"Local model says {local_ai_percentage:.1f}% of this page is AI-generated.\n\n"
    )
    if was_capped:
        user_content += f"(Showing first {MAX_SENTENCES_FOR_LLM} of {len(sentences)} sentences)\n\n"
    user_content += f"Sentences ({len(capped)} total):\n"

    for i, s in enumerate(capped, 1):
        user_content += f"{i}. {s}\n"

    response = client.messages.create(
        model=_get_model(),
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": user_content},
        ],
        temperature=0.7,
        max_tokens=4096,
    )

    raw = response.content[0].text.strip()
    # Strip markdown code fences if the model wraps them anyway
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    # Check if the response was truncated (hit max_tokens)
    if response.stop_reason == "max_tokens":
        logger.warning("LLM response was truncated (hit max_tokens). Trying to salvage...")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse LLM JSON: %s", e)
        logger.error("Raw response (first 500 chars): %s", raw[:500])
        raise

    # Map index-based results back to full sentence objects
    mapped_results = []
    for r in parsed.get("results", []):
        idx = r.get("i", 0) - 1  # convert 1-based to 0-based
        prob = r.get("p", 0.0)
        text = capped[idx] if 0 <= idx < len(capped) else f"(sentence {idx+1})"
        mapped_results.append({
            "text": text,
            "ai_probability": prob,
            "is_ai": prob >= 0.75,
        })

    parsed["results"] = mapped_results
    return parsed