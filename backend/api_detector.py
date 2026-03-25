import os
import json
from anthropic import Anthropic

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
    { "text": "<sentence>", "ai_probability": <0.0-1.0>, "is_ai": <true/false> }
  ],
  "overall_ai_percentage": <0.0-100.0>
}

Rules:
- "summary" is your comedic take on how AI-generated the page is.
- "results" must contain every sentence you received, in the same order.
- "ai_probability" is your estimated probability (0.0 to 1.0) that the sentence was AI-generated.
- "is_ai" is true if ai_probability >= 0.75.
- "overall_ai_percentage" is the percentage of sentences you marked is_ai, 0-100.\
"""


def enhanced_detect(sentences: list[str], local_ai_percentage: float) -> dict:
    """
    Send all sentences to the LLM in one call and return the parsed response.
    Raises on network/parsing errors. Caller should handle.
    """
    client = _get_client()

    user_content = (
        f"Local model says {local_ai_percentage:.1f}% of this page is AI-generated.\n\n"
        f"Sentences ({len(sentences)} total):\n"
    )
    for i, s in enumerate(sentences, 1):
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

    return json.loads(raw)