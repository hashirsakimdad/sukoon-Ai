"""
Weekly Mental Health PDF (ReportLab only) — Sukoon AI.
Roman Urdu / English friendly (Latin script via Helvetica).
"""

from __future__ import annotations

from io import BytesIO
from typing import Any

from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Circle, Drawing, Line, PolyLine, Rect, String
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"

PRIMARY = HexColor("#8B5CF6")
TEAL = HexColor("#14B8A6")
WHITE = HexColor("#FFFFFF")
TEXT_BODY = HexColor("#1E293B")
TEXT_MUTED = HexColor("#64748B")
SURFACE = HexColor("#F8FAFC")
BORDER = HexColor("#E2E8F0")

EMOTION_FILL: dict[str, Any] = {
    "anxiety": HexColor("#A78BFA"),
    "sad": HexColor("#60A5FA"),
    "stressed": HexColor("#F59E0B"),
    "angry": HexColor("#F87171"),
    "okay": HexColor("#34D399"),
    "happy": HexColor("#FBBF24"),
}


def _xml_escape(text: str) -> str:
    s = "" if text is None else str(text)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class DrawingPDF(Flowable):
    """Platypus wrapper for reportlab.graphics Drawing."""

    def __init__(self, drawing: Drawing, gap: float = 6):
        Flowable.__init__(self)
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


class HorizontalRule(Flowable):
    def __init__(self, width: float, color: Any, thickness: float = 0.9):
        Flowable.__init__(self)
        self.target_w = width
        self.color = color
        self.t = thickness

    def wrap(self, availWidth, availHeight):
        self.draw_w = min(self.target_w, availWidth)
        return self.draw_w, self.t + 4

    def draw(self):
        self.canv.saveState()
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.t)
        self.canv.line(0, 2, getattr(self, "draw_w", self.target_w), 2)
        self.canv.restoreState()


def mood_line_chart(values: list[float], w: float = 440, h: float = 120) -> Drawing:
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, rx=8, ry=8, fillColor=SURFACE, strokeColor=BORDER, strokeWidth=0.8))

    pad_l, pad_r, pad_b, pad_t = 34, 14, 22, 26
    iw = w - pad_l - pad_r
    ih = h - pad_b - pad_t

    for g in range(0, 11, 2):
        fy = pad_b + (g / 10.0) * ih
        d.add(Line(pad_l, fy, pad_l + iw, fy, strokeColor=BORDER, strokeWidth=0.4))

    vals = [max(1.0, min(10.0, float(x))) for x in (values or [5.0])]
    n = max(1, len(vals) - 1)

    pts: list[float] = []
    for i, v in enumerate(vals):
        xi = pad_l + (iw * (i / n)) if len(vals) > 1 else pad_l + iw / 2
        yi = pad_b + ((v - 1) / 9.0) * ih
        pts.extend([xi, yi])

    if len(vals) >= 2:
        d.add(PolyLine(pts, strokeColor=PRIMARY, strokeWidth=2))
    for i in range(0, len(pts), 2):
        d.add(Circle(pts[i], pts[i + 1], 4.5, fillColor=TEAL, strokeColor=PRIMARY, strokeWidth=1))

    d.add(String(10, h - 14, "Scale: 1 (low) → 10 (high)", fontName=FONT, fontSize=7, fillColor=TEXT_MUTED))
    return d


def emotion_bar_chart(freq: dict[str, int], w: float = 440, h: float = 110) -> Drawing:
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, rx=8, ry=8, fillColor=SURFACE, strokeColor=BORDER, strokeWidth=0.8))

    pairs = sorted(((k, int(v)) for k, v in freq.items() if int(v) > 0), key=lambda x: (-x[1], x[0]))
    if not pairs:
        d.add(
            String(
                140,
                h / 2,
                "Baat karte raho — emotions yahan appear honge",
                fillColor=TEXT_MUTED,
                fontName=FONT,
                fontSize=9,
            )
        )
        return d

    vmax = float(max(c for _, c in pairs))
    nbar = min(len(pairs), 6)
    bw = (w - 48) / float(nbar)

    for idx in range(nbar):
        emo, ct = pairs[idx]
        fc = EMOTION_FILL.get(emo, PRIMARY)
        bx = 24 + idx * bw + 4
        bh = max(10.0, (ct / vmax) * (h - 44))
        by = 26
        d.add(Rect(bx, by, bw - 8, bh, rx=3, ry=3, fillColor=fc, strokeWidth=0))
        d.add(String(bx + 2, 10, emo[:10], fontName=FONT, fontSize=7, fillColor=TEXT_MUTED))
        d.add(String(bx + bw / 2 - 6, h - 14, str(ct), fontName=FONT_BOLD, fontSize=9, fillColor=TEXT_BODY))

    return d


def compute_mood_values(mood_hist: Any) -> list[float]:
    if not isinstance(mood_hist, list):
        return []
    out: list[float] = []
    for m in mood_hist:
        if not isinstance(m, dict):
            continue
        try:
            v = int(m.get("value"))
        except (TypeError, ValueError):
            continue
        out.append(float(max(1, min(10, v))))
    return out


def compute_trend_label(vals: list[float]) -> str:
    if len(vals) < 2:
        return "→ Stable — abhi data thora hai, baat karte raho."
    mid = max(1, len(vals) // 2)
    a1 = sum(vals[:mid]) / len(vals[:mid])
    a2 = sum(vals[mid:]) / len(vals[mid:])
    d = a2 - a1
    if d > 0.35:
        return "↑ Mood behtar ho raha hai — shandar!"
    if d < -0.35:
        return "↓ Thora extra care — hum yahan hain."
    return "→ Stable — consistency bhi takat hai."


def heuristic_stressors(blob: str) -> list[str]:
    b = blob.lower()
    tags: list[str] = []
    if any(x in b for x in ("family", "ghar", "maa", "baap", "rishta", "saas", "bahu")):
        tags.append("family / ghar")
    if any(x in b for x in ("exam", "paper", "study", "university", "college", "test")):
        tags.append("studies")
    if any(x in b for x in ("job", "boss", "office", "career", "kaam")):
        tags.append("work")
    if any(x in b for x in ("dost", "friend", "relationship", "breakup", "pyaar")):
        tags.append("relationships")
    return tags[:6] or ["general life stress"]


def merge_emotion_counts(ai_freq: Any, fallback: dict[str, int]) -> dict[str, int]:
    allowed = set(EMOTION_FILL.keys())
    merged = {k: 0 for k in allowed}
    for k, v in fallback.items():
        kk = str(k).strip().lower()
        if kk in allowed:
            try:
                merged[kk] += max(0, int(v))
            except (TypeError, ValueError):
                pass

    if isinstance(ai_freq, list):
        for item in ai_freq:
            if not isinstance(item, dict):
                continue
            key = str(item.get("emotion", "")).strip().lower()
            if key not in allowed:
                key = "okay"
            try:
                c = int(item.get("count", 0))
            except (TypeError, ValueError):
                c = 0
            merged[key] += max(c, 0)

    merged = {k: v for k, v in merged.items() if v > 0}
    if not merged:
        merged = {"okay": 3}
    return merged


def default_insights(blob: str, mood_vals: list[float]) -> dict[str, Any]:
    hv = heuristic_stressors(blob)
    fv = heuristic_emotions_for_chart(blob)
    return {
        "week_label": "last sessions",
        "warm_analysis": "Aap ne apni feelings share ki — connection aur support lene ki yeh salahiyat hi bari baat hai. "
        "Roman Urdu / English mix mein sukoon dhoondhna normal hai.",
        "stressors": hv,
        "positive_observations": [
            "Aap help maangne se nahi dartay — yeh bravery hai.",
            "Chotti chotti baatein boltay rehnay se dimagh halke hotay hain.",
            "Consistency se baat kartay rehna self-respect hai.",
        ],
        "recommendations": [
            "Roz 10 min saans mashq ya short walk rakho.",
            "Ek safe dost / cousin se haal puso.",
            "Screen se 1 ghanta pehle phone band — neend better hoti hai.",
        ],
        "motivational_message": "Ek qadam roz kaafi hai. Tum araam aur sukoon deserve karte ho.",
        "trend_arrow_label": compute_trend_label(mood_vals),
        "emotion_freq": fv,
    }


def heuristic_emotions_for_chart(blob: str) -> dict[str, int]:
    """Coarse keyword counts for bar chart when AI omits structure."""
    b = blob.lower()
    f = {k: 0 for k in EMOTION_FILL}
    rules = [
        ("anxiety", ["anxiety", "panic", "ghabra", "dar", "worry"]),
        ("sad", ["udaas", "sad", "low", "depress", "rona"]),
        ("stressed", ["stress", "pressur", "thak", "burnout"]),
        ("angry", ["gussa", "angry", "frustrat"]),
        ("happy", ["khush", "happy", "acha", "great"]),
        ("okay", ["theek", "okay", "fine"]),
    ]
    for key, words in rules:
        for w in words:
            if w in b:
                f[key] += b.count(w)
    if sum(f.values()) == 0:
        return {"okay": 3}
    return f


def build_weekly_report_pdf(doc: dict[str, Any], insights: dict[str, Any]) -> bytes:
    """
    Professional A4 weekly report.
    Layout: Platypus + reportlab.graphics charts. Margins: 40px.
    """
    from datetime import datetime

    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.charts.lineplots import LinePlot
    from reportlab.graphics.charts.textlabels import Label

    buf = BytesIO()
    base = getSampleStyleSheet()

    MARGIN = 40  # px/pt
    pdf = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title="Sukoon AI Weekly Mental Health Report",
    )

    header_bg = HexColor("#7c6af7")
    teal = HexColor("#4ecdc4")

    title_style = ParagraphStyle(
        "t1",
        parent=base["Heading1"],
        fontName=FONT_BOLD,
        fontSize=20,
        textColor=WHITE,
        alignment=TA_LEFT,
        leading=24,
        spaceAfter=2,
    )
    sub_style = ParagraphStyle(
        "t2",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=11,
        textColor=HexColor("#F3F4FF"),
        alignment=TA_LEFT,
        leading=14,
        spaceAfter=0,
    )
    h2 = ParagraphStyle(
        "h2n",
        parent=base["Heading2"],
        fontName=FONT_BOLD,
        fontSize=13,
        textColor=HexColor("#0f172a"),
        spaceBefore=14,
        spaceAfter=8,
        leading=16,
    )
    body = ParagraphStyle(
        "bdn",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=10.5,
        textColor=HexColor("#0f172a"),
        leading=14,
        alignment=TA_LEFT,
    )
    small = ParagraphStyle(
        "sm",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=9,
        textColor=HexColor("#334155"),
        leading=12,
        alignment=TA_LEFT,
    )

    # --- derive user + dates ---
    extracted = doc.get("extracted_facts") if isinstance(doc.get("extracted_facts"), dict) else {}
    user_name = _xml_escape(str(extracted.get("name") or "").strip()) or "User"

    def _parse_dt(s: Any) -> datetime | None:
        if not s:
            return None
        try:
            return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        except Exception:
            return None

    msg_ts = [_parse_dt(m.get("timestamp")) for m in (doc.get("messages") or []) if isinstance(m, dict)]
    msg_ts = [t for t in msg_ts if t is not None]
    if msg_ts:
        start_dt = min(msg_ts)
        end_dt = max(msg_ts)
        date_range = f"{start_dt.strftime('%d %b %Y')} - {end_dt.strftime('%d %b %Y')}"
    else:
        date_range = "This week"

    # mood series
    mh = doc.get("mood_history") if isinstance(doc.get("mood_history"), list) else []
    mood_points: list[tuple[str, float]] = []
    for row in mh[-14:]:
        if not isinstance(row, dict):
            continue
        v = row.get("value")
        try:
            fv = float(v)
        except (TypeError, ValueError):
            continue
        fv = max(1.0, min(10.0, fv))
        dt = _parse_dt(row.get("timestamp"))
        lbl = dt.strftime('%d %b') if dt else "?"
        mood_points.append((lbl, fv))
    if not mood_points:
        mood_points = [("?", 5.0)]

    mood_vals = [v for _, v in mood_points]
    avg_mood = round(sum(mood_vals) / len(mood_vals), 1) if mood_vals else 0.0
    best_i = max(range(len(mood_vals)), key=lambda i: mood_vals[i]) if mood_vals else 0
    worst_i = min(range(len(mood_vals)), key=lambda i: mood_vals[i]) if mood_vals else 0

    # emotion breakdown
    ef = insights.get("emotion_freq") if isinstance(insights.get("emotion_freq"), dict) else {}
    mapped = {
        "Khush": int(ef.get("happy", 0) or 0),
        "Udaas": int(ef.get("sad", 0) or 0),
        "Anxious": int(ef.get("anxiety", 0) or 0),
        "Gussa": int(ef.get("angry", 0) or 0),
        "Neutral": int(ef.get("okay", 0) or 0),
    }
    if sum(mapped.values()) == 0:
        mapped["Neutral"] = 1
    dominant_em = max(mapped.items(), key=lambda kv: kv[1])[0]

    # sessions count (user turns)
    total_sessions = 0
    for m in doc.get("messages") or []:
        if isinstance(m, dict) and str(m.get("role", "")).lower() == "user" and str(m.get("content", "")).strip():
            total_sessions += 1

    # tips based on dominant
    tips_map = {
        "Udaas": [
            "Roz 10 minute dhoop mein baithein.",
            "Aaj ek choti walk ya halka sa stretch try karein.",
            "Ek apne insaan ko chota sa message kar dein.",
        ],
        "Anxious": [
            "Box breathing try karein — 4 second in, 4 hold, 4 out.",
            "Jo cheezein control mein hain unki short list bana lein.",
            "Coffee/energy drinks thore kam kar dein (agar ho).",
        ],
        "Gussa": [
            "Likhna shuru karein — jo gussa hai woh kagaz pe nikaalo.",
            "Aik break le kar paani piyein, 60 seconds pause.",
            "Trigger identify karein: aaj kis baat ne sab se zyada gussa diya?",
        ],
        "Khush": [
            "Is routine ko note kar lein: aaj kya cheez help kar rahi thi?",
            "Apne aap ko credit dein — consistency maintain karein.",
            "Aik choti celebration choose karein (simple reward).",
        ],
        "Neutral": [
            "Roz ka aik chota goal set karein (10-15 minutes).",
            "Neend ka time thora consistent rakhein.",
            "Aaj ek supportive cheez karein: walk, chai, ya journaling.",
        ],
    }
    tips = tips_map.get(dominant_em, tips_map["Neutral"])

    # --- build charts ---
    def mood_chart() -> Drawing:
        w, h = 480, 180
        d = Drawing(w, h)
        d.add(Rect(0, 0, w, h, rx=10, ry=10, fillColor=HexColor("#F8FAFC"), strokeColor=HexColor("#E2E8F0")))

        pad_l, pad_r, pad_b, pad_t = 44, 16, 32, 22
        plot = LinePlot()
        plot.x = pad_l
        plot.y = pad_b
        plot.width = w - pad_l - pad_r
        plot.height = h - pad_b - pad_t

        data = [(i, mood_vals[i]) for i in range(len(mood_vals))]
        plot.data = [data]
        plot.joinedLines = 1
        plot.lines[0].strokeColor = teal
        plot.lines[0].strokeWidth = 2

        plot.yValueAxis.valueMin = 1
        plot.yValueAxis.valueMax = 10
        plot.yValueAxis.valueStep = 1
        plot.yValueAxis.visibleGrid = 1
        plot.yValueAxis.gridStrokeColor = HexColor("#E2E8F0")
        plot.yValueAxis.gridStrokeWidth = 0.5
        plot.yValueAxis.labels.fontName = FONT
        plot.yValueAxis.labels.fontSize = 7

        plot.xValueAxis.valueMin = 0
        plot.xValueAxis.valueMax = max(1, len(mood_vals) - 1)
        plot.xValueAxis.valueStep = 1
        plot.xValueAxis.labels.fontName = FONT
        plot.xValueAxis.labels.fontSize = 7
        plot.xValueAxis.labels.angle = 0
        plot.xValueAxis.labelTextFormat = lambda v: mood_points[int(v)][0] if int(v) < len(mood_points) else ""

        d.add(plot)

        lab = Label()
        lab.setOrigin(12, h - 14)
        lab.setText("Mood scores by session (1 to 10)")
        lab.fontName = FONT_BOLD
        lab.fontSize = 9
        lab.fillColor = HexColor("#0f172a")
        d.add(lab)
        return d

    def emotion_chart() -> Drawing:
        w, h = 480, 170
        d = Drawing(w, h)
        d.add(Rect(0, 0, w, h, rx=10, ry=10, fillColor=HexColor("#F8FAFC"), strokeColor=HexColor("#E2E8F0")))

        labels = list(mapped.keys())
        values = [mapped[k] for k in labels]
        pad_l, pad_r, pad_b, pad_t = 44, 16, 36, 22
        bc = VerticalBarChart()
        bc.x = pad_l
        bc.y = pad_b
        bc.width = w - pad_l - pad_r
        bc.height = h - pad_b - pad_t
        bc.data = [values]
        bc.strokeColor = None
        bc.bars[0].fillColor = teal
        bc.valueAxis.valueMin = 0
        bc.valueAxis.valueMax = max(1, max(values))
        bc.valueAxis.valueStep = max(1, int(max(values) / 4) or 1)
        bc.valueAxis.visibleGrid = 1
        bc.valueAxis.gridStrokeColor = HexColor("#E2E8F0")
        bc.valueAxis.gridStrokeWidth = 0.5
        bc.valueAxis.labels.fontName = FONT
        bc.valueAxis.labels.fontSize = 7
        bc.categoryAxis.categoryNames = labels
        bc.categoryAxis.labels.fontName = FONT
        bc.categoryAxis.labels.fontSize = 7
        bc.categoryAxis.labels.angle = 0
        d.add(bc)

        lab = Label()
        lab.setOrigin(12, h - 14)
        lab.setText("Emotion breakdown (frequency)")
        lab.fontName = FONT_BOLD
        lab.fontSize = 9
        lab.fillColor = HexColor("#0f172a")
        d.add(lab)
        return d

    full_w = A4[0] - (2 * MARGIN)

    # --- story ---
    story: list[Any] = []

    head_tbl = Table(
        [
            [Paragraph(_xml_escape("Sukoon AI"), title_style)],
            [Paragraph(_xml_escape("Weekly Mental Health Report"), sub_style)],
            [Paragraph(_xml_escape(f"User: {user_name}"), sub_style)],
            [Paragraph(_xml_escape(f"Date range: {date_range}"), sub_style)],
        ],
        colWidths=[full_w],
    )
    head_tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), header_bg),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
            ]
        )
    )
    story.append(head_tbl)
    story.append(Spacer(1, 14))

    story.append(Paragraph(_xml_escape("Mood Graph"), h2))
    story.append(DrawingPDF(mood_chart()))
    story.append(Spacer(1, 10))

    story.append(Paragraph(_xml_escape("Emotion Breakdown"), h2))
    story.append(DrawingPDF(emotion_chart()))
    story.append(Spacer(1, 10))

    story.append(Paragraph(_xml_escape("Weekly Summary"), h2))
    summary_lines = [
        f"Is hafte aapka overall mood: {avg_mood:.1f}/10",
        f"Sabse mushkil din: {mood_points[worst_i][0]}",
        f"Sabse behtar din: {mood_points[best_i][0]}",
        f"Total sessions: {total_sessions}",
        f"Dominant emotion: {dominant_em}",
    ]
    for ln in summary_lines:
        story.append(Paragraph(_xml_escape(ln), body))
        story.append(Spacer(1, 2))

    story.append(Spacer(1, 8))
    story.append(Paragraph(_xml_escape("Personalized Tips"), h2))
    for t in tips[:3]:
        story.append(Paragraph(_xml_escape(f"- {t}"), body))
        story.append(Spacer(1, 2))

    story.append(Spacer(1, 14))
    story.append(Paragraph(_xml_escape("Crisis support: Umang 0317-4288665"), small))

    pdf.build(story)
    return buf.getvalue()
