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
  const chatScroll = $("chatScroll");
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
  const voiceMuteBtn = $("voiceMuteBtn");
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

  /** @type {SpeechRecognition | null} */
  let recognition = null;
  let listening = false;
  let voiceLangFallbackTried = false;
  /** @type {string} */
  let voiceFinalAccum = "";
  /** @type {ReturnType<typeof setTimeout> | null} */
  let voiceAutoSendTimer = null;

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

  function setEmotionUI(emotion, color, urduLabel) {
    if (!emotionBadge || !emotionUrdu || !emotionEmojiEl) return;
    const em = String(emotion || "okay").toLowerCase();
    const col = color || "#14b8a6";
    emotionBadge.style.setProperty("--emotion-glow", col);
    emotionUrdu.textContent = urduLabel || em;
    emotionEmojiEl.textContent = EMOTION_ICONS[em] || EMOTION_ICONS.okay;
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
    moodEmoji.textContent = EMOJI_BY_MOOD(n);
    moodValue.textContent = String(n);
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

  /** -------- Voice synth -------- */

  function isVoiceMuted() {
    return localStorage.getItem("sukoon_voice_mute") === "1";
  }

  function setVoiceMute(on) {
    localStorage.setItem("sukoon_voice_mute", on ? "1" : "0");
    updateMuteButtonUI();
    if (on) stopSpeechSynth();
  }

  function updateMuteButtonUI() {
    if (!voiceMuteBtn) return;
    const muted = isVoiceMuted();
    voiceMuteBtn.textContent = muted ? "🔇" : "🔊";
    voiceMuteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    voiceMuteBtn.title = muted ? "Unmute AI voice" : "Mute AI voice";
  }

  function stopSpeechSynth() {
    try {
      window.speechSynthesis && window.speechSynthesis.cancel();
    } catch (_) {}
  }

  function pickSpeechVoice() {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() || [] : [];
    const ur =
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("ur")) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().includes("ur"));
    const en = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("en-us"));
    return ur || en || voices[0] || null;
  }

  /**
   * @param {string} text
   */
  function speakText(text) {
    const raw = String(text || "").trim();
    if (!raw || !window.speechSynthesis || isVoiceMuted()) return;
    stopSpeechSynth();
    const u = new SpeechSynthesisUtterance(raw);
    u.rate = 0.85;
    u.pitch = 1;
    u.volume = 1;
    const v = pickSpeechVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang || "ur-PK";
    } else {
      u.lang = "ur-PK";
    }
    try {
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  function clearVoiceAutoSend() {
    if (voiceAutoSendTimer) {
      clearTimeout(voiceAutoSendTimer);
      voiceAutoSendTimer = null;
    }
  }

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
   * @param {{ autoSpeak?: boolean }} [opts]
   */
  function addAiBubble(content, stamp, opts = {}) {
    const { autoSpeak = false } = opts;
    if (!chatEl) return;
    const row = document.createElement("article");
    row.className = "msg msg-ai";

    const wrap = document.createElement("div");
    wrap.className = "bubble-ai-wrap";

    const av = document.createElement("div");
    av.className = "avatar-teal";
    av.setAttribute("aria-hidden", "true");
    av.textContent = "🧠";

    const bubble = document.createElement("div");
    bubble.className = "bubble-ai";

    const head = document.createElement("div");
    head.className = "bubble-ai-head";

    const text = document.createElement("p");
    text.className = "bubble-ai-text";
    text.style.margin = "0";
    text.textContent = content;

    const speakBtn = document.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "msg-speak-btn";
    speakBtn.setAttribute("aria-label", "Play message");
    speakBtn.textContent = "🔊";
    speakBtn.addEventListener("click", (e) => {
      e.preventDefault();
      stopSpeechSynth();
      speakText(content);
    });

    head.appendChild(text);
    head.appendChild(speakBtn);

    const time = document.createElement("time");
    time.textContent = stamp || "";
    bubble.appendChild(head);
    bubble.appendChild(time);

    wrap.appendChild(av);
    wrap.appendChild(bubble);
    row.appendChild(wrap);
    chatEl.appendChild(row);
    scrollChat();

    if (autoSpeak) speakText(content);
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
      else addAiBubble(c, stamp, { autoSpeak: false });
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

      const lastEmo = _safeLower(data.session.last_emotion);
      if (lastEmo && EMOTION_ICONS[lastEmo]) {
        setEmotionUI(lastEmo, glowForEmotion(lastEmo), urduGuess(lastEmo));
      }

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

    stopSpeechSynth();
    clearVoiceAutoSend();
    hideExercises();

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
      const emotionData = await analyzeEmotion(text);
      const emotionKey = String(emotionData.emotion || "okay");
      const col = emotionData.color || glowForEmotion(emotionKey);
      const urd = emotionData.urdu_label || urduGuess(emotionKey);
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
      addAiBubble(reply || "Kuch masla aa gaya, dobara try karo.", stamp, { autoSpeak: true });
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
      const errText = net ? "Yaar internet check karo 🤍" : "Kuch masla aa gaya, dobara try karo.";
      addAiBubble(errText, padTime(new Date()), { autoSpeak: false });
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

  function setupSpeech() {
    if (!micBtn || !inputEl || !micStatus) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.disabled = true;
      micStatus.textContent = "Chrome use karo voice ke liye.";
      return;
    }

    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "ur-PK";

    recognition.onstart = () => {
      listening = true;
      voiceLangFallbackTried = false;
      voiceFinalAccum = "";
      clearVoiceAutoSend();
      micBtn.classList.add("listening");
      micStatus.textContent = "🔴 Sun raha hun...";
    };

    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove("listening");
      inputEl.classList.remove("voice-interim");

      const t = inputEl.value.trim();
      if (t.length >= 3) {
        micStatus.textContent = "✓ Sun liya!";
        setTimeout(() => {
          micStatus.textContent = "";
        }, 1000);

        voiceAutoSendTimer = setTimeout(() => {
          sendMessage(inputEl.value);
          voiceAutoSendTimer = null;
        }, 1000);
      } else {
        micStatus.textContent = "";
        if (t.length > 0 && t.length < 3) inputEl.value = "";
      }

      updateSendState();
      autoResizeTextarea();
    };

    recognition.onerror = (ev) => {
      const code = String(ev.error || "");

      if (!voiceLangFallbackTried && (code.includes("language") || code === "language-not-supported")) {
        voiceLangFallbackTried = true;
        try {
          recognition.lang = "en-US";
          recognition.start();
        } catch (_) {}
        return;
      }

      micBtn.classList.remove("listening");
      listening = false;
      inputEl.classList.remove("voice-interim");
      micStatus.textContent = "Voice error — dubara mic dabao.";
    };

    recognition.onresult = (ev) => {
      let interim = "";
      let finalAll = "";

      for (let i = 0; i < ev.results.length; i++) {
        const part = ev.results[i];
        const transcript = part[0] && part[0].transcript ? part[0].transcript : "";
        if (part.isFinal) finalAll += transcript;
        else interim += transcript;
      }

      voiceFinalAccum = finalAll;
      inputEl.value = `${finalAll}${interim}`.trim();
      inputEl.classList.toggle("voice-interim", interim.trim().length > 0);

      stopSpeechSynth();
      clearVoiceAutoSend();
      autoResizeTextarea();
      updateSendState();
    };

    micBtn.addEventListener("click", () => {
      if (!recognition) return;
      stopSpeechSynth();
      clearVoiceAutoSend();
      if (listening) {
        try {
          recognition.stop();
        } catch (_) {}
        return;
      }
      try {
        inputEl.value = "";
        updateSendState();
        autoResizeTextarea();
        recognition.lang = "ur-PK";
        voiceLangFallbackTried = false;
        recognition.start();
      } catch (_) {
        micStatus.textContent = "Mic start nahi hua — Chrome check karo.";
      }
    });
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
      bootstrap.session_id = sessionId;
      closeHistoryPanel();
      stopSpeechSynth();

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
      moodSeries = [];
      hideExercises();
      setMemoryBar("");
      stopSpeechSynth();

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
      stopSpeechSynth();
      await hydrateFromServer();
      closeHistoryPanel();
    } catch (_) {}
  }

  /* Wire */
  voiceMuteBtn &&
    voiceMuteBtn.addEventListener("click", () => {
      setVoiceMute(!isVoiceMuted());
    });

  sendBtn &&
    sendBtn.addEventListener("click", () => {
      stopSpeechSynth();
      clearVoiceAutoSend();
      sendMessage(inputEl.value);
    });

  inputEl &&
    inputEl.addEventListener("keydown", (e) => {
      stopSpeechSynth();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        clearVoiceAutoSend();
        sendMessage(inputEl.value);
      }
    });

  inputEl &&
    inputEl.addEventListener("input", () => {
      stopSpeechSynth();
      clearVoiceAutoSend();
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

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }

  /* Init */
  initTheme();
  updateMuteButtonUI();
  setupSpeech();
  setEmotionUI("okay", glowForEmotion("okay"), urduGuess("okay"));
  setMemoryBar(bootstrap.latest_memory_insight || "");

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
