(() => {
  const $ = (id) => document.getElementById(id);

  let bootstrap = {};
  try {
    const el = $("sukoon-bootstrap");
    bootstrap = JSON.parse((el && el.textContent) || "{}");
  } catch (_) {
    bootstrap = {};
  }

  let sessionId = bootstrap.session_id || "";

  /** @type {{role:string,content:string,timestamp?:string}[]} */
  let history = Array.isArray(bootstrap.history) ? bootstrap.history.slice() : [];
  let moodSeries = Array.isArray(bootstrap.mood_history)
    ? bootstrap.mood_history.map((m) => (m && typeof m.value === "number" ? m.value : null)).filter((n) => n != null)
    : [];

  const chatEl = $("chat");
  const typingIndicator = $("typingIndicator");
  const inputEl = $("messageInput");
  const sendBtn = $("sendBtn");
  const micBtn = $("micBtn");
  const micStatus = $("micStatus");
  const moodSlider = $("moodSlider");
  const moodEmoji = $("moodEmoji");
  const moodValue = $("moodValue");
  const moodChart = $("moodChart");
  const emotionBadge = $("emotionBadge");
  const emotionUrdu = $("emotionUrdu");
  const emotionEmojiEl = $("emotionEmoji");
  const themeToggle = $("themeToggle");
  const memoryBar = $("memoryBar");
  const memoryInsightText = $("memoryInsightText");
  const clearHistoryBtn = $("clearHistoryBtn");
  const sidebar = $("historySidebar");
  const sidebarBackdrop = $("sidebarBackdrop");
  const openSidebarBtn = $("openSidebarBtn");
  const sidebarClose = $("sidebarClose");
  const sessionsList = $("sessionsList");
  const clearAllSessionsBtn = $("clearAllSessionsBtn");
  const exerciseBreathing = $("exerciseBreathing");
  const exerciseGrounding = $("exerciseGrounding");
  const breathCircle = $("breathCircle");
  const breathPhaseText = $("breathPhaseText");
  const breathToggleBtn = $("breathToggleBtn");
  const hideBreathingBtn = $("hideBreathingBtn");
  const hideGroundingBtn = $("hideGroundingBtn");
  const groundingList = $("groundingList");
  const groundingDone = $("groundingDone");

  const EMOJI_BY_MOOD = (n) => {
    if (n <= 3) return "😔";
    if (n <= 5) return "😐";
    if (n <= 7) return "🙂";
    return "😊";
  };

  const EMOTION_ICONS = {
    anxiety: "😰",
    sad: "😢",
    stressed: "😤",
    angry: "😡",
    okay: "😐",
    happy: "😊",
  };

  /**
   * @param {number} mood
   */
  function ensureMoodPoint(mood) {
    moodSeries.push(mood);
    if (moodSeries.length > 10) moodSeries = moodSeries.slice(-10);
  }

  /** @type {SpeechRecognition | null} */
  let recognition = null;
  let listening = false;

  /** @type {ReturnType<typeof setInterval> | null} */
  let breathTimers = null;
  let breathingOn = false;

  function padTime(d) {
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }

  function scrollChat(behavior = "smooth") {
    if (!chatEl) return;
    requestAnimationFrame(() => {
      chatEl.scrollTo({ top: chatEl.scrollHeight, behavior });
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

  function setEmotionUI(emotion, color, urduLabel) {
    if (!emotionBadge || !emotionUrdu || !emotionEmojiEl) return;
    const em = String(emotion || "okay").toLowerCase();
    const col = color || "#34D399";
    emotionBadge.style.setProperty("--emotion", col);
    emotionUrdu.textContent = urduLabel || em;
    emotionEmojiEl.textContent = EMOTION_ICONS[em] || EMOTION_ICONS.okay;
  }

  function hideExercises() {
    exerciseBreathing && exerciseBreathing.classList.add("hidden");
    exerciseGrounding && exerciseGrounding.classList.add("hidden");
    groundingDone && groundingDone.classList.add("hidden");
    stopBreathing();
  }

  function showExercise(kind) {
    hideExercises();
    if (kind === "breathing" && exerciseBreathing) {
      exerciseBreathing.classList.remove("hidden");
      if (breathPhaseText) breathPhaseText.textContent = "Taiyar?";
      if (breathToggleBtn) breathToggleBtn.textContent = "Shuru karo";
    } else if (kind === "grounding" && exerciseGrounding && groundingList) {
      exerciseGrounding.classList.remove("hidden");
      groundingList.innerHTML = "";
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
          const boxes = groundingList.querySelectorAll('input[type="checkbox"]');
          const ok = [...boxes].every((b) => b.checked);
          if (groundingDone) groundingDone.classList.toggle("hidden", !ok);
        });
      });
    }
  }

  function stopBreathing() {
    breathingOn = false;
    if (breathTimers) clearTimeout(breathTimers);
    breathTimers = null;
    if (breathCircle) breathCircle.classList.remove("animating");
    if (breathToggleBtn) breathToggleBtn.textContent = "Shuru karo";
  }

  /**
   * @param {boolean} forceStart
   */
  function toggleBreathing(forceStart) {
    if (!breathCircle || !breathPhaseText) return;

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
    let i = -1;

    const next = () => {
      i = (i + 1) % phases.length;
      breathPhaseText.textContent = phases[i].txt;
      breathTimers = setTimeout(next, phases[i].ms);
    };
    next();
  }

  function getMood() {
    if (!moodSlider) return 6;
    const v = parseInt(moodSlider.value, 10);
    return Number.isFinite(v) ? v : 6;
  }

  function updateMoodUI() {
    if (!moodEmoji || !moodValue || !moodSlider) return;
    const n = getMood();
    moodEmoji.textContent = EMOJI_BY_MOOD(n);
    moodValue.textContent = String(n);
    moodSlider.style.background = `linear-gradient(90deg, hsl(${210 - n * 6},72%,52%), hsl(${45 + n * 2},78%,54%))`;
  }

  let chartResizeObs = null;

  function resizeCanvasPixels() {
    if (!moodChart) return;
    const cssW = moodChart.clientWidth || 300;
    const cssH = 80;
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
    const w = moodChart.clientWidth || 300;
    const h = 80;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle =
      document.body.classList.contains("theme-light") ? "rgba(15,23,42,0.04)" : "rgba(148,163,184,0.06)";
    ctx.fillRect(0, 0, w, h);

    for (let g = 1; g < 10; g++) {
      const gy = ((g - 1) / 9) * (h - 16) + 8;
      ctx.strokeStyle = "rgba(124,58,237,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, gy);
      ctx.lineTo(w - 8, gy);
      ctx.stroke();
    }

    const pts = moodSeries.slice(-10);
    if (pts.length < 2) {
      ctx.fillStyle = "#7c3aed";
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(w - 16, h / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const n = pts.length - 1;
    const pad = 10;
    const xStep = (w - pad * 2) / n;
    const yMap = (v) => h - pad - ((v - 1) / 9) * (h - pad * 2);

    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#7c3aed";
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
      ctx.arc(x, y, 4.4, 0, Math.PI * 2);
      ctx.fillStyle = "#0d9488";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  /** @type {{role:string,content:string}[]} */
  function historyForPayload() {
    return history.slice(-40).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      content: String(m.content || ""),
    }));
  }

  function addAiBubble(content, stamp) {
    if (!chatEl) return;
    const row = document.createElement("article");
    row.className = "msg msg-ai";
    const wrap = document.createElement("div");
    wrap.className = "bubble-inner";
    wrap.innerHTML = `<div class="avatar" aria-hidden="true">🧠</div>`;
    const p = document.createElement("div");
    p.className = "bubble-text-wrap";
    const text = document.createElement("p");
    text.className = "bubble-text";
    text.textContent = content;
    const meta = document.createElement("time");
    meta.className = "bubble-meta";
    meta.textContent = stamp || "";
    p.appendChild(text);
    p.appendChild(meta);
    wrap.appendChild(p);
    row.appendChild(wrap);
    chatEl.appendChild(row);
    scrollChat();
  }

  function addUserBubble(content, stamp) {
    if (!chatEl) return;
    const row = document.createElement("article");
    row.className = "msg msg-user";
    const b = document.createElement("div");
    b.className = "bubble";
    b.innerHTML =
      `<div class="bubble-body"></div>` + `<span class="bubble-meta">${stamp || ""}</span>`;
    const body = b.querySelector(".bubble-body");
    body.textContent = content;
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

      const ins = Array.isArray(data.session.memory_insights)
        ? data.session.memory_insights.filter(Boolean).pop()
        : "";
      if (typeof ins === "string" && ins) setMemoryBar(ins);
      else if (bootstrap.latest_memory_insight) setMemoryBar(bootstrap.latest_memory_insight);

      resizeCanvasPixels();
      updateMoodUI();
    } catch (_) {
      setMemoryBar(bootstrap.latest_memory_insight || "");
    }
  }

  async function analyzeEmotion(message) {
    const res = await fetch("/analyze-emotion", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "emotion");
    return data;
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

    const now = padTime(new Date());
    addUserBubble(text, now);
    history.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    inputEl.value = "";
    const moodVal = getMood();
    ensureMoodPoint(moodVal);
    resizeCanvasPixels();

    sendBtn.disabled = true;
    setTyping(true);

    try {
      const emotionData = await analyzeEmotion(text);
      const emotionKey = String(emotionData.emotion || "okay");
      const col = emotionData.color || "#34D399";
      const urd = emotionData.urdu_label || "";
      setEmotionUI(emotionKey, col, urd);

      const data = await chatRequest({
        message: text,
        mood: moodVal,
        history: historyForPayload(),
        emotion: emotionKey,
        session_id: sessionId,
      });

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
      const errText = net
        ? "Yaar internet check karo 🤍"
        : "Kuch masla aa gaya, dobara try karo.";
      addAiBubble(errText, padTime(new Date()));
      history.push({ role: "model", content: errText, timestamp: new Date().toISOString() });
    } finally {
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
    if (themeToggle) themeToggle.textContent = t === "light" ? "🌙" : "☀️";
  }

  function initTheme() {
    const saved = localStorage.getItem("sukoon_theme");
    applyTheme(saved === "light" ? "light" : "dark");
  }

  function setupSpeech() {
    if (!micBtn || !inputEl) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.disabled = true;
      if (micStatus) micStatus.textContent = "Voice is not supported in this browser.";
      return;
    }
    recognition = new SR();
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.lang = "ur-PK";

    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add("listening");
      if (micStatus) micStatus.textContent = "Sun raha hun...";
    };
    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove("listening");
      if (micStatus) micStatus.textContent = "";
    };
    recognition.onerror = (ev) => {
      if (String(ev.error || "").toLowerCase().includes("language")) {
        try {
          recognition.lang = "en-US";
        } catch (_) {}
      }
      if (micStatus) micStatus.textContent = "Voice error. Try again.";
    };
    recognition.onresult = (ev) => {
      let finalT = "";
      let inter = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = r[0] && r[0].transcript ? r[0].transcript : "";
        if (r.isFinal) finalT += t;
        else inter += t;
      }
      const out = (finalT || inter || "").trim();
      if (out) inputEl.value = out;
    };

    micBtn.addEventListener("click", () => {
      if (!recognition) return;
      if (listening) {
        recognition.stop();
        return;
      }
      try {
        recognition.start();
      } catch (_) {
        if (micStatus) micStatus.textContent = "Voice error. Try again.";
      }
    });
  }

  function openSidebar() {
    sidebar && sidebar.classList.add("open");
    sidebarBackdrop && sidebarBackdrop.classList.remove("hidden");
    sidebar && sidebar.setAttribute("aria-hidden", "false");
    loadSessionsList();
  }

  function closeSidebar() {
    sidebar && sidebar.classList.remove("open");
    sidebarBackdrop && sidebarBackdrop.classList.add("hidden");
    sidebar && sidebar.setAttribute("aria-hidden", "true");
  }

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
        btn.className = "session-card";
        const stamp = row.created_at
          ? new Date(row.created_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "?";
        btn.innerHTML = `<span class="session-meta">${stamp}</span><span>#${(
          row.session_id || ""
        ).slice(0, 8)}… · msgs ${row.message_count ?? 0}</span>`;
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
      bootstrap.session_id = sessionId;
      closeSidebar();

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
      await hydrateFromServer();
      closeSidebar();
    } catch (_) {}
  }

  /* Wire */
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

  moodSlider &&
    moodSlider.addEventListener("input", () => {
      updateMoodUI();
    });

  themeToggle &&
    themeToggle.addEventListener("click", () => {
      applyTheme(document.body.classList.contains("theme-light") ? "dark" : "light");
      resizeCanvasPixels();
      drawMoodChart();
    });

  clearHistoryBtn && clearHistoryBtn.addEventListener("click", clearCurrentHistory);

  openSidebarBtn && openSidebarBtn.addEventListener("click", openSidebar);
  sidebarClose && sidebarClose.addEventListener("click", closeSidebar);
  sidebarBackdrop && sidebarBackdrop.addEventListener("click", closeSidebar);

  clearAllSessionsBtn && clearAllSessionsBtn.addEventListener("click", clearAllSessions);

  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => sendMessage(btn.getAttribute("data-prompt") || ""));
  });

  hideBreathingBtn && hideBreathingBtn.addEventListener("click", hideExercises);
  hideGroundingBtn && hideGroundingBtn.addEventListener("click", hideExercises);

  breathToggleBtn &&
    breathToggleBtn.addEventListener("click", () => {
      if (breathingOn) stopBreathing();
      else toggleBreathing(true);
    });

  /* Init */
  initTheme();
  setupSpeech();
  setEmotionUI("okay", "#34D399", "ٹھیک");
  setMemoryBar(bootstrap.latest_memory_insight || "");

  if (history.length) {
    renderHistory(history);
  } else {
    renderHistory([]);
  }

  updateMoodUI();

  window.addEventListener("resize", () => {
    resizeCanvasPixels();
  });

  resizeCanvasPixels();
  hydrateFromServer();

  if (chartResizeObs && chartResizeObs.disconnect) chartResizeObs.disconnect();
  if (window.ResizeObserver && moodChart) {
    chartResizeObs = new ResizeObserver(() => resizeCanvasPixels());
    chartResizeObs.observe(moodChart);
  }
})();
