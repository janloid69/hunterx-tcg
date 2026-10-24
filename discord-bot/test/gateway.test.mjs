import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGateway, Intents } from '../src/gateway.mjs';

class FakeSocket {
  static all = [];

  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sent = [];
    this.listeners = {};
    FakeSocket.all.push(this);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }

  emit(type, event) {
    for (const fn of this.listeners[type] ?? []) fn(event);
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000, reason = '') {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closedWith = code;
    this.emit('close', { code, reason });
  }

  // Things Discord does:
  receive(payload) {
    this.emit('message', { data: JSON.stringify(payload) });
  }

  drop(code) {
    this.readyState = 3;
    this.emit('close', { code, reason: '' });
  }

  ops() {
    return this.sent.map((p) => p.op);
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(t) {
  FakeSocket.all = [];
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const events = [];
  const fatal = [];
  const gateway = createGateway({
    token: 'tok',
    intents: Intents.GUILDS | Intents.GUILD_MEMBERS,
    getGatewayUrl: async () => 'wss://gateway.test',
    onDispatch: (type, data) => events.push([type, data]),
    onFatal: (code, message) => fatal.push([code, message]),
    WebSocketImpl: FakeSocket,
    random: () => 0.5,
  });
  return { gateway, events, fatal };
}

async function connect(t, gateway) {
  gateway.start();
  t.mock.timers.tick(0);
  await flush();
  return FakeSocket.all.at(-1);
}

test('identifies with the right intents, then heartbeats', async (t) => {
  const { gateway, events } = setup(t);
  const ws = await connect(t, gateway);
  assert.equal(ws.url, 'wss://gateway.test/?v=10&encoding=json');

  ws.receive({ op: 10, d: { heartbeat_interval: 1000 } });
  assert.equal(ws.sent[0].op, 2);
  assert.equal(ws.sent[0].d.token, 'tok');
  assert.equal(ws.sent[0].d.intents, 3);

  ws.receive({ op: 0, t: 'READY', s: 1, d: { session_id: 'sess', resume_gateway_url: 'wss://resume.test' } });
  assert.deepEqual(events.map((e) => e[0]), ['READY']);

  t.mock.timers.tick(500); // first beat at interval * random
  assert.deepEqual(ws.sent.at(-1), { op: 1, d: 1 });
  ws.receive({ op: 11 });
  ws.receive({ op: 0, t: 'GUILD_MEMBER_UPDATE', s: 2, d: { user: { id: '1' } } });
  t.mock.timers.tick(1000);
  assert.deepEqual(ws.sent.at(-1), { op: 1, d: 2 });
  gateway.stop();
});

test('reconnects and resumes when Discord asks, or when heartbeats go unanswered', async (t) => {
  const { gateway } = setup(t);
  const ws = await connect(t, gateway);
  ws.receive({ op: 10, d: { heartbeat_interval: 1000 } });
  ws.receive({ op: 0, t: 'READY', s: 5, d: { session_id: 'sess', resume_gateway_url: 'wss://resume.test' } });

  ws.receive({ op: 7, d: null });
  assert.equal(ws.closedWith, 4000, 'keeps the session resumable');
  t.mock.timers.tick(0);
  await flush();
  const second = FakeSocket.all.at(-1);
  assert.equal(second.url, 'wss://resume.test/?v=10&encoding=json');
  second.receive({ op: 10, d: { heartbeat_interval: 1000 } });
  assert.deepEqual(second.sent[0], { op: 6, d: { token: 'tok', session_id: 'sess', seq: 5 } });

  // No ACK for a heartbeat: zombie connection, reconnect.
  t.mock.timers.tick(500);
  t.mock.timers.tick(1000);
  assert.equal(second.closedWith, 4000);
  t.mock.timers.tick(0);
  await flush();
  assert.equal(FakeSocket.all.length, 3);
  gateway.stop();
});

test('a dropped connection retries with a resume; an invalid session starts fresh', async (t) => {
  const { gateway } = setup(t);
  const ws = await connect(t, gateway);
  ws.receive({ op: 10, d: { heartbeat_interval: 1000 } });
  ws.receive({ op: 0, t: 'READY', s: 3, d: { session_id: 'sess', resume_gateway_url: 'wss://resume.test' } });

  ws.drop(1006);
  t.mock.timers.tick(60_000);
  await flush();
  const second = FakeSocket.all.at(-1);
  assert.notEqual(second, ws);
  second.receive({ op: 10, d: { heartbeat_interval: 1000 } });
  assert.equal(second.sent[0].op, 6);

  second.receive({ op: 9, d: false });
  t.mock.timers.tick(5000);
  await flush();
  const third = FakeSocket.all.at(-1);
  assert.equal(third.url, 'wss://gateway.test/?v=10&encoding=json', 'fresh sessions use the normal gateway');
  third.receive({ op: 10, d: { heartbeat_interval: 1000 } });
  assert.equal(third.sent[0].op, 2, 'identifies again');
  gateway.stop();
});

test('setup problems stop the bot with a clear message', async (t) => {
  const { gateway, fatal } = setup(t);
  const ws = await connect(t, gateway);
  ws.receive({ op: 10, d: { heartbeat_interval: 1000 } });
  ws.drop(4014);
  t.mock.timers.tick(120_000);
  await flush();
  assert.equal(FakeSocket.all.length, 1, 'does not reconnect');
  assert.equal(fatal[0][0], 4014);
  assert.match(fatal[0][1], /Server Members Intent/);
});

test('stop closes cleanly and does not reconnect', async (t) => {
  const { gateway } = setup(t);
  const ws = await connect(t, gateway);
  gateway.stop();
  assert.equal(ws.closedWith, 1000);
  t.mock.timers.tick(120_000);
  await flush();
  assert.equal(FakeSocket.all.length, 1);
});
