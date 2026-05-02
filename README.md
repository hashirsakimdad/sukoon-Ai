<!-- Gold Tier README for Google AI Seekho 2026 --> 

# 🧠 Sukoon AI  
### Pakistan ka Pehla Roman Urdu Mental Health AI Chatbot

[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](#)
[![Flask](https://img.shields.io/badge/Flask-Backend-black.svg)](#)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-AI-4285F4.svg)](#)
[![Cloud%20Run](https://img.shields.io/badge/Google%20Cloud%20Run-Deployed-0F9D58.svg)](#)
[![Last%20Commit](https://img.shields.io/github/last-commit/hashirsakimdad/sukoon-Ai)](#)
[![Made%20for%20Pakistan](https://img.shields.io/badge/Made%20with%20love%20for-Pakistan-006600.svg)](#)

Sukoon AI Pakistan ke liye banaya gaya ek **warm, culturally-aware mental health companion** hai —  
Roman Urdu, Urdu, aur English mein aap ki baat suntay huay **stress, anxiety, sadness** ko gently handle karta hai.  
Goal simple hai: **therapy ka stigma kam**, aur **support zyada** — har phone pe, har waqt.

---

## ✨ Features

- 🎤 **Voice Input** — Roman Urdu mein bolo  
- 🧠 **Agent-Based AI** — context yaad rakhta hai  
- 💾 **Conversation History** — pichli baatein save hoti hain  
- 😭 **Real-time Emotion Detection** — 6 emotions  
- 📊 **Live Mood Tracking Chart**  
- 🧘 **Interactive Breathing Exercise** (animated)  
- 🌿 **Grounding Exercise (5-4-3-2-1)**  
- 🌙 **Dark / Light Mode**  
- 🚨 **Crisis Support** — Umang `0317-4288665`  
- 🇵🇰 **Pakistani Cultural Context Aware**  

---

## 🖥️ Screenshots

**App Screenshot** (coming soon — judges, we’ll add real screenshots before final submission)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JS |
| Backend | Python, Flask, Flask-CORS |
| AI | Google Gemini 1.5 Flash |
| Memory | Agent-based JSON session storage |
| Deployment | Docker, Google Cloud Run |
| Version Control | Git, GitHub |

---

## 🚀 Live Demo

🌐 **Live App:** `https://sukoon-ai-130411295021.asia-south1.run.app`

---

## ⚙️ Run Locally

```bash
git clone https://github.com/hashirsakimdad/sukoon-Ai.git
cd sukoon-Ai/sukoon-ai
pip install -r requirements.txt
```

Create a `.env` file (copy `.env.example`) and set:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
FLASK_SECRET_KEY=your_local_secret_key
```

Run:

```bash
python app.py
```

Open:

```text
http://localhost:8080
```

---

## ☁️ Deploy to Cloud Run

> **Security note:** Do **not** hardcode real API keys in README. Use env vars / Secret Manager.

```bash
cd "D:\sukoon ai\sukoon-ai"
gcloud run deploy sukoon-ai --source . --platform managed --region asia-south1 --allow-unauthenticated --set-env-vars "GEMINI_API_KEY=YOUR_KEY_HERE,FLASK_SECRET_KEY=sukoon-ai-secret-2026"
```

---

## 🏗️ Project Structure

```text
sukoon-ai/
├── app.py
├── templates/
│   └── index.html
├── static/
│   ├── style.css
│   └── app.js
├── data/
│   └── .gitkeep
├── .env.example
├── .gitignore
├── requirements.txt
├── Dockerfile
└── .dockerignore
```

---

## 🤝 Why Sukoon AI?

Pakistan mein mental health ka masla real hai — lekin **therapy ka stigma**, “log kya kahenge”, aur access ki kami ki wajah se log akelay reh jatay hain.  
Sukoon AI ka mission yeh hai ke aap ko ek **safe, non-judgmental, culturally aware** space milay — jahan aap apni feelings bol bhi sako, likh bhi sako, aur choti choti CBT exercises se **thoda sukoon** pa sako.

---

## 🏆 Built For

**Google AI Seekho 2026** | **#VibeKaregaPakistan 🇵🇰**

---

## 👨‍💻 Author

- **GitHub:** `hashirsakimdad`

---

Made with ❤️ for Pakistan 🇵🇰

