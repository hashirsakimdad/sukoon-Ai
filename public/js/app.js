/* ── Sukoon AI — Client-side SPA ─────────────────────────────────────────── */
(function () {
  "use strict";

  // ── Auth state ────────────────────────────────────────────────────────────
  let token = localStorage.getItem("sukoon_token") || null;
  let user = JSON.parse(localStorage.getItem("sukoon_user") || "null");

  function setAuth(u, t) {
    user = u; token = t;
    localStorage.setItem("sukoon_token", t);
    localStorage.setItem("sukoon_user", JSON.stringify(u));
    updateNav();
  }
  function clearAuth() {
    user = null; token = null;
    localStorage.removeItem("sukoon_token");
    localStorage.removeItem("sukoon_user");
    updateNav();
  }
  function authHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

  // ── API helper ────────────────────────────────────────────────────────────
  async function api(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      headers: opts.body ? authHeaders() : { Authorization: `Bearer ${token}` },
      ...opts,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  // ── Nav ────────────────────────────────────────────────────────────────────
  function updateNav() {
    const el = document.getElementById("auth-nav");
    if (!el) return;
    if (user) {
      el.innerHTML = `
        <a href="/chat" data-link class="btn-primary">💬 Chat</a>
        <button onclick="window.__logout()" class="btn-sm">Logout</button>
      `;
    } else {
      el.innerHTML = `
        <a href="/login" data-link>Login</a>
        <a href="/signup" data-link class="btn-primary">Get Started</a>
      `;
    }
    // re-attach link listeners
    el.querySelectorAll("[data-link]").forEach((a) =>
      a.addEventListener("click", (e) => { e.preventDefault(); navigate(a.getAttribute("href")); })
    );
  }
  window.__logout = () => { clearAuth(); navigate("/"); };

  // ── Router ────────────────────────────────────────────────────────────────
  const routes = {
    "/": pageHome,
    "/about": pageAbout,
    "/features": pageFeatures,
    "/how-it-works": pageHowItWorks,
    "/exercises": pageExercises,
    "/crisis": pageCrisis,
    "/faq": pageFaq,
    "/privacy": pagePrivacy,
    "/contact": pageContact,
    "/login": pageLogin,
    "/signup": pageSignup,
    "/chat": pageChat,
  };

  function navigate(path) {
    window.history.pushState(null, "", path);
    render();
  }
  window.addEventListener("popstate", render);

  function render() {
    const path = window.location.pathname;
    const page = routes[path] || page404;
    const app = document.getElementById("app");
    app.innerHTML = "";
    page(app);
    updateNav();
    window.scrollTo(0, 0);
    // Close mobile menu
    document.getElementById("nav-links")?.classList.remove("open");
  }

  // Intercept all data-link clicks
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-link]");
    if (link) { e.preventDefault(); navigate(link.getAttribute("href")); }
  });

  // Hamburger
  document.getElementById("hamburger")?.addEventListener("click", () => {
    document.getElementById("nav-links")?.classList.toggle("open");
  });

  // ── Page: Home ────────────────────────────────────────────────────────────
  function pageHome(el) {
    el.innerHTML = `
      <section class="hero">
        <div class="container">
          <h1>Sukoon — Your Safe Space to Talk</h1>
          <p>Pakistan ka pehla Roman Urdu mental health AI companion. Stress ho, anxiety ho, ya bas kisi se baat karni ho — Sukoon sunta hai. 💚</p>
          <div class="hero-buttons">
            <a href="${user ? "/chat" : "/signup"}" data-link class="btn btn-primary btn-lg">${user ? "Start Chatting" : "Get Started — Free"}</a>
            <a href="/how-it-works" data-link class="btn btn-outline btn-lg">How It Works</a>
          </div>
        </div>
      </section>

      <section class="section" style="background:var(--c-surface-dim)">
        <div class="container">
          <h2 class="section-title">Why Sukoon?</h2>
          <p class="section-subtitle">Mental health support that understands your language, your culture, your feelings.</p>
          <div class="grid-3">
            <div class="card feature-card">
              <div class="feature-icon">🗣️</div>
              <h3>Roman Urdu Samajhta Hai</h3>
              <p>Apni bhasha mein baat karo — Roman Urdu, Urdu, ya English. Sukoon sab samajhta hai.</p>
            </div>
            <div class="card feature-card">
              <div class="feature-icon">🧠</div>
              <h3>AI Therapist Companion</h3>
              <p>Gentle, non-judgmental support. Koi judge nahi karega — bas sunay ga aur madad karay ga.</p>
            </div>
            <div class="card feature-card">
              <div class="feature-icon">🔒</div>
              <h3>Completely Private</h3>
              <p>Tumhari baatein sirf tumhari hain. Secure login, encrypted data, aur koi sharing nahi.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="section-title">Built for Pakistan 🇵🇰</h2>
          <p class="section-subtitle">Therapy ka stigma kam karna hai — aur access zyada. Har phone pe, har waqt, free.</p>
          <div class="grid-3">
            <div class="card feature-card">
              <div class="feature-icon">📊</div>
              <h3>Mood Tracking</h3>
              <p>Apni emotions track karo. Dekho kaise tumhara mood time ke saath change hota hai.</p>
            </div>
            <div class="card feature-card">
              <div class="feature-icon">🧘</div>
              <h3>Guided Exercises</h3>
              <p>Breathing exercises aur grounding techniques — jab anxiety hit kare, ye tools use karo.</p>
            </div>
            <div class="card feature-card">
              <div class="feature-icon">🚨</div>
              <h3>Crisis Support</h3>
              <p>Agar koi emergency ho — direct helpline numbers aur resources mil jayein ge.</p>
            </div>
          </div>
        </div>
      </section>

      ${footerHTML()}
    `;
  }

  // ── Page: About ───────────────────────────────────────────────────────────
  function pageAbout(el) {
    el.innerHTML = `
      <section class="section">
        <div class="container" style="max-width:720px">
          <h1 class="section-title">About Sukoon AI</h1>
          <p class="section-subtitle">A safe, stigma-free space for mental wellness.</p>

          <div class="card mt-4">
            <h3>🌿 Our Mission</h3>
            <p class="mt-2">Pakistan mein mental health ek taboo hai. Log therapy se darte hain, kisi se baat nahi kar sakte.
            Sukoon AI isi problem ko solve karta hai — ek warm, understanding AI companion jo tumhari apni bhasha mein
            tumhari baat sunta hai, samajhta hai, aur gentle guidance deta hai.</p>
          </div>

          <div class="card mt-2">
            <h3>❤️ What We Believe</h3>
            <ul style="padding-left:20px;margin-top:12px;color:var(--c-text-secondary)">
              <li>Mental health care should be accessible to everyone</li>
              <li>Language should never be a barrier to getting help</li>
              <li>Cultural context matters in therapy</li>
              <li>Technology can bridge the gap until professional help is available</li>
              <li>No one should feel alone in their struggle</li>
            </ul>
          </div>

          <div class="card mt-2">
            <h3>⚠️ Important Disclaimer</h3>
            <p class="mt-2" style="color:var(--c-text-secondary)">Sukoon AI ek supportive companion hai — professional therapist ya doctor ka replacement NAHI hai.
            Serious mental health issues ke liye please professional se raabta karein. Crisis mein
            <a href="/crisis" data-link>Umang helpline</a> (0317-4288665) call karein.</p>
          </div>
        </div>
      </section>
      ${footerHTML()}
    `;
  }

  // ── Page: Features ────────────────────────────────────────────────────────
  function pageFeatures(el) {
    el.innerHTML = `
      <section class="section">
        <div class="container">
          <h1 class="section-title">Features</h1>
          <p class="section-subtitle">Everything you need for everyday mental wellness — in your pocket.</p>
          <div class="grid-2">
            ${[
              ["💬", "AI Therapy Chat", "Roman Urdu, Urdu, or English — talk naturally and get warm, empathetic responses powered by advanced AI."],
              ["😊", "Emotion Detection", "Sukoon automatically detects your emotions in real-time and adapts its responses to how you're feeling."],
              ["📊", "Mood Tracking", "Visual mood charts to track your emotional journey over days and weeks. See patterns and progress."],
              ["🧘", "Breathing Exercise", "Animated breathing circles to calm anxiety in the moment. Inhale, hold, exhale — guided by Sukoon."],
              ["🌿", "5-4-3-2-1 Grounding", "When panic hits, this grounding technique brings you back to the present moment using your senses."],
              ["💾", "Conversation History", "Your chats are saved securely. Come back anytime and continue where you left off."],
              ["🚨", "Crisis Detection", "If Sukoon detects severe distress, it immediately provides helpline numbers and safety resources."],
              ["🌙", "Dark & Light Mode", "Easy on the eyes at any time of day. Automatically adapts to your system preference."],
            ].map(([icon, title, desc]) => `
              <div class="card feature-card">
                <div class="feature-icon">${icon}</div>
                <h3>${title}</h3>
                <p>${desc}</p>
              </div>
            `).join("")}
          </div>
        </div>
      </section>
      ${footerHTML()}
    `;
  }

  // ── Page: How It Works ────────────────────────────────────────────────────
  function pageHowItWorks(el) {
    el.innerHTML = `
      <section class="section">
        <div class="container" style="max-width:720px">
          <h1 class="section-title">How It Works</h1>
          <p class="section-subtitle">Three simple steps to start feeling better.</p>

          ${[
            ["1️⃣", "Sign Up", "Create a free account in seconds. No phone number needed — just your name, email, and a password."],
            ["2️⃣", "Start Talking", "Open a new chat and talk to Sukoon in Roman Urdu, Urdu, or English. It listens and responds like a caring friend."],
            ["3️⃣", "Track & Grow", "Sukoon tracks your mood over time. Use the exercises when anxiety strikes. Review your journey anytime."],
          ].map(([icon, title, desc]) => `
            <div class="card mt-2" style="display:flex;gap:20px;align-items:flex-start">
              <div class="feature-icon" style="flex-shrink:0;font-size:1.6rem">${icon}</div>
              <div><h3>${title}</h3><p style="color:var(--c-text-secondary);margin-top:8px">${desc}</p></div>
            </div>
          `).join("")}

          <div class="text-center mt-4">
            <a href="${user ? "/chat" : "/signup"}" data-link class="btn btn-primary btn-lg">
              ${user ? "Go to Chat" : "Start Now — It's Free"}
            </a>
          </div>
        </div>
      </section>
      ${footerHTML()}
    `;
  }

  // ── Page: Exercises ───────────────────────────────────────────────────────
  function pageExercises(el) {
    el.innerHTML = `
      <section class="section">
        <div class="container">
          <h1 class="section-title">Wellness Exercises</h1>
          <p class="section-subtitle">Quick exercises to calm your mind when you need it most.</p>
          <div class="grid-2">
            <div class="card exercise-card">
              <h3>🧘 Breathing Exercise</h3>
              <p style="color:var(--c-text-secondary);margin-bottom:16px">4-7-8 breathing technique — reduces anxiety in minutes.</p>
              <div class="breathing-circle" id="breathing-circle">Ready</div>
              <button class="btn btn-primary mt-2" id="start-breathing">Start Breathing</button>
            </div>

            <div class="card exercise-card" style="text-align:left">
              <h3 style="text-align:center">🌿 5-4-3-2-1 Grounding</h3>
              <p style="color:var(--c-text-secondary);margin-bottom:16px;text-align:center">Use your senses to come back to the present moment.</p>
              <div class="grounding-step">👀 <strong>5 Things</strong> you can SEE around you</div>
              <div class="grounding-step">✋ <strong>4 Things</strong> you can TOUCH</div>
              <div class="grounding-step">👂 <strong>3 Things</strong> you can HEAR</div>
              <div class="grounding-step">👃 <strong>2 Things</strong> you can SMELL</div>
              <div class="grounding-step">👅 <strong>1 Thing</strong> you can TASTE</div>
              <p style="color:var(--c-text-secondary);margin-top:16px;text-align:center;font-style:italic">
                Take your time with each step. Breathe slowly. You're doing great. 💚
              </p>
            </div>
          </div>
        </div>
      </section>
      ${footerHTML()}
    `;

    // Breathing exercise logic
    const circle = document.getElementById("breathing-circle");
    const btn = document.getElementById("start-breathing");
    let breathingTimer = null;

    btn?.addEventListener("click", () => {
      if (breathingTimer) { clearInterval(breathingTimer); breathingTimer = null; circle.textContent = "Ready"; circle.className = "breathing-circle"; btn.textContent = "Start Breathing"; return; }
      btn.textContent = "Stop";
      const phases = [
        { text: "Breathe In…", class: "inhale", duration: 4000 },
        { text: "Hold…", class: "inhale", duration: 7000 },
        { text: "Breathe Out…", class: "exhale", duration: 8000 },
      ];
      let i = 0;
      function nextPhase() {
        const p = phases[i % phases.length];
        circle.textContent = p.text;
        circle.className = "breathing-circle " + p.class;
        i++;
      }
      nextPhase();
      breathingTimer = setInterval(nextPhase, phases[(i - 1) % phases.length].duration);
      // Use proper sequencing
      clearInterval(breathingTimer);
      async function runCycle() {
        for (const p of phases) {
          circle.textContent = p.text;
          circle.className = "breathing-circle " + p.class;
          await new Promise((r) => (breathingTimer = setTimeout(r, p.duration)));
        }
        if (breathingTimer !== null) runCycle();
      }
      runCycle();
    });
  }

  // ── Page: Crisis ──────────────────────────────────────────────────────────
  function pageCrisis(el) {
    el.innerHTML = `
      <div class="crisis-banner">🚨 If you are in immediate danger, please call Rescue 1122 or go to your nearest hospital.</div>
      <section class="section">
        <div class="container" style="max-width:720px">
          <h1 class="section-title">Crisis Help & Resources</h1>
          <p class="section-subtitle">You are not alone. Help is available right now.</p>

          <div class="card mt-4" style="border-left:4px solid var(--c-danger)">
            <h3>📞 Umang Helpline</h3>
            <p class="mt-2"><strong style="font-size:1.3rem">0317-4288665</strong></p>
            <p style="color:var(--c-text-secondary)">24/7 available — free, confidential mental health support in Urdu and English.</p>
          </div>

          <div class="card mt-2">
            <h3>📞 Rozan Counseling</h3>
            <p class="mt-2"><strong>0800-22444</strong></p>
            <p style="color:var(--c-text-secondary)">Free counseling helpline for emotional support.</p>
          </div>

          <div class="card mt-2">
            <h3>📞 Taskeen Helpline</h3>
            <p class="mt-2"><strong>0311-7786264</strong></p>
            <p style="color:var(--c-text-secondary)">Mental health helpline — trained counsellors available.</p>
          </div>

          <div class="card mt-4">
            <h3>💚 Remember</h3>
            <ul style="padding-left:20px;margin-top:12px;color:var(--c-text-secondary)">
              <li>Madad maangna kamzori nahi, himmat hai</li>
              <li>Professional help lena theek hai — zaruri hai</li>
              <li>Aap akele nahi ho — log care karte hain</li>
              <li>Ye waqt guzar jayega — aap strong ho</li>
            </ul>
          </div>
        </div>
      </section>
      ${footerHTML()}
    `;
  }

  // ── Page: FAQ ─────────────────────────────────────────────────────────────
  function pageFaq(el) {
    const faqs = [
      ["Sukoon AI kya hai?", "Sukoon AI ek AI-powered mental health companion hai jo Roman Urdu, Urdu, aur English mein aap ki baat sunta hai aur supportive responses deta hai."],
      ["Kya ye free hai?", "Haan, Sukoon AI bilkul free hai. Sign up karein aur chat shuru karein."],
      ["Kya meri baatein private hain?", "Bilkul! Aapki conversations encrypted hain aur sirf aap access kar sakte ho after login."],
      ["Kya ye real therapist ki jagah le sakta hai?", "Nahi. Sukoon AI ek supportive tool hai, lekin serious mental health issues ke liye professional therapist se zaroor milein."],
      ["Kaunsi languages support hain?", "Roman Urdu (primary), Urdu script, aur English — aap mix bhi kar sakte ho!"],
      ["Mera data kaun dekh sakta hai?", "Koi nahi. Aapka data aapke account se tied hai aur kisi se share nahi hota."],
    ];
    el.innerHTML = `
      <section class="section">
        <div class="container" style="max-width:720px">
          <h1 class="section-title">Frequently Asked Questions</h1>
          <p class="section-subtitle">Common questions about Sukoon AI.</p>
          ${faqs.map(([q, a]) => `
            <div class="card mt-2">
              <h3>${q}</h3>
              <p style="color:var(--c-text-secondary);margin-top:8px">${a}</p>
            </div>
          `).join("")}
        </div>
      </section>
      ${footerHTML()}
    `;
  }

  // ── Page: Privacy ─────────────────────────────────────────────────────────
  function pagePrivacy(el) {
    el.innerHTML = `
      <section class="section">
        <div class="container" style="max-width:720px">
          <h1 class="section-title">Privacy Policy</h1>
          <p class="section-subtitle">Your privacy matters to us. Here's how we protect it.</p>

          <div class="card mt-4">
            <h3>Data We Collect</h3>
            <p class="mt-2" style="color:var(--c-text-secondary)">We collect your name, email, and chat messages to provide the service.
            Mood data is tracked to show you your emotional patterns. We do NOT sell or share any data with third parties.</p>
          </div>
          <div class="card mt-2">
            <h3>How We Use It</h3>
            <p class="mt-2" style="color:var(--c-text-secondary)">Your messages are sent to an AI model (Groq) to generate responses.
            We do not store messages on Groq's servers — only in your account's database.</p>
          </div>
          <div class="card mt-2">
            <h3>Your Rights</h3>
            <p class="mt-2" style="color:var(--c-text-secondary)">You can delete your conversations anytime. You can delete your account
            and all associated data by contacting us.</p>
          </div>
        </div>
      </section>
      ${footerHTML()}
    `;
  }

  // ── Page: Contact ─────────────────────────────────────────────────────────
  function pageContact(el) {
    el.innerHTML = `
      <section class="section">
        <div class="container" style="max-width:720px">
          <h1 class="section-title">Contact Us</h1>
          <p class="section-subtitle">Questions, feedback, or just want to say hi? Reach out!</p>
          <div class="card mt-4">
            <h3>📧 Email</h3>
            <p class="mt-2"><a href="mailto:hashirsakimdad@gmail.com">hashirsakimdad@gmail.com</a></p>
          </div>
          <div class="card mt-2">
            <h3>🐙 GitHub</h3>
            <p class="mt-2"><a href="https://github.com/hashirsakimdad/sukoon-Ai" target="_blank" rel="noopener">github.com/hashirsakimdad/sukoon-Ai</a></p>
          </div>
        </div>
      </section>
      ${footerHTML()}
    `;
  }

  // ── Page: Login ───────────────────────────────────────────────────────────
  function pageLogin(el) {
    if (user) return navigate("/chat");
    el.innerHTML = `
      <div class="auth-page">
        <div class="card auth-card">
          <h2>Welcome Back 💚</h2>
          <p class="subtitle">Login to continue your journey.</p>
          <form id="login-form">
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="login-email" placeholder="you@example.com" required />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="login-password" placeholder="••••••••" required />
            </div>
            <div class="form-error" id="login-error"></div>
            <button type="submit" class="btn btn-primary" style="width:100%">Login</button>
          </form>
          <p class="auth-footer">Don't have an account? <a href="/signup" data-link>Sign up</a></p>
        </div>
      </div>
    `;
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("login-error");
      errEl.className = "form-error";
      try {
        const data = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("login-email").value,
            password: document.getElementById("login-password").value,
          }),
        });
        setAuth(data.user, data.token);
        navigate("/chat");
      } catch (err) {
        errEl.textContent = err.message;
        errEl.className = "form-error visible";
      }
    });
  }

  // ── Page: Signup ──────────────────────────────────────────────────────────
  function pageSignup(el) {
    if (user) return navigate("/chat");
    el.innerHTML = `
      <div class="auth-page">
        <div class="card auth-card">
          <h2>Create Account 🌿</h2>
          <p class="subtitle">Start your mental wellness journey.</p>
          <form id="signup-form">
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="signup-name" placeholder="Your name" required />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="signup-email" placeholder="you@example.com" required />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="signup-password" placeholder="Min 6 characters" required minlength="6" />
            </div>
            <div class="form-error" id="signup-error"></div>
            <button type="submit" class="btn btn-primary" style="width:100%">Sign Up</button>
          </form>
          <p class="auth-footer">Already have an account? <a href="/login" data-link>Login</a></p>
        </div>
      </div>
    `;
    document.getElementById("signup-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("signup-error");
      errEl.className = "form-error";
      try {
        const data = await api("/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("signup-name").value,
            email: document.getElementById("signup-email").value,
            password: document.getElementById("signup-password").value,
          }),
        });
        setAuth(data.user, data.token);
        navigate("/chat");
      } catch (err) {
        errEl.textContent = err.message;
        errEl.className = "form-error visible";
      }
    });
  }

  // ── Page: Chat (main app) ─────────────────────────────────────────────────
  let currentConvId = null;

  function pageChat(el) {
    if (!user) return navigate("/login");
    el.innerHTML = `
      <div class="chat-layout">
        <aside class="chat-sidebar" id="chat-sidebar">
          <div class="sidebar-header">
            <button class="btn btn-primary btn-sm" style="width:100%" id="new-chat-btn">+ New Chat</button>
          </div>
          <div class="sidebar-list" id="sidebar-list"></div>
          <div style="padding:12px;border-top:1px solid var(--c-border)">
            <a href="/exercises" data-link style="font-size:0.85rem;display:block;padding:8px;color:var(--c-text-secondary)">🧘 Exercises</a>
            <a href="/crisis" data-link style="font-size:0.85rem;display:block;padding:8px;color:var(--c-danger)">🚨 Crisis Help</a>
          </div>
        </aside>
        <div class="chat-main">
          <div style="padding:8px 16px;border-bottom:1px solid var(--c-border);display:flex;align-items:center;gap:8px">
            <button class="btn btn-sm sidebar-toggle" id="sidebar-toggle" style="display:none">☰</button>
            <span style="font-weight:600" id="chat-title">Sukoon AI</span>
          </div>
          <div class="chat-messages" id="chat-messages">
            <div class="chat-welcome">
              <h2>Assalamu Alaikum, ${user?.name || "friend"}! 💚</h2>
              <p>Main Sukoon hoon — tumhara mental health companion. Batao, aaj kaisa feel kar rahe ho?</p>
            </div>
          </div>
          <div class="chat-input-area">
            <div class="chat-input-row">
              <textarea id="chat-input" placeholder="Apni baat likho…" rows="1"></textarea>
              <button id="send-btn" class="btn btn-primary">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Mobile sidebar toggle
    const sidebarToggle = document.getElementById("sidebar-toggle");
    if (window.innerWidth <= 768) sidebarToggle.style.display = "inline-flex";
    sidebarToggle?.addEventListener("click", () => {
      document.getElementById("chat-sidebar").classList.toggle("open");
    });

    loadConversations();

    document.getElementById("new-chat-btn").addEventListener("click", createNewChat);
    document.getElementById("send-btn").addEventListener("click", sendMessage);
    const input = document.getElementById("chat-input");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    // Auto-resize textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 150) + "px";
    });
  }

  async function loadConversations() {
    try {
      const data = await api("/chat/conversations");
      const list = document.getElementById("sidebar-list");
      if (!list) return;
      if (data.conversations.length === 0) {
        list.innerHTML = '<p style="padding:16px;color:var(--c-text-secondary);font-size:0.85rem;text-align:center">No chats yet. Start a new one!</p>';
        return;
      }
      list.innerHTML = data.conversations.map((c) => `
        <button class="sidebar-item ${c.id === currentConvId ? "active" : ""}" data-id="${c.id}">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.title)}</span>
          <span class="delete-btn" data-delete="${c.id}" title="Delete">✕</span>
        </button>
      `).join("");
      // Listeners
      list.querySelectorAll(".sidebar-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          if (e.target.dataset.delete) return;
          loadChat(btn.dataset.id);
          document.getElementById("chat-sidebar")?.classList.remove("open");
        });
      });
      list.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm("Delete this conversation?")) return;
          await api(`/chat/conversations/${btn.dataset.delete}`, { method: "DELETE" });
          if (currentConvId === btn.dataset.delete) { currentConvId = null; resetChatView(); }
          loadConversations();
        });
      });
    } catch (err) {
      console.error("Failed to load conversations", err);
    }
  }

  async function createNewChat() {
    try {
      const data = await api("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ title: "New Chat" }),
      });
      currentConvId = data.id;
      resetChatView();
      loadConversations();
    } catch (err) {
      alert("Failed to create chat: " + err.message);
    }
  }

  function resetChatView() {
    const msgs = document.getElementById("chat-messages");
    if (msgs) {
      msgs.innerHTML = `
        <div class="chat-welcome">
          <h2>Assalamu Alaikum, ${user?.name || "friend"}! 💚</h2>
          <p>Main Sukoon hoon — tumhara mental health companion. Batao, aaj kaisa feel kar rahe ho?</p>
        </div>
      `;
    }
    const title = document.getElementById("chat-title");
    if (title) title.textContent = "New Chat";
  }

  async function loadChat(convId) {
    currentConvId = convId;
    const msgs = document.getElementById("chat-messages");
    if (!msgs) return;
    try {
      const data = await api(`/chat/conversations/${convId}/messages`);
      if (data.messages.length === 0) {
        resetChatView();
      } else {
        msgs.innerHTML = data.messages.map((m) => messageBubble(m.role, m.content, m.emotion)).join("");
        msgs.scrollTop = msgs.scrollHeight;
      }
      // Update title
      const title = document.getElementById("chat-title");
      const sidebar = document.querySelector(`.sidebar-item[data-id="${convId}"] span`);
      if (title && sidebar) title.textContent = sidebar.textContent;
      // Highlight active
      document.querySelectorAll(".sidebar-item").forEach((el) =>
        el.classList.toggle("active", el.dataset.id === convId)
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function sendMessage() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    // Auto-create conversation if none selected
    if (!currentConvId) {
      try {
        const data = await api("/chat/conversations", {
          method: "POST",
          body: JSON.stringify({ title: "New Chat" }),
        });
        currentConvId = data.id;
      } catch (err) {
        alert("Failed to start chat: " + err.message);
        return;
      }
    }

    const msgs = document.getElementById("chat-messages");
    // Clear welcome screen
    const welcome = msgs?.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    // Show user message
    msgs.insertAdjacentHTML("beforeend", messageBubble("user", text));
    input.value = "";
    input.style.height = "auto";
    msgs.scrollTop = msgs.scrollHeight;

    // Show typing indicator
    msgs.insertAdjacentHTML("beforeend", `
      <div class="message assistant" id="typing">
        <div class="message-bubble">
          <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>
      </div>
    `);
    msgs.scrollTop = msgs.scrollHeight;

    // Disable send button
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) sendBtn.disabled = true;

    try {
      const data = await api(`/chat/conversations/${currentConvId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });

      // Remove typing indicator
      document.getElementById("typing")?.remove();

      // Show AI reply
      const emotionTag = data.emotion?.emotion ? ` ${emotionEmoji(data.emotion.emotion)} ${data.emotion.emotion}` : "";
      msgs.insertAdjacentHTML("beforeend", messageBubble("assistant", data.reply, data.emotion?.emotion));
      msgs.scrollTop = msgs.scrollHeight;

      loadConversations(); // refresh sidebar titles
    } catch (err) {
      document.getElementById("typing")?.remove();
      msgs.insertAdjacentHTML("beforeend", messageBubble("assistant", "Sorry, kuch problem ho gayi. Please dobara try karein. 🙏"));
      console.error(err);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  }

  function messageBubble(role, content, emotion) {
    const emotionHTML = emotion && role === "user"
      ? `<div class="message-emotion">${emotionEmoji(emotion)} ${emotion}</div>`
      : "";
    return `
      <div class="message ${role}">
        <div class="message-bubble">
          ${esc(content).replace(/\n/g, "<br>")}
          ${emotionHTML}
        </div>
      </div>
    `;
  }

  function emotionEmoji(emotion) {
    const map = { happy: "😊", sad: "😢", anxious: "😰", angry: "😠", neutral: "😐", fearful: "😨" };
    return map[emotion] || "🫧";
  }

  // ── Page: 404 ─────────────────────────────────────────────────────────────
  function page404(el) {
    el.innerHTML = `
      <section class="section text-center">
        <div class="container">
          <h1 style="font-size:4rem;margin-bottom:16px">404</h1>
          <p style="font-size:1.2rem;color:var(--c-text-secondary);margin-bottom:24px">Page not found — ye page nahi mila.</p>
          <a href="/" data-link class="btn btn-primary">Go Home</a>
        </div>
      </section>
    `;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  function footerHTML() {
    return `
      <footer class="footer">
        <div class="footer-links">
          <a href="/about" data-link>About</a>
          <a href="/features" data-link>Features</a>
          <a href="/faq" data-link>FAQ</a>
          <a href="/privacy" data-link>Privacy</a>
          <a href="/contact" data-link>Contact</a>
          <a href="/crisis" data-link>Crisis Help</a>
        </div>
        <p>© ${new Date().getFullYear()} Sukoon AI — Made with 💚 for Pakistan</p>
      </footer>
    `;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  render();
})();
