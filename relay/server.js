'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const MAX_BODY = 1400 * 1024;
const MAX_MESSAGE = 1100 * 1024;
const MAX_ROOMS = 200;
const MAX_PENDING = 24;
const ROOM_IDLE_MS = 45_000;
const ROOM_MAX_MS = 8 * 60 * 60 * 1000;
const WAIT_MS = 25_000;
const rooms = new Map();
const sendRates = new Map();
const registerRates = new Map();
let lastErrorLog = 0;

function token(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function text(value, max = 80) { return typeof value === 'string' && value.length <= max; }
function send(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}
function read(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function roomFor(id, hostKey) {
  const room = rooms.get(id);
  if (!room || !safeEqual(room.hostKey, hostKey)) return null;
  return room;
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function clean(now = Date.now()) {
  for (const [id, room] of rooms) if (now - room.lastSeen > ROOM_IDLE_MS || now - room.created > ROOM_MAX_MS) {
    rooms.delete(id); for (const pending of room.pending.values()) pending.finish(503, { error: 'Share host disconnected. Start a new session.' });
  }
  for (const [ip, slot] of sendRates) if (now - slot[0] > 60_000) sendRates.delete(ip);
  for (const [ip, slot] of registerRates) if (now - slot[0] > 60_000) registerRates.delete(ip);
  while (sendRates.size > 5000) sendRates.delete(sendRates.keys().next().value);
  while (registerRates.size > 5000) registerRates.delete(registerRates.keys().next().value);
}
function handler(req, res) {
  const url = new URL(req.url, 'http://relay.invalid');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  if (!/^\/v1\/rooms\/[a-f0-9]{64}\/(register|poll|reply|send|close)$/.test(url.pathname)) return send(res, 404, { error: 'Not found.' });
  read(req).then(body => {
    clean();
    const [, , , id, action] = url.pathname.split('/');
    if (!token(id)) return send(res, 400, { error: 'Invalid room.' });
    if (action === 'register') {
      if (!token(body.hostKey) || !token(body.capability)) return send(res, 400, { error: 'Invalid Share session details.' });
      const existing = rooms.get(id);
      if (existing) {
        if (safeEqual(existing.hostKey, body.hostKey) && safeEqual(existing.capability, body.capability)) return send(res, 200, { ok: true });
        return send(res, 409, { error: 'This Share room already exists.' });
      }
      if (rooms.size >= MAX_ROOMS) return send(res, 503, { error: 'Relay is full. Try again later.' });
      const ip = req.socket.remoteAddress || 'unknown', now = Date.now();
      let rate = registerRates.get(ip);
      if (!rate || now - rate[0] >= 60_000) { rate = [now, 0]; registerRates.set(ip, rate); }
      if (++rate[1] > 30) return send(res, 429, { error: 'Too many new Share sessions. Wait a minute and retry.' });
      const created = Date.now(); rooms.set(id, { hostKey: body.hostKey, capability: body.capability, created, lastSeen: created, pending: new Map(), queue: [], waiter: null });
      return send(res, 200, { ok: true });
    }
    if (action === 'send') {
      const room = rooms.get(id);
      if (!room || !safeEqual(room.capability, body.capability)) return send(res, 404, { error: 'Share host is offline or invitation is invalid.' });
      const request = body.request;
      if (!request || request.session !== id || !text(request.action, 32)) return send(res, 400, { error: 'Invalid Share request.' });
      const payload = Buffer.byteLength(JSON.stringify(request));
      if (payload > MAX_MESSAGE) return send(res, 413, { error: 'Share message exceeds the relay limit.' });
      const ip = req.socket.remoteAddress || 'unknown', now = Date.now();
      let rate = sendRates.get(ip);
      if (!rate || now - rate[0] >= 60_000) { rate = [now, 0]; sendRates.set(ip, rate); }
      if (++rate[1] > 1200) return send(res, 429, { error: 'Too many Share messages from this network. Wait a minute and retry.' });
      if (room.pending.size >= MAX_PENDING) return send(res, 429, { error: 'Too many simultaneous Share requests.' });
      const requestId = crypto.randomBytes(18).toString('hex');
      let settled = false;
      const finish = (code, value) => { if (settled) return; settled = true; clearTimeout(timer); room.pending.delete(requestId); const index = room.queue.indexOf(requestId); if (index >= 0) room.queue.splice(index, 1); if (!res.destroyed) send(res, code, value); };
      const timer = setTimeout(() => finish(504, { error: 'Share host did not answer in time.' }), WAIT_MS + 5000);
      room.pending.set(requestId, { id: requestId, request, finish });
      room.queue.push(requestId);
      if (room.waiter) { const wake = room.waiter; room.waiter = null; wake(); }
      res.on('close', () => { if (!res.writableEnded) finish(499, { error: 'Guest disconnected.' }); });
      return;
    }
    const room = roomFor(id, body.hostKey);
    if (!room) return send(res, 404, { error: 'Share room is unavailable.' });
    room.lastSeen = Date.now();
    if (action === 'close') {
      rooms.delete(id); for (const pending of room.pending.values()) pending.finish(503, { error: 'Share host ended this session.' });
      return send(res, 200, { ok: true });
    }
    if (action === 'reply') {
      if (!/^[a-f0-9]{36}$/.test(body.id || '') || !body.response || Buffer.byteLength(JSON.stringify(body.response)) > MAX_MESSAGE)
        return send(res, 400, { error: 'Invalid Share response.' });
      const pending = room.pending.get(body.id);
      if (!pending) return send(res, 404, { error: 'Share request expired.' });
      pending.finish(200, { response: body.response });
      return send(res, 200, { ok: true });
    }
    if (room.waiter) return send(res, 409, { error: 'Another host poll is already waiting.' });
    const take = () => {
      while (room.queue.length) {
        const pending = room.pending.get(room.queue.shift());
        if (pending) return send(res, 200, { item: { id: pending.id, request: pending.request } });
      }
      return false;
    };
    if (take()) return;
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; room.waiter = null; send(res, 200, { item: null }); } }, WAIT_MS);
    const wake = () => { if (settled) return; if (take()) { settled = true; clearTimeout(timer); } else room.waiter = wake; };
    room.waiter = wake;
    res.on('close', () => { if (!settled) { settled = true; clearTimeout(timer); if (room.waiter === wake) room.waiter = null; } });
  }).catch(error => {
    if (!error.status && Date.now() - lastErrorLog > 30_000) { lastErrorLog = Date.now(); console.warn('Relay could not process a request for action:', url.pathname.split('/').pop()); }
    if (!res.headersSent && !res.destroyed) send(res, error.status || 400, { error: error.status === 413 ? 'Request too large.' : 'Invalid relay request.' });
  });
}

function createServer() {
  const server = http.createServer(handler);
  server.maxConnections = 160;
  server.requestTimeout = 35_000;
  server.headersTimeout = 10_000;
  return server;
}
if (require.main === module) {
  const server = createServer();
  server.listen(Number(process.env.PORT || 10000), '0.0.0.0', () => console.log('Lark Share relay is listening.'));
  setInterval(clean, 5000).unref();
  process.on('SIGTERM', () => { for (const room of rooms.values()) for (const pending of room.pending.values()) pending.finish(503, { error: 'Relay restarting.' }); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
}

module.exports = { createServer, rooms, clean, MAX_MESSAGE };
