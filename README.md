# 🌿 Sukoon AI

**Pakistan's First Roman Urdu Mental Health AI Companion**

Sukoon AI is a warm, culturally-aware mental health chatbot that supports users in Roman Urdu, Urdu, and English. It helps with stress, anxiety, sadness, and everyday emotional struggles — gently, privately, and for free.

## ✨ Features

- 💬 **AI Therapy Chat** — Talk in Roman Urdu, Urdu, or English
- 😊 **Real-time Emotion Detection** — 6 emotions detected automatically
- 📊 **Mood Tracking** — Track your emotional journey over time
- 🧘 **Breathing Exercise** — Animated 4-7-8 technique
- 🌿 **5-4-3-2-1 Grounding** — Sensory grounding for panic moments
- 🔐 **User Accounts** — Signup/login with saved conversation history
- 🚨 **Crisis Detection** — Immediate helpline info when needed
- 🌙 **Dark/Light Mode** — Follows system preference
- 🇵🇰 **Pakistani Cultural Context** — Understands local idioms and culture

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Database | SQLite (better-sqlite3) |
| Auth | JWT + bcrypt |
| AI | Groq (Llama 3.3 70B) |
| Frontend | Vanilla JS SPA, CSS |
| Deployment | Docker |

## 🚀 Quick Start

```bash
git clone https://github.com/hashirsakimdad/sukoon-Ai.git
cd sukoon-Ai
npm install
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
npm start
```

Open http://localhost:3000

## 🐳 Docker

```bash
docker build -t sukoon-ai .
docker run -p 3000:8080 -e GROQ_API_KEY=your_key -e JWT_SECRET=your_secret sukoon-ai
```

## 📁 Project Structure

```
├── src/
│   ├── server.js          # Express server entry point
│   ├── db/database.js     # SQLite schema & connection
│   ├── middleware/auth.js  # JWT auth middleware
│   ├── routes/auth.js     # Signup/login endpoints
│   ├── routes/chat.js     # Chat & mood endpoints
│   └── services/ai.js     # Groq AI integration
├── public/
│   ├── index.html         # SPA shell
│   ├── css/style.css      # Design system
│   └── js/app.js          # Client-side router & UI
├── data/                   # SQLite DB (gitignored)
├── Dockerfile
└── package.json
```

## 🔌 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/auth/me` | Yes | Get current user |
| GET | `/api/chat/conversations` | Yes | List conversations |
| POST | `/api/chat/conversations` | Yes | Create conversation |
| DELETE | `/api/chat/conversations/:id` | Yes | Delete conversation |
| GET | `/api/chat/conversations/:id/messages` | Yes | Get messages |
| POST | `/api/chat/conversations/:id/messages` | Yes | Send message & get AI reply |
| GET | `/api/chat/mood?days=7` | Yes | Get mood entries |

## ⚠️ Disclaimer

Sukoon AI is a supportive companion, NOT a replacement for professional therapy. For serious mental health issues, please consult a professional. In crisis, call **Umang Helpline: 0317-4288665**.
