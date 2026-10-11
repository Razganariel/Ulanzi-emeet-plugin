/**
 * Reading the settings the host sends back.
 *
 * The panels only ever offer the values in constants.js, but a settings payload is just
 * JSON over a socket: it can be a stale build, a hand-edited profile, or a value that never
 * went through a panel at all. Getting that wrong is silent - a key moves by the wrong
 * amount - so the rules are pinned here rather than trusted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, longPressMs, stepSize } from '../plugin/service/core/params.js';
import { DEFAULT_STEP_SIZE, LONG_PRESS_MS, MAX_STEP_SIZE } from '../plugin/service/core/constants.js';

test('a step arrives as a string as often as a number', () => {
  assert.equal(stepSize('5'), 5);
  assert.equal(stepSize(5), 5);
});

test('a blank step keeps the default rather than becoming zero', () => {
  // `Number('')` is 0, and a step of 0 is a key that never moves the head.
  assert.equal(stepSize(''), DEFAULT_STEP_SIZE);
  assert.equal(stepSize('   '), DEFAULT_STEP_SIZE);
  assert.equal(stepSize(undefined), DEFAULT_STEP_SIZE);
  assert.equal(stepSize(null), DEFAULT_STEP_SIZE);
});

test('a step that is not a number keeps the default', () => {
  assert.equal(stepSize('abc'), DEFAULT_STEP_SIZE);
  assert.equal(stepSize(NaN), DEFAULT_STEP_SIZE);
  assert.equal(stepSize({}), DEFAULT_STEP_SIZE);
});

test('a step of zero or less is refused, not clamped', () => {
  // Clamping 0 to 1 would hide the setting that is actually wrong.
  assert.equal(stepSize(0), DEFAULT_STEP_SIZE);
  assert.equal(stepSize(-10), DEFAULT_STEP_SIZE);
});

test('a step beyond what the panels offer is still honoured', () => {
  // A step of 45 has been driven on the real camera (PROJECT_CONTEXT.md section 43), and a
  // value restored from an older profile is not the plugin's to refuse. Only an absurd one
  // is bounded.
  assert.equal(stepSize(45), 45);
  assert.equal(stepSize(9999), MAX_STEP_SIZE);
});

test('a fractional step is rounded rather than refused', () => {
  assert.equal(stepSize(2.6), 3);
});

test('an absent step falls back to the one the caller named', () => {
  // Zoom's default is half of pan's, and the caller is the only one that knows which.
  assert.equal(stepSize(undefined, 5), 5);
  assert.equal(stepSize('nope', 5), 5);
});

test('the long press threshold is held inside what the panel offers', () => {
  assert.equal(longPressMs(500), 500);
  assert.equal(longPressMs('750'), 750);
});

test('an out of range threshold is pulled back to the nearest offered value', () => {
  // A threshold of 50ms is not nonsense the user needs protecting from, it is one they can
  // see and change, and the nearest offered value reads closer to it than the default.
  assert.equal(longPressMs(10), LONG_PRESS_MS.MIN);
  assert.equal(longPressMs(99999), LONG_PRESS_MS.MAX);
});

test('an unusable threshold keeps the default', () => {
  assert.equal(longPressMs(''), LONG_PRESS_MS.DEFAULT);
  assert.equal(longPressMs('later'), LONG_PRESS_MS.DEFAULT);
});

test('clamp keeps a value inside its range', () => {
  assert.equal(clamp(5, 0, 10, 1), 5);
  assert.equal(clamp(-5, 0, 10, 1), 0);
  assert.equal(clamp(50, 0, 10, 1), 10);
  assert.equal(clamp('x', 0, 10, 1), 1);
});