(() => {
  const $ = (id) => document.getElementById(id);

  const STORAGE_SESSION = "sukoon_session_id";

  let bootstrap = {};
  try {
    const el = $("sukoon-bootstrap");
    bootstrap = JSON.parse((el && el.textContent) || "{}");
  } catch (_) {
    bootstrap = {};
  }

  let sessionId = localStorage.getItem(STORAGE_SESSION);
  if (!sessionId) {
    sessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(STORAGE_SESSION, sessionId);
  }

  /** @type {{role:string,content:string,timestamp?:string}[]} */
  let history = [];
  let moodSeries = [];

  const chatEl = $("chat");
  const chatScroll = $("chatScroll");
  const typingIndicator = $("typingIndicator");
  const inputEl = $("messageInput");
  const sendBtn = $("sendBtn");
  const reportHint = $("reportHint");
  const moodSlider = $("moodSlider");
  const moodEmoji = $("moodEmoji");
  const moodValue = $("moodValue");
  const moodChart = $("moodChart");
  const emotionBadge = $("emotionBadge");
  const emotionUrdu = $("emotionUrdu");
  const emotionEmojiEl = $("emotionEmoji");
  const themeToggle = $("themeToggle");
  const heroIntro = $("heroIntro");
  const heroStartBtn = $("heroStartBtn");
  const appMain = $("appMain");
  const memoryBar = $("memoryBar");
  const memoryInsightText = $("memoryInsightText");
  const clearHistoryBtn = $("clearHistoryBtn");
  const historySidebar = $("historySidebar");
  const historyBackdrop = $("historyBackdrop");
  const openSidebarBtn = $("openSidebarBtn");
  const sidebarClose = $("sidebarClose");
  const sessionsList = $("sessionsList");
  const clearAllSessionsBtn = $("clearAllSessionsBtn");
  const leftSidebar = $("leftSidebar");
  const navOpenBtn = $("navOpenBtn");
  const navBackdrop = $("navBackdrop");
  const exerciseBreathing = $("exerciseBreathing");
  const exerciseGrounding = $("exerciseGrounding");
  const breathCircle = $("breathCircle");
  const breathPhaseText = $("breathPhaseText");
  const breathTimer = $("breathTimer");
  const breathToggleBtn = $("breathToggleBtn");
  const hideBreathingBtn = $("hideBreathingBtn");
  const hideGroundingBtn = $("hideGroundingBtn");
  const groundingList = $("groundingList");
  const groundingDone = $("groundingDone");
  const groundingProgressFill = $("groundingProgressFill");
  const openNewTabBtn = $("openNewTabBtn");

  function getMoodEmoji(score) {
    if (score <= 2) return "😢";
    if (score <= 4) return "😔";
    if (score <= 6) return "😐";
    if (score <= 8) return "😊";
    return "😄";
  }

  function getMoodLabel(score) {
    if (score <= 2) return "Bahut Mushkil";
    if (score <= 4) return "Theek Nahi";
    if (score <= 6) return "Theek Hai";
    if (score <= 8) return "Acha Lag Raha";
    return "Bahut Acha";
  }

  function getEmotionEmoji(emotion) {
    const map = {
      khushi: "😊",
      happy: "😊",
      udaas: "😢",
      sad: "😢",
      anxious: "😰",
      anxiety: "😰",
      gussa: "😤",
      angry: "😤",
      neutral: "😐",
      ok: "😐",
      theek: "😐",
      dar: "😨",
      fear: "😨",
    };
    const key = String(emotion || "").toLowerCase();
    for (const [k, v] of Object.entries(map)) {
      if (key.includes(k)) return v;
    }
    return "💭";
  }

  const EMOTION_ICONS = {
    anxiety: "😰",
    sad: "😢",
    stressed: "😤",
    angry: "😤",
    okay: "😐",
    happy: "😊",
  };

  let chatSendInFlight = false;

  let breathingOn = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let breathPhaseTimer = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let breathTickTimer = null;

  let chartResizeObs = null;

  function padTime(d) {
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }

  function scrollChat(behavior = "smooth") {
    if (!chatScroll) return;
    requestAnimationFrame(() => {
      chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior });
    });
  }

  function setTyping(on) {
    if (!typingIndicator) return;
    typingIndicator.classList.toggle("hidden", !on);
    if (on) scrollChat();
  }

  function setMemoryBar(text) {
    const t = String(text || "").trim();
    if (!memoryBar || !memoryInsightText) return;
    if (!t) {
      memoryBar.classList.add("hidden");
      memoryInsightText.textContent = "";
      return;
    }
    memoryBar.classList.remove("hidden");
    memoryInsightText.textContent = t;
  }

  function setEmotionUI(emotion, color, urduLabel, customEmoji = null) {
    if (!emotionBadge || !emotionUrdu || !emotionEmojiEl) return;
    const em = String(emotion || "okay").toLowerCase();
    const col = color || "#14b8a6";
    const ico =
      typeof customEmoji === "string" && customEmoji.trim()
        ? customEmoji.trim()
        : getEmotionEmoji(`${em} ${urduLabel || ""}`) || EMOTION_ICONS[em] || EMOTION_ICONS.okay;
    emotionBadge.style.setProperty("--emotion-glow", col);
    const label = urduLabel ? `${capitalizeEmotion(em)} — ${urduLabel}` : capitalizeEmotion(em);
    emotionUrdu.textContent = label || em;
    emotionEmojiEl.textContent = ico;
  }

  function capitalizeEmotion(em) {
    const e = String(em || "").toLowerCase();
    if (!e) return "";
    return e.charAt(0).toUpperCase() + e.slice(1);
  }

  function hideExercises() {
    exerciseBreathing && exerciseBreathing.classList.add("hidden");
    exerciseGrounding && exerciseGrounding.classList.add("hidden");
    groundingDone && groundingDone.classList.add("hidden");
    stopBreathing();
  }

  function updateGroundingProgress() {
    if (!groundingList || !groundingProgressFill) return;
    const boxes = groundingList.querySelectorAll('input[type="checkbox"]');
    const n = boxes.length;
    let c = 0;
    boxes.forEach((b) => {
      if (b.checked) c += 1;
    });
    const pct = n ? (c / n) * 100 : 0;
    groundingProgressFill.style.width = `${pct}%`;
  }

  function showExercise(kind) {
    hideExercises();
    if (kind === "breathing" && exerciseBreathing) {
      exerciseBreathing.classList.remove("hidden");
      if (breathPhaseText) breathPhaseText.textContent = "Taiyar?";
      if (breathTimer) breathTimer.textContent = "—";
      if (breathToggleBtn) breathToggleBtn.textContent = "Shuru karo";
    } else if (kind === "grounding" && exerciseGrounding && groundingList) {
      exerciseGrounding.classList.remove("hidden");
      groundingList.innerHTML = "";
      if (groundingProgressFill) groundingProgressFill.style.width = "0%";
      groundingDone && groundingDone.classList.add("hidden");
      const rows = [
        "5 cheezein dekho",
        "4 cheezein chhuo",
        "3 awaazein suno",
        "2 cheezein sungho",
        "1 cheez chkho",
      ];
      rows.forEach((txt) => {
        const lbl = document.createElement("label");
        const ck = document.createElement("input");
        ck.type = "checkbox";
        const sp = document.createElement("span");
        sp.textContent = txt;
        lbl.appendChild(ck);
        lbl.appendChild(sp);
        groundingList.appendChild(lbl);
        ck.addEventListener("change", () => {
          updateGroundingProgress();
          const boxes = groundingList.querySelectorAll('input[type="checkbox"]');
          const ok = [...boxes].every((b) => b.checked);
          if (groundingDone) groundingDone.classList.toggle("hidden", !ok);
        });
      });
    }
  }

  function stopBreathing() {
    breathingOn = false;
    if (breathPhaseTimer) clearTimeout(breathPhaseTimer);
    breathPhaseTimer = null;
    if (breathTickTimer) clearInterval(breathTickTimer);
    breathTickTimer = null;
    if (breathCircle) breathCircle.classList.remove("animating");
    if (breathToggleBtn) breathToggleBtn.textContent = "Shuru karo";
    if (breathTimer) breathTimer.textContent = "—";
  }

  /**
   * @param {boolean} forceStart
   */
  function toggleBreathing(forceStart) {
    if (!breathCircle || !breathPhaseText || !breathTimer) return;
    const start = typeof forceStart === "boolean" ? forceStart : !breathingOn;
    stopBreathing();
    if (!start) return;
    breathingOn = true;
    breathToggleBtn && (breathToggleBtn.textContent = "Roko");
    breathCircle.classList.add("animating");

    const phases = [
      { txt: "Saans lo...", ms: 4000 },
      { txt: "Roko...", ms: 4000 },
      { txt: "Chhodo...", ms: 6000 },
    ];
    let idx = 0;
    /** @type {number} */
    let phaseEndsAt = 0;

    const tick = () => {
      const left = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
      breathTimer.textContent = left > 0 ? `${left}s` : "…";
    };

    const runPhase = () => {
      const ph = phases[idx];
      breathPhaseText.textContent = ph.txt;
      phaseEndsAt = Date.now() + ph.ms;
      tick();
      if (breathTickTimer) clearInterval(breathTickTimer);
      breathTickTimer = setInterval(tick, 180);
      if (breathPhaseTimer) clearTimeout(breathPhaseTimer);
      breathPhaseTimer = setTimeout(() => {
        idx = (idx + 1) % phases.length;
        runPhase();
      }, ph.ms);
    };

    runPhase();
  }

  function getMood() {
    if (!moodSlider) return 6;
    const v = parseInt(moodSlider.value, 10);
    return Number.isFinite(v) ? v : 6;
  }

  function updateMoodUI() {
    if (!moodEmoji || !moodValue || !moodSlider) return;
    const n = getMood();
    moodEmoji.textContent = getMoodEmoji(n);
    moodValue.textContent = `${getMoodLabel(n)} ${n}/10`;
    const den = document.querySelector(".mood-den");
    if (den) den.textContent = "";
    const t = (n - 1) / 9;
    moodSlider.style.background = `linear-gradient(90deg, 
      hsl(${220 - t * 40}, 70%, 48%), 
      var(--accent-purple), 
      var(--accent-teal))`;
  }

  function ensureMoodPoint(mood) {
    moodSeries.push(mood);
    if (moodSeries.length > 10) moodSeries = moodSeries.slice(-10);
  }

  function resizeCanvasPixels() {
    if (!moodChart) return;
    const cssW = moodChart.clientWidth || 200;
    const cssH = 50;
    const dpr = window.devicePixelRatio || 1;
    moodChart.width = Math.round(cssW * dpr);
    moodChart.height = Math.round(cssH * dpr);
    const ctx = moodChart.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMoodChart();
  }

  function drawMoodChart() {
    if (!moodChart) return;
    const ctx = moodChart.getContext("2d");
    if (!ctx) return;
    const w = moodChart.clientWidth || 200;
    const h = 50;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    const isLight = document.body.classList.contains("theme-light");
    ctx.fillStyle = isLight ? "rgba(15,23,42,0.04)" : "rgba(148,163,184,0.06)";
    ctx.fillRect(0, 0, w, h);

    for (let g = 1; g < 10; g += 2) {
      const gy = ((g - 1) / 9) * (h - 10) + 5;
      ctx.strokeStyle = "rgba(139,92,246,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(6, gy);
      ctx.lineTo(w - 6, gy);
      ctx.stroke();
    }

    const pts = moodSeries.slice(-10);
    if (pts.length < 2) {
      ctx.fillStyle = "#8b5cf6";
      ctx.beginPath();
      ctx.arc(w - 10, h / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const n = pts.length - 1;
    const pad = 8;
    const xStep = (w - pad * 2) / n;
    const yMap = (v) => h - pad - ((v - 1) / 9) * (h - pad * 2);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = pad + i * xStep;
      const y = yMap(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    pts.forEach((v, i) => {
      const x = pad + i * xStep;
      const y = yMap(v);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#14b8a6";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  function historyForPayload() {
    return history.slice(-40).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      content: String(m.content || ""),
    }));
  }

  /** -------- Text-only mode (no STT/TTS/Voice Mode) -------- */

  function autoResizeTextarea() {
    if (!inputEl) return;
    inputEl.style.height = "auto";
    const max = 120;
    const next = Math.min(inputEl.scrollHeight, max);
    inputEl.style.height = `${Math.max(44, next)}px`;
  }

  function updateSendState() {
    if (!sendBtn || !inputEl) return;
    const v = inputEl.value.trim();
    sendBtn.disabled = v.length === 0;
  }

  /**
   * @param {string} content
   * @param {string} stamp
   */
  function addAiBubble(content, stamp) {
    if (!chatEl) return;
    const row = document.createElement("article");
    row.className = "msg msg-ai";

    const wrap = document.createElement("div");
    wrap.className = "bubble-ai-wrap";

    const av = document.createElement("div");
    av.className = "avatar-teal";
    av.setAttribute("aria-hidden", "true");
    av.textContent = "AI";

    const bubble = document.createElement("div");
    bubble.className = "bubble-ai";

    const head = document.createElement("div");
    head.className = "bubble-ai-head";

    const text = document.createElement("p");
    text.className = "bubble-ai-text";
    text.style.margin = "0";
    text.textContent = content;

    head.appendChild(text);

    const time = document.createElement("time");
    time.textContent = stamp || "";
    bubble.appendChild(head);
    bubble.appendChild(time);

    wrap.appendChild(av);
    wrap.appendChild(bubble);
    row.appendChild(wrap);
    chatEl.appendChild(row);
    scrollChat();
  }

  function addUserBubble(content, stamp) {
    if (!chatEl) return;
    const row = document.createElement("article");
    row.className = "msg msg-user";
    const b = document.createElement("div");
    b.className = "bubble-user";
    const p = document.createElement("p");
    p.style.margin = "0";
    p.textContent = content;
    const t = document.createElement("time");
    t.textContent = stamp || "";
    b.appendChild(p);
    b.appendChild(t);
    row.appendChild(b);
    chatEl.appendChild(row);
    scrollChat();
  }

  function renderHistory(entries) {
    if (!chatEl) return;
    chatEl.innerHTML = "";
    history = [];

    entries.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const role = String(entry.role || "");
      const c = String(entry.content || "").trim();
      if (!c) return;
      const ts = entry.timestamp ? new Date(entry.timestamp) : new Date();
      const stamp = Number.isFinite(ts.getTime()) ? padTime(ts) : "";

      history.push({
        role: role === "user" ? "user" : "model",
        content: c,
        timestamp: entry.timestamp || "",
      });

      if (role === "user") addUserBubble(c, stamp);
      else addAiBubble(c, stamp);
    });
    scrollChat("auto");
  }

  async function hydrateFromServer() {
    try {
      const res = await fetch(`/history?session_id=${encodeURIComponent(sessionId)}`, {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session) return;
      sessionId = data.session.session_id || sessionId;
      localStorage.setItem(STORAGE_SESSION, sessionId);

      moodSeries =
        Array.isArray(data.session.mood_history) && data.session.mood_history.length
          ? data.session.mood_history.map((x) => x.value).filter((x) => typeof x === "number")
          : moodSeries.slice();

      moodSeries.length > 10 && (moodSeries = moodSeries.slice(-10));

      const msgs = Array.isArray(data.session.messages) ? data.session.messages : [];

      renderHistory(
        msgs.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          content: m.content,
          timestamp: m.timestamp,
        })),
      );

      const lastEmo = _safeLower(data.session.last_emotion);
      if (lastEmo && EMOTION_ICONS[lastEmo]) {
        setEmotionUI(lastEmo, glowForEmotion(lastEmo), urduGuess(lastEmo));
      }

      const ins = Array.isArray(data.session.memory_insights)
        ? data.session.memory_insights.filter(Boolean).pop()
        : "";
      if (typeof ins === "string" && ins) setMemoryBar(ins);
      else setMemoryBar(bootstrap.latest_memory_insight || "");

      resizeCanvasPixels();
      updateMoodUI();
    } catch (_) {
      setMemoryBar(bootstrap.latest_memory_insight || "");
    }
  }

  function _safeLower(s) {
    return String(s || "").toLowerCase();
  }

  function glowForEmotion(em) {
    const map = {
      anxiety: "#a78bfa",
      sad: "#60a5fa",
      stressed: "#f59e0b",
      angry: "#f87171",
      okay: "#14b8a6",
      happy: "#fbbf24",
    };
    return map[em] || "#14b8a6";
  }

  function urduGuess(em) {
    const map = {
      anxiety: "پریشانی",
      sad: "اداسی",
      stressed: "تھکاوٹ",
      angry: "غصہ",
      okay: "ٹھیک",
      happy: "خوشی",
    };
    return map[em] || map.okay;
  }

  async function chatRequest(payload) {
    const res = await fetch("/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "chat");
    return data;
  }

  async function sendMessage(rawText) {
    const text = String(rawText || "").trim();
    if (!text || !inputEl || !sendBtn || !chatEl) return;

    hideExercises();

    chatSendInFlight = true;

    const now = padTime(new Date());
    addUserBubble(text, now);
    history.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    inputEl.value = "";
    autoResizeTextarea();
    updateSendState();

    const moodVal = getMood();
    ensureMoodPoint(moodVal);
    resizeCanvasPixels();

    sendBtn.disabled = true;
    setTyping(true);

    try {
      const data = await chatRequest({
        message: text,
        mood: moodVal,
        history: historyForPayload(),
        session_id: sessionId,
      });

      const emotionKey = String(data.emotion || "okay").toLowerCase();
      const col = data.emotion_color || glowForEmotion(emotionKey);
      const urd = data.urdu_label || urduGuess(emotionKey);
      setEmotionUI(emotionKey, col, urd, data.emotion_emoji || null);

      const reply = String(data.response || "").trim();
      const stamp = padTime(data.timestamp ? new Date(data.timestamp) : new Date());
      addAiBubble(reply || "Kuch masla aa gaya, dobara try karo.", stamp);
      history.push({
        role: "model",
        content: reply,
        timestamp: data.timestamp || new Date().toISOString(),
      });

      if (data.memory_insight) setMemoryBar(data.memory_insight);

      const ex = String(data.suggested_exercise || "none");
      if (ex === "breathing" || ex === "grounding") showExercise(ex);
    } catch (e) {
      const net = !navigator.onLine || String(e.message || e).toLowerCase().includes("failed to fetch");
      const errText = net ? "Yaar internet check karo" : "Kuch masla aa gaya, dobara try karo.";
      addAiBubble(errText, padTime(new Date()));
      history.push({ role: "model", content: errText, timestamp: new Date().toISOString() });
    } finally {
      chatSendInFlight = false;
      setTyping(false);
      sendBtn.disabled = false;
      resizeCanvasPixels();
      updateMoodUI();
      inputEl.focus();
    }
  }

  function applyTheme(next) {
    const t = next === "light" ? "light" : "dark";
    document.body.classList.toggle("theme-light", t === "light");
    document.body.classList.toggle("theme-dark", t === "dark");
    localStorage.setItem("sukoon_theme", t);
    if (themeToggle) themeToggle.textContent = t === "light" ? "Dark" : "Light";
    resizeCanvasPixels();
    drawMoodChart();
  }

  function initTheme() {
    const saved = localStorage.getItem("sukoon_theme");
    applyTheme(saved === "light" ? "light" : "dark");
  }

  /* -------- Navigation / side panels -------- */

  function closeLeftNav() {
    document.body.classList.remove("nav-open");
    navBackdrop && navBackdrop.setAttribute("aria-hidden", "true");
  }

  function toggleLeftNav() {
    document.body.classList.toggle("nav-open");
    const open = document.body.classList.contains("nav-open");
    navBackdrop && navBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function openHistoryPanel() {
    closeLeftNav();
    document.body.classList.add("history-open");
    historySidebar && historySidebar.setAttribute("aria-hidden", "false");
    historyBackdrop && historyBackdrop.setAttribute("aria-hidden", "false");
    loadSessionsList();
  }

  function closeHistoryPanel() {
    document.body.classList.remove("history-open");
    historySidebar && historySidebar.setAttribute("aria-hidden", "true");
    historyBackdrop && historyBackdrop.setAttribute("aria-hidden", "true");
  }

  // Speech / TTS removed (text-only)

  async function loadSessionsList() {
    if (!sessionsList) return;
    sessionsList.innerHTML = "Load ho rahi hai…";
    try {
      const res = await fetch("/sessions", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.sessions) {
        sessionsList.textContent = "List nahi mili.";
        return;
      }

      sessionsList.innerHTML = "";
      data.sessions.forEach((row) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "history-item";
        const stamp = row.created_at
          ? new Date(row.created_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "?";

        const emKey = String(row.last_emotion || "okay").toLowerCase();
        const emoji = EMOTION_ICONS[emKey] || EMOTION_ICONS.okay;
        const prev = row.preview ? String(row.preview).trim() : "";
        const shortPrev = prev.length > 92 ? `${prev.slice(0, 90)}…` : prev || "—";

        const meta = document.createElement("span");
        meta.className = "history-item-meta";
        meta.textContent = stamp;

        const prevEl = document.createElement("span");
        prevEl.className = "history-item-preview";
        prevEl.textContent = shortPrev;

        const badge = document.createElement("span");
        badge.className = "history-item-badge";
        badge.textContent = `${emoji} ${emKey}`;

        btn.appendChild(meta);
        btn.appendChild(prevEl);
        btn.appendChild(badge);

        btn.addEventListener("click", async () => {
          await switchSession(row.session_id);
        });

        sessionsList.appendChild(btn);
      });

      if (!data.sessions.length) sessionsList.textContent = "Koi session nahi.";
    } catch (_) {
      sessionsList.textContent = "Network masla.";
    }
  }

  async function switchSession(sid) {
    try {
      const res = await fetch("/switch-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session) return;
      sessionId = data.session.session_id;
      localStorage.setItem(STORAGE_SESSION, sessionId);
      bootstrap.session_id = sessionId;
      closeHistoryPanel();

      moodSeries =
        Array.isArray(data.session.mood_history) && data.session.mood_history.length
          ? data.session.mood_history.map((x) => x.value).filter((x) => typeof x === "number")
          : [];
      moodSeries.length > 10 && (moodSeries = moodSeries.slice(-10));

      const msgs = data.session.messages || [];
      renderHistory(
        msgs.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          content: m.content,
          timestamp: m.timestamp,
        })),
      );

      const lem = _safeLower(data.session.last_emotion);
      if (lem && EMOTION_ICONS[lem]) setEmotionUI(lem, glowForEmotion(lem), urduGuess(lem));

      const ins = Array.isArray(data.session.memory_insights)
        ? data.session.memory_insights.filter(Boolean).pop()
        : "";
      setMemoryBar(typeof ins === "string" ? ins : "");

      resizeCanvasPixels();
    } catch (_) {}
  }

  async function clearCurrentHistory() {
    try {
      const res = await fetch("/clear-history", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session) return;
      sessionId = data.session.session_id;
      localStorage.setItem(STORAGE_SESSION, sessionId);
      moodSeries = [];
      hideExercises();
      setMemoryBar("");

      const msgs = Array.isArray(data.session.messages) ? data.session.messages : [];
      renderHistory(
        msgs.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          content: m.content,
          timestamp: m.timestamp,
        })),
      );

      resizeCanvasPixels();
      updateMoodUI();
    } catch (_) {}
  }

  async function clearAllSessions() {
    if (!confirm("Sab sessions hamesha ke liye saf ho jayengi. Theek hai?")) return;
    try {
      const res = await fetch("/clear-all-sessions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session_id) return;
      sessionId = data.session_id;
      localStorage.setItem(STORAGE_SESSION, sessionId);
      await hydrateFromServer();
      closeHistoryPanel();
    } catch (_) {}
  }

  /* Wire */
  openNewTabBtn &&
    openNewTabBtn.addEventListener("click", () => {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
    });

  // Voice UI removed (text-only)

  sendBtn &&
    sendBtn.addEventListener("click", () => {
      sendMessage(inputEl.value);
    });

  inputEl &&
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputEl.value);
      }
    });

  inputEl &&
    inputEl.addEventListener("input", () => {
      autoResizeTextarea();
      updateSendState();
    });

  moodSlider &&
    moodSlider.addEventListener("input", () => {
      updateMoodUI();
    });

  themeToggle &&
    themeToggle.addEventListener("click", () => {
      applyTheme(document.body.classList.contains("theme-light") ? "dark" : "light");
    });

  clearHistoryBtn && clearHistoryBtn.addEventListener("click", clearCurrentHistory);

  openSidebarBtn && openSidebarBtn.addEventListener("click", openHistoryPanel);
  sidebarClose && sidebarClose.addEventListener("click", closeHistoryPanel);
  historyBackdrop && historyBackdrop.addEventListener("click", closeHistoryPanel);

  navOpenBtn &&
    navOpenBtn.addEventListener("click", () => {
      toggleLeftNav();
    });

  navBackdrop &&
    navBackdrop.addEventListener("click", () => {
      closeLeftNav();
    });

  clearAllSessionsBtn && clearAllSessionsBtn.addEventListener("click", clearAllSessions);

  document.querySelectorAll(".chip-v").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeLeftNav();
      sendMessage(btn.getAttribute("data-prompt") || "");
    });
  });

  hideBreathingBtn && hideBreathingBtn.addEventListener("click", hideExercises);
  hideGroundingBtn && hideGroundingBtn.addEventListener("click", hideExercises);

  breathToggleBtn &&
    breathToggleBtn.addEventListener("click", () => {
      if (breathingOn) stopBreathing();
      else toggleBreathing(true);
    });

  async function generateReport() {
    const btns = document.querySelectorAll(".js-report-btn");
    if (!btns.length) return;

    btns.forEach((b) => {
      if (!b.dataset.reportHtml) b.dataset.reportHtml = b.innerHTML;
    });

    btns.forEach((b) => {
      b.disabled = true;
      b.classList.add("is-loading");
      b.innerHTML =
        '<span class="spinner-ring" aria-hidden="true"></span> Report ban rahi hai...';
    });

    if (reportHint) {
      reportHint.textContent = "Aapki report ban rahi hai...";
    }

    try {
      const res = await fetch("/generate-report", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!res.ok) {
        let msg = "Kuch masla aa gaya.";
        try {
          const j = await res.json();
          if (j && j.error) msg = String(j.error);
        } catch (_) {}
        if (reportHint) reportHint.textContent = msg;
        return;
      }

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/pdf")) {
        if (reportHint) reportHint.textContent = "Unexpected response — dubara try karo.";
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      a.download = `Sukoon-AI-Report-${y}-${m}-${day}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (reportHint) reportHint.textContent = "✅ Report download ho gayi!";
      setTimeout(() => {
        if (reportHint) reportHint.textContent = "";
      }, 4200);
    } catch (_) {
      if (reportHint) reportHint.textContent = "Network masla — dubara try karo.";
    } finally {
      btns.forEach((b) => {
        b.disabled = false;
        b.classList.remove("is-loading");
        b.innerHTML = b.dataset.reportHtml || "";
      });
    }
  }

  document.querySelectorAll(".js-report-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeLeftNav();
      generateReport();
    });
  });

  // Text-only mode.

  /* Init */
  initTheme();
  updateMuteButtonUI();
  setupSpeech();
  setEmotionUI("okay", glowForEmotion("okay"), urduGuess("okay"));
  setMemoryBar(bootstrap.latest_memory_insight || "");

  // Hero intro: show before chat loads.
  if (heroStartBtn && heroIntro && appMain) {
    const startApp = () => {
      heroIntro.classList.add("is-fading");
      appMain.classList.remove("app-main-hidden");
      appMain.classList.add("app-main-visible");
      window.setTimeout(() => {
        heroIntro.style.display = "none";
      }, 650);
    };
    heroStartBtn.addEventListener("click", startApp);
    // Safety: if user refreshes and wants immediate access, allow Esc to skip.
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") startApp();
    });
  } else if (appMain) {
    appMain.classList.remove("app-main-hidden");
    appMain.classList.add("app-main-visible");
  }

  if (history.length) renderHistory(history);
  else renderHistory([]);

  updateMoodUI();
  updateSendState();
  autoResizeTextarea();

  window.addEventListener("resize", () => resizeCanvasPixels());

  resizeCanvasPixels();
  hydrateFromServer();

  if (chartResizeObs) chartResizeObs.disconnect();
  if (window.ResizeObserver && moodChart) {
    chartResizeObs = new ResizeObserver(() => resizeCanvasPixels());
    chartResizeObs.observe(moodChart);
  }
})();
