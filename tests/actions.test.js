/**
 * The actions, with a camera that only records.
 *
 * Every assertion here is about the command that leaves the plugin, because that is the
 * only thing these modules are responsible for: what a press means, in what order, with
 * what argument. The wire format itself is covered in bridge.test.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as encoder from '../plugin/service/actions/encoder.js';
import { defaultsFor, findByUuid, registry } from '../plugin/service/actions/index.js';
import { Camera } from '../plugin/service/core/camera.js';
import { createStore, ensureEntry, mergeSettings } from '../plugin/service/core/context.js';
import { AXIS, ACTION } from '../plugin/service/core/constants.js';
import { fakeBridge } from './helpers/fake-bridge.mjs';

const ENCODER_FLUSH_MS = 80;

/**
 * A context an action is handed, over a bridge that only records.
 *
 * The real `Camera` is used on purpose: it is the layer that turns `{ ok: false }` into a
 * rejection, and the actions are written against it rather than against the wire.
 */
function ctxFor(uuid, settings = {}, answers = {}) {
  const bridge = fakeBridge(answers);
  const entry = ensureEntry(createStore(), 'ctx', uuid);
  mergeSettings(entry, settings);
  return {
    bridge,
    entry,
    ctx: {
      $UD: null,
      action: findByUuid(uuid),
      uuid,
      context: 'ctx',
      entry,
      settings: entry.settings,
      camera: new Camera({ bridge, log: () => {} }),
      log: () => {},
      report: () => {},
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, ENCODER_FLUSH_MS + 40));

/** Long enough for a 300ms threshold to have elapsed. */
const held = () => new Promise((resolve) => setTimeout(resolve, 360));

test('every action in the manifest is registered', async () => {
  const manifest = JSON.parse(
    await (await import('node:fs/promises')).readFile(new URL('../plugin/manifest.json', import.meta.url), 'utf8')
  );
  const missing = manifest.Actions
    .map((action) => action.UUID)
    .filter((uuid) => !registry.has(uuid));
  assert.deepEqual(missing, [], 'the service answers for every action the deck can hold');
});

test('pan and tilt move one step in the right direction', async () => {
  // The expected values are the driver's, not the physical ones. On this camera a positive
  // pan moves the head LEFT while a positive tilt moves it UP - measured, see
  // PROJECT_CONTEXT.md section 49 - so the two rows below are not negatives of each other
  // by accident, they are the axis polarity doing its job.
  const cases = [
    [ACTION.PAN_LEFT, AXIS.PAN, 10],
    [ACTION.PAN_RIGHT, AXIS.PAN, -10],
    [ACTION.TILT_UP, AXIS.TILT, 10],
    [ACTION.TILT_DOWN, AXIS.TILT, -10],
  ];

  for (const [uuid, axis, delta] of cases) {
    const { ctx, bridge } = ctxFor(uuid);
    await findByUuid(uuid).onRun(ctx);
    assert.deepEqual(bridge.last('move'), { cmd: 'move', axis, delta }, `${uuid}`);
  }
});

test('a key and its encoder move the head the same way', async () => {
  // The invariant that the pan reversal was missing: the buttons and the encoders drive the
  // same axes, and there are two places that could each carry the polarity. Fixing one and
  // forgetting the other produces keys that disagree with dials, which is invisible until
  // both are used.
  // [button, rotation that must produce the same movement]
  const pairs = [
    [ACTION.PAN_LEFT, ACTION.PAN_ENCODER, 'left'],
    [ACTION.PAN_RIGHT, ACTION.PAN_ENCODER, 'right'],
    [ACTION.TILT_DOWN, ACTION.TILT_ENCODER, 'left'],
    [ACTION.TILT_UP, ACTION.TILT_ENCODER, 'right'],
    [ACTION.ZOOM_OUT, ACTION.ZOOM_ENCODER, 'left'],
    [ACTION.ZOOM_IN, ACTION.ZOOM_ENCODER, 'right'],
  ];

  for (const [buttonUuid, encoderUuid, direction] of pairs) {
    const key = ctxFor(buttonUuid, { stepSize: 5 });
    await findByUuid(buttonUuid).onRun(key.ctx);

    const dial = ctxFor(encoderUuid, { stepSize: 5 });
    encoder.onDialRotate(dial.ctx, { rotateEvent: direction });
    await settle();

    const fromKey = key.bridge.last('move');
    const fromDial = dial.bridge.last('move');
    assert.equal(fromKey.axis, fromDial.axis, `${buttonUuid} and ${encoderUuid} share an axis`);
    assert.equal(
      fromDial.delta,
      fromKey.delta,
      `${buttonUuid} moves like ${encoderUuid} rotated ${direction}`
    );
  }
});

test('zoom defaults to half the step of the other axes', async () => {
  // Zoom tops out at 150 while pan runs far wider, so the same request would walk straight
  // past the useful part of it. Measured on the camera, PROJECT_CONTEXT.md section 43.
  const { ctx, bridge } = ctxFor(ACTION.ZOOM_IN);
  await findByUuid(ACTION.ZOOM_IN).onRun(ctx);
  assert.equal(bridge.last('move').delta, 5);

  const pan = ctxFor(ACTION.PAN_RIGHT);
  await findByUuid(ACTION.PAN_RIGHT).onRun(pan.ctx);
  assert.equal(pan.bridge.last('move').delta, -10, 'pan moves right with a negative driver value');
});

test("a key's own step overrides the default", async () => {
  const { ctx, bridge } = ctxFor(ACTION.PAN_RIGHT, { stepSize: 45 });
  await findByUuid(ACTION.PAN_RIGHT).onRun(ctx);
  assert.equal(bridge.last('move').delta, -45, 'a step of 45 was driven on this camera, and Pan Right is negative');
});

test('center asks the head for its own defaults', async () => {
  // Not 0/0/100: the helper reads the defaults from the driver, so the plugin is not
  // assuming what they are on the day they change.
  const { ctx, bridge } = ctxFor(ACTION.CENTER);
  await findByUuid(ACTION.CENTER).onRun(ctx);
  assert.deepEqual(bridge.commands(), ['center']);
});

test('the three mode keys each ask for their own mode', async () => {
  const cases = [
    [ACTION.MODE_STANDARD, 'standard'],
    [ACTION.MODE_TRACKING, 'tracking'],
    [ACTION.MODE_PRIVACY, 'privacy'],
  ];

  for (const [uuid, mode] of cases) {
    const { ctx, bridge } = ctxFor(uuid);
    await findByUuid(uuid).onRun(ctx);
    assert.deepEqual(bridge.last('mode'), { cmd: 'mode', value: mode }, `${uuid}`);
  }
});

test('a short press on a position key recalls, and does not store', async () => {
  const action = findByUuid(ACTION.PRESET_3);
  const { ctx, bridge } = ctxFor(ACTION.PRESET_3, { longPressMs: 300 });

  action.onKeyDown(ctx);
  action.onKeyUp(ctx);
  await settle();

  assert.deepEqual(bridge.commands(), ['preset-load']);
  assert.equal(bridge.last('preset-load').name, 'preset3');
});

test('a press held past the threshold stores, and does not recall', async () => {
  const action = findByUuid(ACTION.PRESET_3);
  const { ctx, bridge } = ctxFor(ACTION.PRESET_3, { longPressMs: 300 });

  action.onKeyDown(ctx);
  await held();
  action.onKeyUp(ctx);
  await settle();

  assert.deepEqual(
    bridge.commands(),
    ['preset-save', 'preset-set-start'],
    'the head stored the position and pointed start at it'
  );
  assert.equal(bridge.last('preset-save').name, 'start');
});

test('a press just short of the threshold still recalls', async () => {
  const action = findByUuid(ACTION.PRESET_1);
  const { ctx, bridge } = ctxFor(ACTION.PRESET_1, { longPressMs: 300 });

  action.onKeyDown(ctx);
  await new Promise((resolve) => setTimeout(resolve, 120));
  action.onKeyUp(ctx);
  await settle();

  assert.deepEqual(bridge.commands(), ['preset-load'], 'a 120ms press was short');
});

test('the start key stores under the name the helper uses for it', async () => {
  const action = findByUuid(ACTION.START);
  const { ctx, bridge } = ctxFor(ACTION.START, { longPressMs: 300 });

  action.onKeyDown(ctx);
  await held();
  action.onKeyUp(ctx);

  assert.equal(bridge.last('preset-save').name, 'start');
});

test('a burst of notches is one movement of the total', async () => {
  // One event per notch, and a flick is several. Sending a command per notch made the head
  // walk through every intermediate position.
  const { ctx, bridge } = ctxFor(ACTION.PAN_ENCODER, { stepSize: 5 });

  for (let n = 0; n < 4; n += 1) encoder.onDialRotate(ctx, { rotateEvent: 'right' });
  await settle();

  assert.equal(bridge.commands().length, 1, 'four notches, one command');
  assert.deepEqual(bridge.last('move'), { cmd: 'move', axis: AXIS.PAN, delta: -20 });
});

test('a burst that turns both ways is the sum of the two', async () => {
  const { ctx, bridge } = ctxFor(ACTION.TILT_ENCODER, { stepSize: 5 });

  encoder.onDialRotate(ctx, { rotateEvent: 'right' });
  encoder.onDialRotate(ctx, { rotateEvent: 'right' });
  encoder.onDialRotate(ctx, { rotateEvent: 'left' });
  await settle();

  assert.equal(bridge.last('move').delta, 5, '10 out, 5 back');
});

test('a rotation with no direction moves nothing', async () => {
  const { ctx, bridge } = ctxFor(ACTION.PAN_ENCODER);
  encoder.onDialRotate(ctx, {});
  await settle();
  assert.deepEqual(bridge.commands(), []);
});

test('a removed key does not move the head on what it had queued', async () => {
  const { ctx, bridge, entry } = ctxFor(ACTION.PAN_ENCODER, { stepSize: 5 });

  encoder.onDialRotate(ctx, { rotateEvent: 'right' });
  encoder.forget(entry);
  await settle();

  assert.deepEqual(bridge.commands(), [], 'the notch was dropped with the key');
});

test('a press on a fixed encoder recentres, and does not change axis', async () => {
  const { ctx, bridge, entry } = ctxFor(ACTION.ZOOM_ENCODER);
  encoder.onDialPress(ctx);
  await settle();

  assert.deepEqual(bridge.commands(), ['center']);
  assert.equal(entry.axisIndex, 0, 'a fixed encoder has no axis to change');
});

test('a press on a cycling encoder changes axis without moving the head', async () => {
  const { ctx, bridge, entry } = ctxFor(ACTION.ENCODER);
  encoder.onDialPress(ctx);
  await settle();

  assert.deepEqual(bridge.commands(), [], 'the head stays where it is');
  assert.equal(entry.axisIndex, 1, 'and the knob now drives tilt');
});

test('notches turned before an axis change are not applied to the new one', async () => {
  // Keyed by axis as well as by key, so a press inside the coalescing window does not move
  // the head on the axis it just switched to.
  const { ctx, bridge } = ctxFor(ACTION.ENCODER, { stepSize: 5 });

  encoder.onDialRotate(ctx, { rotateEvent: 'right' });
  encoder.onDialPress(ctx);
  encoder.onDialRotate(ctx, { rotateEvent: 'right' });
  await settle();

  const moves = bridge.requests.filter((request) => request.cmd === 'move');
  assert.equal(moves.length, 2, 'one movement per axis, not one combined');
  assert.deepEqual(
    moves.map((move) => [move.axis, move.delta]).sort(),
    [[AXIS.PAN, -5], [AXIS.TILT, 5]].sort()
  );
});

test('a camera that refuses does not take the deck down', async () => {
  // The helper reports a driver failure as ok:false, which `Camera` turns into a rejection.
  // The action propagates it and app.js reports it: what must not happen is an unhandled
  // rejection, which would kill the service on the next bad frame.
  const { ctx } = ctxFor(ACTION.PAN_RIGHT, {}, { move: { ok: false, error: 'driver refused' } });

  await assert.rejects(findByUuid(ACTION.PAN_RIGHT).onRun(ctx), /driver refused/);
});

test('a helper that cannot be reached does not take the deck down', async () => {
  const { ctx } = ctxFor(ACTION.PAN_RIGHT, {}, { move: new Error('bridge timed out') });
  await assert.rejects(findByUuid(ACTION.PAN_RIGHT).onRun(ctx), /bridge timed out/);
});

test('the settings defaults follow the axis, not the module', async () => {
  assert.equal(defaultsFor(ACTION.PAN_LEFT).stepSize, 10);
  assert.equal(defaultsFor(ACTION.ZOOM_IN).stepSize, 5);
  assert.equal(defaultsFor(ACTION.CENTER).stepSize, undefined);
});

test('an action the plugin does not know resolves to nothing', async () => {
  // A host frame can name an action from an older or a newer build. It must not create
  // state and must not send anything back.
  assert.equal(findByUuid('com.ulanzi.ulanzideck.pixy.nope'), null);
  assert.deepEqual(defaultsFor('com.ulanzi.ulanzideck.pixy.nope'), {});
});

test.after(() => encoder.reset());