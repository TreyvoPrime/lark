'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, rooms, clean } = require('../server');

const id = 'a'.repeat(64), hostKey = 'b'.repeat(64), capability = 'c'.repeat(64);
let server, base;
test.before(async () => {
  server = createServer(); server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { for (const room of rooms.values()) for (const item of room.pending.values()) item.finish(503, {}); rooms.clear(); await new Promise(resolve => server.close(resolve)); });
async function call(path, body) { return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }

test('health has no session information', async () => {
  const r = await fetch(base + '/health'); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
});
test('host key required; guest request waits for host and receives its decision', async () => {
  assert.equal((await call(`/v1/rooms/${id}/register`, { capability })).status, 400);
  assert.equal((await call(`/v1/rooms/${id}/register`, { hostKey, capability })).status, 200);
  assert.equal((await call(`/v1/rooms/${id}/register`, { hostKey, capability })).status, 200);
  assert.equal((await call(`/v1/rooms/${id}/register`, { hostKey: 'd'.repeat(64), capability })).status, 409);
  const request = { version: 2, session: id, action: 'join', invitation: capability };
  const guest = call(`/v1/rooms/${id}/send`, { capability, request });
  const poll = await call(`/v1/rooms/${id}/poll`, { hostKey });
  const item = (await poll.json()).item; assert.equal(item.request.action, 'join');
  const answer = { ok: true, version: 2, status: 'pending', credential: 'private' };
  assert.equal((await call(`/v1/rooms/${id}/reply`, { hostKey, id: item.id, response: answer })).status, 200);
  const response = await guest; assert.equal(response.status, 200); assert.deepEqual((await response.json()).response, answer);
});
test('bad invitation, mismatched room and unauthenticated host calls are rejected', async () => {
  assert.equal((await call(`/v1/rooms/${id}/send`, { capability: 'd'.repeat(64), request: { session: id, action: 'poll' } })).status, 404);
  assert.equal((await call(`/v1/rooms/${id}/poll`, { hostKey: 'd'.repeat(64) })).status, 404);
  assert.equal((await call(`/v1/rooms/${id}/send`, { capability, request: { session: 'e'.repeat(64), action: 'poll' } })).status, 400);
});
test('a waiting host receives a later guest request', async () => {
  const waiting = call(`/v1/rooms/${id}/poll`, { hostKey });
  await new Promise(resolve => setTimeout(resolve, 30));
  const guest = call(`/v1/rooms/${id}/send`, { capability, request: { session: id, action: 'encrypted' } });
  const item = (await (await waiting).json()).item;
  assert.equal(item.request.action, 'encrypted');
  await call(`/v1/rooms/${id}/reply`, { hostKey, id: item.id, response: { data: 'encrypted' } });
  assert.equal((await guest).status, 200);
});
test('room close rejects pending guests and removes room state', async () => {
  const guest = call(`/v1/rooms/${id}/send`, { capability, request: { version: 2, session: id, action: 'poll' } });
  const close = await call(`/v1/rooms/${id}/close`, { hostKey }); assert.equal(close.status, 200);
  assert.equal((await guest).status, 503); assert.equal(rooms.has(id), false);
});
test('expired rooms and waiting responses are cleared', () => {
  const item = { finish: () => { item.finished = true; } };
  rooms.set(id, { created: 0, lastSeen: 0, pending: new Map([['req', item]]) }); clean(Date.now());
  assert.equal(rooms.has(id), false); assert.equal(item.finished, true);
});
