import express from "express";
import http from "http";
import { Server } from "socket.io";
import mysql from "mysql2/promise";

const PORT = 3000;

// ADJUST THESE FOR YOUR LIGHTSAIL MYSQL INSTANCE
const db = await mysql.createPool({
  host: "YOUR_DB_ENDPOINT",   // e.g. lightsaildb.xxxxxx.rds.amazonaws.com
  user: "YOUR_DB_USER",       // e.g. admin
  password: "YOUR_DB_PASSWORD",
  database: "chessDB",        // whatever your DB name is
  waitForConnections: true,
  connectionLimit: 10
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

// ---------- DB HEALTH ----------
app.get("/db-health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- REGISTER ----------
app.post("/users/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ ok: false, error: "Missing fields" });

  const [exists] = await db.query(
    "SELECT id FROM users WHERE username = ?",
    [username]
  );
  if (exists.length > 0)
    return res.status(409).json({ ok: false, error: "Username taken" });

  const [result] = await db.query(
    "INSERT INTO users (username, password, winNum, lossNum, imageIdNum) VALUES (?, ?, 0, 0, 7)",
    [username, password]
  );

  res.json({ ok: true, userId: result.insertId.toString() });
});

// ---------- GET USER BY USERNAME ----------
app.get("/users/:username", async (req, res) => {
  const [rows] = await db.query(
    "SELECT id AS userId, username, winNum, lossNum, imageIdNum FROM users WHERE username = ?",
    [req.params.username]
  );
  if (rows.length === 0)
    return res.status(404).json({ ok: false, error: "User not found" });

  res.json({ ok: true, user: rows[0] });
});

// ---------- GET USER BY ID ----------
app.get("/users/id/:id", async (req, res) => {
  const [rows] = await db.query(
    "SELECT id AS userId, username, winNum, lossNum, imageIdNum FROM users WHERE id = ?",
    [req.params.id]
  );
  if (rows.length === 0)
    return res.status(404).json({ ok: false, error: "User not found" });

  res.json({ ok: true, user: rows[0] });
});

// ---------- RENAME USER ----------
app.patch("/users/id/:id/rename", async (req, res) => {
  const { newUsername } = req.body;
  if (!newUsername)
    return res.status(400).json({ ok: false, error: "Missing username" });

  const [exists] = await db.query(
    "SELECT id FROM users WHERE username = ?",
    [newUsername]
  );
  if (exists.length > 0)
    return res.status(409).json({ ok: false, error: "Username taken" });

  await db.query("UPDATE users SET username = ? WHERE id = ?", [
    newUsername,
    req.params.id,
  ]);

  res.json({ ok: true });
});

// ---------- UPDATE PROFILE IMAGE ----------
app.patch("/users/id/:id/image", async (req, res) => {
  const { imageIdNum } = req.body;
  if (!imageIdNum)
    return res.status(400).json({ ok: false, error: "Missing imageIdNum" });

  await db.query("UPDATE users SET imageIdNum = ? WHERE id = ?", [
    imageIdNum,
    req.params.id,
  ]);

  res.json({ ok: true });
});

// ---------- SOCKET.IO MULTIPLAYER ----------
const rooms = new Map();
function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

io.on("connection", socket => {
  socket.on("create", (_, cb) => {
    const code = makeRoomCode();
    rooms.set(code, Date.now());
    socket.join(code);
    cb && cb({ code });
  });

  socket.on("join", (code, cb) => {
    if (!rooms.has(code))
      return cb && cb({ ok: false, error: "NO_ROOM" });

    socket.join(code);
    cb && cb({ ok: true });
    socket.to(code).emit("peer-joined", { id: socket.id });
  });
});

server.listen(PORT, () => console.log("Server running on", PORT));