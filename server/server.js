// Biscuit Bake-Off live server.
// Serves the game files from /docs and runs the live rooms over WebSocket at /ws.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const miniws = require('./miniws');

const PORT = process.env.PORT || 8080;
const DOCS = path.join(__dirname, '..', 'docs');
const STATIONS = 6;
const MAX_PLAYERS = 80;
const MAX_ROOMS = 300;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000; // rooms vanish after 3 quiet hours
const ROOM_EMPTY_MS = 30 * 60 * 1000; // ...or 30 minutes with nobody connected

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// ---------- HTTP: health check + static files ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(DOCS, p));
  if (!file.startsWith(DOCS)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ---------- Rooms ----------
const rooms = new Map(); // code -> room

function newCode() {
  for (let i = 0; i < 200; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return null;
}

const token = () => crypto.randomBytes(12).toString('hex');
const now = () => Date.now();

function makeRoom() {
  const code = newCode();
  if (!code) return null;
  const room = {
    code,
    hostToken: token(),
    host: null, // socket
    status: 'lobby', // lobby | playing | results
    round: 0,
    seed: 0,
    startedAt: 0,
    players: new Map(), // id -> player
    lastActivity: now(),
    flushTimer: null,
  };
  rooms.set(code, room);
  return room;
}

// Keep the word filter short and boring: it only catches the obvious stuff.
// The teacher can always kick a name from the host screen.
const BLOCK = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigg', 'fag', 'slut', 'whore', 'penis', 'vagina', 'porn', 'rape', 'nazi', 'hitler', 'kkk', 'retard', 'asshole', 'dumbass', 'jackass'];
const OK_WORDS = ['dickens', 'dickson', 'dickinson', 'grape', 'drape', 'scrape', 'trapeze'];

function cleanName(raw, room) {
  let name = String(raw || '')
    .replace(/[^\p{L}\p{N} _.'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  if (name.length < 1) name = 'Chef';
  let flat = name.toLowerCase().replace(/[^a-z]/g, '');
  for (const ok of OK_WORDS) flat = flat.split(ok).join('');
  if (BLOCK.some((w) => flat.includes(w))) name = 'Chef ' + Math.floor(100 + Math.random() * 900);
  // unique names inside a room
  const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
  let base = name;
  let n = 2;
  while (taken.has(name.toLowerCase())) {
    name = (base.slice(0, 13) + ' ' + n).trim();
    n++;
  }
  return name;
}

function playerPoints(p) {
  return p.scores.reduce((a, s) => a + (typeof s === 'number' ? s : 0), 0);
}
function stationsDone(p) {
  return p.scores.filter((s) => typeof s === 'number').length;
}

function rankedPlayers(room) {
  return [...room.players.values()].sort((a, b) => {
    const pa = playerPoints(a);
    const pb = playerPoints(b);
    if (pb !== pa) return pb - pa;
    const da = stationsDone(a);
    const db = stationsDone(b);
    if (db !== da) return db - da;
    return (a.finishedAt || Infinity) - (b.finishedAt || Infinity);
  });
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    hat: p.hat,
    connected: !!p.ws,
    scores: p.scores,
    points: playerPoints(p),
    done: p.done,
    look: p.look,
    best: p.best,
    bestLook: p.bestLook,
  };
}

function hostState(room) {
  return {
    t: 'state',
    code: room.code,
    status: room.status,
    round: room.round,
    startedAt: room.startedAt,
    players: rankedPlayers(room).map(publicPlayer),
  };
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      /* ignore */
    }
  }
}

function roundMsg(room) {
  return { t: 'status', status: room.status, round: room.round, seed: room.seed };
}

// Batch updates so 30 kids finishing at once doesn't flood the projector.
function scheduleFlush(room) {
  room.lastActivity = now();
  if (room.flushTimer) return;
  room.flushTimer = setTimeout(() => {
    room.flushTimer = null;
    flush(room);
  }, 150);
}

function flush(room) {
  send(room.host, hostState(room));
  const ranked = rankedPlayers(room);
  ranked.forEach((p, i) => {
    send(p.ws, { t: 'rank', rank: i + 1, of: ranked.length, points: playerPoints(p) });
  });
}

function resultsMsg(room) {
  const ranked = rankedPlayers(room);
  const top = ranked.filter((p) => p.done || playerPoints(p) > 0).slice(0, 3).map((p) => ({ name: p.name, hat: p.hat, points: playerPoints(p), look: p.look }));
  return { ranked, top };
}

function sendResults(room) {
  const { ranked, top } = resultsMsg(room);
  ranked.forEach((p, i) => {
    send(p.ws, { t: 'results', round: room.round, top, rank: i + 1, of: ranked.length, points: playerPoints(p) });
  });
}

// ---------- WebSocket ----------
const clients = miniws.attach(server, '/ws', 8 * 1024, (ws) => {
  ws.isAlive = true;
  ws.role = null; // 'host' | 'player'
  ws.room = null;
  ws.playerId = null;
  ws.bucket = 40;
  ws.lastReact = 0;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (data) => {
    // simple rate limit: 40 messages, refills 20/sec
    if (ws.bucket <= 0) return;
    ws.bucket--;
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    try {
      handle(ws, msg);
    } catch (e) {
      console.error('handler error', e);
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws.role === 'host' && room.host === ws) room.host = null;
    if (ws.role === 'player') {
      const p = room.players.get(ws.playerId);
      if (p && p.ws === ws) p.ws = null;
    }
    scheduleFlush(room);
  });
});

function bindPlayer(ws, room, p) {
  if (p.ws && p.ws !== ws) {
    send(p.ws, { t: 'replaced' });
    try {
      p.ws.close();
    } catch (e) {}
  }
  p.ws = ws;
  ws.role = 'player';
  ws.room = room;
  ws.playerId = p.id;
  send(ws, {
    t: 'joined',
    id: p.id,
    token: p.token,
    name: p.name,
    hat: p.hat,
    code: room.code,
    status: room.status,
    round: room.round,
    seed: room.seed,
    scores: p.round === room.round ? p.scores : [],
    done: p.round === room.round ? p.done : false,
  });
  if (room.status === 'results') {
    const { ranked, top } = resultsMsg(room);
    const i = ranked.indexOf(p);
    send(ws, { t: 'results', round: room.round, top, rank: i + 1, of: ranked.length, points: playerPoints(p) });
  }
  scheduleFlush(room);
}

function freshScores(p, room) {
  if (p.round !== room.round) {
    p.round = room.round;
    p.scores = Array(STATIONS).fill(null);
    p.done = false;
    p.look = null;
    p.finishedAt = 0;
  }
}

function handle(ws, msg) {
  switch (msg.t) {
    case 'ping':
      send(ws, { t: 'pong' });
      return;

    // ----- host -----
    case 'host_create': {
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', msg: 'The kitchen is full right now. Try again in a few minutes.' });
      const room = makeRoom();
      if (!room) return send(ws, { t: 'error', msg: 'Could not make a room code. Try again.' });
      room.host = ws;
      ws.role = 'host';
      ws.room = room;
      send(ws, { t: 'host_ok', code: room.code, hostToken: room.hostToken });
      send(ws, hostState(room));
      return;
    }
    case 'host_resume': {
      const room = rooms.get(String(msg.code));
      if (!room || room.hostToken !== msg.hostToken) return send(ws, { t: 'host_gone' });
      if (room.host && room.host !== ws) {
        send(room.host, { t: 'replaced' });
        try {
          room.host.close();
        } catch (e) {}
      }
      room.host = ws;
      ws.role = 'host';
      ws.room = room;
      send(ws, { t: 'host_ok', code: room.code, hostToken: room.hostToken });
      send(ws, hostState(room));
      return;
    }

    // ----- player -----
    case 'join': {
      const room = rooms.get(String(msg.code || '').trim());
      if (!room) return send(ws, { t: 'error', msg: "That room code doesn't exist. Check the code on the board." });
      if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'This kitchen is full.' });
      const p = {
        id: token().slice(0, 8),
        token: token(),
        name: cleanName(msg.name, room),
        hat: Math.max(0, Math.min(7, Number(msg.hat) | 0)),
        ws: null,
        round: -1,
        scores: [],
        done: false,
        look: null,
        finishedAt: 0,
        best: 0,
        bestLook: null,
      };
      freshScores(p, room);
      room.players.set(p.id, p);
      bindPlayer(ws, room, p);
      return;
    }
    case 'rejoin': {
      const room = rooms.get(String(msg.code || ''));
      const p = room && [...room.players.values()].find((x) => x.token === msg.token);
      if (!room || !p) return send(ws, { t: 'rejoin_failed' });
      freshScores(p, room);
      bindPlayer(ws, room, p);
      return;
    }
  }

  const room = ws.room;
  if (!room) return;
  room.lastActivity = now();

  if (ws.role === 'host') {
    switch (msg.t) {
      case 'start': {
        if (room.status === 'playing') return;
        room.round++;
        room.seed = Math.floor(Math.random() * 2 ** 31);
        room.status = 'playing';
        room.startedAt = now();
        for (const p of room.players.values()) freshScores(p, room);
        for (const p of room.players.values()) send(p.ws, roundMsg(room));
        scheduleFlush(room);
        return;
      }
      case 'end': {
        if (room.status !== 'playing') return;
        room.status = 'results';
        for (const p of room.players.values()) {
          const pts = playerPoints(p);
          if (p.round === room.round && pts > p.best) {
            p.best = pts;
            p.bestLook = p.look;
          }
          send(p.ws, roundMsg(room));
        }
        sendResults(room);
        send(room.host, hostState(room));
        return;
      }
      case 'lobby': {
        room.status = 'lobby';
        for (const p of room.players.values()) send(p.ws, roundMsg(room));
        scheduleFlush(room);
        return;
      }
      case 'kick': {
        const p = room.players.get(String(msg.id));
        if (!p) return;
        send(p.ws, { t: 'kicked' });
        if (p.ws) {
          p.ws.room = null;
          try {
            p.ws.close();
          } catch (e) {}
        }
        room.players.delete(p.id);
        scheduleFlush(room);
        return;
      }
      case 'close_room': {
        for (const p of room.players.values()) send(p.ws, { t: 'closed' });
        rooms.delete(room.code);
        return;
      }
    }
    return;
  }

  if (ws.role === 'player') {
    const p = room.players.get(ws.playerId);
    if (!p) return;
    switch (msg.t) {
      case 'progress': {
        if (room.status !== 'playing' || msg.round !== room.round) return;
        freshScores(p, room);
        const i = Number(msg.station);
        if (!(i >= 0 && i < STATIONS) || typeof p.scores[i] === 'number') return;
        p.scores[i] = Math.max(0, Math.min(100, Math.round(Number(msg.score) || 0)));
        scheduleFlush(room);
        return;
      }
      case 'finish': {
        if (room.status !== 'playing' || msg.round !== room.round) return;
        if (stationsDone(p) < STATIONS || p.done) return;
        p.done = true;
        p.finishedAt = now();
        p.look = sanitizeLook(msg.look);
        scheduleFlush(room);
        return;
      }
      case 'react': {
        const e = Number(msg.e) | 0;
        if (e < 0 || e > 7) return;
        if (now() - ws.lastReact < 1500) return;
        ws.lastReact = now();
        send(room.host, { t: 'react', e, name: p.name, hat: p.hat });
        return;
      }
    }
  }
}

// The finished biscuit's appearance, drawn on the host screen podium.
function sanitizeLook(look) {
  if (!look || typeof look !== 'object') return null;
  const n = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  return {
    rise: n(look.rise),
    layers: Math.max(0, Math.min(8, Number(look.layers) | 0)),
    round: n(look.round),
    brown: n(look.brown),
    tender: n(look.tender),
    mood: n(look.mood),
    seed: Number(look.seed) | 0,
  };
}

// ---------- housekeeping ----------
setInterval(() => {
  for (const ws of clients) {
    ws.bucket = Math.min(40, ws.bucket + 20);
  }
}, 1000);

setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {}
  }
}, 25000);

setInterval(() => {
  const t = now();
  for (const [code, room] of rooms) {
    const anyone = room.host || [...room.players.values()].some((p) => p.ws);
    if (t - room.lastActivity > ROOM_IDLE_MS || (!anyone && t - room.lastActivity > ROOM_EMPTY_MS)) {
      rooms.delete(code);
    }
  }
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`Biscuit Bake-Off server on :${PORT}`);
});
