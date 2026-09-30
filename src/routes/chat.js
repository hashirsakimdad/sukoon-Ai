const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");
const { chat, detectEmotion } = require("../services/ai");

const router = Router();

// All chat routes require authentication
router.use(requireAuth);

// ── Conversations ───────────────────────────────────────────────────────────

// GET /api/chat/conversations
router.get("/conversations", (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
       FROM conversations c
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC`
    )
    .all(req.user.id);
  res.json({ conversations: rows });
});

// POST /api/chat/conversations
router.post("/conversations", (req, res) => {
  const id = uuidv4();
  const title = req.body.title || "New Chat";
  db.prepare("INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)").run(
    id, req.user.id, title
  );
  res.status(201).json({ id, title });
});

// DELETE /api/chat/conversations/:id
router.delete("/conversations/:id", (req, res) => {
  const conv = db
    .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  db.prepare("DELETE FROM conversations WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── Messages ────────────────────────────────────────────────────────────────

// GET /api/chat/conversations/:id/messages
router.get("/conversations/:id/messages", (req, res) => {
  const conv = db
    .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: "Conversation not found" });

  const messages = db
    .prepare("SELECT role, content, emotion, created_at FROM messages WHERE conversation_id = ? ORDER BY id")
    .all(req.params.id);
  res.json({ messages });
});

// POST /api/chat/conversations/:id/messages  — send a message and get AI reply
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const conv = db
      .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.user.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Detect emotion
    const emotionResult = await detectEmotion(message);

    // Save user message
    db.prepare(
      "INSERT INTO messages (conversation_id, role, content, emotion) VALUES (?, 'user', ?, ?)"
    ).run(req.params.id, message, emotionResult.emotion);

    // Save mood entry
    db.prepare(
      "INSERT INTO mood_entries (user_id, mood, score, note) VALUES (?, ?, ?, ?)"
    ).run(req.user.id, emotionResult.emotion, emotionResult.score, emotionResult.summary);

    // Build history for AI (last 20 messages for context)
    const history = db
      .prepare(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 20"
      )
      .all(req.params.id)
      .reverse();

    // Get AI reply
    const reply = await chat(history);

    // Save assistant message
    db.prepare(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)"
    ).run(req.params.id, reply);

    // Update conversation title if it's the first message
    const msgCount = db
      .prepare("SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?")
      .get(req.params.id).c;
    if (msgCount <= 2) {
      const shortTitle = message.length > 40 ? message.slice(0, 40) + "…" : message;
      db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(shortTitle, req.params.id);
    }

    // Update timestamp
    db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(
      req.params.id
    );

    res.json({
      reply,
      emotion: emotionResult,
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to get response. Please try again." });
  }
});

// ── Mood data ───────────────────────────────────────────────────────────────

// GET /api/chat/mood?days=7
router.get("/mood", (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const rows = db
    .prepare(
      `SELECT mood, score, note, created_at
       FROM mood_entries
       WHERE user_id = ? AND created_at >= datetime('now', ?)
       ORDER BY created_at`
    )
    .all(req.user.id, `-${days} days`);
  res.json({ entries: rows });
});

module.exports = router;
