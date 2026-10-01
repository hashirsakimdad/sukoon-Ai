require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

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
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// ── API routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", require("../src/routes/auth"));
app.use("/api/chat", require("../src/routes/chat"));

// ── SPA fallback — serve index.html for any non-API, non-file route ─────────
const indexPath = path.join(publicDir, "index.html");
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not found" });
  }
  // Check file exists before sending (avoids crash on Vercel)
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(200).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Sukoon AI</title></head>
<body><h1>Sukoon AI is running</h1><p>Static files not found at expected path.</p></body></html>`);
});

// ── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── For local dev, listen on a port; Vercel uses the export ─────────────────
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Sukoon AI server running → http://localhost:${PORT}`);
  });
}

module.exports = app;
