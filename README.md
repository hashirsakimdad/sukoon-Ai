# 🧠 Sukoon AI — Mental Health Support Chatbot for Pakistan

> Pakistan ka pehla Roman Urdu mental health AI chatbot with voice input, emotion detection, and interactive CBT exercises.

Built for Google AI Seekho 2026 #VibeKaregaPakistan 🇵🇰

## ✨ Features
- 🎤 Voice Input in Roman Urdu
- 😭 Real-time Emotion Detection (6 emotions)
- 🧘 Interactive Breathing Exercise (animated)
- 🌿 Grounding Exercise (5-4-3-2-1 technique)
- 📊 Live Mood Tracking Chart
- 🌙 Dark / Light Mode
- 🚨 Crisis Support — Umang Helpline 0317-4288665
- 🇵🇰 Pakistani cultural context aware

## 🛠️ Tech Stack
- Python + Flask
- Google Gemini API
- HTML / CSS / Vanilla JS
- Docker + Google Cloud Run

## 🚀 Run Locally
1. Clone:
   `git clone https://github.com/hashirsakimdad/sukoon-Ai.git`
2. `cd sukoon-Ai/sukoon-ai`
3. Install:
   `pip install -r requirements.txt`
4. Create `.env` (copy from `.env.example`) and add your key:
   `GEMINI_API_KEY=your_key`
5. Run:
   `python app.py`
6. Open:
   `http://localhost:8080`

## 🎤 Test Voice Input
- Open in Chrome on Windows
- Click mic button
- Allow microphone permission
- Speak (Urdu/Roman Urdu/English)
- It will auto-fill in the input box

## ☁️ Deploy to Cloud Run (Windows)
From `sukoon-ai/`:

`gcloud run deploy sukoon-ai --source . --platform managed --region asia-south1 --allow-unauthenticated --set-env-vars GEMINI_API_KEY=your_key`

## 🏆 Hackathon
Google AI Seekho 2026 | #VibeKaregaPakistan | Made with ❤️ for Pakistan

