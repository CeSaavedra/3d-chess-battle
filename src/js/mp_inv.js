const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'public');
const outFile = path.join(outDir, 'index.html');

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invite Code Minimal</title>
</head>
<body>
  <div>
    <button id="createBtn">Create Invite Code</button>
    <span id="codeDisplay" style="margin-left:12px"></span>
  </div>

  <div style="margin-top:12px">
    <input id="codeInput" placeholder="ENTER CODE" />
    <button id="joinBtn">Join</button>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();

    const createBtn = document.getElementById('createBtn');
    const joinBtn = document.getElementById('joinBtn');
    const codeDisplay = document.getElementById('codeDisplay');
    const codeInput = document.getElementById('codeInput');

    function gotoGame(code){
        const url = new URL('../pages/game-page.html', location.origin);
        url.searchParams.set('code', code);
        location.href = url.toString();
    }

    // Creator: create room and wait for peer to join, then navigate both
    createBtn.addEventListener('click', () => {
      socket.emit('create', null, res => {
        if (!res || !res.code) return alert('Create failed');
        const code = res.code;
        codeDisplay.textContent = code;
        alert('Created room: ' + code);
        socket.once('peer-joined', () => gotoGame(code));
      });
    });

    // Joiner: join and navigate immediately on success
    joinBtn.addEventListener('click', () => {
      const code = (codeInput.value || '').trim();
      if (!code) return alert('Enter code');
      socket.emit('join', code, res => {
        if (res && res.ok) {
          alert('Joined: ' + code);
          gotoGame(code);
        } else {
          alert('Join failed: ' + (res && res.error ? res.error : 'unknown'));
        }
      });
    });

    // If someone else joins your created room while you're connected, server should emit 'peer-joined'
    socket.on('peer-joined', d => {
      // If creator receives this, they will already navigate via the once() above.
      // Keep this as a fallback to notify if needed.
      alert('Peer joined your room: ' + (d && d.id ? d.id : JSON.stringify(d)));
    });
  </script>
</body>
</html>
`;

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log('Wrote', outFile);