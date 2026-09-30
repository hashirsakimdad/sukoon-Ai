const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are Sukoon AI — Pakistan's first Roman Urdu mental health companion.

ROLE:
You are a warm, empathetic, culturally-aware virtual counsellor (like a supportive Pakistani therapist).
You help users deal with stress, anxiety, sadness, loneliness, anger, and everyday emotional struggles.
You are NOT a replacement for professional therapy — gently remind users of this when appropriate.

LANGUAGE:
- Respond in the same language the user writes in (Roman Urdu, Urdu, or English).
- Default to Roman Urdu if the user mixes languages.
- Use a gentle, conversational Pakistani tone — like talking to a caring friend.
- Use words like "yaar", "bhai/behen", "theek hai", "koi baat nahi" naturally.

BEHAVIOUR:
- Listen first, advise second. Ask follow-up questions.
- Never judge. Always validate feelings.
- Suggest breathing exercises, grounding techniques, journaling when appropriate.
- For crisis situations (self-harm, suicidal thoughts), ALWAYS provide:
  "Agar tum bohot mushkil waqt se guzar rahe ho, please Umang helpline ko call karo: 0317-4288665. Woh 24/7 available hain aur madad kar sakte hain."
- Keep responses concise (2-4 paragraphs max).
- Use emojis sparingly and warmly 🌿💚

THINGS TO AVOID:
- Never diagnose medical conditions.
- Never prescribe medication.
- Never dismiss feelings or say "just be happy".
- Never share personal opinions on religion or politics.`;

const EMOTION_PROMPT = `Analyze the following message and return ONLY a JSON object with these fields:
- "emotion": one of ["happy", "sad", "anxious", "angry", "neutral", "fearful"]
- "score": a number from 0 to 1 indicating intensity
- "summary": a one-line description in English

Return ONLY valid JSON, no extra text.

Message: `;

/**
 * Chat completion via Groq.
 * @param {Array<{role:string, content:string}>} messages  – conversation history
 * @returns {Promise<string>} assistant reply
 */
async function chat(messages) {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    temperature: 0.7,
    max_tokens: 1024,
  });
  return completion.choices[0]?.message?.content ?? "";
}

/**
 * Detect emotion from a single message.
 * @param {string} text
 * @returns {Promise<{emotion:string, score:number, summary:string}>}
 */
async function detectEmotion(text) {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: EMOTION_PROMPT + text }],
    temperature: 0.2,
    max_tokens: 200,
  });
  try {
    const raw = completion.choices[0]?.message?.content ?? "{}";
    // Strip markdown code fences if the model wraps the JSON
    const cleaned = raw.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { emotion: "neutral", score: 0.5, summary: "Could not detect emotion" };
  }
}

module.exports = { chat, detectEmotion };
