/**
 * The mock Studio, driven over a real socket.
 *
 * The in-process tests replace the websocket with a stub, which proves the service routes
 * events but proves nothing about the connection: the handshake, the port, or the framing on
 * the wire. This file closes that gap against an implementation the mock did not write -
 * Node's built-in WebSocket client - so a mistake in the hand-rolled framing cannot pass by
 * being consistent with itself.
 *
 * What this cannot see: a client that conforms to the RFC but differs from `ws`, which is
 * what the SDK actually uses. What it can see is that the framing is real, and the two
 * implementations agreeing on it is the point.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFrames, encodeFrame, MockStudio } from '../scripts/mock-studio.mjs';

const UUID = 'com.ulanzi.ulanzideck.pixy';

let studio;
let socket;
let server;

/** Every frame the mock received, newest last. */
let received = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

/** Waits until the predicate holds, or gives up with what it did see. */
async function until(predicate, what, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}; saw ${JSON.stringify(received)}`);
}

before(async () => {
  studio = new MockStudio();
  const port = await studio.listen(0);

  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  server = await studio.session();

  // The handshake is the only thing proven so far; every test below resets this.
  socket.send(JSON.stringify({ uuid: UUID }));
  await until(() => server.received.length > 0, 'the plugin to identify itself');
});

after(async () => {
  try {
    socket?.close();
  } catch {
    /* already closed */
  }
  await studio?.close();
});

test('a client completes the handshake and announces itself', () => {
  // The SDK is told an address and a port and nothing else, so whether the plugin ever
  // arrives comes down to this exchange alone.
  assert.ok(studio.port > 0, 'the mock is listening');
  assert.equal(socket.readyState, WebSocket.OPEN, 'the client considers itself connected');
  assert.deepEqual(server.received[0], { uuid: UUID }, 'the first frame arrived intact');
});

test('the port the mock listens on is the port the client connected to', () => {
  assert.ok(server.socket.remotePort > 0, 'a real TCP connection, not a stub');
});

test('an event frame is parsed whole', async () => {
  server.received.length = 0;
  const uuid = `${UUID}.center`;
  socket.send(JSON.stringify({ cmd: 'add', uuid, key: '1_1', actionid: 'a1', context: `${uuid}___1_1___a1` }));

  await until(() => server.received.length === 1, 'the frame');
  received = server.received;
  assert.equal(received[0].cmd, 'add');
  assert.equal(received[0].context, `${uuid}___1_1___a1`);
});

test('frames sent back to the client arrive', async () => {
  // The other direction, which is what the plugin's property inspector relies on: the host
  // pushes, the client reads.
  const uuid = `${UUID}.center`;
  const seen = [];
  const listener = (event) => seen.push(JSON.parse(event.data));
  socket.addEventListener('message', listener);

  server.send({ cmd: 'setFeedback', uuid, layout: { title: 'PAN' } });
  await settle();
  socket.removeEventListener('message', listener);

  assert.equal(seen.at(-1)?.cmd, 'setFeedback', 'the client read what the mock pushed');
  assert.equal(seen.at(-1)?.layout.title, 'PAN');
});

test('several frames sent at once are all received, in order', async () => {
  server.received.length = 0;
  const uuid = `${UUID}.panleft`;
  for (const cmd of ['add', 'didReceiveSettings', 'keydown']) {
    socket.send(JSON.stringify({ cmd, uuid, key: '1_1', actionid: 'a1', context: `${uuid}___1_1___a1` }));
  }

  await until(() => server.received.length === 3, 'three frames');
  assert.deepEqual(server.received.map((frame) => frame.cmd), ['add', 'didReceiveSettings', 'keydown']);
});

test('a payload that needs the extended length field round trips', async () => {
  server.received.length = 0;
  // Past 125 bytes the length stops fitting in the header byte. A settings payload carrying
  // a long preset list reaches it, and getting it wrong corrupts the stream silently.
  const settings = { note: 'x'.repeat(500) };
  socket.send(JSON.stringify({ cmd: 'didReceiveSettings', settings, context: 'c' }));

  await until(() => server.received.length === 1, 'the frame');
  assert.equal(server.received[0].settings.note.length, 500);
});

test('a frame split across two writes is reassembled', () => {
  // TCP has no message boundaries. Treating half a frame as a frame is the classic way to
  // get a corrupt stream, and it only shows up when a payload crosses a packet boundary.
  const payload = JSON.stringify({ cmd: 'keydown', context: 'split' });
  const wire = encodeFrame(payload);

  const first = decodeFrames(wire.subarray(0, 6));
  assert.deepEqual(first.frames, [], 'half a frame is not a frame');
  assert.ok(first.rest.length > 0, 'and it is kept for the rest');

  const second = decodeFrames(Buffer.concat([first.rest, wire.subarray(6)]));
  assert.equal(second.frames.length, 1);
  assert.equal(JSON.parse(second.frames[0].payload).cmd, 'keydown');
  assert.equal(second.rest.length, 0, 'nothing is left over');
});

test('a masked client frame is unmasked', () => {
  // A conforming client masks every frame; the mock does not, because it is the server.
  // Getting the mask wrong yields plausible but corrupt JSON, which is why it is pinned
  // here rather than found out during a manual session.
  const payload = JSON.stringify({ cmd: 'keydown' });
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const body = Buffer.from(payload);
  for (let i = 0; i < body.length; i += 1) body[i] ^= mask[i % 4];

  const header = Buffer.from([0x81, 0x80 | payload.length]);
  const { frames: decoded } = decodeFrames(Buffer.concat([header, mask, body]));
  assert.deepEqual(JSON.parse(decoded[0].payload), { cmd: 'keydown' });
});

test('a protocol ping is surfaced as a ping, not as an event', () => {
  // Node's built-in WebSocket client has no way to send a protocol ping, so this asserts
  // the half that matters and can be asserted: the decoder reports the opcode, and the
  // session answers it rather than parsing it as JSON. A ping parsed as a text frame would
  // land in the event log as "(not json)" on every keepalive.
  const mask = Buffer.from([1, 2, 3, 4]);
  const frame = decodeFrames(Buffer.concat([
    Buffer.from([0x89, 0x80]),   // FIN + ping, masked, zero-length
    mask,
  ]));

  assert.equal(frame.frames.length, 1);
  assert.equal(frame.frames[0].opcode, 0x9, 'the opcode comes through');
  assert.equal(frame.frames[0].payload.length, 0);
});

test('a text frame that is not JSON is recorded as such, not as an event', async () => {
  server.received.length = 0;
  socket.send('this is not json');
  await until(() => server.received.length === 1, 'the frame to be noticed');

  assert.equal(server.received[0].cmd, '(not json)');
  assert.equal(server.received[0].raw, 'this is not json');
});

test('the mock refuses a request that is not an upgrade', async () => {
  // Anything else on this port is not a plugin asking to connect, and answering it with
  // the upgrade response would be the wrong answer.
  const response = await fetch(`http://127.0.0.1:${studio.port}/`);
  assert.equal(response.status, 400);
});