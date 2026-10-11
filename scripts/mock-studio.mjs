/**
 * A stand-in for Ulanzi Studio, for driving the plugin without a deck.
 *
 * The service connects to a websocket and speaks a frame protocol over it. Up to now that
 * has only been exercised in-process, with the socket replaced by a stub - which proves the
 * service routes events correctly but proves nothing about the connection itself: the port,
 * the handshake, the JSON round trip, and what the plugin actually sends back over the wire.
 *
 * The previous harnesses did that job and were lost with the old layout. This replaces them,
 * with two differences worth stating:
 *
 *  - no dependency. It speaks RFC 6455 over `node:net` and `node:crypto`, because the only
 *    WebSocket package this project has is `ws`, and that one is a runtime dependency of the
 *    built plugin - not something a dev tool should reach into. The frames are the only
 *    thing involved and they are small, unfragmented, uncompressed JSON text, which is the
 *    whole of what the SDK sends.
 *  - it is tested. `tests/mock-studio.test.js` drives it with Node's built-in WebSocket
 *    client, so a mistake in here fails the suite instead of failing a manual session.
 *
 * Manual use:
 *
 *     npm run mock
 *
 * then press keys at the prompt. `help` lists the commands.
 */

import net from 'node:net';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OPCODE_TEXT = 0x1;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;
const OPCODE_PONG = 0xa;

/** Encodes one server-to-client frame. Server frames are never masked. */
export function encodeFrame(payload, opcode = OPCODE_TEXT) {
  const data = Buffer.from(payload, 'utf8');
  let header;
  if (data.length < 126) {
    header = Buffer.alloc(2);
    header[1] = data.length;
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  header[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([header, data]);
}

/**
 * Decodes frames out of a buffer, returning the complete ones and the remainder.
 *
 * Only what the SDK sends is handled: a single unfragmented text frame, always masked.
 * A close or a ping is reported so the caller can answer it.
 */
export function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let cursor = offset + 2;

    if (length === 126) {
      if (buffer.length - cursor < 2) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (buffer.length - cursor < 8) break;
      length = Number(buffer.readBigUInt64BE(cursor));
      cursor += 8;
    }

    let mask = null;
    if (masked) {
      if (buffer.length - cursor < 4) break;
      mask = buffer.subarray(cursor, cursor + 4);
      cursor += 4;
    }

    if (buffer.length - cursor < length) break;

    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    cursor += length;

    if (opcode === OPCODE_TEXT) frames.push({ opcode, payload: payload.toString('utf8') });
    else frames.push({ opcode, payload });

    offset = cursor;
  }

  return { frames, rest: buffer.subarray(offset) };
}

/** One connected plugin service. */
class Session {
  constructor(socket, server) {
    this.socket = socket;
    this.server = server;
    this.buffer = Buffer.alloc(0);
    /** Everything the plugin has sent, in order. */
    this.received = [];
    this.closed = false;

    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const { frames, rest } = decodeFrames(this.buffer);
      this.buffer = rest;
      for (const frame of frames) this.onFrame(frame);
    });
    socket.on('close', () => { this.closed = true; });
    socket.on('error', () => { this.closed = true; });
  }

  onFrame({ opcode, payload }) {
    if (opcode === OPCODE_CLOSE) {
      this.socket.end();
      return;
    }
    if (opcode === OPCODE_PING) {
      this.socket.write(encodeFrame(payload, OPCODE_PONG));
      return;
    }
    if (opcode !== OPCODE_TEXT) return;

    let frame;
    try {
      frame = JSON.parse(payload);
    } catch {
      this.received.push({ cmd: '(not json)', raw: payload });
      return;
    }
    this.received.push(frame);
    this.server.emit('frame', frame, this);
  }

  /** Sends one host event to the plugin. */
  send(frame) {
    if (this.closed) return false;
    this.socket.write(encodeFrame(JSON.stringify(frame)));
    return true;
  }

  /** The frames the plugin sent back, optionally filtered. */
  frames(cmd) {
    return cmd ? this.received.filter((frame) => frame.cmd === cmd) : [...this.received];
  }

  /** The most recent frame the plugin sent, optionally filtered. */
  last(cmd) {
    const frames = this.frames(cmd);
    return frames.at(-1) || null;
  }

  close() {
    this.socket.end();
  }
}

/**
 * A mock Studio.
 *
 * @param {object} [options]
 * @param {string} [options.pluginUuid]  the uuid the plugin connects with
 * @param {number} [options.port]        0 asks the OS for a free port
 */
export class MockStudio extends EventEmitter {
  constructor({ pluginUuid = 'com.ulanzi.ulanzideck.pixy', port = 0 } = {}) {
    super();
    this.pluginUuid = pluginUuid;
    /** @type {Session[]} every session that has connected */
    this.sessions = [];
    this.server = net.createServer((socket) => this.onConnection(socket));
  }

  async listen(port = this.port ?? 3906) {
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });
    this.port = this.server.address().port;
    return this.port;
  }

  async close() {
    for (const session of this.sessions) session.close();
    await new Promise((resolve) => this.server.close(resolve));
  }

  onConnection(socket) {
    socket.once('data', (chunk) => {
      // The HTTP upgrade. Anything else on this port is not a plugin asking to connect.
      const request = chunk.toString('utf8', 0, chunk.indexOf('\r\n'));
      if (!/^GET\s+\S+\s+HTTP\/1\.1/i.test(request)) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      const key = /\r\nsec-websocket-key:\s*(\S+)/i.exec(chunk.toString('latin1'))?.[1];
      if (!key) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n'
        + 'Upgrade: websocket\r\n'
        + 'Connection: Upgrade\r\n'
        + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      // The upgrade request can arrive in the same packet as the first frame.
      const { frames, rest } = decodeFrames(chunk.subarray(chunk.indexOf('\r\n\r\n') + 4));
      const session = new Session(socket, this);
      this.sessions.push(session);
      this.emit('connect', session);
      for (const frame of frames) session.onFrame(frame);
      if (rest.length) session.onFrame({ opcode: OPCODE_TEXT, payload: rest.toString('utf8') });
    });
  }

  /** The session a plugin is using, waiting for one to arrive. */
  async session(timeoutMs = 3000) {
    const existing = this.sessions.at(-1);
    if (existing && !existing.closed) return existing;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no plugin connected')), timeoutMs);
      this.once('connect', (session) => {
        clearTimeout(timer);
        resolve(session);
      });
    });
  }

  /**
   * Announces an action on a key and answers its settings, the way the host does.
   *
   * The plugin creates its own entry on any event, so this is not needed to make it work -
   * it is what the deck does, and having it here is what makes a manual session resemble the
   * real one.
   *
   * @param {string} actionUuid
   * @param {object} [options]
   */
  place(session, actionUuid, { key = '1_1', actionid = 'a1', settings = {}, controller } = {}) {
    const context = `${actionUuid}___${key}___${actionid}`;
    session.send({ cmd: 'add', uuid: actionUuid, key, actionid, context, ...(controller ? { controller } : {}) });
    session.send({ cmd: 'didReceiveSettings', uuid: actionUuid, key, actionid, context, settings });
    return context;
  }

  key(session, actionUuid, context, cmd = 'keydown') {
    return session.send({ cmd, uuid: actionUuid, key: '1_1', actionid: 'a1', context });
  }

  dial(session, actionUuid, context, event) {
    return session.send({ cmd: 'dialrotate', uuid: actionUuid, key: '1_1', actionid: 'a1', context, rotateEvent: event });
  }
}

/**
 * Reads commands from stdin and turns them into host events.
 *
 * Deliberately tiny: the point is to be able to press a key without a deck, not to be a
 * second Ulanzi Studio.
 */
function interactive(studio) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'mock> ' });
  rl.prompt();

  const session = () => studio.sessions.at(-1);

  const help = [
    '',
    '  key <action> [keydown|keyup]   press a key',
    '  dial <action> <left|right>     turn an encoder',
    '  press <action>                 press an encoder knob',
    '  place <action> [key] [id]     announce an action on a key',
    '  frames [cmd]                   what the plugin sent back',
    '  help / quit',
    '',
    '  actions: panleft panright tiltup tiltdown zoomin zoomout center',
    '           encoder panencoder tiltencoder zoomencoder',
    '           start preset1 preset2 preset3 preset4 preset5',
    '           modestandard modetracking modeprivacy',
    '',
  ].join('\n');
  console.log(help);

  const qualify = (name) => (name.includes('.') ? name : `${studio.pluginUuid}.${name}`);

  rl.on('line', (line) => {
    const [verb, ...rest] = line.trim().split(/\s+/).filter(Boolean);
    const current = session();

    switch (verb) {
      case undefined:
        break;
      case 'help':
        console.log(help);
        break;
      case 'quit':
      case 'exit':
        rl.close();
        return;
      case 'frames': {
        const list = current ? current.frames(rest[0]) : [];
        console.log(list.length ? list : '  (nothing)');
        break;
      }
      case 'key': {
        if (!current) { console.log('  no plugin connected'); break; }
        const uuid = qualify(rest[0] || '');
        current.send({ cmd: rest[1] || 'keydown', uuid, key: '1_1', actionid: 'a1', context: `${uuid}___1_1___a1` });
        console.log(`  -> ${uuid} ${rest[1] || 'keydown'}`);
        break;
      }
      case 'dial': {
        if (!current) { console.log('  no plugin connected'); break; }
        const uuid = qualify(rest[0] || '');
        const event = rest[1] || 'right';
        current.send({ cmd: 'dialrotate', uuid, key: '1_1', actionid: 'a1', context: `${uuid}___1_1___a1`, rotateEvent: event });
        console.log(`  -> ${uuid} dial ${event}`);
        break;
      }
      case 'press': {
        if (!current) { console.log('  no plugin connected'); break; }
        const uuid = qualify(rest[0] || '');
        current.send({ cmd: 'dialdown', uuid, key: '1_1', actionid: 'a1', context: `${uuid}___1_1___a1` });
        console.log(`  -> ${uuid} dialdown`);
        break;
      }
      case 'place': {
        if (!current) { console.log('  no plugin connected'); break; }
        const uuid = qualify(rest[0] || '');
        studio.place(current, uuid, { key: rest[1] || '1_1', actionid: rest[2] || 'a1', controller: 'Encoder' });
        console.log(`  placed ${uuid}`);
        break;
      }
      default:
        console.log(`  unknown command "${verb}", try help`);
    }
    rl.prompt();
  });

  rl.on('close', () => studio.close().then(() => process.exit(0)));

  studio.on('connect', (connected) => {
    console.log(`\n  plugin connected from ${connected.socket.remoteAddress}:${connected.socket.remotePort}`);
    rl.prompt();
  });
}

/** True when this file was run rather than imported. */
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const port = Number(process.env.PIXY_MOCK_PORT || process.argv[2] || 3906);
  const studio = new MockStudio();
  studio.listen(port).then((actual) => {
    console.log(`Mock Ulanzi Studio on ws://127.0.0.1:${actual}`);
    console.log('Point a real build at this port to watch what it sends.');
    console.log('');
    if (process.stdin.isTTY) interactive(studio);
    else studio.on('connect', (connected) => console.log('plugin connected:', connected.received.length, 'frames'));
  });
}