"""
Weekly report PDF (ReportLab only).

This module is imported by `app.py`. Keep these exports stable:
- build_weekly_report_pdf
- compute_mood_values
- compute_trend_label
- default_insights
- heuristic_emotions_for_chart
- merge_emotion_counts
"""

from __future__ import annotations

import json
import traceback
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from reportlab.graphics import renderPDF
from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
from reportlab.graphics.charts.textlabels import Label
from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer

DATA_DIR = Path("data")
SESSIONS_DIR = DATA_DIR / "sessions"

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"

PURPLE = HexColor("#7c6af7")

MOOD_RED = HexColor("#e74c3c")
MOOD_YELLOW = HexColor("#f39c12")
MOOD_GREEN = HexColor("#2ecc71")

EMO_COLORS = {
    "Khush": HexColor("#2ecc71"),
    "Udaas": HexColor("#3498db"),
    "Anxious": HexColor("#9b59b6"),
    "Gussa": HexColor("#e74c3c"),
    "Neutral": HexColor("#95a5a6"),
}


def _xml_escape(text: str) -> str:
    s = "" if text is None else str(text)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class DrawingPDF(Flowable):
    def __init__(self, drawing: Drawing, gap: float = 8):
        super().__init__()
        self.drw = drawing
        self.gap = gap

    def wrap(self, availWidth, availHeight):
        self._scale = min(1.0, (availWidth - 2) / float(self.drw.width))
        self._w = self.drw.width * self._scale + 2
        self._h = self.drw.height * self._scale + self.gap
        return self._w, self._h

    def draw(self):
        self.canv.saveState()
        self.canv.translate(1, self.gap / 2)
        self.canv.scale(self._scale, self._scale)
        renderPDF.draw(self.drw, self.canv, 0, -self.drw.height)
        self.canv.restoreState()


def _parse_dt(s: Any) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def _read_all_session_docs() -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    if not SESSIONS_DIR.exists():
        return docs
    for p in SESSIONS_DIR.glob("*.json"):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
            if isinstance(d, dict):
                docs.append(d)
        except Exception:
            continue
    return docs


def _session_last_mood(doc: dict[str, Any]) -> float:
    mh = doc.get("mood_history")
    if isinstance(mh, list) and mh:
        for row in reversed(mh):
            if isinstance(row, dict):
                v = row.get("value")
                try:
                    fv = float(v)
                    return max(0.0, min(10.0, fv))
                except (TypeError, ValueError):
                    continue
    return 5.0


def _session_last_ts(doc: dict[str, Any]) -> datetime | None:
    ts: list[datetime] = []
    msgs = doc.get("messages")
    if isinstance(msgs, list):
        for m in msgs:
            if isinstance(m, dict):
                d = _parse_dt(m.get("timestamp"))
                if d:
                    ts.append(d)
    mh = doc.get("mood_history")
    if isinstance(mh, list):
        for row in mh:
            if isinstance(row, dict):
                d = _parse_dt(row.get("timestamp"))
                if d:
                    ts.append(d)
    d0 = _parse_dt(doc.get("created_at"))
    if d0:
        ts.append(d0)
    return max(ts) if ts else None


def _collect_week_docs(all_docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)
    picked: list[tuple[datetime, dict[str, Any]]] = []
    for d in all_docs:
        ts = _session_last_ts(d)
        if ts and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts and ts >= cutoff:
            picked.append((ts, d))
    picked.sort(key=lambda x: x[0])
    return [d for _, d in picked] if picked else all_docs


def _extract_user_text(all_docs: list[dict[str, Any]]) -> str:
    chunks: list[str] = []
    for d in all_docs:
        msgs = d.get("messages")
        if not isinstance(msgs, list):
            continue
        for m in msgs:
            if not isinstance(m, dict):
                continue
            if str(m.get("role", "")).lower() != "user":
                continue
            c = str(m.get("content", "")).strip()
            if c:
                chunks.append(c)
    return "\n".join(chunks)[:20000]


TOPIC_RULES: list[tuple[str, list[str]]] = [
    ("neend", ["neend", "sleep", "insomnia", "sone"]),
    ("exam", ["exam", "paper", "test", "parhai", "study", "assignment"]),
    ("ghar", ["ghar", "family", "ammi", "abba", "walid", "walida", "bhai", "behen"]),
    ("anxiety", ["anxiety", "panic", "ghabra", "dar", "worry"]),
    ("akela", ["akela", "lonely", "tanha"]),
    ("work", ["job", "work", "office", "boss", "career"]),
    ("relationship", ["relationship", "rishta", "breakup", "partner", "shaadi"]),
]


def _topic_counts(text: str) -> dict[str, int]:
    low = text.lower()
    out: dict[str, int] = {}
    for topic, words in TOPIC_RULES:
        c = 0
        for w in words:
            if w in low:
                c += low.count(w)
        if c > 0:
            out[topic] = c
    return out


def compute_trend_label(values: list[float]) -> str:
    if not values or len(values) < 2:
        return "stable"
    first = values[0]
    last = values[-1]
    diff = last - first
    if diff >= 0.8:
        return "improving"
    if diff <= -0.8:
        return "worsening"
    return "stable"


def compute_mood_values(doc: dict[str, Any]) -> list[float]:
    mh = doc.get("mood_history")
    out: list[float] = []
    if isinstance(mh, list):
        for row in mh:
            if isinstance(row, dict):
                try:
                    out.append(float(row.get("value")))
                except (TypeError, ValueError):
                    continue
    return [max(0.0, min(10.0, x)) for x in out]


def merge_emotion_counts(items: Any) -> dict[str, int]:
    merged: dict[str, int] = {}
    if isinstance(items, dict):
        for k, v in items.items():
            try:
                merged[str(k)] = int(v)
            except Exception:
                continue
        return merged
    if isinstance(items, list):
        for it in items:
            if isinstance(it, dict):
                emo = str(it.get("emotion", "")).strip()
                if not emo:
                    continue
                try:
                    merged[emo] = merged.get(emo, 0) + int(it.get("count", 0))
                except Exception:
                    continue
    return merged


def heuristic_emotions_for_chart(blob: str) -> dict[str, int]:
    low = blob.lower()
    rules = {
        "happy": ["khush", "happy", "acha", "great"],
        "sad": ["udaas", "sad", "rona", "low"],
        "anxiety": ["anxiety", "panic", "ghabra", "dar", "worry"],
        "angry": ["gussa", "angry", "frustrat"],
        "okay": ["theek", "ok", "fine", "neutral"],
    }
    out = {k: 0 for k in rules}
    for k, words in rules.items():
        for w in words:
            if w in low:
                out[k] += low.count(w)
    out = {k: v for k, v in out.items() if v > 0}
    return out or {"okay": 1}


def default_insights(blob: str, mood_vals: list[float]) -> dict[str, Any]:
    return {
        "week_label": "this week",
        "warm_analysis": "Is report mein aap ke is hafte ke trends aur topics ka snapshot hai.",
        "stressors": [],
        "positive_observations": [],
        "recommendations": [],
        "motivational_message": "Yahan aana hi pehla qadam hai.",
        "trend_arrow_label": compute_trend_label(mood_vals),
        "emotion_freq": heuristic_emotions_for_chart(blob),
    }


def _mood_bar_colors(scores: list[float]) -> list[Any]:
    cols: list[Any] = []
    for s in scores:
        if s <= 3:
            cols.append(MOOD_RED)
        elif s <= 6:
            cols.append(MOOD_YELLOW)
        else:
            cols.append(MOOD_GREEN)
    return cols


def _mood_chart(scores: list[float], w: int = 450, h: int = 220) -> Drawing:
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, rx=10, ry=10, fillColor=HexColor("#F8FAFC"), strokeColor=HexColor("#E2E8F0")))

    bc = VerticalBarChart()
    bc.x = 40
    bc.y = 35
    bc.width = w - 60
    bc.height = h - 70
    bc.data = [scores]
    bc.valueAxis.valueMin = 0
    bc.valueAxis.valueMax = 10
    bc.valueAxis.valueStep = 1
    bc.valueAxis.visibleGrid = 1
    bc.valueAxis.gridStrokeColor = HexColor("#E2E8F0")
    bc.valueAxis.labels.fontName = FONT
    bc.valueAxis.labels.fontSize = 8
    bc.categoryAxis.categoryNames = [f"Session {i+1}" for i in range(len(scores))]
    bc.categoryAxis.labels.fontName = FONT
    bc.categoryAxis.labels.fontSize = 7
    bc.categoryAxis.labels.angle = 0

    bc.barSpacing = 4
    bc.groupSpacing = 10
    bc.strokeColor = None

    # per-bar color
    try:
        bc.barFillColors = _mood_bar_colors(scores)
    except Exception:
        bc.bars[0].fillColor = HexColor("#4ecdc4")

    d.add(bc)
    d.add(String(12, h - 16, "Mood scores (0 to 10)", fontName=FONT_BOLD, fontSize=9, fillColor=HexColor("#0f172a")))

    # Score number on top of each bar (manual overlay; avoids barLabels incompatibilities)
    n = max(1, len(scores))
    for i, s in enumerate(scores):
        try:
            val = float(s)
        except (TypeError, ValueError):
            val = 5.0
        val = max(0.0, min(10.0, val))
        x = bc.x + ((i + 0.5) / n) * bc.width
        y = bc.y + (val / 10.0) * bc.height + 6
        d.add(String(x, y, str(int(round(val))), fontName=FONT_BOLD, fontSize=8, fillColor=HexColor("#0f172a"), textAnchor="middle"))
    return d


def _emotion_chart(em_counts: dict[str, int], w: int = 450, h: int = 220) -> Drawing:
    mapped = {
        "Khush": int(em_counts.get("happy", 0) or 0),
        "Udaas": int(em_counts.get("sad", 0) or 0),
        "Anxious": int(em_counts.get("anxiety", 0) or 0),
        "Gussa": int(em_counts.get("angry", 0) or 0),
        "Neutral": int(em_counts.get("okay", 0) or 0),
    }
    mapped = {k: v for k, v in mapped.items() if v > 0}
    if not mapped:
        mapped = {"Neutral": 1}

    labels = list(mapped.keys())
    values = [mapped[k] for k in labels]

    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, rx=10, ry=10, fillColor=HexColor("#F8FAFC"), strokeColor=HexColor("#E2E8F0")))

    bc = HorizontalBarChart()
    bc.x = 120
    bc.y = 40
    bc.width = w - 150
    bc.height = h - 80
    bc.data = [values]
    bc.categoryAxis.categoryNames = labels
    bc.categoryAxis.labels.fontName = FONT
    bc.categoryAxis.labels.fontSize = 8
    bc.valueAxis.valueMin = 0
    bc.valueAxis.valueMax = max(1, max(values))
    bc.valueAxis.valueStep = max(1, int(max(values) / 4) or 1)
    bc.valueAxis.visibleGrid = 1
    bc.valueAxis.gridStrokeColor = HexColor("#E2E8F0")
    bc.valueAxis.labels.fontName = FONT
    bc.valueAxis.labels.fontSize = 8
    bc.barSpacing = 6
    bc.groupSpacing = 8
    bc.strokeColor = None

    try:
        bc.barFillColors = [EMO_COLORS.get(lbl, HexColor("#4ecdc4")) for lbl in labels]
    except Exception:
        bc.bars[0].fillColor = HexColor("#4ecdc4")

    d.add(bc)
    d.add(String(12, h - 16, "Emotion frequency (this week)", fontName=FONT_BOLD, fontSize=9, fillColor=HexColor("#0f172a")))
    return d


def _kahaani_paragraph(session_count: int, topic_counts: dict[str, int], trend: str) -> tuple[str, list[str]]:
    topics_sorted = sorted(topic_counts.items(), key=lambda kv: kv[1], reverse=True)
    top_topic = topics_sorted[0][0] if topics_sorted else "general"

    if trend == "improving":
        trend_txt = "behtar hota gaya"
    elif trend == "worsening":
        trend_txt = "thoda mushkil hota gaya"
    else:
        trend_txt = "kaafi stable raha"

    para = (
        f"Is hafte aap ne {session_count} baar baat ki. "
        f"Aap ne zyada tar {top_topic} ke baare mein baat ki. "
        f"Aapka mood {trend_txt}."
    )
    topics_list = [k for k, _ in topics_sorted[:8]]
    return para, topics_list


def _personal_tips(dominant_em: str, topics: set[str]) -> list[str]:
    tips: list[str] = []

    if dominant_em == "Udaas" and "akela" in topics:
        tips.append("Roz ek purane dost ko message karein.")
    if dominant_em == "Anxious" and "exam" in topics:
        tips.append("Pomodoro technique try karein — 25 min kaam, 5 min break.")
    if dominant_em == "Anxious" and "neend" in topics:
        tips.append("Sone se 1 ghanta pehle screen band karein.")
    if dominant_em == "Gussa" and "ghar" in topics:
        tips.append("Ghar se 15 minute walk pe jaein jab tension ho.")
    if dominant_em in ("Anxious", "Neutral") and "anxiety" in topics:
        tips.append("Box breathing: 4 second andar, 4 hold, 4 bahar.")

    if "neend" in topics and len(tips) < 3:
        tips.append("Raat ko same wake time rakhein aur caffeine shaam se pehle.")
    if "exam" in topics and len(tips) < 3:
        tips.append("Aaj ka sirf aik chota target set karein (one topic).")
    if "ghar" in topics and len(tips) < 3:
        tips.append("Boundaries ke liye aik calm line practice karein aur timing choose karein.")
    if len(tips) < 3:
        tips.append("Aaj ek choti walk ya stretch kar ke body ko reset karein.")

    out: list[str] = []
    seen = set()
    for t in tips:
        if t not in seen:
            out.append(t)
            seen.add(t)
        if len(out) >= 3:
            break
    return out


def _encouragement(trend: str) -> str:
    if trend == "improving":
        return "Aap ne is hafte bahut himmat dikhai."
    if trend == "stable":
        return "Yahan aana hi pehla qadam hai."
    return "Mushkil waqt mein bhi aap ne baat ki — yeh kafi hai."


def build_weekly_report_pdf(doc: dict[str, Any], insights: dict[str, Any]) -> bytes:
    all_docs = _read_all_session_docs()
    use_docs = _collect_week_docs(all_docs) if all_docs else [doc]

    # user name (prefer current session extracted facts)
    user_name = "User"
    ex = doc.get("extracted_facts") if isinstance(doc.get("extracted_facts"), dict) else {}
    if str(ex.get("name") or "").strip():
        user_name = str(ex["name"]).strip()
    else:
        for d in use_docs:
            ef = d.get("extracted_facts") if isinstance(d.get("extracted_facts"), dict) else {}
            if str(ef.get("name") or "").strip():
                user_name = str(ef["name"]).strip()
                break

    ts_list = [_session_last_ts(d) for d in use_docs]
    ts_list = [t for t in ts_list if t]
    if ts_list:
        start = min(ts_list)
        end = max(ts_list)
        date_range = f"{start.strftime('%d %b %Y')} - {end.strftime('%d %b %Y')}"
    else:
        date_range = "This week"

    scores = [_session_last_mood(d) for d in use_docs] or [5.0]
    blob = _extract_user_text(use_docs)

    emo_freq = insights.get("emotion_freq") if isinstance(insights.get("emotion_freq"), dict) else {}
    emo_freq = emo_freq or heuristic_emotions_for_chart(blob)

    topics = _topic_counts(blob)
    trend = compute_trend_label(scores)

    mapped = {
        "Khush": int(emo_freq.get("happy", 0) or 0),
        "Udaas": int(emo_freq.get("sad", 0) or 0),
        "Anxious": int(emo_freq.get("anxiety", 0) or 0),
        "Gussa": int(emo_freq.get("angry", 0) or 0),
        "Neutral": int(emo_freq.get("okay", 0) or 0),
    }
    mapped = {k: v for k, v in mapped.items() if v > 0} or {"Neutral": 1}
    dominant_em = max(mapped.items(), key=lambda kv: kv[1])[0]

    kahaani, topic_list = _kahaani_paragraph(session_count=len(use_docs), topic_counts=topics, trend=trend)
    tips = _personal_tips(dominant_em, set(topic_list))
    close_line = _encouragement(trend)

    buf = BytesIO()
    base = getSampleStyleSheet()
    M = 50
    pdf = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=M,
        rightMargin=M,
        topMargin=M,
        bottomMargin=M,
        title="Sukoon AI Weekly Mental Health Report",
    )

    h_title = ParagraphStyle(
        "ht",
        parent=base["Heading1"],
        fontName=FONT_BOLD,
        fontSize=22,
        textColor=PURPLE,
        alignment=TA_LEFT,
        leading=26,
    )
    h_sub = ParagraphStyle(
        "hs",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=12,
        textColor=HexColor("#0f172a"),
        alignment=TA_LEFT,
        leading=15,
    )
    h_meta = ParagraphStyle(
        "hm",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=10,
        textColor=HexColor("#334155"),
        alignment=TA_LEFT,
        leading=13,
    )
    h_sec = ParagraphStyle(
        "h2",
        parent=base["Heading2"],
        fontName=FONT_BOLD,
        fontSize=13,
        textColor=HexColor("#0f172a"),
        alignment=TA_LEFT,
        spaceAfter=8,
        leading=16,
    )
    body = ParagraphStyle(
        "bd",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=11,
        textColor=HexColor("#0f172a"),
        alignment=TA_LEFT,
        leading=15,
    )

    story: list[Any] = []

    # SECTION 1 — HEADER
    story.append(Paragraph(_xml_escape("Sukoon AI"), h_title))
    story.append(Paragraph(_xml_escape("Aapki Weekly Mental Health Report"), h_sub))
    story.append(Paragraph(_xml_escape(f"Naam: {user_name}"), h_meta))
    story.append(Paragraph(_xml_escape(f"Date range: {date_range}"), h_meta))
    story.append(Spacer(1, 10))
    sep = Drawing(450, 10)
    sep.add(Line(0, 2, 450, 2, strokeColor=HexColor("#CBD5E1"), strokeWidth=1.2))
    story.append(DrawingPDF(sep, gap=0))
    story.append(Spacer(1, 20))

    # SECTION 2 — MOOD JOURNEY GRAPH
    story.append(Paragraph(_xml_escape("Is Hafte Aapka Mood Safar"), h_sec))
    story.append(DrawingPDF(_mood_chart(scores, w=450, h=220)))
    story.append(Spacer(1, 20))

    # SECTION 3 — EMOTION BREAKDOWN
    story.append(Paragraph(_xml_escape("Aapke Jazbaaat Is Hafte"), h_sec))
    story.append(DrawingPDF(_emotion_chart(emo_freq, w=450, h=220)))
    story.append(Spacer(1, 20))

    # SECTION 4 — AAPKI KAHANI
    story.append(Paragraph(_xml_escape("Aapki Kahani"), h_sec))
    story.append(Paragraph(_xml_escape(kahaani), body))
    story.append(Spacer(1, 10))
    if topic_list:
        story.append(Paragraph(_xml_escape("Aapne in cheezoon ke baare mein baat ki:"), body))
        story.append(Spacer(1, 6))
        for t in topic_list:
            story.append(Paragraph(_xml_escape(f"- {t}"), body))
            story.append(Spacer(1, 2))
    else:
        story.append(Paragraph(_xml_escape("Is hafte topics clear nahi hue — thori aur baat karen to report aur strong ho gi."), body))
    story.append(Spacer(1, 20))

    # SECTION 5 — PERSONAL TIPS
    story.append(Paragraph(_xml_escape("Personal Tips"), h_sec))
    for tip in tips:
        story.append(Paragraph(_xml_escape(f"- {tip}"), body))
        story.append(Spacer(1, 4))
    story.append(Spacer(1, 20))

    # SECTION 6 — ENCOURAGEMENT
    story.append(Paragraph(_xml_escape("Encouragement"), h_sec))
    story.append(Paragraph(_xml_escape(close_line), body))

    try:
        pdf.build(story)
    except Exception:
        traceback.print_exc()
        raise
    return buf.getvalue()

