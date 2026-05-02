from dotenv import load_dotenv

load_dotenv()

import json
import os
import traceback
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request, send_file, session
from flask_cors import CORS

import google.generativeai as genai
from google.api_core import exceptions as gexc

from weekly_report import (
    build_weekly_report_pdf,
    compute_mood_values,
    compute_trend_label,
    default_insights,
    heuristic_emotions_for_chart,
    merge_emotion_counts,
)

def _load_gemini_api_key() -> str:
    """Prefer GEMINI_API_KEY; strip whitespace; optional GOOGLE_API_KEY fallback."""
    key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    return key


GEMINI_API_KEY = _load_gemini_api_key()
if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY is missing. Set it in .env or Cloud Run environment variables.")
else:
    genai.configure(api_key=GEMINI_API_KEY)

DATA_DIR = Path("data")
SESSIONS_DIR = DATA_DIR / "sessions"


def ensure_sessions_directory() -> None:
    """Always ensure session + profile dirs exist on disk (Docker / ephemeral fs safe)."""
    os.makedirs(DATA_DIR / "sessions", exist_ok=True)
    os.makedirs(DATA_DIR / "profiles", exist_ok=True)


ensure_sessions_directory()

from agents import EmotionAgent, OrchestratorAgent

PRIMARY_MODEL = "gemini-1.5-flash"
QUOTA_FALLBACK_MODEL = "gemini-1.5-flash-8b"

# Order: try 1.5 Flash first; on 429 / quota / ResourceExhausted, later entries (8B) are tried.
# Then other Flash IDs for 404 / missing model.
COMPLETION_MODELS: list[str] = [
    "gemini-1.5-flash",
    "models/gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "models/gemini-1.5-flash-8b",
    "models/gemini-2.0-flash",
    "models/gemini-flash-latest",
    "models/gemini-2.5-flash",
]


class GeminiQuotaExhaustedError(Exception):
    """Raised when every tried model hits quota/rate-limit (429 / ResourceExhausted)."""

URDU_LABELS = {
    "anxiety": "پریشانی",
    "sad": "اداسی",
    "stressed": "تھکاوٹ",
    "angry": "غصہ",
    "okay": "ٹھیک",
    "happy": "خوشی",
}

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

SYSTEM_PROMPT = (
    "You are Sukoon AI, a warm compassionate mental health assistant for Pakistani users. "
    "You understand Roman Urdu, Urdu, and English — always respond in the same language the user writes in. "
    "You deeply know Pakistani culture: family pressure, izzat, rishtay tension, exam stress, career anxiety, "
    "loneliness, log kya kahenge. Be like a caring dost — never clinical or robotic. "
    "Remember what the user told you earlier in this conversation and reference it naturally. "
    "Use CBT techniques: breathing exercises, thought reframing, grounding 5-4-3-2-1. "
    "Based on emotion: anxiety=be calming, sad=be warm+validating, angry=be grounding, stressed=be practical. "
    "Suggest exercise when mood below 5 or emotion is anxiety/sad/stressed. "
    "For crisis or self-harm: immediately say Umang helpline 0317-4288665. "
    "Keep responses 3-5 sentences. End with one caring question."
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_str(value: Any, max_len: int = 8000) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    if len(value) > max_len:
        value = value[:max_len]
    return value


def _friendly_error_payload(message: str) -> dict[str, Any]:
    return {"ok": False, "error": message}


def _build_quota_exception_types() -> tuple[type, ...]:
    types_list: list[type] = [gexc.ResourceExhausted]
    tm = getattr(gexc, "TooManyRequests", None)
    if tm is not None:
        types_list.append(tm)
    return tuple(types_list)


QUOTA_EXCEPTION_TYPES: tuple[type, ...] = _build_quota_exception_types()


def _is_quota_or_rate_limit(err: BaseException) -> bool:
    if isinstance(err, QUOTA_EXCEPTION_TYPES):
        return True
    code = getattr(err, "code", None)
    if code == 429:
        return True
    msg = str(err).lower()
    if "resource exhausted" in msg:
        return True
    if "429" in msg and ("quota" in msg or "rate" in msg or "limit" in msg):
        return True
    if "quota" in msg and ("exceed" in msg or "exhausted" in msg):
        return True
    return False


RATE_LIMIT_CHAT: dict[str, Any] = {
    "response": "Thori dair baad try karo — AI thoda busy hai abhi.",
    "suggested_exercise": "none",
    "memory_insight": None,
}


def _strip_code_fences(text: str) -> str:
    t = _safe_str(text, max_len=24000)
    if t.startswith("```"):
        lines = t.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


def _extract_first_json_object(text: str) -> str:
    t = _strip_code_fences(text)
    start = t.find("{")
    if start < 0:
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


def _build_gemini_history(history: Any) -> list[dict[str, Any]]:
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
        elif role in ("model", "assistant", "ai"):
            out.append({"role": "model", "parts": [content]})
    return out


def _default_model_greeting() -> str:
    return (
        "Assalam o Alaikum! Main Sukoon AI hun — tumhara digital dost. "
        "Aaj kaisa feel ho raha hai? Bata sakte ho mujhe."
    )


def _new_session(session_id: str) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "created_at": _utc_now_iso(),
        "messages": [],
        "mood_history": [],
        "memory_insights": [],
        "last_emotion": "okay",
    }


def _session_path(session_id: str) -> Path:
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_")
    if not safe:
        raise ValueError("invalid session")
    return SESSIONS_DIR / f"{safe}.json"


def load_session_doc(session_id: str) -> dict[str, Any]:
    ensure_sessions_directory()
    path = _session_path(session_id)
    if not path.exists():
        doc = _new_session(session_id)
        doc["messages"].append(
            {"role": "model", "content": _default_model_greeting(), "timestamp": _utc_now_iso()},
        )
        save_session_doc(doc)
        return doc
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print("load_session_doc error:", e)
        traceback.print_exc()
        return _new_session(session_id)
    data.setdefault("session_id", session_id)
    data.setdefault("created_at", _utc_now_iso())
    data.setdefault("messages", [])
    data.setdefault("mood_history", [])
    data.setdefault("memory_insights", [])
    data.setdefault("last_emotion", "okay")
    if not isinstance(data["messages"], list):
        data["messages"] = []
    if not isinstance(data["mood_history"], list):
        data["mood_history"] = []
    if not isinstance(data["memory_insights"], list):
        data["memory_insights"] = []
    return data


def save_session_doc(doc: dict[str, Any]) -> None:
    ensure_sessions_directory()
    sid = _safe_str(doc.get("session_id"), max_len=80)
    if not sid:
        raise ValueError("missing session_id")
    session_file = _session_path(sid)
    with open(session_file, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)


def list_recent_sessions(limit: int = 5) -> list[dict[str, Any]]:
    rows: list[tuple[float, Path]] = []
    for p in SESSIONS_DIR.glob("*.json"):
        try:
            rows.append((p.stat().st_mtime, p))
        except OSError:
            continue
    rows.sort(key=lambda x: x[0], reverse=True)
    out: list[dict[str, Any]] = []
    for _, p in rows[:limit]:
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
            msgs = d.get("messages") or []
            preview = ""
            if isinstance(msgs, list):
                for m in msgs:
                    if isinstance(m, dict) and _safe_str(m.get("role")).lower() == "user":
                        preview = _safe_str(m.get("content"), max_len=100)
                        break
            lem = _safe_str(d.get("last_emotion"), max_len=16).lower()
            if lem not in ALLOWED_EMOTIONS:
                lem = "okay"
            out.append(
                {
                    "session_id": _safe_str(d.get("session_id")) or p.stem,
                    "created_at": _safe_str(d.get("created_at")),
                    "message_count": len(msgs) if isinstance(msgs, list) else 0,
                    "preview": preview,
                    "last_emotion": lem,
                }
            )
        except Exception:
            continue
    return out


class MentalHealthAgent:
    def __init__(self) -> None:
        self.model = PRIMARY_MODEL
        self.quota_fallback_model = QUOTA_FALLBACK_MODEL
        self.system_prompt = SYSTEM_PROMPT

    def _generate_text(self, prompt: str, system: str | None = None) -> str:
        last_err: Exception | None = None
        saw_quota = False
        for name in COMPLETION_MODELS:
            try:
                kwargs: dict[str, Any] = {"model_name": name}
                if system:
                    kwargs["system_instruction"] = system
                model = genai.GenerativeModel(**kwargs)
                res = model.generate_content(prompt)
                result_text = _safe_str(getattr(res, "text", ""), max_len=24000)
                if result_text:
                    return result_text
            except gexc.NotFound as e:
                last_err = e
                continue
            except Exception as e:
                if _is_quota_or_rate_limit(e):
                    saw_quota = True
                    last_err = e
                    print(f"Gemini quota/rate-limit on {name!r}, trying next model:", e)
                    traceback.print_exc()
                    continue
                last_err = e
                raise
        if saw_quota:
            raise GeminiQuotaExhaustedError(str(last_err) if last_err else "quota exhausted")
        if last_err:
            raise last_err
        return ""

    def analyze_emotion(self, message: str) -> dict[str, Any]:
        msg = _safe_str(message)
        if not msg:
            return {
                "emotion": "okay",
                "color": EMOTION_COLORS["okay"],
                "urdu_label": URDU_LABELS["okay"],
            }

        prompt = (
            "Classify the emotion into EXACTLY one word from:\n"
            "anxiety, sad, stressed, angry, okay, happy\n\n"
            "Output ONLY the single label. No punctuation. No explanation.\n\n"
            f"Message: {msg}"
        )

        try:
            label_raw = self._generate_text(prompt)
        except GeminiQuotaExhaustedError as e:
            print("analyze_emotion quota exhausted:", e)
            return {
                "emotion": "okay",
                "color": EMOTION_COLORS["okay"],
                "urdu_label": URDU_LABELS["okay"],
            }
        except Exception as e:
            print("analyze_emotion:", e)
            traceback.print_exc()
            raise

        label = label_raw.lower().replace(".", "").replace(":", "").strip().split()[0] if label_raw else "okay"
        if label not in ALLOWED_EMOTIONS:
            label = "okay"
        return {
            "emotion": label,
            "color": EMOTION_COLORS[label],
            "urdu_label": URDU_LABELS[label],
        }

    def generate_memory_insight(self, messages: list[dict[str, Any]]) -> str:
        lines = []
        for m in messages[-20:]:
            if not isinstance(m, dict):
                continue
            r = _safe_str(m.get("role")).lower()
            c = _safe_str(m.get("content"), max_len=400)
            if not c:
                continue
            pref = "user" if r == "user" else "assistant"
            lines.append(f"{pref}: {c}")
        transcript = "\n".join(lines)
        prompt = (
            "Summarize the emotional theme and ONE concrete fact user shared in ONE short Urdu sentence "
            "(Roman Urdu OK). Example: Tumne exam stress aur neend ki baat ki thi. "
            "No quotes. Max 140 characters.\n\n"
            f"Conversation:\n{transcript}"
        )
        try:
            t = self._generate_text(prompt, system="You write brief Roman Urdu memory cues for therapists.")
            t = _safe_str(t, max_len=280)
            return t or ""
        except GeminiQuotaExhaustedError:
            return ""
        except Exception as e:
            print("generate_memory_insight:", e)
            traceback.print_exc()
            return ""

    def chat(
        self,
        message: str,
        mood: int | None,
        history: Any,
        emotion: str,
    ) -> dict[str, Any]:
        msg = _safe_str(message)
        if not msg:
            return {"response": "", "suggested_exercise": "none", "memory_insight": None}

        emo = _safe_str(emotion, max_len=24).lower() or "okay"
        if emo not in ALLOWED_EMOTIONS:
            emo = "okay"

        mood_int = mood
        if mood_int is not None:
            try:
                mood_int = int(mood_int)
                mood_int = max(1, min(10, mood_int))
            except (TypeError, ValueError):
                mood_int = None

        mood_ctx = str(mood_int) if mood_int is not None else "not provided"
        exercise_hint = (
            "Suggested exercise must be exactly one of: breathing, grounding, none. "
            "Prefer breathing when anxiety/stressed/panic/neend; grounding when overwhelm/anger. "
            "If mood numeric is below 5 or emotion is anxiety/sad/stressed, strongly prefer breathing or grounding over none."
        )
        schema = (
            'Return ONLY valid JSON object with keys: "response", "suggested_exercise", "memory_insight". '
            "memory_insight can be null or a very short Roman Urdu line about what to remember from this reply. "
            f"{exercise_hint} "
            'Example: {"response":"...","suggested_exercise":"none","memory_insight":null}'
        )

        prompt = (
            f"Detected emotion tag: {emo}\n"
            f"User mood (1-10): {mood_ctx}\n\n"
            f"User message: {msg}\n\n"
            f"{schema}"
        )

        gh = _build_gemini_history(history)

        raw = ""
        last_quota = False
        for name in COMPLETION_MODELS:
            try:
                model = genai.GenerativeModel(
                    model_name=name,
                    system_instruction=self.system_prompt,
                )
                chat_session = model.start_chat(history=gh)
                result = chat_session.send_message(prompt)
                raw = _safe_str(getattr(result, "text", ""), max_len=24000)
                if raw:
                    break
            except gexc.NotFound:
                continue
            except Exception as e:
                if _is_quota_or_rate_limit(e):
                    last_quota = True
                    print(f"Chat quota/rate-limit on {name!r}, trying next model:", e)
                    traceback.print_exc()
                    continue
                print("chat model error:", e)
                traceback.print_exc()
                raise
        if not raw and last_quota:
            return dict(RATE_LIMIT_CHAT)

        suggested = "none"
        reply = ""
        mem_line = None

        try:
            blob = _extract_first_json_object(raw)
            obj = json.loads(blob)
            reply = _safe_str(obj.get("response"))
            suggested = _safe_str(obj.get("suggested_exercise", "none"), max_len=32).lower() or "none"
            mem_line = obj.get("memory_insight")
            if mem_line is not None:
                mem_line = _safe_str(str(mem_line), max_len=400) or None
        except Exception:
            reply = raw

        if suggested not in ALLOWED_EXERCISES:
            suggested = "none"

        if mood_int is not None and mood_int < 5 and suggested == "none":
            suggested = "breathing"

        lower = msg.lower()
        if suggested == "none" and (
            emo in ("anxiety", "stressed") or any(k in lower for k in ("panic", "ghabra", "anx", "stress", "neend", "panic"))
        ):
            suggested = "breathing"
        elif suggested == "none" and (emo in ("angry", "sad") or any(k in lower for k in ("gussa", "akela", "udaas"))):
            suggested = "grounding"

        if not reply:
            reply = (
                "Mujhay abhi jawab bnane mei masla aa raha hai. Dobara zaroor likho — mai sun rahi hun. "
                "Agar emergency lagay to Umang: 0317-4288665."
            )

        return {
            "response": reply.strip(),
            "suggested_exercise": suggested,
            "memory_insight": mem_line,
        }


def _report_meaningful_user_turns(doc: dict[str, Any]) -> int:
    count = 0
    for m in doc.get("messages") or []:
        if not isinstance(m, dict):
            continue
        if _safe_str(m.get("role")).lower() != "user":
            continue
        if len(_safe_str(m.get("content"))) >= 8:
            count += 1
    return count


def session_report_eligible(doc: dict[str, Any]) -> bool:
    return _report_meaningful_user_turns(doc) >= 2


def serialize_session_for_report(doc: dict[str, Any]) -> str:
    lines: list[str] = []
    for m in doc.get("messages") or []:
        if not isinstance(m, dict):
            continue
        role_ui = "user" if _safe_str(m.get("role")).lower() == "user" else "assistant"
        content = _safe_str(m.get("content"))
        ts = _safe_str(m.get("timestamp"), max_len=42)
        if content:
            lines.append(f"[{ts}] {role_ui}: {content}")
    lines.append("\n--- Mood snapshots (value 1–10) ---")
    mh = doc.get("mood_history") or []
    if isinstance(mh, list):
        for row in mh[-40:]:
            if isinstance(row, dict):
                lines.append(f"  {_safe_str(row.get('timestamp'))} -> {_safe_str(row.get('value'))}")
    lines.append(f"\nLast tagged emotion keyword: {_safe_str(doc.get('last_emotion'))}")
    return "\n".join(lines)[:14000]


def gemini_weekly_report_insights(history_blob: str) -> dict[str, Any]:
    spec = (
        "Analyze this user's mental health conversation history and generate a compassionate weekly summary "
        "in Roman Urdu and English mixed. Never sound clinical.\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "mood_trend": "improving"|"declining"|"stable",\n'
        '  "trend_arrow_label": "short Roman Urdu label with ↑ or ↓ or → arrow",\n'
        '  "warm_analysis": "2-4 sentences, warm paragraph",\n'
        '  "common_emotions": [{"emotion":"anxiety"|"sad"|"stressed"|"angry"|"okay"|"happy","count":2}, ...],\n'
        '  "stressors": ["family","studies","work","relationships"] as keywords actually implied,\n'
        '  "positive_observations": ["...", "...", "..."],\n'
        '  "recommendations": ["...", "...", "..."],\n'
        '  "motivational_message": "one Roman Urdu line"\n'
        "}\n"
    )
    prompt = spec + "\nHistory:\n" + history_blob
    raw_out = ""

    for name in COMPLETION_MODELS:
        try:
            model = genai.GenerativeModel(model_name=name)
            res = model.generate_content(prompt)
            raw_out = _safe_str(getattr(res, "text", ""), max_len=24000)
            if raw_out:
                break
        except gexc.NotFound:
            continue
        except Exception as e:
            if _is_quota_or_rate_limit(e):
                print("weekly-report quota:", e)
                traceback.print_exc()
                continue
            traceback.print_exc()
            break

    if not raw_out:
        return {}

    try:
        return dict(json.loads(_extract_first_json_object(raw_out)))
    except Exception as e:
        print("weekly-report JSON:", e)
        traceback.print_exc()
        return {}


def build_weekly_insights_for_pdf(doc: dict[str, Any], ai: dict[str, Any]) -> dict[str, Any]:
    text_blob = " ".join(
        _safe_str(m.get("content")) for m in doc.get("messages") or [] if isinstance(m, dict)
    ).lower()

    mood_vals = compute_mood_values(doc.get("mood_history"))
    defaults = default_insights(text_blob, mood_vals)

    msgs_ts = [_safe_str(x.get("timestamp")) for x in (doc.get("messages") or []) if isinstance(x, dict) and x.get("timestamp")]
    if len(msgs_ts) >= 2:
        week_label = f"{msgs_ts[0][:10]} → {msgs_ts[-1][:10]}"
    else:
        week_label = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    merged_emo = merge_emotion_counts(ai.get("common_emotions"), heuristic_emotions_for_chart(text_blob))

    trend_lbl = _safe_str(ai.get("trend_arrow_label"))
    if not trend_lbl:
        trend_lbl = compute_trend_label(mood_vals)

    warm = _safe_str(ai.get("warm_analysis")) or defaults["warm_analysis"]

    stressors_ai = ai.get("stressors")
    stress_clean: list[str] = []
    if isinstance(stressors_ai, list):
        stress_clean = [_safe_str(x, max_len=80) for x in stressors_ai if _safe_str(x)]
    if not stress_clean:
        stress_clean = list(defaults["stressors"])

    pos_ai = ai.get("positive_observations")
    positives: list[str] = []
    if isinstance(pos_ai, list):
        positives = [_safe_str(x, max_len=500) for x in pos_ai if _safe_str(x)]
    i = 0
    while len(positives) < 3:
        positives.append(defaults["positive_observations"][i % len(defaults["positive_observations"])])
        i += 1

    rec_ai = ai.get("recommendations")
    recs: list[str] = []
    if isinstance(rec_ai, list):
        recs = [_safe_str(x, max_len=500) for x in rec_ai if _safe_str(x)]
    j = 0
    while len(recs) < 3:
        recs.append(defaults["recommendations"][j % len(defaults["recommendations"])])
        j += 1

    mot = _safe_str(ai.get("motivational_message")) or defaults["motivational_message"]

    return {
        "week_label": week_label[:120],
        "mood_values": mood_vals,
        "trend_arrow_label": trend_lbl[:200],
        "emotion_freq": merged_emo,
        "warm_analysis": warm[:2500],
        "stressors": stress_clean[:10],
        "positive_observations": positives[:5],
        "recommendations": recs[:5],
        "motivational_message": mot[:900],
    }


agent = MentalHealthAgent()
orchestrator = OrchestratorAgent()

app = Flask(__name__)
_secret = os.environ.get("FLASK_SECRET_KEY")
app.secret_key = _secret.encode("utf-8") if _secret else os.urandom(24)
CORS(app)


@app.get("/")
def index():
    try:
        ensure_sessions_directory()
        # Session & history come from disk via client localStorage session_id + GET /history.
        return render_template(
            "index.html",
            session_id="",
            history=[],
            mood_history=[],
            latest_memory_insight="",
            recent_sessions=list_recent_sessions(5),
        )
    except Exception as e:
        print("/ index error:", e)
        traceback.print_exc()
        return (
            '<h2>Kuch masla aa gaya. Page reload karo.</h2>',
            500,
        )


@app.get("/sessions")
def get_sessions():
    try:
        return jsonify({"ok": True, "sessions": list_recent_sessions(5)})
    except Exception as e:
        print("GET /sessions:", e)
        traceback.print_exc()
        return jsonify(_friendly_error_payload("Seshen ki fehrist nahi khul saki.")), 500


@app.get("/history")
def get_history():
    try:
        ensure_sessions_directory()
        sid = request.args.get("session_id") or session.get("session_id")
        if not sid:
            return jsonify(_friendly_error_payload("Session nahi mila.")), 400
        sid = _safe_str(sid, max_len=80)
        # Always hydrate from JSON on disk for this session_id (never in-memory-only).
        doc = load_session_doc(sid)
        return jsonify({"ok": True, "session": doc})
    except Exception as e:
        print("GET /history:", e)
        traceback.print_exc()
        return jsonify(_friendly_error_payload("History nahi mili — dobara koshish karo.")), 500


@app.post("/switch-session")
def switch_session():
    try:
        data = request.get_json(silent=True) or {}
        sid = _safe_str(data.get("session_id"), max_len=80)
        if not sid:
            return jsonify(_friendly_error_payload("Session ID chahiye.")), 400
        session["session_id"] = sid
        doc = load_session_doc(sid)
        return jsonify({"ok": True, "session": doc})
    except Exception as e:
        print("POST /switch-session:", e)
        traceback.print_exc()
        return jsonify(_friendly_error_payload("Session switch masla — dobara koshish karo.")), 500


@app.post("/analyze-emotion")
def analyze_emotion_route():
    try:
        data = request.get_json(silent=True) or {}
        msg = data.get("message", "")
        mood_raw = data.get("mood")
        mood_val: int | None = None
        try:
            if mood_raw is not None:
                mood_val = max(1, min(10, int(mood_raw)))
        except (TypeError, ValueError):
            mood_val = None
        ea = EmotionAgent()
        deep = ea.analyze(msg, [], mood_val)
        return jsonify(
            {
                "emotion": deep.get("primary_emotion", "okay"),
                "color": deep.get("color", EMOTION_COLORS.get("okay", "#34D399")),
                "urdu_label": deep.get("urdu_label", URDU_LABELS.get("okay", "ٹھیک")),
            }
        )
    except Exception as e:
        print("/analyze-emotion:", e)
        traceback.print_exc()
        return jsonify(
            _friendly_error_payload("Mahsoos karna abhi mamool par nahi chal sakta.")
        ), 500


@app.post("/chat")
def chat_route():
    ai_ts = _utc_now_iso()
    try:
        ensure_sessions_directory()
        data = request.get_json(silent=True) or {}
        message = data.get("message", "")
        mood = data.get("mood")
        sid = _safe_str(data.get("session_id"), max_len=80) or session.get("session_id")
        if not sid:
            sid = str(uuid.uuid4())
        session["session_id"] = sid

        msg = _safe_str(message)
        if not msg:
            return jsonify(
                _friendly_error_payload("Pehlay koi pegham likho.")
            ), 400

        doc = load_session_doc(sid)

        ts = _utc_now_iso()
        try:
            mood_val = int(mood) if mood is not None else None
            if mood_val is not None:
                mood_val = max(1, min(10, mood_val))
        except (TypeError, ValueError):
            mood_val = None

        if mood_val is not None:
            doc.setdefault("mood_history", []).append({"value": mood_val, "timestamp": ts})
            mh = doc["mood_history"]
            if isinstance(mh, list) and len(mh) > 30:
                doc["mood_history"] = mh[-30:]

        prior_msgs: list[dict[str, Any]] = []
        for m in doc.get("messages", []) or []:
            if isinstance(m, dict) and _safe_str(m.get("content")):
                r = _safe_str(m.get("role")).lower()
                if r not in ("user", "model"):
                    continue
                prior_msgs.append(
                    {"role": "user" if r == "user" else "model", "content": _safe_str(m.get("content"))}
                )

        history_for_ai = prior_msgs[-40:]

        user_entry = {"role": "user", "content": msg, "timestamp": ts}
        doc.setdefault("messages", []).append(user_entry)

        # Persist immediately after every user message (crash-safe before Gemini).
        session_file = _session_path(sid)
        with open(session_file, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)

        def _count_user_turns(messages: Any) -> int:
            if not isinstance(messages, list):
                return 0
            n = 0
            for mm in messages:
                if isinstance(mm, dict) and _safe_str(mm.get("role")).lower() == "user":
                    if _safe_str(mm.get("content")):
                        n += 1
            return n

        user_turn_ix = _count_user_turns(doc["messages"])

        ai_pack = orchestrator.process(
            msg,
            mood_val,
            sid,
            history_for_ai,
            message_index=user_turn_ix,
        )
        ai_ts = _utc_now_iso()
        ai_text = _safe_str(ai_pack.get("response"))
        returned_insight = ai_pack.get("memory_insight")
        ef = ai_pack.get("extracted_facts")
        if isinstance(ef, dict):
            doc["extracted_facts"] = ef

        emo_saved = _safe_str(ai_pack.get("emotion"), max_len=24).lower()
        if emo_saved not in ALLOWED_EMOTIONS:
            emo_saved = "okay"
        doc["last_emotion"] = emo_saved

        ai_entry = {
            "role": "model",
            "content": ai_text or "Hmm, abhi kuch clear nahi. Dobara zaroor likhna.",
            "timestamp": ai_ts,
        }
        doc["messages"].append(ai_entry)

        with open(session_file, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)

        return jsonify(
            {
                "response": ai_text,
                "emotion": emo_saved,
                "emotion_color": ai_pack.get("color"),
                "urdu_label": ai_pack.get("urdu_label"),
                "emotion_emoji": ai_pack.get("emoji"),
                "suggested_exercise": ai_pack.get("suggested_exercise") or "none",
                "memory_insight": returned_insight,
                "technique_used": ai_pack.get("technique_used"),
                "risk_level": ai_pack.get("risk_level"),
                "timestamp": ai_ts,
            }
        )
    except Exception as e:
        print("/chat:", e)
        traceback.print_exc()
        return jsonify(
            _friendly_error_payload(
                "Yaar internet check karo — server pe kuch masla aa gaya hai, dobara try karo."
            )
        ), 500


@app.post("/clear-history")
def clear_history_route():
    try:
        data = request.get_json(silent=True) or {}
        sid = _safe_str(data.get("session_id"), max_len=80) or session.get("session_id")
        if not sid:
            return jsonify(_friendly_error_payload("Session nahi mila.")), 400

        blank = _new_session(sid)
        greet = (
            "Sab saf ho gaya. Phir se shuru kartay hain — main yahan hun. "
            "Aaj subah se sab se zyada kya chub raha hai?"
        )
        blank["messages"].append(
            {"role": "model", "content": greet, "timestamp": _utc_now_iso()},
        )
        save_session_doc(blank)
        return jsonify({"ok": True, "success": True, "session": blank})
    except Exception as e:
        print("/clear-history:", e)
        traceback.print_exc()
        return jsonify(_friendly_error_payload("Safai nahi ho saki — dobara try karo.")), 500


@app.post("/clear-all-sessions")
def clear_all_sessions_route():
    try:
        for p in SESSIONS_DIR.glob("*.json"):
            try:
                p.unlink()
            except OSError:
                pass
        new_sid = str(uuid.uuid4())
        session["session_id"] = new_sid
        doc = _new_session(new_sid)
        greet = (
            "Naya safe space shuru — main Sukoon AI hoon. "
            "Jo bhi dil pe hai, araam se likho; hum saath hain."
        )
        doc["messages"].append({"role": "model", "content": greet, "timestamp": _utc_now_iso()})
        save_session_doc(doc)
        return jsonify({"ok": True, "success": True, "session_id": new_sid})
    except Exception as e:
        print("/clear-all-sessions:", e)
        traceback.print_exc()
        return jsonify(_friendly_error_payload("Sab saf nahi kar paye."))


@app.post("/generate-report")
def generate_weekly_report_route():
    """Build AI-analyzed weekly wellness PDF for the current session."""
    try:
        if not GEMINI_API_KEY:
            return jsonify(_friendly_error_payload("GEMINI_API_KEY server par set nahi hai.")), 503

        payload = request.get_json(silent=True) or {}
        sid = _safe_str(payload.get("session_id"), max_len=80) or session.get("session_id")
        if not sid:
            return jsonify(_friendly_error_payload("Session nahi mila.")), 400

        doc = load_session_doc(sid)
        if not session_report_eligible(doc):
            return jsonify(
                _friendly_error_payload("Pehle thodi baat karo, phir report banegi!"),
            ), 400

        hist_blob = serialize_session_for_report(doc)
        ai_struct = gemini_weekly_report_insights(hist_blob)
        insights_pack = build_weekly_insights_for_pdf(doc, ai_struct)
        pdf_bytes = build_weekly_report_pdf(doc, insights_pack)

        fname = f"Sukoon-AI-Report-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.pdf"
        buf = BytesIO(pdf_bytes)
        buf.seek(0)
        try:
            return send_file(
                buf,
                mimetype="application/pdf",
                as_attachment=True,
                download_name=fname,
            )
        except TypeError:
            return send_file(
                buf,
                mimetype="application/pdf",
                as_attachment=True,
                attachment_filename=fname,
            )
    except Exception as e:
        print("/generate-report:", e)
        traceback.print_exc()
        return jsonify(_friendly_error_payload("Report nahi ban saki — thori dair baad try karo.")), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
