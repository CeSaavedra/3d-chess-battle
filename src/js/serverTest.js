const INSTANCE_IP = '100.31.30.28';
const BASE = `/api/proxy`;
const DB_HEALTH_URL = `${BASE}/db-health`;
const USER_BY_NAME_URL = username => `${BASE}/users/${encodeURIComponent(username)}`;
const USER_BY_ID_URL = userId => `${BASE}/users/id/${encodeURIComponent(userId)}`;
const RENAME_BY_ID_URL = userId => `${BASE}/users/id/${encodeURIComponent(userId)}/rename`;

// prefer userId lookups; fallback to username if needed
const DEFAULT_USER_ID = '2cb040d5-cd49-11f0-b8d3-022f637f4249';
const DEFAULT_USERNAME = 'bob';
const HARD_CODED_NEW_USERNAME = 'frank';

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, ...options });
    clearTimeout(timeout);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { ok: res.ok, status: res.status, json, raw: text };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

function showJson(el, obj) {
  el.textContent = JSON.stringify(obj, null, 2);
}

function showUserLine(el, u) {
  if (!u) { el.textContent = 'user not found'; return; }
  // do not display password; show stable userId and public fields
  el.textContent = `${u.userId || 'no-id'} | ${u.username || 'no-username'} | ${u.imageIdNum} | ${u.winNum} | ${u.lossNum}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const healthPre = document.getElementById('server-status') || document.body.appendChild(document.createElement('pre'));
  healthPre.id = 'server-status';
  const userLine = document.getElementById('user-line') || (() => {
    const d = document.body.appendChild(document.createElement('div'));
    d.id = 'user-line';
    d.style.marginTop = '12px';
    d.style.fontFamily = 'monospace';
    return d;
  })();
  const userRaw = document.getElementById('user-raw') || document.body.appendChild(document.createElement('pre'));
  userRaw.id = 'user-raw';

  // check DB health
  showJson(healthPre, { checking: DB_HEALTH_URL });
  const health = await fetchWithTimeout(DB_HEALTH_URL);
  showJson(healthPre, health);

  // Attempt to rename bob -> glob using the userId rename endpoint (hardcoded)
  const renameRes = await fetchWithTimeout(RENAME_BY_ID_URL(DEFAULT_USER_ID), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ newUsername: HARD_CODED_NEW_USERNAME })
  });

  // show rename result briefly in the raw area
  if (renameRes && renameRes.ok) {
    // success: show the rename response
    showJson(userRaw, { rename: renameRes });
  } else {
    // failure: show the error response
    showJson(userRaw, { renameFailed: renameRes });
  }

  // After attempting rename, fetch the user (prefer userId lookup)
  let userRes = await fetchWithTimeout(USER_BY_ID_URL(DEFAULT_USER_ID));

  // if userId lookup failed, fallback to username lookup (use new username first, then old)
  if (!(userRes.ok && userRes.json && userRes.json.ok && userRes.json.user)) {
    // try new username first
    userRes = await fetchWithTimeout(USER_BY_NAME_URL(HARD_CODED_NEW_USERNAME));
    if (!(userRes.ok && userRes.json && userRes.json.ok && userRes.json.user)) {
      // fallback to original username
      userRes = await fetchWithTimeout(USER_BY_NAME_URL(DEFAULT_USERNAME));
    }
  }

  if (userRes.ok && userRes.json && userRes.json.ok && userRes.json.user) {
    showUserLine(userLine, userRes.json.user);
    showJson(userRaw, userRes.json);
  } else {
    showUserLine(userLine, null);
    showJson(userRaw, userRes);
  }
});