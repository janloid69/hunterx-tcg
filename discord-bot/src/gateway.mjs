// Discord's Gateway: the live connection that tells the bot when members join,
// leave or change roles, and when a mod presses a button. Keeps the
// connection alive with heartbeats and picks up where it left off after drops.
// Uses Node 22's built-in WebSocket.

export const Intents = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1, // privileged: "Server Members Intent" in the Developer Portal
};

const Op = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE: 3,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
};

/** Close codes that retrying can't fix, with what to do about them. */
export const FATAL_CLOSE_CODES = {
  4004: 'Discord rejected the bot token. Copy a fresh token from the Developer Portal (Bot → Reset Token) into DISCORD_BOT_TOKEN in .env.',
  4010: 'Discord says the shard setup is invalid. This is a bug in the bot.',
  4011: 'The bot is in too many servers for one connection. This is a bug in the bot.',
  4012: 'Discord rejected the gateway version. Update the bot.',
  4013: 'Discord rejected the intents. This is a bug in the bot.',
  4014: 'Turn on "Server Members Intent" in the Discord Developer Portal (your app → Bot → Privileged Gateway Intents), save, then start the bot again.',
};

// After these, the old session can't be resumed; start a new one.
const NEW_SESSION_CODES = new Set([4007, 4009]);

export function createGateway({
  token,
  intents,
  getGatewayUrl,
  onDispatch = () => {},
  onFatal = () => {},
  log = () => {},
  presence,
  WebSocketImpl = globalThis.WebSocket,
  timers = globalThis,
  random = Math.random,
}) {
  let socket = null;
  let seq = null;
  let sessionId = null;
  let resumeUrl = null;
  let heartbeatTimer = null;
  let firstBeatTimer = null;
  let reconnectTimer = null;
  let ackReceived = true;
  let failures = 0;
  let stopped = false;
  let nextConnectResumes = false;

  function sendRaw(ws, payload) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
  }

  function stopHeartbeat() {
    timers.clearTimeout(firstBeatTimer);
    timers.clearInterval(heartbeatTimer);
    firstBeatTimer = null;
    heartbeatTimer = null;
  }

  function beat(ws) {
    sendRaw(ws, { op: Op.HEARTBEAT, d: seq });
  }

  function startHeartbeat(ws, interval) {
    stopHeartbeat();
    ackReceived = true;
    const tick = () => {
      if (!ackReceived) {
        log('Discord stopped answering heartbeats; reconnecting');
        dropAndReconnect(ws, true);
        return;
      }
      ackReceived = false;
      beat(ws);
    };
    firstBeatTimer = timers.setTimeout(() => {
      tick();
      heartbeatTimer = timers.setInterval(tick, interval);
    }, Math.floor(interval * random()));
  }

  function identify(ws) {
    sendRaw(ws, {
      op: Op.IDENTIFY,
      d: {
        token,
        intents,
        properties: { os: process.platform, browser: 'hunterx-bot', device: 'hunterx-bot' },
        ...(presence ? { presence } : {}),
      },
    });
  }

  /** Closes the current connection on purpose; the close handler reconnects. */
  function dropAndReconnect(ws, resume) {
    if (ws !== socket) return;
    nextConnectResumes = resume;
    stopHeartbeat();
    socket = null;
    try {
      // 4000 (not 1000) keeps the session resumable on Discord's side.
      ws.close(4000, 'reconnecting');
    } catch {
      // already closed
    }
    scheduleConnect(resume ? 0 : 1000 + Math.floor(random() * 4000));
  }

  function scheduleConnect(delay) {
    if (stopped) return;
    timers.clearTimeout(reconnectTimer);
    reconnectTimer = timers.setTimeout(() => {
      connect().catch((error) => {
        log(`Couldn't connect to Discord: ${error.message}`);
        failures += 1;
        scheduleConnect(backoff());
      });
    }, delay);
  }

  function backoff() {
    return Math.min(1000 * 2 ** Math.min(failures, 6), 60000) + Math.floor(random() * 1000);
  }

  function handle(ws, payload) {
    if (payload.s !== null && payload.s !== undefined) seq = payload.s;

    switch (payload.op) {
      case Op.HELLO: {
        startHeartbeat(ws, payload.d.heartbeat_interval);
        if (nextConnectResumes && sessionId) {
          sendRaw(ws, { op: Op.RESUME, d: { token, session_id: sessionId, seq } });
        } else {
          identify(ws);
        }
        break;
      }
      case Op.HEARTBEAT_ACK:
        ackReceived = true;
        break;
      case Op.HEARTBEAT:
        beat(ws);
        break;
      case Op.RECONNECT:
        log('Discord asked the bot to reconnect');
        dropAndReconnect(ws, true);
        break;
      case Op.INVALID_SESSION:
        if (!payload.d) {
          sessionId = null;
          seq = null;
        }
        log(`Discord ended the session (${payload.d ? 'resuming' : 'starting a new one'})`);
        dropAndReconnect(ws, Boolean(payload.d));
        break;
      case Op.DISPATCH:
        if (payload.t === 'READY') {
          sessionId = payload.d.session_id;
          resumeUrl = payload.d.resume_gateway_url;
          failures = 0;
        } else if (payload.t === 'RESUMED') {
          failures = 0;
        }
        try {
          onDispatch(payload.t, payload.d);
        } catch (error) {
          log(`Error handling ${payload.t}: ${error.stack ?? error.message}`);
        }
        break;
      default:
        break;
    }
  }

  function handleClose(ws, code, reason) {
    if (ws !== socket) return; // a connection we already replaced
    socket = null;
    stopHeartbeat();
    if (stopped) return;

    if (FATAL_CLOSE_CODES[code]) {
      stopped = true;
      onFatal(code, FATAL_CLOSE_CODES[code]);
      return;
    }
    if (NEW_SESSION_CODES.has(code)) {
      sessionId = null;
      seq = null;
    }
    failures += 1;
    const delay = backoff();
    log(`Discord connection closed (${code}${reason ? `: ${reason}` : ''}); reconnecting in ${Math.round(delay / 1000)}s`);
    nextConnectResumes = Boolean(sessionId);
    scheduleConnect(delay);
  }

  async function connect() {
    if (stopped) return;
    const base = nextConnectResumes && sessionId && resumeUrl ? resumeUrl : await getGatewayUrl();
    const ws = new WebSocketImpl(`${base}/?v=10&encoding=json`);
    socket = ws;
    ws.addEventListener('message', (event) => {
      if (ws !== socket) return;
      let payload;
      try {
        payload = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'));
      } catch {
        return;
      }
      handle(ws, payload);
    });
    ws.addEventListener('close', (event) => handleClose(ws, event.code, event.reason));
    ws.addEventListener('error', () => {
      // A close event always follows; it handles reconnecting.
    });
  }

  return {
    start() {
      stopped = false;
      nextConnectResumes = false;
      scheduleConnect(0);
    },
    stop() {
      stopped = true;
      stopHeartbeat();
      timers.clearTimeout(reconnectTimer);
      const ws = socket;
      socket = null;
      try {
        ws?.close(1000, 'shutting down');
      } catch {
        // already closed
      }
    },
    /** For tests and logs. */
    get state() {
      return { seq, sessionId, resumeUrl, connected: socket !== null };
    },
  };
}
