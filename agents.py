"""
Multi-agent Sukoon AI: Memory + Emotion + Therapy + Orchestrator.
Each agent calls Gemini separately (gemini-1.5-flash). Failures are contained with fallbacks.
"""

from __future__ import annotations

import json
import re
import traceback
from pathlib import Path
from typing import Any

import google.generativeai as genai
from google.api_core import exceptions as gexc

AGENT_PRIMARY_MODEL = "gemini-1.5-flash"
AGENT_MODEL_FALLBACK = "models/gemini-1.5-flash"

DATA_ROOT = Path("data")
SESSIONS_DIR = DATA_ROOT / "sessions"
PROFILE_DIR = DATA_ROOT / "profiles"

ALLOWED_PRIMARY = frozenset({"anxiety", "sad", "stressed", "angry", "okay", "happy"})
ALLOWED_EXERCISES = frozenset({"breathing", "grounding", "none"})

EMOTION_COLORS: dict[str, str] = {
    "anxiety": "#A78BFA",
    "sad": "#60A5FA",
    "stressed": "#F59E0B",
    "angry": "#F87171",
    "okay": "#34D399",
    "happy": "#FBBF24",
}
EMOTION_EMOJI: dict[str, str] = {
    "anxiety": "ANX",
    "sad": "SAD",
    "stressed": "STR",
    "angry": "ANG",
    "okay": "OK",
    "happy": "HAP",
}
URDU_LABELS: dict[str, str] = {
    "anxiety": "پریشانی",
    "sad": "اداسی",
    "stressed": "تھکاوٹ",
    "angry": "غصہ",
    "okay": "ٹھیک",
    "happy": "خوشی",
}

HIGH_CRISIS_KEYWORDS = (
    "suicide",
    "suicidal",
    "khudkushi",
    "khud kushi",
    "mar jana chahta",
    "mar jaun",
    "mar jaao",
    "zindagi khatam",
    "khud khushi",
    "self harm",
    "hurt myself",
    "mary zindagi",
    "qatil",
)

MEDIUM_CRISIS_HINTS = (
    "tang aa gaya",
    "tang aa gayi",
    "reh hi nahi",
    "kis kaam ki zindagi",
)


def safe_str(value: Any, max_len: int = 16000) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    return value[:max_len] if len(value) > max_len else value


def strip_code_fence(text: str) -> str:
    t = safe_str(text, max_len=32000)
    if t.startswith("```"):
        lines = t.splitlines()
        lines = lines[1:] if lines else []
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


def extract_first_json(text: str) -> str | None:
    t = strip_code_fence(text).strip()
    start = t.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(t)):
        ch = t[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return t[start : i + 1].strip()
    return None


def _quotaish(err: BaseException) -> bool:
    msg = str(err).lower()
    if isinstance(err, gexc.ResourceExhausted):
        return True
    tm = getattr(gexc, "TooManyRequests", None)
    if tm is not None and isinstance(err, tm):
        return True
    if getattr(err, "code", None) == 429:
        return True
    if "resource exhausted" in msg or ("quota" in msg and ("exhaust" in msg or "429" in msg)):
        return True
    return False


def _generation_config(**kwargs: Any):
    gc_mod = getattr(genai, "types", None)
    if gc_mod is None:
        return None
    ctor = getattr(gc_mod, "GenerationConfig", None)
    if ctor is None:
        return None
    args = {k: v for k, v in kwargs.items() if v is not None}
    if not args:
        return None
    try:
        return ctor(**args)
    except Exception:
        return None


def gemini_plain_text(
    prompt: str,
    *,
    system_instruction: str | None = None,
    temperature: float | None = None,
    max_output_tokens: int | None = None,
) -> str:
    gen_cfg = _generation_config(
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    for model_name in (AGENT_PRIMARY_MODEL, AGENT_MODEL_FALLBACK):
        try:
            kwargs_model: dict[str, Any] = {"model_name": model_name}
            if system_instruction:
                kwargs_model["system_instruction"] = system_instruction
            model = genai.GenerativeModel(**kwargs_model)
            if gen_cfg is not None:
                res = model.generate_content(prompt, generation_config=gen_cfg)
            else:
                res = model.generate_content(prompt)
            return safe_str(getattr(res, "text", ""))
        except gexc.NotFound:
            continue
        except Exception as e:
            if _quotaish(e):
                print(f"agents: quota on {model_name!r}:", e)
                traceback.print_exc()
                return ""
            print(f"agents: gemini error on {model_name!r}:", e)
            traceback.print_exc()
            return ""
    return ""


def _micro_hint_line(ml: str) -> str:
    if "exam" in ml or "paper" in ml or "test" in ml:
        return "Aaj sirf aik chota target choose karo (25 min) aur phir 5 min break."
    if "neend" in ml or "sleep" in ml or "sone" in ml:
        return "Aaj raat lights dim + screen thori jaldi band karke try karo."
    if "ghar" in ml or "family" in ml or "ma" in ml or "baap" in ml:
        return "Abhi bas itna karo: 2 minute ka break lo, pani pi lo, aur jo baat kehni hai usko aik simple line mein likh lo."
    if "anxiety" in ml or "ghabra" in ml or "panic" in ml:
        return "Abhi 4-count inhale / 6-count exhale 5 rounds kar ke dekho."
    return "Thora sa context likho: kab se aur kis cheez se start hua?"


def therapy_fallback_bundle(message: str, emotion_data: dict[str, Any]) -> dict[str, Any]:
    u = safe_str(message, max_len=280).strip().replace('"', "'").replace("\n", " ")
    ml = u.lower()
    pe = safe_str(str(emotion_data.get("primary_emotion", "okay"))).lower()

    if "exam" in ml or "paper" in ml or "test" in ml:
        tail_q = "Sub se heavy pressure kis subject/paper se lag rahi hai kal tak?"
    elif "neend" in ml or "sleep" in ml or "sone" in ml:
        tail_q = "Neend toot rahi jagte rehnay se hai ya jag kar so nahi sakte?"
    elif "ghar" in ml or "family" in ml:
        tail_q = "Ghar walon ki kis expectation/baat ne aaj sab se zyada chauband kiya?"
    elif "akela" in ml or "lonely" in ml or "tanha" in ml:
        tail_q = "Akela zyada raat aa raha ya din ka koi waqt spike karta?"
    elif "anxiety" in ml or "ghabra" in ml or "panic" in ml or pe == "anxiety":
        tail_q = "Triggers zyada body mein (dhadkan/tight chest) dikhte ya dimagh mein loop?"
    else:
        tail_q = "Is feeling ka sab se recent moment kaunsa tha jo ab tak yaad hai?"

    # 4-sentence fallback: validation → empathy → practical step → caring question
    def _validation() -> str:
        if "anxiety" in ml or "ghabra" in ml or "panic" in ml or pe == "anxiety":
            return "Anxiety feel hona bilkul samajh aata hai."
        if "udaas" in ml or "sad" in ml or pe == "sad":
            return "Udaasi feel hona bilkul theek hai."
        if "ghar" in ml or "family" in ml:
            return "Ghar ki tension se thak jana bilkul normal hai."
        if "exam" in ml or "paper" in ml or "test" in ml:
            return "Exam ka pressure heavy lagna bilkul natural hai."
        return "Yeh feeling valid hai, aur tum akelay nahi ho."

    def _empathy() -> str:
        return "Yaar yeh sach mein mushkil hai, is waqt dimaag aur jism dono heavy ho jate hain."

    step = _micro_hint_line(ml)
    reply = f"{_validation()} {_empathy()} {step} {tail_q}"

    ex = "none"
    if pe in ("anxiety", "stressed") or any(k in ml for k in ("anxiety", "ghabra", "panic")):
        ex = "breathing"
    elif pe in ("sad", "angry"):
        ex = "grounding"
    tech = (
        "grounding anchors"
        if ex == "grounding"
        else ("paced breathing" if ex == "breathing" else "focused reflection")
    )
    return {
        "response": reply,
        "suggested_exercise": ex,
        "technique_used": tech,
        "follow_up_needed": True,
    }


def _sanitize_session_file_stem(session_id: str) -> str:
    return "".join(c for c in session_id if c.isalnum() or c in "-_") or "anon"


class MemoryAgent:
    def extract_facts(self, message: str, history: list[dict[str, Any]]) -> dict[str, Any]:
        msg = safe_str(message, max_len=8000)
        if not msg:
            return {}

        lines: list[str] = []
        if isinstance(history, list):
            for row in history[-8:]:
                if not isinstance(row, dict):
                    continue
                r = safe_str(row.get("role"), max_len=8).lower()
                c = safe_str(row.get("content"), max_len=500)
                if not c:
                    continue
                pref = "user" if r == "user" else "assistant"
                lines.append(f"{pref}: {c}")
        hs = "\n".join(lines)

        prompt = (
            "Extract important personal facts from this message. Return ONLY JSON: "
            '{ "name":"","age":"","city":"","occupation":"","issues":[],"relationships":[],'
            '"recent_events":[],"mood_pattern":"" }. Only include explicitly mentioned facts.'
            '\nIssues/relationships/recent_events must be SHORT string arrays.'
            f"\nRecent chat context:\n{hs}\nMessage: {msg}"
        )
        raw = gemini_plain_text(
            prompt,
            system_instruction="Return JSON object only.",
            temperature=0.7,
            max_output_tokens=768,
        )

        defaults: dict[str, Any] = {
            "name": "",
            "age": "",
            "city": "",
            "occupation": "",
            "issues": [],
            "relationships": [],
            "recent_events": [],
            "mood_pattern": "",
        }
        blob = extract_first_json(raw or "") if raw else None
        if not blob:
            return defaults
        try:
            data = json.loads(blob)
            if not isinstance(data, dict):
                return defaults
            out = defaults.copy()
            for k in ("name", "age", "city", "occupation", "mood_pattern"):
                out[k] = safe_str(str(data.get(k, "")), max_len=200)
            for k in ("issues", "relationships", "recent_events"):
                v = data.get(k)
                if isinstance(v, list):
                    out[k] = [safe_str(str(x), max_len=200) for x in v[:24] if safe_str(str(x))]
            return out
        except json.JSONDecodeError:
            return defaults

    def _profile_path(self, session_id: str) -> Path:
        return PROFILE_DIR / f"{_sanitize_session_file_stem(safe_str(session_id, max_len=80))}.json"

    def _load_envelope(self, session_id: str) -> dict[str, Any]:
        p = self._profile_path(session_id)
        if not p.exists():
            return {}
        try:
            with open(p, encoding="utf-8") as f:
                obj = json.load(f)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    def _merge_profiles(self, base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
        merged: dict[str, Any] = dict(base) if isinstance(base, dict) else {}
        for k in ("name", "age", "city", "occupation", "mood_pattern"):
            pv = safe_str(patch.get(k, ""))
            if pv:
                merged[k] = pv
            merged.setdefault(k, "")
        for k in ("issues", "relationships", "recent_events"):
            old = merged.get(k) if isinstance(merged.get(k), list) else []
            new = patch.get(k) if isinstance(patch.get(k), list) else []
            seen = {safe_str(str(x)).lower() for x in old}
            combo = list(old)
            for item in new:
                sitem = safe_str(str(item))
                low = sitem.lower()
                if not sitem or low in seen:
                    continue
                seen.add(low)
                combo.append(sitem)
                if len(combo) >= 42:
                    break
            merged[k] = combo
        return merged

    def merge_and_save_facts(self, session_id: str, facts: dict[str, Any]) -> dict[str, Any]:
        PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        sid = safe_str(session_id, max_len=80)
        if not sid:
            return {}
        env_in = self._load_envelope(sid)
        current = env_in.get("profile") if isinstance(env_in.get("profile"), dict) else {}
        merged = self._merge_profiles(current, facts)
        out = {"session_anchor": sid, "profile": merged}
        try:
            with open(self._profile_path(sid), "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=2)
        except Exception:
            traceback.print_exc()
        return merged

    def build_context(self, session_id: str) -> dict[str, Any]:
        """Scan session JSON files; merge cross-session hints into profile for this anchor."""
        PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        sid = safe_str(session_id, max_len=80)
        if not sid:
            return {}
        env_in = self._load_envelope(sid)
        merged: dict[str, Any] = (
            env_in.get("profile") if isinstance(env_in.get("profile"), dict) else {}
        )

        snippets: list[str] = []
        if SESSIONS_DIR.exists():
            sortable: list[tuple[float, Path]] = []
            for pth in SESSIONS_DIR.glob("*.json"):
                try:
                    sortable.append((pth.stat().st_mtime, pth))
                except OSError:
                    continue
            sortable.sort(key=lambda x: x[0], reverse=True)
            for _, pth in sortable[:20]:
                try:
                    with open(pth, encoding="utf-8") as sf:
                        sdoc = json.load(sf)
                    parts: list[str] = []
                    for m in (sdoc.get("messages") or [])[:60]:
                        if not isinstance(m, dict):
                            continue
                        if safe_str(m.get("role")).lower() != "user":
                            continue
                        c = safe_str(m.get("content"), max_len=350)
                        if c:
                            parts.append(c)
                        if len(parts) >= 3:
                            break
                    if parts:
                        snippets.append(f"{pth.stem}:\n- " + "\n- ".join(parts[:3]))
                except Exception:
                    continue

        blob = "\n\n".join(snippets)[:8800]
        if not blob:
            return merged

        prompt = (
            "Merge these excerpts from Sukoon chats into ONE structured profile JSON ONLY."
            "\nNever invent. Keys: name, age, city, occupation, mood_pattern, issues[], "
            "relationships[], recent_events[].\n\n"
            f"Existing_hint: {json.dumps(merged, ensure_ascii=False)[:3500]}\n\nSESSION_EXCERPTS:\n{blob}"
        )
        raw = gemini_plain_text(
            prompt,
            system_instruction="Return JSON object only.",
            temperature=0.7,
            max_output_tokens=2048,
        )
        jb = extract_first_json(raw or "")
        if jb:
            try:
                data = json.loads(jb)
                if isinstance(data, dict):
                    patch: dict[str, Any] = {
                        "name": safe_str(str(data.get("name", "")), max_len=200),
                        "age": safe_str(str(data.get("age", "")), max_len=48),
                        "city": safe_str(str(data.get("city", "")), max_len=200),
                        "occupation": safe_str(str(data.get("occupation", "")), max_len=200),
                        "mood_pattern": safe_str(str(data.get("mood_pattern", "")), max_len=400),
                        "issues": data.get("issues") if isinstance(data.get("issues"), list) else [],
                        "relationships": (
                            data.get("relationships")
                            if isinstance(data.get("relationships"), list)
                            else []
                        ),
                        "recent_events": (
                            data.get("recent_events")
                            if isinstance(data.get("recent_events"), list)
                            else []
                        ),
                    }
                    merged = self._merge_profiles(merged, patch)
            except json.JSONDecodeError:
                pass

        merged = merged if isinstance(merged, dict) else {}
        out = {"session_anchor": sid, "profile": merged}
        try:
            with open(self._profile_path(sid), "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=2)
        except Exception:
            traceback.print_exc()
        return merged

    def get_memory_summary(self, session_id: str) -> str:
        env = self._load_envelope(safe_str(session_id, max_len=80))
        prof = env.get("profile") if isinstance(env.get("profile"), dict) else {}
        if not prof:
            return "Abhi zyada profile detail nahi mili."

        pj = json.dumps(prof, ensure_ascii=False)
        prompt = (
            'Roman Urdu + English mixed paragraph ONLY: "User ka naam X hai, wo Y city mein ..., '
            'issues ..." — max 380 characters.\nONLY use facts in profile JSON;\nJSON:\n' + pj[:8000]
        )
        txt = gemini_plain_text(
            prompt,
            system_instruction="Warm dost tone. No invention.",
            temperature=0.7,
            max_output_tokens=512,
        )
        t = safe_str(txt, max_len=450)
        if t:
            return t
        chunks: list[str] = []
        if prof.get("name"):
            chunks.append(safe_str(str(prof.get("name"))))
        if prof.get("city"):
            chunks.append(f"{safe_str(str(prof.get('city')))} se")
        if prof.get("issues") and isinstance(prof["issues"], list) and prof["issues"]:
            chunks.append("masle: " + ", ".join(safe_str(str(x)) for x in prof["issues"][:3]))
        return "Profile: " + " · ".join(chunks) if chunks else "Abhi zyada profile detail nahi mili."


class EmotionAgent:
    def detect_crisis(self, message: str) -> dict[str, Any]:
        msg_low = safe_str(message, max_len=8000).lower()
        hit_high = next((k for k in HIGH_CRISIS_KEYWORDS if k in msg_low), None)
        if hit_high:
            return {
                "is_crisis": True,
                "severity": "high",
                "reason": safe_str(hit_high, max_len=120),
            }
        hit_med = next((m for m in MEDIUM_CRISIS_HINTS if m in msg_low), None)
        if hit_med:
            return {
                "is_crisis": True,
                "severity": "medium",
                "reason": safe_str(hit_med, max_len=120),
            }

        probe = gemini_plain_text(
            safe_str(message, max_len=4000)
            + "\n\nAnswer ONLY compact JSON {\"is_crisis\":boolean,\"severity\":\"low\"|\"medium\"|\"high\","
            '"reason_short":""}',
            system_instruction='Detect self-harm or suicide acute risk. Conservative for "medium". JSON only.',
            temperature=0.7,
            max_output_tokens=256,
        )
        jb = extract_first_json(probe or "") if probe else None
        try:
            d = json.loads(jb or "{}") if jb else {}
            if isinstance(d, dict) and isinstance(d.get("is_crisis"), bool):
                sev = safe_str(str(d.get("severity", "low"))).lower()
                if sev not in ("low", "medium", "high"):
                    sev = "medium" if d.get("is_crisis") else "low"
                return {
                    "is_crisis": bool(d.get("is_crisis")),
                    "severity": sev,
                    "reason": safe_str(str(d.get("reason_short", ""))),
                }
        except json.JSONDecodeError:
            pass
        return {"is_crisis": False, "severity": "low", "reason": ""}

    def analyze(
        self,
        message: str,
        history: list[dict[str, Any]],
        mood_score: int | None,
    ) -> dict[str, Any]:
        mh = mood_score if isinstance(mood_score, int) else "unknown"
        last_lines = []
        if isinstance(history, list):
            for row in history[-5:]:
                if not isinstance(row, dict):
                    continue
                c = safe_str(row.get("content"), max_len=400)
                if c:
                    last_lines.append(c)
        hist_blob = "\n".join(last_lines)

        prompt = (
            "Analyze emotional state deeply. Return ONLY valid JSON:\n"
            "{\n"
            '  "primary_emotion": "anxiety"|"sad"|"stressed"|"angry"|"okay"|"happy",\n'
            '  "intensity": 1-10 number,\n'
            '  "triggers": ["..."],\n'
            '  "underlying_need": "...",\n'
            '  "risk_level": "low"|"medium"|"high",\n'
            '  "color": "#RRGGBB",\n'
            '  "urdu_label": "single Urdu word",\n'
            '  "emoji": "one emoji"\n'
            "}\n"
            f"Message: {safe_str(message, max_len=6000)}\n"
            f"Recent mood scores (current): {mh}\n"
            f"Last messages:\n{hist_blob}"
        )
        raw = gemini_plain_text(
            prompt,
            system_instruction="JSON only. No markdown.",
            temperature=0.7,
            max_output_tokens=1024,
        )
        jb = extract_first_json(raw or "") if raw else None

        def _fallback() -> dict[str, Any]:
            return {
                "primary_emotion": "okay",
                "intensity": 5,
                "triggers": [],
                "underlying_need": "sukoon aur sunwai",
                "risk_level": "low",
                "color": EMOTION_COLORS["okay"],
                "urdu_label": URDU_LABELS["okay"],
                "emoji": EMOTION_EMOJI["okay"],
            }

        if not jb:
            return _fallback()
        try:
            d = json.loads(jb)
            if not isinstance(d, dict):
                return _fallback()
            pe = safe_str(str(d.get("primary_emotion", "okay"))).lower()
            if pe not in ALLOWED_PRIMARY:
                pe = "okay"
            try:
                intensity = max(1, min(10, int(d.get("intensity", 5))))
            except (TypeError, ValueError):
                intensity = 5
            triggers = (
                [safe_str(str(x), max_len=120) for x in d["triggers"][:12]]
                if isinstance(d.get("triggers"), list)
                else []
            )
            need = safe_str(str(d.get("underlying_need", "")), max_len=400)
            rk = safe_str(str(d.get("risk_level", "low"))).lower()
            if rk not in ("low", "medium", "high"):
                rk = "low"
            col = safe_str(str(d.get("color", "")), max_len=12)
            if not re.match(r"^#[0-9A-Fa-f]{6}$", col):
                col = EMOTION_COLORS.get(pe, EMOTION_COLORS["okay"])
            urd = safe_str(str(d.get("urdu_label", "")), max_len=40) or URDU_LABELS[pe]
            emoj = safe_str(str(d.get("emoji", "")), max_len=8) or EMOTION_EMOJI[pe]
            return {
                "primary_emotion": pe,
                "intensity": intensity,
                "triggers": triggers,
                "underlying_need": need,
                "risk_level": rk,
                "color": col,
                "urdu_label": urd,
                "emoji": emoj,
            }
        except (json.JSONDecodeError, TypeError, ValueError):
            return _fallback()


class TherapyAgent:
    def __init__(self) -> None:
        self._preferred_model = AGENT_PRIMARY_MODEL

    def respond(
        self,
        message: str,
        emotion_analysis: dict[str, Any],
        memory_context: str,
        mood: int | None,
    ) -> dict[str, Any]:
        emotion_data = emotion_analysis if isinstance(emotion_analysis, dict) else {}
        base_fallback = therapy_fallback_bundle(message, emotion_data)

        user_msg = safe_str(message, max_len=6000).replace('"', "'")
        mem = safe_str(memory_context, max_len=2200).replace('"', "'")
        mood_disp = mood if isinstance(mood, int) else "unknown"
        emotion = safe_str(emotion_data.get("primary_emotion", "okay"), max_len=24)
        intensity = emotion_data.get("intensity", 5)
        try:
            intensity = int(intensity)
        except Exception:
            intensity = 5

        system_prompt = f"""
Tum Sukoon AI ho — Pakistan ka pehla Roman Urdu mental health 
support chatbot. Tum ek caring, warm dost ho jo mental health 
samajhta hai.

SABSE IMPORTANT RULES:
1. Pehle user ki feeling VALIDATE karo — judge mat karo
2. Phir EMPATHY dikhao — "yaar yeh sach mein mushkil hai"
3. Phir EK chota practical suggestion do
4. End mein EK caring sawaal

OUTPUT CONSTRAINTS (must follow):
- Roman Urdu only
- Exactly 4 sentences (no more, no less), in this order:
  1) Validation
  2) Empathy ("yaar yeh sach mein mushkil hai" style)
  3) One small practical step (breathing / grounding / tiny next action)
  4) One caring question (sirf ek sawal)
- No life-coach tone, no lectures, no clinical/robotic language

USER NE YEH KAHA: {user_msg}
EMOTION: {emotion} (intensity: {intensity}/10)
MOOD: {mood_disp}/10
MEMORY: {mem}

RESPONSE EXAMPLES based on what they say:

If anxiety:
"Yaar anxiety sach mein bahut tiring hoti hai — jism aur dimaag 
dono thak jaate hain. Abhi ek kaam karo — 4 second saans lo, 
4 second roko, 4 second mein chodo. Yeh cycle 3 baar karo.
Kya anxiety kisi specific cheez ki wajah se hai ya bas aise hi?"

If sad/udaas:
"Udaasi ko feel karna bilkul theek hai yaar — isko daba mat.
Kabhi kabhi bas koi sunne wala chahiye hota hai. Main yahan hun.
Kya aaj kuch aisa hua jo specially heavy feel hua?"

If family tension:
"Ghar ki tension bahut drain karti hai yaar — woh jagah jo 
safe honi chahiye wahan bhi chain nahi — yeh sach mein bahut 
mushkil hai. Kya tum mujhe thoda aur bata sakte ho kya ho raha hai?"

If exam stress:
"Exam ka pressure overwhelming ho sakta hai — especially jab 
lagta hai sab kuch is pe depend karta hai. Yaar ek kaam karo —
abhi sirf aaj ka ek subject, ek chapter. Bas itna. 
Kaunsa subject sabse zyada scary lag raha hai?"

NEVER:
- Generic \"Main yahan hun sunne ke liye\"
- \"courageous\" word use karna
- Life coaching advice
- \"Aik calm line soch lo\" (yeh exact line kabhi mat likhna)
- English-only responses
- Robotic/clinical language

ALWAYS:
- Roman Urdu main baat karo
- Personal aur specific raho
- Warm dost ki tarah baat karo
- Maximum 4 sentences
"""

        prompt = system_prompt.strip()

        try:
            generation_config = genai.types.GenerationConfig(
                temperature=0.95,
                max_output_tokens=250,
            )
            forbidden_phrases = [
                "Aik calm line soch lo",
                "courageous",
                "Quick win",
                "yehi jagah pakad",
                "Achha tumne bola",
                "Tumhari wording",
                "Main yahan hun sunne ke liye",
            ]

            def _has_forbidden(t: str) -> bool:
                low = t.lower()
                for p in forbidden_phrases:
                    if p.lower() in low:
                        return True
                return False

            def _sentence_count(t: str) -> int:
                # Keep it simple: split by sentence enders; fall back to non-empty lines.
                parts = [s.strip() for s in re.split(r"[.!?؟]+", t) if s.strip()]
                if len(parts) >= 2:
                    return len(parts)
                lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
                return len(lines)

            for model_name in (self._preferred_model, AGENT_MODEL_FALLBACK):
                try:
                    model = genai.GenerativeModel(model_name=model_name)
                    resp = model.generate_content(prompt, generation_config=generation_config)
                    text = safe_str(getattr(resp, "text", ""), max_len=6000).strip()

                    # If the model violates rules, do a single corrective retry.
                    if text and (_has_forbidden(text) or _sentence_count(text) != 4):
                        fix_prompt = (
                            "Tumhara pichla jawab rules tor gaya.\n"
                            "Ab dobara likho aur inn rules ko strictly follow karo:\n"
                            "- Roman Urdu only\n"
                            "- Exactly 4 sentences (validation, empathy, 1 practical step, 1 caring question)\n"
                            "- In phrases ko kabhi mat likhna: "
                            + ", ".join([f'"{p}"' for p in forbidden_phrases])
                            + "\n\n"
                            f"User: {user_msg}\n"
                            f"Emotion: {emotion} (intensity {intensity}/10)\n"
                            f"Mood: {mood_disp}/10\n"
                            f"Memory: {mem}\n"
                        )
                        resp2 = model.generate_content(fix_prompt, generation_config=generation_config)
                        text2 = safe_str(getattr(resp2, "text", ""), max_len=6000).strip()
                        if text2 and not _has_forbidden(text2):
                            text = text2

                    if text and not _has_forbidden(text):
                        # Note: exercise suggestion stays conservative; frontend handles exercises separately.
                        return {
                            "response": text,
                            "suggested_exercise": "none",
                            "technique_used": "validation + practical step",
                            "follow_up_needed": True,
                        }
                except gexc.NotFound:
                    continue
            raise RuntimeError("Empty Gemini response")
        except Exception:
            return base_fallback


class OrchestratorAgent:
    def __init__(self) -> None:
        self.memory = MemoryAgent()
        self.emotion = EmotionAgent()
        self.therapy = TherapyAgent()

    def process(
        self,
        message: str,
        mood: int | None,
        session_id: str,
        history: list[dict[str, Any]],
        *,
        message_index: int = 0,
    ) -> dict[str, Any]:
        msg = safe_str(message, max_len=8000)
        sid = safe_str(session_id, max_len=80)
        if not msg or not sid:
            return {
                "response": "Kuch likho to sahi — main sun rahi hun.",
                "emotion": "okay",
                "color": EMOTION_COLORS["okay"],
                "urdu_label": URDU_LABELS["okay"],
                "emoji": EMOTION_EMOJI["okay"],
                "suggested_exercise": "none",
                "memory_insight": None,
                "technique_used": "",
                "follow_up_needed": False,
                "risk_level": "low",
                "extracted_facts": {},
                "crisis_mode": False,
            }

        # Step 1 — crisis
        try:
            crisis = self.emotion.detect_crisis(msg)
        except Exception:
            crisis = {"is_crisis": False, "severity": "low", "reason": ""}

        severity = safe_str(str(crisis.get("severity", "low"))).lower()

        emergency = (
            "Main tumhari baat sunkar behad fikar-mand hun. Tum bilkul akelay nahi ho."
            "\nPLEASE abhi Umang Crisis Helpline pe call lagao ya message karo — trained log hamesha khade hote hain: "
            "**0317-4288665**.\n"
            'Agar khatra abhi aur zyada ho to **1122** ya apne qareebi hospital/emergency.'
            "\nHum phir baat zaroor karenge jab tum thori hifazat mein ho."
        )

        if crisis.get("is_crisis") and severity == "high":
            return {
                "response": emergency,
                "emotion": "anxiety",
                "color": EMOTION_COLORS["anxiety"],
                "urdu_label": URDU_LABELS["anxiety"],
                "emoji": EMOTION_EMOJI["anxiety"],
                "suggested_exercise": "none",
                "memory_insight": "Crisis — helpline suggest ki.",
                "technique_used": "Crisis triage & safety routing",
                "follow_up_needed": True,
                "risk_level": "high",
                "extracted_facts": {},
                "crisis_mode": True,
            }

        # Step 2 — memory facts from this message
        facts: dict[str, Any] = {}
        try:
            facts = self.memory.extract_facts(msg, history)
        except Exception:
            facts = {}
        try:
            self.memory.merge_and_save_facts(sid, facts)
        except Exception:
            traceback.print_exc()

        # Step 3 — emotion deep analysis
        emo: dict[str, Any]
        try:
            emo = self.emotion.analyze(msg, history, mood)
        except Exception:
            emo = {
                "primary_emotion": "okay",
                "intensity": 5,
                "triggers": [],
                "underlying_need": "",
                "risk_level": "low",
                "color": EMOTION_COLORS["okay"],
                "urdu_label": URDU_LABELS["okay"],
                "emoji": EMOTION_EMOJI["okay"],
            }

        if crisis.get("is_crisis") and severity == "medium":
            emo["risk_level"] = "medium"

        # Merge cross-session context (throttled) before summary so get_memory_summary sees updates
        try:
            if message_index % 4 == 0 or message_index <= 1:
                self.memory.build_context(sid)
        except Exception:
            traceback.print_exc()

        # Step 4 — memory paragraph for therapist
        mem_summary = ""
        try:
            mem_summary = self.memory.get_memory_summary(sid)
        except Exception:
            mem_summary = ""

        # Step 5 — therapy response
        try:
            ther = self.therapy.respond(msg, emo, mem_summary, mood)
        except Exception:
            ther = therapy_fallback_bundle(msg, emo if isinstance(emo, dict) else {})

        reply = safe_str(ther.get("response", ""), max_len=8000)
        if crisis.get("is_crisis") and severity == "medium" and emergency[:40] not in reply:
            reply = (
                "Dil pe bohat bojh lag raha hai — pehle apni hifazat zaroori hai. "
                "Agar dil mein khatray wali soch aaye to **Umang 0317-4288665** abhi try karo.\n\n" + reply
            )

        mem_insight = safe_str(mem_summary, max_len=480) or None

        return {
            "response": reply,
            "emotion": emo.get("primary_emotion", "okay"),
            "color": emo.get("color", EMOTION_COLORS["okay"]),
            "urdu_label": emo.get("urdu_label", URDU_LABELS["okay"]),
            "emoji": emo.get("emoji", EMOTION_EMOJI["okay"]),
            "suggested_exercise": ther.get("suggested_exercise") or "none",
            "memory_insight": mem_insight,
            "technique_used": safe_str(str(ther.get("technique_used", "")), max_len=200),
            "follow_up_needed": bool(ther.get("follow_up_needed")),
            "risk_level": emo.get("risk_level", "low"),
            "extracted_facts": facts,
            "crisis_mode": bool(crisis.get("is_crisis")),
            "emotion_analysis": emo,
        }
