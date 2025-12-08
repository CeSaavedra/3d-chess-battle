// src/js/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const srv = http.createServer(app);
const io = new Server(srv);

app.use(express.static('public'));

// rooms: Map<code, { createdAt: number, players: Map<socketId, playerNumber>, ready: Set<socketId>, started: boolean, turn?: number, movedPieces?: Set<string> }>
const rooms = new Map();
function makeCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

// helper to parse coords on server for minimal pawn validation
function coordToFR(coord) {
  if (!coord || typeof coord !== 'string') throw new Error('invalid coord');
  const f = coord.charCodeAt(0) - 'A'.charCodeAt(0);
  const r = parseInt(coord.slice(1), 10) - 1;
  if (Number.isNaN(f) || Number.isNaN(r)) throw new Error('invalid coord');
  return { f, r };
}

function ensureRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      createdAt: Date.now(),
      players: new Map(),
      ready: new Set(),
      started: false,
      movedPieces: new Set()
    });
  }
  return rooms.get(code);
}

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  // CREATE: create a room and assign the creator player 1 immediately
  socket.on('create', (_, cb) => {
    const code = makeCode();
    const room = ensureRoom(code);
    room.players.set(socket.id, 1);
    socket.join(code);
    socket.emit('player-number', 1);

    // if a turn already exists for the room, inform the creator
    if (room.turn) socket.emit('turn', { playerNumber: room.turn });

    cb && cb({ ok: true, code });
    socket.emit('status', 'room-created');
    console.log('room created', code, 'creator', socket.id);
  });

  // JOIN: join an existing room and assign smallest free player slot (1 or 2)
  socket.on('join', (code, cb) => {
    if (!rooms.has(code)) return cb && cb({ ok: false, error: 'NO_ROOM' });
    const room = rooms.get(code);

    const used = new Set(room.players.values());
    let assigned;
    if (!used.has(1)) assigned = 1;
    else if (!used.has(2)) assigned = 2;
    else return cb && cb({ ok: false, error: 'ROOM_FULL' });

    room.players.set(socket.id, assigned);
    socket.join(code);

    cb && cb({ ok: true, playerNumber: assigned });
    socket.emit('player-number', assigned);

    // if a turn already exists for the room, inform the joiner
    if (room.turn) socket.emit('turn', { playerNumber: room.turn });

    socket.to(code).emit('peer-joined', { id: socket.id, playerNumber: assigned });

    // re-emit stored numbers to peers to ensure everyone knows their assignment
    for (const [id, num] of room.players.entries()) {
      if (id !== socket.id) io.to(id).emit('player-number', num);
    }

    console.log('join', code, 'assigned', assigned, 'room players:', Array.from(room.players.entries()));
  });

  // READY: client notifies server that it has finished loading and is ready to start
  // payload: code (string)
  socket.on('ready', (code, cb) => {
    if (!rooms.has(code)) return cb && cb({ ok: false, error: 'NO_ROOM' });
    const room = rooms.get(code);
    if (room.started) return cb && cb({ ok: false, error: 'ALREADY_STARTED' });

    room.ready.add(socket.id);
    socket.to(code).emit('peer-ready', { id: socket.id });

    // If at least two players are present, require all present players to be ready before starting
    if (room.players.size >= 2) {
      const allPresentIds = Array.from(room.players.keys());
      const allReady = allPresentIds.every(id => room.ready.has(id));
      if (allReady) {
        room.started = true;
        // reset movedPieces for a fresh game
        room.movedPieces = new Set();
        // set initial turn to player 1 by convention
        room.turn = 1;
        io.to(code).emit('start-game', { code });
        // broadcast current turn to all clients in room
        io.to(code).emit('turn', { playerNumber: room.turn });
        console.log('start-game emitted for', code, 'initial turn:', room.turn);
      }
    }

    cb && cb({ ok: true });
  });

  // WHOAMI: return the player's assigned number if present in any room
  socket.on('whoami', (cb) => {
    for (const [code, room] of rooms.entries()) {
      if (room.players.has(socket.id)) {
        const pn = room.players.get(socket.id);
        cb && cb({ ok: true, playerNumber: pn });
        socket.emit('player-number', pn);
        // also emit current turn if available
        if (room.turn) socket.emit('turn', { playerNumber: room.turn });
        return;
      }
    }
    cb && cb({ ok: false, error: 'NOT_IN_ROOM' });
  });

  // PLAYER-MOVE: broadcast move, detect captures, emit game-over with socket ids, and send final turn update
  socket.on('player-move', (code, move, cb) => {
    if (!rooms.has(code)) return cb && cb({ ok: false, error: 'NO_ROOM' });
    const room = rooms.get(code);

    // ensure the socket is a player in this room
    const playerNumber = room.players.get(socket.id);
    if (typeof playerNumber !== 'number') return cb && cb({ ok: false, error: 'NOT_IN_ROOM' });

    // ensure the room has started and it's this player's turn
    if (!room.started) return cb && cb({ ok: false, error: 'NOT_STARTED' });
    if (room.turn !== playerNumber) return cb && cb({ ok: false, error: 'NOT_YOUR_TURN', currentTurn: room.turn });

    // basic shape validation
    if (!move || typeof move.from !== 'string' || typeof move.to !== 'string') {
      return cb && cb({ ok: false, error: 'INVALID_MOVE' });
    }

    // Minimal server-side pawn two-square validation: reject two-step if piece already moved
    try {
      if (move.type === 'pawn' && typeof move.id === 'string') {
        const fromFR = coordToFR(move.from);
        const toFR = coordToFR(move.to);
        const rankDiff = toFR.r - fromFR.r;
        const absRank = Math.abs(rankDiff);
        // two-square advance detected
        if (absRank === 2) {
          if (room.movedPieces && room.movedPieces.has(move.id)) {
            return cb && cb({ ok: false, error: 'PAWN_ALREADY_MOVED' });
          }
          // Note: full path/occupancy validation requires server-side board state; this only prevents repeated two-steps.
        }
      }
    } catch (e) {
      return cb && cb({ ok: false, error: 'INVALID_COORDS' });
    }

    // broadcast the move to all clients (including mover)
    io.to(code).emit('move', { by: playerNumber, move });

    // detect captured piece type from payload (client should include capturedType or captured.type)
    const capturedType = move?.capturedType || move?.captured?.type;

    // If a king was captured, broadcast game-over to the room and mark the room finished
    if (capturedType === 'king') {
      const winner = playerNumber;
      const loser = winner === 1 ? 2 : 1;

      // find socket ids for winner and loser in this room (defensive)
      let winnerSocketId = socket.id;
      let loserSocketId = null;
      for (const [id, num] of room.players.entries()) {
        if (num === winner) winnerSocketId = id;
        if (num === loser) loserSocketId = id;
      }

      room.started = false;      // stop further moves for this room
      room.turn = null;          // clear authoritative turn
      // clear movedPieces for safety (game ended)
      room.movedPieces = new Set();

      // emit game-over with both player numbers and socket ids
      io.to(code).emit('game-over', {
        winnerPlayerNumber: winner,
        loserPlayerNumber: loser,
        winnerSocketId,
        loserSocketId,
        reason: 'king-captured',
        move
      });

      // authoritative final turn update so clients clear turn state
      io.to(code).emit('turn', { playerNumber: null, gameOver: true });

      console.log('game-over in', code, 'winner:', winner, 'loser:', loser, 'move:', move);
      cb && cb({ ok: true, gameOver: true });
      return;
    }

    // advance turn (2-player toggle) only if game still running
    if (!room.turn) room.turn = 1;
    room.turn = room.turn === 1 ? 2 : 1;

    // mark the moved piece as having moved (so pawns can't two-step later)
    if (move && typeof move.id === 'string') {
      room.movedPieces = room.movedPieces || new Set();
      room.movedPieces.add(move.id);
    }

    // emit authoritative next turn
    io.to(code).emit('turn', { playerNumber: room.turn });

    console.log('player-move in', code, 'by', playerNumber, 'move:', move, 'next turn:', room.turn);
    cb && cb({ ok: true, turn: room.turn });
  });

  // ADVANCE-TURN: simple test helper to toggle turn between players 1 and 2
  socket.on('advance-turn', (code, cb) => {
    if (!rooms.has(code)) return cb && cb({ ok: false, error: 'NO_ROOM' });
    const room = rooms.get(code);
    if (!room.turn) room.turn = 1;
    room.turn = room.turn === 1 ? 2 : 1;
    io.to(code).emit('turn', { playerNumber: room.turn });
    console.log('advance-turn for', code, 'now turn:', room.turn);
    cb && cb({ ok: true, turn: room.turn });
  });

  // Clean up on disconnecting: remove from players and ready sets, notify peers, delete empty rooms
  socket.on('disconnecting', () => {
    for (const r of socket.rooms) {
      if (r === socket.id) continue;
      const room = rooms.get(r);
      if (room) {
        room.players.delete(socket.id);
        room.ready.delete(socket.id);
        socket.to(r).emit('peer-left', { id: socket.id });
        if (room.players.size === 0) {
          rooms.delete(r);
          console.log('deleted empty room', r);
        } else {
          
        }
      }
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('socket disconnected', socket.id, reason);
  });
});

srv.listen(3000, () => console.log('listening :3000'));