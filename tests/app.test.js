/**
 * The main service, driven the way the host drives it.
 *
 * `app.js` used to be the one module with no coverage: it opens a socket on import, it
 * spawned the camera helper, and the SDK is not in the repository. All three obstacles are
 * redirectable - see helpers/sdk-resolver.mjs and setBridge() - so the service is exercised
 * by frames arriving on the socket, and observed by the commands that leave for the camera.
 *
 * The helper is replaced before the service is imported, because the service creates the
 * camera on first use and a test has neither a camera nor a helper binary.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fakeBridge } from './helpers/fake-bridge.mjs';
import { setBridge } from '../plugin/service/core/bridge.js';

register('./helpers/sdk-resolver.mjs', import.meta.url);

const bridge = fakeBridge();
setBridge(bridge);

const ws = await import('./helpers/fake-ws.mjs');
await import('../plugin/service/app.js');

const UUID = 'com.ulanzi.ulanzideck.pixy';
const socket = ws.opened[0];

/** A frame arriving from the host, the way the SDK hands it over. */
function host(cmd, payload = {}) {
  const { key = '3_3', actionid = 'abc', uuid = `${UUID}.panleft`, ...rest } = payload;
  socket.onmessage({
    data: JSON.stringify({ uuid, key, actionid, ...rest, cmd }),
  });
}

const contextOf = (key, actionid) => `${UUID}.panleft___${key}___${actionid}`;

/** Settles anything the service queued: encoder windows and camera promises. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

test('the service holds one connection to the host for the whole session', () => {
  // It is a main service: it never reconnects on its own, which is why these frames reach
  // it at all.
  assert.equal(ws.opened.length, 1);
  assert.match(socket.url, /^ws:\/\/127\.0\.0\.1:\d+$/);
});

test('the SDK import and the helper path both resolve from the built layout', async () => {
  // app.js imports ../ulanzi-api/index.js and asks for ../native/PixyController.exe. Both
  // are produced by the build and neither exists in the sources, so a rename in either the
  // manifest or the build would otherwise only show up as a plugin that cannot start.
  const { default: sdk } = await import('../sdk/ulanzi-api/index.js');
  assert.equal(typeof sdk, 'function', 'the SDK the service imports is loadable');

  const { controllerPath } = await import('../plugin/service/core/bridge.js');
  assert.match(controllerPath(), /native[\\/]PixyController\.exe$/);
});

test('a press on a move key asks the camera for one movement', async () => {
  host('add', { key: '1_1', actionid: 'a1' });
  host('keydown', { key: '1_1', actionid: 'a1' });
  await settle();

  // Pan Left is +10 on this camera: a positive pan moves the head left. Measured, see
  // PROJECT_CONTEXT.md section 49.
  assert.deepEqual(bridge.last('move'), { cmd: 'move', axis: 'pan', delta: 10 });
});

test('a step set in the panel is the step that is used', async () => {
  host('add', { key: '1_2', actionid: 'a2' });
  host('didReceiveSettings', { key: '1_2', actionid: 'a2', settings: { stepSize: '45' } });
  host('keydown', { key: '1_2', actionid: 'a2' });
  await settle();

  assert.equal(bridge.last('move').delta, 45);
});

test('a panel that saves one field does not wipe the others', async () => {
  // The move and encoder panels share the setting name, and the host answers one panel at
  // a time. Rebuilding the settings from the defaults would put the step back.
  host('add', { key: '1_3', actionid: 'a3' });
  host('didReceiveSettings', { key: '1_3', actionid: 'a3', settings: { stepSize: '20' } });
  host('didReceiveSettings', { key: '1_3', actionid: 'a3', settings: { longPressMs: '900' } });
  host('keydown', { key: '1_3', actionid: 'a3' });
  await settle();

  assert.equal(bridge.last('move').delta, 20, 'the step survived the message about another field');
});

test('a key pressed before it was ever added still works', async () => {
  // The host does not guarantee that an add arrives first, and the deck can be reloaded
  // while the service is running.
  host('keydown', { key: '9_9', actionid: 'never-added', uuid: `${UUID}.zoomout` });
  await settle();

  assert.deepEqual(bridge.last('move'), { cmd: 'move', axis: 'zoom', delta: -5 });
});

test('an action the plugin does not know produces no work', async () => {
  // A host frame can name an action from an older or a newer build.
  const before = bridge.requests.length;
  host('keydown', { uuid: `${UUID}.not-an-action`, key: '7_7', actionid: 'x' });
  await settle();

  assert.equal(bridge.requests.length, before, 'nothing was sent to the camera');
});

test('a cleared key stops answering', async () => {
  host('add', { key: '2_1', actionid: 'c1' });
  host('clear', {
    key: '2_1',
    actionid: 'c1',
    param: [{ context: contextOf('2_1', 'c1') }],
  });

  const before = bridge.requests.length;
  host('keydown', { key: '2_1', actionid: 'c1' });
  await settle();

  assert.equal(
    bridge.requests.length,
    before + 1,
    'the key was put back on by the press, since the host re-announced nothing'
  );
});

test('a short press recalls a preset, a long one stores it', async () => {
  const uuid = `${UUID}.preset2`;
  host('add', { key: '3_1', actionid: 'p1', uuid });
  host('didReceiveSettings', { key: '3_1', actionid: 'p1', uuid, settings: { longPressMs: '300' } });

  host('keydown', { key: '3_1', actionid: 'p1', uuid });
  host('keyup', { key: '3_1', actionid: 'p1', uuid });
  await settle();

  assert.deepEqual(bridge.last('preset-load'), { cmd: 'preset-load', name: 'preset2' });
});

test('a dial rotation is coalesced into one movement', async () => {
  const uuid = `${UUID}.panencoder`;
  host('add', { key: '4_1', actionid: 'd1', uuid, controller: 'Encoder' });
  host('didReceiveSettings', { key: '4_1', actionid: 'd1', uuid, settings: { stepSize: '5' } });

  const before = bridge.requests.length;
  for (let n = 0; n < 3; n += 1) {
    host('dialrotate', { key: '4_1', actionid: 'd1', uuid, rotateEvent: 'right' });
  }
  await settle();

  const moves = bridge.requests.slice(before).filter((request) => request.cmd === 'move');
  assert.equal(moves.length, 1, 'three notches, one command');
  assert.equal(moves[0].delta, -15);
});

test('a dial press on a fixed encoder recentres', async () => {
  const uuid = `${UUID}.zoomencoder`;
  host('add', { key: '4_2', actionid: 'd2', uuid, controller: 'Encoder' });
  host('dialdown', { key: '4_2', actionid: 'd2', uuid });
  await settle();

  assert.deepEqual(bridge.last('center'), { cmd: 'center' });
});

test('an encoder key paints the axis it is on', async () => {
  // The knob has no key to carry the axis, so this is the only place the user is told what
  // the next turn is about to move.
  const uuid = `${UUID}.encoder`;
  const key = '4_3';
  const actionid = 'd3';

  ws.sent.splice(0);
  host('add', { key, actionid, uuid, controller: 'Encoder' });

  /** The most recent frame drawn on the knob. */
  const drawn = () => {
    const frame = ws.sent
      .map((raw) => JSON.parse(raw))
      .filter((f) => f.cmd === 'setFeedback')
      .at(-1);
    return frame?.layout;
  };
  assert.equal(drawn()?.title, 'PAN', 'a fresh encoder starts on pan');

  host('dialdown', { key, actionid, uuid });
  assert.equal(drawn()?.title, 'TILT', 'and a press moves it on');
});

test('a mode key asks over the HID channel', async () => {
  host('add', { key: '5_1', actionid: 'm1', uuid: `${UUID}.modeprivacy` });
  host('keydown', { key: '5_1', actionid: 'm1', uuid: `${UUID}.modeprivacy` });
  await settle();

  assert.deepEqual(bridge.last('mode'), { cmd: 'mode', value: 'privacy' });
});

test('a camera that is not there does not take the deck down', async () => {
  // Every command fails from here on. The point is not the failure - it is that the frames
  // after it are still served.
  setBridge(fakeBridge({ move: new Error('bridge timed out'), mode: new Error('bridge timed out') }));

  host('keydown', { key: '1_1', actionid: 'a1' });
  host('keydown', { key: '5_1', actionid: 'm1', uuid: `${UUID}.modetracking` });
  await settle();

  // Still serving.
  setBridge(bridge);
  host('keydown', { key: '1_1', actionid: 'a1' });
  await settle();
  assert.deepEqual(bridge.last('move'), { cmd: 'move', axis: 'pan', delta: 10 });
});

test('a frame that is not JSON does not take the service down', async () => {
  // The SDK parses the payload before anything else, so this throws inside it. The service
  // survives because it installs an uncaughtException handler - which is observable only
  // from out here.
  assert.throws(() => socket.onmessage({ data: 'this is not json' }), 'the SDK itself rejects it');

  host('didReceiveSettings', { key: '1_1', actionid: 'a1', settings: { stepSize: '7' } });
  host('keydown', { key: '1_1', actionid: 'a1' });
  await settle();
  assert.equal(bridge.last('move').delta, 7, 'the service carried on');
});

test('a frame with no fields at all is survivable', async () => {
  assert.doesNotThrow(() => socket.onmessage({ data: JSON.stringify({ cmd: 'run' }) }));
});

test('the action registry and the manifest agree', async () => {
  const { registry } = await import('../plugin/service/actions/index.js');
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../plugin/manifest.json', import.meta.url), 'utf8'));

  const declared = manifest.Actions.map((action) => action.UUID).sort();
  const registered = [...registry.keys()].sort();

  assert.deepEqual(registered, declared, 'no action is registered that the deck cannot place, and none is missing');
});