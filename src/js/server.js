const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const srv = http.createServer(app);
const io = new Server(srv);

app.use(express.static('public'));

const rooms = new Map();
function makeCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

io.on('connection', socket => {
  socket.on('create', (_, cb) => {
    const code = makeCode();
    rooms.set(code, { createdAt: Date.now() });
    socket.join(code);
    cb && cb({ code });
  });

  socket.on('join', (code, cb) => {
    if (!rooms.has(code)) return cb && cb({ ok: false, error: 'NO_ROOM' });
    socket.join(code);
    cb && cb({ ok: true });
    socket.to(code).emit('peer-joined', { id: socket.id });
  });

  socket.on('disconnecting', () => {
    [...socket.rooms].forEach(r => {
      if (r !== socket.id) socket.to(r).emit('peer-left', { id: socket.id });
    });
  });
});

srv.listen(3000, () => console.log('listening :3000'));
