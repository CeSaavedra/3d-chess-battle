const socket = (typeof io === 'function') ? io() : null;

const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const codeDisplay = document.getElementById('codeDisplay');
const codeInput = document.getElementById('codeInput');
const statusEl = document.getElementById('status');

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function gotoGame(code) {
  // navigate to the game page using an absolute path
  location.href = '/pages/game-page.html?code=' + encodeURIComponent(code);
}

if (!socket) {
  setStatus('Socket.io client not available. Check server and /socket.io/socket.io.js');
  console.error('Socket.io client not found on window as io()');
} else {
  setStatus('Connecting to server...');
  socket.on('connect', () => setStatus('Connected as ' + socket.id));
  socket.on('disconnect', () => setStatus('Disconnected'));

  // keep track of the room code we created (if any) and whether we've already navigated
  let currentRoomCode = null;
  let hasNavigated = false;

  // Creator: create room and wait for server 'start-game' on the game page,
  // but also navigate the creator immediately when a peer joins (restore original UX).
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      socket.emit('create', null, res => {
        if (!res || !res.code) {
          alert('Create failed');
          return;
        }
        const code = res.code;
        currentRoomCode = code; // remember it for peer-joined handler
        if (codeDisplay) codeDisplay.textContent = code;
        setStatus('Room created — waiting for opponent to load...');
        alert('Created room: ' + code);

        // Keep a listener for start-game in case you want to rely on server handshake
        // on the game page itself; this does not prevent immediate navigation on peer-joined.
        socket.once('start-game', () => {
          if (!hasNavigated) {
            hasNavigated = true;
            gotoGame(code);
          }
        });
      });
    });
  }

  // Joiner: join and navigate immediately on success
  if (joinBtn && codeInput) {
    joinBtn.addEventListener('click', () => {
      const code = (codeInput.value || '').trim();
      if (!code) return alert('Enter code');
      socket.emit('join', code, res => {
        if (res && res.ok) {
          alert('Joined: ' + code);
          hasNavigated = true;
          gotoGame(code);
        } else {
          alert('Join failed: ' + (res && res.error ? res.error : 'unknown'));
        }
      });
    });
  }

  // Global peer-joined handler: if we're the creator (we have a currentRoomCode),
  // show an alert to inform the inviter, then navigate to the game page.
  socket.on('peer-joined', d => {
    console.log('peer-joined', d);
    setStatus('Peer joined your room');

    // show the alert first so the inviter sees the notification
    alert('A peer has joined your room.');

    // If we created a room and still have its code, navigate the creator to the game page
    if (currentRoomCode && !hasNavigated) {
      // small delay to allow any UI updates; remove if undesired
      setTimeout(() => {
        if (!hasNavigated) {
          hasNavigated = true;
          gotoGame(currentRoomCode);
        }
      }, 50);
    }
  });

  // Optional: show server-sent status messages
  socket.on('status', msg => setStatus(String(msg)));
}