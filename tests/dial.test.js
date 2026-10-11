/**
 * What a dial event means.
 *
 * The rotation handler and the press handler have to agree about which axis a key is on.
 * They did not: rotation read the key's remembered axis while a press had nothing to read,
 * and the two disagreed whenever that axis was not yet established. The helpers that resolve
 * it are pinned here, together with the rule that a removed key stops moving the head.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AXIS } from '../plugin/service/core/constants.js';
import { advanceAxis, axisFor, currentAxis, rotateSteps } from '../plugin/service/core/dial.js';
import { createStore, ensureEntry, forget, mergeSettings } from '../plugin/service/core/context.js';

test('a rotation is a direction', () => {
  assert.equal(rotateSteps({ rotateEvent: 'left' }), -1);
  assert.equal(rotateSteps({ rotateEvent: 'right' }), 1);
});

test('a held rotation is still a rotation', () => {
  // The host reports a sustained turn as hold-*. Treating it as a press would recentre the
  // head on every notch of a long turn.
  assert.equal(rotateSteps({ rotateEvent: 'hold-left' }), -1);
  assert.equal(rotateSteps({ rotateEvent: 'hold-right' }), 1);
});

test('an event with no direction is not a rotation', () => {
  // The host always sends one. Guessing "left" for the rest would move the head on events
  // that mean nothing.
  assert.equal(rotateSteps({}), 0);
  assert.equal(rotateSteps({ rotateEvent: 'press' }), 0);
  assert.equal(rotateSteps(undefined), 0);
});

test('a cycling encoder starts on pan and walks the axes in order', () => {
  const entry = ensureEntry(createStore(), 'ctx', 'x');
  assert.equal(currentAxis(entry), AXIS.PAN);
  assert.equal(advanceAxis(entry), AXIS.TILT);
  assert.equal(advanceAxis(entry), AXIS.ZOOM);
  assert.equal(advanceAxis(entry), AXIS.PAN, 'and wraps round to pan');
});

test('each key keeps its own axis', () => {
  // Two encoders on the deck can sit on different axes; the axis belongs to the key, not
  // to the plugin.
  const store = createStore();
  const left = ensureEntry(store, 'left', 'x');
  const right = ensureEntry(store, 'right', 'x');

  advanceAxis(left);
  advanceAxis(left);

  assert.equal(currentAxis(left), AXIS.ZOOM);
  assert.equal(currentAxis(right), AXIS.PAN);
});

test('a fixed encoder ignores the remembered axis', () => {
  const entry = ensureEntry(createStore(), 'ctx', 'x');
  advanceAxis(entry);

  assert.equal(axisFor(AXIS.TILT, entry), AXIS.TILT, 'the action decides, not the key');
  assert.equal(axisFor(null, entry), AXIS.TILT, 'a cycling one still reads the key');
});

test('settings accumulate instead of replacing what a panel did not mention', () => {
  // The host answers one panel at a time and each carries only its own fields. Rebuilding
  // the object from the defaults is what made saving a step put the long press back.
  const store = createStore();
  const entry = ensureEntry(store, 'ctx', 'x');

  mergeSettings(entry, { stepSize: 10, longPressMs: 900 });
  mergeSettings(entry, { longPressMs: 1200 });

  assert.equal(entry.settings.stepSize, 10, 'the field the second message left out survived');
  assert.equal(entry.settings.longPressMs, 1200);
});

test('the same key for a different action starts over', () => {
  const store = createStore();
  const first = ensureEntry(store, 'ctx', 'com.ulanzi.ulanzideck.pixy.panleft');
  mergeSettings(first, { stepSize: 30 });

  const second = ensureEntry(store, 'ctx', 'com.ulanzi.ulanzideck.pixy.zoomout');
  assert.notEqual(first, second);
  assert.deepEqual(second.settings, {}, 'no settings carried over to a different action');
});

test('a removed key takes its entry with it', () => {
  const store = createStore();
  const entry = ensureEntry(store, 'ctx', 'x');
  mergeSettings(entry, { stepSize: 10 });

  assert.equal(forget(store, 'ctx'), true);
  assert.equal(store.size, 0, 'nothing is left for a later event to write into');
  assert.equal(forget(store, 'ctx'), false, 'forgetting it twice is not an error');
});

test('a removed key cancels the store it had armed', () => {
  // Otherwise the timer outlives the key and overwrites a preset nobody can see any more.
  const store = createStore();
  const entry = ensureEntry(store, 'ctx', 'x');

  let fired = false;
  entry.longPressTimer = setTimeout(() => { fired = true; }, 5);

  forget(store, 'ctx');
  return new Promise((resolve) => setTimeout(resolve, 25)).then(() => {
    assert.equal(fired, false, 'the store never ran');
  });
});

test('a context with missing fields does not become the string "undefined"', () => {
  const entry = ensureEntry(createStore(), `${'uuid'}___undefined___undefined`);
  assert.equal(entry.uuid, 'uuid');
});