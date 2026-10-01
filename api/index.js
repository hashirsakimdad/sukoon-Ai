require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();

// ── Security & parsing ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Rate-limit the chat endpoint (30 messages / minute per IP)
app.use(
  "/api/chat",
  rateLimit({ windowMs: 60_000, max: 30, message: { error: "Too many requests" } })
);

// ── Static files (the frontend) ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "public")));

// ── API routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", require("../src/routes/auth"));
app.use("/api/chat", require("../src/routes/chat"));

// ── SPA fallback — serve index.html for any non-API, non-file route ─────────
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ── For local dev, listen on a port; Vercel uses the export ─────────────────
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Sukoon AI server running → http://localhost:${PORT}`);
  });
}

module.exports = app;
