const path = require("path");
const fs = require("fs");

/**
 * Simple in-memory database that works on Vercel serverless.
 * On local dev, it also works — but data resets on restart.
 * For production persistence, swap this for Supabase/Postgres.
 */

const store = {
  users: new Map(),
  conversations: new Map(),
  messages: new Map(),       // key: conversation_id, value: array of messages
  mood_entries: new Map(),   // key: user_id, value: array of entries
  _msgId: 0,
  _moodId: 0,
};

/** SQLite-compatible API wrapper around in-memory Maps */
const db = {
  prepare(sql) {
    return {
      run(...params) { return execSQL(sql, params, "run"); },
      get(...params) { return execSQL(sql, params, "get"); },
      all(...params) { return execSQL(sql, params, "all"); },
    };
  },
  pragma() {},
  exec() {},
};

function execSQL(sql, params, mode) {
  const s = sql.trim().toLowerCase();

  // ── Users ───────────────────────────────────────────────────────────
  if (s.includes("insert into users")) {
    const [id, name, email, password_hash] = params;
    store.users.set(id, { id, name, email, password_hash, created_at: new Date().toISOString() });
    return { changes: 1 };
  }
  if (s.includes("from users where email")) {
    const email = params[0];
    for (const u of store.users.values()) {
      if (u.email === email) return mode === "all" ? [u] : u;
    }
    return mode === "all" ? [] : undefined;
  }
  if (s.includes("from users where id")) {
    const id = params[0];
    const u = store.users.get(id);
    return mode === "all" ? (u ? [u] : []) : u;
  }

  // ── Conversations ───────────────────────────────────────────────────
  if (s.includes("insert into conversations")) {
    const [id, user_id, title] = params;
    const now = new Date().toISOString();
    store.conversations.set(id, { id, user_id, title, created_at: now, updated_at: now });
    store.messages.set(id, []);
    return { changes: 1 };
  }
  if (s.includes("from conversations") && s.includes("where c.user_id") || (s.includes("from conversations c") && s.includes("user_id"))) {
    const user_id = params[0];
    const convs = [...store.conversations.values()]
      .filter((c) => c.user_id === user_id)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((c) => ({ ...c, message_count: (store.messages.get(c.id) || []).length }));
    return mode === "all" ? convs : convs[0];
  }
  if (s.includes("from conversations where id") && s.includes("user_id")) {
    const [id, user_id] = params;
    const c = store.conversations.get(id);
    if (c && c.user_id === user_id) return mode === "all" ? [c] : c;
    return mode === "all" ? [] : undefined;
  }
  if (s.includes("delete from conversations")) {
    const id = params[0];
    store.conversations.delete(id);
    store.messages.delete(id);
    return { changes: 1 };
  }
  if (s.includes("update conversations set title")) {
    const [title, id] = params;
    const c = store.conversations.get(id);
    if (c) c.title = title;
    return { changes: 1 };
  }
  if (s.includes("update conversations set updated_at")) {
    const id = params[0];
    const c = store.conversations.get(id);
    if (c) c.updated_at = new Date().toISOString();
    return { changes: 1 };
  }

  // ── Messages ────────────────────────────────────────────────────────
  if (s.includes("insert into messages")) {
    const [conversation_id, role, content, emotion] = params;
    const msgs = store.messages.get(conversation_id) || [];
    msgs.push({
      id: ++store._msgId,
      conversation_id, role, content,
      emotion: emotion || null,
      created_at: new Date().toISOString(),
    });
    store.messages.set(conversation_id, msgs);
    return { changes: 1 };
  }
  if (s.includes("from messages where conversation_id") && s.includes("order by id desc")) {
    const id = params[0];
    const msgs = (store.messages.get(id) || []).slice(-20).reverse();
    // The caller reverses again, so return in desc order
    return mode === "all" ? msgs : msgs[0];
  }
  if (s.includes("from messages where conversation_id") && s.includes("order by id")) {
    const id = params[0];
    const msgs = store.messages.get(id) || [];
    return mode === "all" ? msgs : msgs[0];
  }
  if (s.includes("count(*)") && s.includes("from messages")) {
    const id = params[0];
    return { c: (store.messages.get(id) || []).length };
  }

  // ── Mood entries ────────────────────────────────────────────────────
  if (s.includes("insert into mood_entries")) {
    const [user_id, mood, score, note] = params;
    const entries = store.mood_entries.get(user_id) || [];
    entries.push({
      id: ++store._moodId, user_id, mood, score,
      note: note || null,
      created_at: new Date().toISOString(),
    });
    store.mood_entries.set(user_id, entries);
    return { changes: 1 };
  }
  if (s.includes("from mood_entries")) {
    const user_id = params[0];
    const entries = store.mood_entries.get(user_id) || [];
    // Simple filter — return all for now
    return mode === "all" ? entries : entries[0];
  }

  // Fallback
  return mode === "all" ? [] : undefined;
}

module.exports = db;
