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
        "motivational_message": "Ek qadam roz kaafi hai. Tum deserving ho araam aur sukoon ke 🤍",
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
    buf = BytesIO()
    base = getSampleStyleSheet()

    pdf = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Sukoon AI Weekly Report",
    )

    cover_title = ParagraphStyle(
        "rt",
        parent=base["Heading1"],
        fontName=FONT_BOLD,
        fontSize=19,
        textColor=WHITE,
        alignment=TA_CENTER,
        leading=24,
    )
    cover_sub = ParagraphStyle(
        "rs",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=10,
        textColor=HexColor("#EDE9FE"),
        alignment=TA_CENTER,
        leading=13,
    )
    h2 = ParagraphStyle(
        "h2",
        parent=base["Heading2"],
        fontName=FONT_BOLD,
        fontSize=13,
        textColor=PRIMARY,
        spaceBefore=14,
        spaceAfter=8,
        leading=16,
    )
    body = ParagraphStyle(
        "bd",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=10,
        textColor=TEXT_BODY,
        leading=14,
        alignment=TA_LEFT,
    )
    quote = ParagraphStyle(
        "qt",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=11,
        textColor=WHITE,
        alignment=TA_CENTER,
        leading=15,
    )
    foot = ParagraphStyle(
        "ft",
        parent=base["Normal"],
        fontName=FONT,
        fontSize=8,
        textColor=TEXT_MUTED,
        alignment=TA_CENTER,
        leading=10,
    )

    full_w = A4[0] - 32 * mm

    story: list[Any] = []

    header = Table(
        [
            [Paragraph(_xml_escape("🧠 Sukoon AI — Aapki Weekly Report"), cover_title)],
            [Paragraph(_xml_escape("Aapki mental wellness journey ka ek jhalak"), cover_sub)],
        ],
        colWidths=[full_w],
    )
    header.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
                ("TOPPADDING", (0, 0), (-1, -1), 16),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 18),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    story.append(header)
    story.append(Spacer(1, 8))

    week_lbl = insights.get("week_label") or "Is hafte"
    story.append(Paragraph(_xml_escape(f"<i>Week of {week_lbl}</i>"), foot))
    story.append(Spacer(1, 2))
    story.append(HorizontalRule(full_w - 32, PRIMARY))
    story.append(Spacer(1, 10))

    mood_vals = insights.get("mood_values") or []
    avg = round(sum(mood_vals) / len(mood_vals), 1) if mood_vals else 0.0
    trend_txt = insights.get("trend_arrow_label") or compute_trend_label(mood_vals)

    story.append(Paragraph(_xml_escape("📊 Aapka Mood Journey"), h2))
    story.append(
        Paragraph(
            _xml_escape(
                f"<b>Average mood score:</b> {avg:.1f} / 10 &nbsp;&nbsp; <b>Trend arrow:</b> {trend_txt}"
            ),
            body,
        )
    )
    story.append(Spacer(1, 4))

    vals_draw = mood_vals if len(mood_vals) >= 2 else ([mood_vals[0]] if mood_vals else [5.0])
    story.append(DrawingPDF(mood_line_chart(vals_draw)))

    story.append(Spacer(1, 12))
    story.append(Paragraph(_xml_escape("💭 Aapke Jazbaat Is Hafte"), h2))

    ef = insights.get("emotion_freq") or {"okay": 2}
    story.append(DrawingPDF(emotion_bar_chart(ef)))

    story.append(Spacer(1, 12))
    story.append(Paragraph(_xml_escape("🤖 Sukoon AI ki Raay"), h2))
    warm = insights.get("warm_analysis") or ""
    story.append(Paragraph(_xml_escape(warm), body))

    stressors = insights.get("stressors") or []
    if stressors:
        story.append(Spacer(1, 6))
        tag_html = " &bull; ".join(_xml_escape(s) for s in stressors)
        story.append(Paragraph(_xml_escape("<b>Key themes / stressors:</b> ") + tag_html, body))

    story.append(Spacer(1, 10))
    story.append(Paragraph(_xml_escape("✨ Aapki Khubiyaan"), h2))
    for line in insights.get("positive_observations") or []:
        story.append(Paragraph(_xml_escape(f"✅ {line}"), body))
        story.append(Spacer(1, 3))

    story.append(Spacer(1, 8))
    story.append(Paragraph(_xml_escape("💡 Aglay Hafte Ke Liye"), h2))
    icons = ["🌿", "💧", "☀️", "📓", "🤝"]
    for i, line in enumerate(insights.get("recommendations") or []):
        ic = icons[i % len(icons)]
        story.append(Paragraph(_xml_escape(f"{ic} {line}"), body))
        story.append(Spacer(1, 3))

    story.append(Spacer(1, 10))
    mot = insights.get("motivational_message") or "Tum deserving ho araam aur sukoon ke 🤍"
    qt = ParagraphStyle(
        "qti",
        parent=quote,
        fontName=FONT,
        italic=True,
    )

    mq = Table(
        [[Paragraph(_xml_escape(mot.replace("\n", " ")), qt)]],
        colWidths=[full_w],
    )
    mq.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ]
        )
    )
    story.append(mq)

    story.append(Spacer(1, 16))
    story.append(
        Paragraph(_xml_escape("Sukoon AI — Pakistan ka pehla Roman Urdu Mental Health Assistant"), foot)
    )
    story.append(Paragraph(_xml_escape("Yeh report sirf aapke liye hai 🤍"), foot))
    story.append(Paragraph(_xml_escape("Mushkil waqt mein: Umang 0317-4288665"), foot))

    pdf.build(story)
    return buf.getvalue()
