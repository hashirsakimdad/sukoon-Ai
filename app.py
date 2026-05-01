from dotenv import load_dotenv

# load_dotenv() at top
load_dotenv()

import json
import os
import traceback
from typing import Any

from flask import Flask, jsonify, render_template, request

import google.generativeai as genai
from google.api_core import exceptions as gexc


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY is missing. Set it in .env or environment variables.")

genai.configure(api_key=GEMINI_API_KEY)

# Requested model name, but it may not exist for your API key.
# We keep it as primary to match spec and fallback to an available Flash model if needed.
PRIMARY_MODEL = "gemini-1.5-flash"
FALLBACK_MODELS = [
    "models/gemini-2.0-flash",
    "models/gemini-flash-latest",
    "models/gemini-2.5-flash",
]


CHAT_SYSTEM_PROMPT = (
    "You are Sukoon AI, a warm compassionate mental health assistant for Pakistani users. "
    "You deeply understand Roman Urdu, Urdu, and English — respond in whatever language the user writes in. "
    "You know Pakistani culture: family pressure, izzat, rishtay tension, exam stress, career anxiety, loneliness. "
    "Be like a caring dost — not a clinical robot. Use CBT techniques naturally: breathing, thought reframing, grounding. "
    "Based on the detected emotion tag provided, adjust your tone — if anxiety: be calming, if sad: be warm and validating, "
    "if angry: be grounding, if stressed: be practical. Suggest an exercise when appropriate. "
    "If crisis or self-harm mentioned: recommend Umang helpline 0317-4288665 immediately. "
    "Max 4 sentences. End with one gentle question."
)


EMOTION_COLORS: dict[str, str] = {
    "anxiety": "#A78BFA",
    "sad": "#60A5FA",
    "stressed": "#F59E0B",
    "angry": "#F87171",
    "okay": "#34D399",
    "happy": "#FBBF24",
}

ALLOWED_EMOTIONS = set(EMOTION_COLORS.keys())
ALLOWED_EXERCISES = {"breathing", "grounding", "none"}


def _safe_str(value: Any, max_len: int = 6000) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    if len(value) > max_len:
        value = value[:max_len]
    return value


def _build_gemini_history(history: Any) -> list[dict[str, Any]]:
    """
    Frontend history shape:
      { role: "user"|"model"|"assistant", content: "..." }
    Gemini chat history shape:
      { role: "user"|"model", parts: ["..."] }
    """
    if not isinstance(history, list):
        return []

    out: list[dict[str, Any]] = []
    for item in history[-40:]:
        if not isinstance(item, dict):
            continue
        role = _safe_str(item.get("role"), max_len=32).lower()
        content = _safe_str(item.get("content"))
        if not content:
            continue

        if role == "user":
            out.append({"role": "user", "parts": [content]})
        elif role in ("model", "assistant", "ai", "bot"):
            out.append({"role": "model", "parts": [content]})

    return out


def _strip_code_fences(text: str) -> str:
    t = _safe_str(text, max_len=20000)
    if t.startswith("```"):
        lines = t.splitlines()
        # remove first fence line
        lines = lines[1:]
        # remove last fence line if present
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


def _extract_first_json_object(text: str) -> str:
    """
    Gemini often wraps JSON in ```json fences or adds extra text.
    This extracts the first top-level {...} block if possible.
    """
    t = _strip_code_fences(text)
    start = t.find("{")
    if start == -1:
        return t
    depth = 0
    for i in range(start, len(t)):
        ch = t[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return t[start : i + 1].strip()
    return t


def _iter_model_names() -> list[str]:
    # Keep PRIMARY_MODEL first to match spec, but it may 404 at request-time.
    return [PRIMARY_MODEL] + FALLBACK_MODELS


def _json_fallback():
    return jsonify({"response": "Sorry, kuch masla aa gaya. Dobara try karo."})


def _json_quota_message():
    return jsonify(
        {
            "response": "Yaar, abhi AI ki limit/quota khatam ho gayi hai. Thori dair baad dobara try karo."
        }
    )


app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/analyze-emotion")
def analyze_emotion():
    try:
        data = request.get_json(silent=True) or {}
        message = _safe_str(data.get("message"))
        if not message:
            return jsonify({"emotion": "okay", "color": EMOTION_COLORS["okay"]})

        prompt = (
            "Classify the emotion of the message into EXACTLY one label from this list:\n"
            "anxiety, sad, stressed, angry, okay, happy\n\n"
            "Output ONLY the single label.\n"
            "No punctuation. No extra words.\n\n"
            f"Message: {message}"
        )

        result = None
        last_err: Exception | None = None
        for name in _iter_model_names():
            try:
                model = genai.GenerativeModel(model_name=name)
                result = model.generate_content(prompt)
                last_err = None
                break
            except gexc.NotFound as e:
                last_err = e
                continue
            except gexc.ResourceExhausted as e:
                print(e)
                traceback.print_exc()
                return jsonify({"emotion": "okay", "color": EMOTION_COLORS["okay"]})
            except Exception as e:
                msg = str(e)
                if "exceeded your current quota" in msg.lower() or "quota exceeded" in msg.lower():
                    print(e)
                    traceback.print_exc()
                    return jsonify({"emotion": "okay", "color": EMOTION_COLORS["okay"]})
                print(e)
                traceback.print_exc()
                return jsonify({"emotion": "okay", "color": EMOTION_COLORS["okay"]})

        if result is None and last_err is not None:
            raise last_err

        label = _safe_str(getattr(result, "text", ""), max_len=40).lower()
        label = label.replace(".", "").replace(":", "").strip()
        label = label.split()[0] if label else "okay"
        if label not in ALLOWED_EMOTIONS:
            label = "okay"

        return jsonify({"emotion": label, "color": EMOTION_COLORS[label]})
    except gexc.ResourceExhausted as e:
        print(e)
        traceback.print_exc()
        return jsonify({"emotion": "okay", "color": EMOTION_COLORS["okay"]})
    except Exception as e:
        print(e)
        traceback.print_exc()
        return jsonify({"emotion": "okay", "color": EMOTION_COLORS["okay"]})


@app.post("/chat")
def chat():
    try:
        data = request.get_json(silent=True) or {}
        message = _safe_str(data.get("message"))
        mood = data.get("mood", None)
        history = data.get("history", [])
        emotion = _safe_str(data.get("emotion"), max_len=24).lower() or "okay"
        if emotion not in ALLOWED_EMOTIONS:
            emotion = "okay"

        if not message:
            return _json_fallback()

        try:
            mood_int = int(mood) if mood is not None else None
        except (TypeError, ValueError):
            mood_int = None
        if mood_int is not None:
            mood_int = max(1, min(10, mood_int))

        mood_context = str(mood_int) if mood_int is not None else "not provided"

        contract = (
            "Return ONLY valid JSON with keys: response, suggested_exercise. "
            "suggested_exercise must be exactly one of: breathing, grounding, none. "
            "No extra text outside JSON."
        )

        prompt = (
            f"Detected emotion tag: {emotion}\n"
            f"User mood (1-10): {mood_context}\n"
            f"User message: {message}\n\n"
            f"{contract}"
        )

        result = None
        last_not_found: Exception | None = None
        for name in _iter_model_names():
            try:
                model = genai.GenerativeModel(
                    model_name=name,
                    system_instruction=CHAT_SYSTEM_PROMPT,
                )
                chat_session = model.start_chat(history=_build_gemini_history(history))
                result = chat_session.send_message(prompt)
                last_not_found = None
                break
            except gexc.NotFound as e:
                last_not_found = e
                continue
            except gexc.ResourceExhausted as e:
                print(e)
                traceback.print_exc()
                return _json_quota_message()
            except Exception as e:
                # Some quota / billing errors may not surface as ResourceExhausted in all versions.
                msg = str(e)
                if "exceeded your current quota" in msg.lower() or "quota exceeded" in msg.lower():
                    print(e)
                    traceback.print_exc()
                    return _json_quota_message()
                print(e)
                traceback.print_exc()
                return _json_fallback()

        if result is None and last_not_found is not None:
            print(last_not_found)
            traceback.print_exc()
            return _json_fallback()

        raw = _safe_str(getattr(result, "text", ""), max_len=20000)
        if not raw:
            try:
                print("EMPTY_MODEL_TEXT:", repr(result))
            except Exception:
                print("EMPTY_MODEL_TEXT: (could not repr result)")

        response_text = ""
        suggested = "none"

        try:
            candidate = _extract_first_json_object(raw)
            obj = json.loads(candidate)
            response_text = _safe_str(obj.get("response", ""))
            suggested = _safe_str(obj.get("suggested_exercise", "none"), max_len=16).lower() or "none"
        except Exception:
            # If model returned plain text, still show it and choose exercise heuristically
            response_text = raw

        if suggested not in ALLOWED_EXERCISES:
            suggested = "none"

        if suggested == "none":
            lower = message.lower()
            if emotion in ("anxiety", "stressed") or any(
                k in lower for k in ("panic", "ghabra", "ghabr", "anx", "stress", "restless", "dil ghabra")
            ):
                suggested = "breathing"
            elif emotion in ("angry", "sad") or any(k in lower for k in ("gussa", "angry", "sad", "udaas", "low")):
                suggested = "grounding"

        if not response_text:
            try:
                print("NO_RESPONSE_TEXT_RAW:", raw[:600])
            except Exception:
                print("NO_RESPONSE_TEXT_RAW: (unavailable)")
            return _json_fallback()

        return jsonify({"response": response_text, "suggested_exercise": suggested})
    except Exception as e:
        print(e)
        traceback.print_exc()
        return _json_fallback()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
