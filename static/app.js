(() => {
  const $ = (id) => document.getElementById(id);

  const chatEl = $("chat");
  const typingEl = $("typing");
  const inputEl = $("messageInput");
  const sendBtn = $("sendBtn");
  const micBtn = $("micBtn");
  const micStatus = $("micStatus");
  const moodSlider = $("moodSlider");
  const moodEmoji = $("moodEmoji");
  const moodValue = $("moodValue");
  const moodChart = $("moodChart");
  const emotionBadge = $("emotionBadge");
  const emotionText = $("emotionText");
  const themeToggle = $("themeToggle");

  const exerciseCard = $("exerciseCard");
  const exerciseClose = $("exerciseClose");
  const exerciseTitle = $("exerciseTitle");
  const breathingBox = $("breathingBox");
  const breathingText = $("breathingText");
  const groundingBox = $("groundingBox");
  const groundingList = $("groundingList");

  const history = [];
  const moodSeries = [];

  const EMOJI_BY_MOOD = (n) => {
    if (n <= 3) return "😔";
    if (n <= 5) return "😐";
    if (n <= 7) return "🙂";
    return "😊";
  };

  const EMOTION_LABELS = {
    anxiety: "Anxiety",
    sad: "Sad",
    stressed: "Stressed",
    angry: "Angry",
    okay: "Okay",
    happy: "Happy",
  };

  const scrollToBottom = () => {
    chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" });
  };

  const setTyping = (on) => {
    typingEl.classList.toggle("hidden", !on);
    if (on) scrollToBottom();
  };

  const addMessage = (role, text) => {
    const msg = document.createElement("div");
    msg.className = "msg " + (role === "user" ? "msg-user" : "msg-ai");

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    msg.appendChild(bubble);
    chatEl.appendChild(msg);
    scrollToBottom();
  };

  const pushHistory = (role, content) => {
    history.push({ role, content });
    if (history.length > 60) history.splice(0, history.length - 60);
  };

  const getMood = () => {
    const n = parseInt(moodSlider.value, 10);
    return Number.isFinite(n) ? n : 6;
  };

  const updateMoodUI = () => {
    const n = getMood();
    moodEmoji.textContent = EMOJI_BY_MOOD(n);
    moodValue.textContent = String(n);
  };

  const setEmotionBadge = (emotion, color) => {
    const safeEmotion = EMOTION_LABELS[emotion] ? emotion : "okay";
    emotionText.textContent = EMOTION_LABELS[safeEmotion] || "Okay";
    emotionBadge.style.setProperty("--badge", color || "#34D399");
  };

  const drawMoodChart = () => {
    const ctx = moodChart.getContext("2d");
    if (!ctx) return;

    const w = moodChart.width;
    const h = moodChart.height;
    ctx.clearRect(0, 0, w, h);

    // background
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, w, h);

    const data = moodSeries.slice(-10);
    if (data.length < 2) {
      // baseline dot
      ctx.fillStyle = "rgba(124,58,237,0.8)";
      ctx.beginPath();
      ctx.arc(w - 10, h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const pad = 6;
    const xStep = (w - pad * 2) / (data.length - 1);
    const yMap = (v) => {
      const t = (v - 1) / 9; // 0..1
      return h - pad - t * (h - pad * 2);
    };

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(124,58,237,0.95)";
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = pad + i * xStep;
      const y = yMap(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // points
    ctx.fillStyle = "rgba(13,148,136,0.95)";
    data.forEach((v, i) => {
      const x = pad + i * xStep;
      const y = yMap(v);
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const updateMoodSeries = (mood) => {
    moodSeries.push(mood);
    if (moodSeries.length > 10) moodSeries.splice(0, moodSeries.length - 10);
    drawMoodChart();
  };

  const showExercise = (kind) => {
    exerciseCard.classList.remove("hidden");
    breathingBox.classList.toggle("hidden", kind !== "breathing");
    groundingBox.classList.toggle("hidden", kind !== "grounding");

    if (kind === "breathing") {
      exerciseTitle.textContent = "Breathing exercise";
      startBreathingCycle();
    } else if (kind === "grounding") {
      exerciseTitle.textContent = "Grounding exercise";
      renderGroundingChecklist();
    }
  };

  const hideExercise = () => {
    exerciseCard.classList.add("hidden");
    breathingBox.classList.add("hidden");
    groundingBox.classList.add("hidden");
  };

  const renderGroundingChecklist = () => {
    const items = [
      "5 cheezein dekho",
      "4 cheezein chhuo",
      "3 awaazein suno",
      "2 cheezein sungho",
      "1 cheez chkho",
    ];
    groundingList.innerHTML = "";
    items.forEach((label) => {
      const row = document.createElement("label");
      row.className = "check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      const text = document.createElement("span");
      text.textContent = label;
      row.appendChild(cb);
      row.appendChild(text);
      groundingList.appendChild(row);
    });
  };

  let breathingTimer = null;
  const startBreathingCycle = () => {
    if (breathingTimer) clearInterval(breathingTimer);

    const phases = [
      { text: "Saans lo...", ms: 4000 },
      { text: "Roko...", ms: 4000 },
      { text: "Chhodo...", ms: 6000 },
    ];

    let idx = 0;
    let remaining = phases[0].ms;
    breathingText.textContent = phases[0].text;

    breathingTimer = setInterval(() => {
      remaining -= 250;
      if (remaining <= 0) {
        idx = (idx + 1) % phases.length;
        breathingText.textContent = phases[idx].text;
        remaining = phases[idx].ms;
      }
    }, 250);
  };

  const applyTheme = (theme) => {
    const t = theme === "light" ? "light" : "dark";
    document.body.classList.toggle("theme-light", t === "light");
    document.body.classList.toggle("theme-dark", t === "dark");
    localStorage.setItem("sukoon_theme", t);
  };

  const initTheme = () => {
    const saved = localStorage.getItem("sukoon_theme");
    applyTheme(saved || "dark");
  };

  const analyzeEmotion = async (message) => {
    const res = await fetch("/analyze-emotion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && (data.error || data.response)) || "Emotion analyze failed");
    return data;
  };

  const chatRequest = async ({ message, mood, emotion }) => {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        mood,
        emotion,
        history,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && (data.error || data.response)) || "Chat failed");
    return data;
  };

  const sendMessage = async (text) => {
    const message = (text || "").trim();
    if (!message) return;

    hideExercise();

    addMessage("user", message);
    pushHistory("user", message);

    const mood = getMood();
    updateMoodSeries(mood);
    updateMoodUI();

    inputEl.value = "";
    inputEl.focus();

    setTyping(true);
    sendBtn.disabled = true;

    try {
      const emo = await analyzeEmotion(message);
      const emotion = String(emo.emotion || "okay");
      const color = String(emo.color || "#34D399");
      setEmotionBadge(emotion, color);

      const data = await chatRequest({ message, mood, emotion });
      const reply = String(data.response || "").trim() || "Sorry, kuch masla aa gaya. Dobara try karo.";
      addMessage("ai", reply);
      pushHistory("model", reply);

      const ex = String(data.suggested_exercise || "none");
      if (ex === "breathing" || ex === "grounding") {
        showExercise(ex);
      }
    } catch (e) {
      const err = "Sorry, kuch masla aa gaya. Dobara try karo.";
      addMessage("ai", err);
      pushHistory("model", err);
    } finally {
      setTyping(false);
      sendBtn.disabled = false;
    }
  };

  // Voice input (Web Speech API)
  let recognition = null;
  let isListening = false;

  const setMicStatus = (text) => {
    micStatus.textContent = text || "";
  };

  const setupSpeech = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.disabled = true;
      setMicStatus("Voice input not supported in this browser.");
      return;
    }

    recognition = new SR();
    recognition.interimResults = true;
    recognition.continuous = false;

    const tryLang = (lang) => {
      recognition.lang = lang;
    };

    tryLang("ur-PK");

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add("active");
      setMicStatus("Sun raha hun...");
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove("active");
      setMicStatus("");
    };

    recognition.onerror = (ev) => {
      // fallback language for common cases
      if (String(ev.error || "").toLowerCase().includes("language")) {
        tryLang("en-US");
      }
      setMicStatus("Voice error. Try again.");
    };

    recognition.onresult = (ev) => {
      let finalText = "";
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = r[0] && r[0].transcript ? r[0].transcript : "";
        if (r.isFinal) finalText += t;
        else interim += t;
      }

      const combined = (finalText || interim || "").trim();
      if (combined) inputEl.value = combined;
    };
  };

  const bootGreeting = () => {
    const greet =
      "Assalam o alaikum. Main Sukoon AI hoon — aap ka haal kaisa hai? " +
      "Aap jo bhi feel kar rahe hain, main yahan hoon. Aaj aap ko kis cheez ne sab se zyada affect kiya?";
    addMessage("ai", greet);
    pushHistory("model", greet);
  };

  // Wire events
  moodSlider.addEventListener("input", () => {
    updateMoodUI();
  });

  sendBtn.addEventListener("click", () => sendMessage(inputEl.value));
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage(inputEl.value);
  });

  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt") || "";
      sendMessage(prompt);
    });
  });

  themeToggle.addEventListener("click", () => {
    const isLight = document.body.classList.contains("theme-light");
    applyTheme(isLight ? "dark" : "light");
    drawMoodChart();
  });

  exerciseClose.addEventListener("click", () => hideExercise());

  micBtn.addEventListener("click", async () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      return;
    }

    // Microphone permission is handled by the browser when starting recognition
    try {
      recognition.start();
    } catch (e) {
      setMicStatus("Voice error. Try again.");
    }
  });

  // Init
  initTheme();
  setupSpeech();
  updateMoodUI();
  updateMoodSeries(getMood());
  bootGreeting();
})();

