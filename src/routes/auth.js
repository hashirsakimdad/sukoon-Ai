const { Router } = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/database");
const { generateToken } = require("../middleware/auth");

const router = Router();

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)").run(
      id, name, email, password_hash
    );

    const user = { id, name, email };
    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!row) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = { id: row.id, name: row.name, email: row.email };
    const token = generateToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/auth/me  (requires auth header)
const { requireAuth } = require("../middleware/auth");
router.get("/me", requireAuth, (req, res) => {
  const row = db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!row) return res.status(404).json({ error: "User not found" });
  res.json({ user: row });
});

module.exports = router;
