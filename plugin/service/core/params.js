/**
 * Parameter helpers shared by every action.
 *
 * The host hands settings back as strings sometimes and numbers other times, depending
 * on how they were typed in the property inspector, so every read goes through here.
 * A settings payload is just JSON over a socket though, so it can also be a stale build,
 * a hand-edited profile, or a value that never went through a panel at all.
 */

import {
  AXIS,
  AXIS_POLARITY,
  DEFAULT_STEP_SIZE,
  LONG_PRESS_MS,
  MAX_STEP_SIZE,
  PAN_DIRECTION,
} from './constants.js';

/**
 * The sign an axis value has to carry for the head to move the way the user asked.
 *
 * This is the single place an axis becomes a driver value, and it exists because two sites
 * drive axes - the keys and the dials. When the polarity was applied in both by hand, the
 * fix for a measured sign was made in one and forgotten in the other, and the symptom was
 * keys that contradicted dials: invisible until both were used. Anything that turns a
 * physical direction into a driver value belongs here, once.
 *
 * The user's own choice is applied on top, and only for pan: the camera's sign is a fact
 * about the camera, the preference is a fact about the person holding the key.
 *
 * @param {string} axis      one of AXIS
 * @param {object} settings  the key's settings
 * @returns {number} +1 or -1
 */
export function driverPolarity(axis, settings) {
  const base = AXIS_POLARITY[axis] ?? 1;
  if (axis !== AXIS.PAN) return base;
  return settings?.panDirection === PAN_DIRECTION.INVERTED ? -base : base;
}

/** Integer clamped into [min, max], falling back when absent or unparseable. */
export function clamp(value, min, max, fallback) {
  // `Number('')` is 0 and `Number('  ')` too, so a field the user emptied would
  // silently become 0 instead of keeping its default. Blank is not a number.
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Reads a movement step from a setting.
 *
 * Anything unusable - absent, blank, zero, negative, unparseable - falls back rather than
 * clamping: a stored 0 is not a request for a very small step, it is a key that would never
 * move the head, and quietly turning it into 1 hides the setting that caused it.
 *
 * @param {*} value
 * @param {number} fallback
 * @returns {number} an integer in [1, MAX_STEP_SIZE]
 */
export function stepSize(value, fallback = DEFAULT_STEP_SIZE) {
  const blank = value === undefined || value === null || String(value).trim() === '';
  const n = blank ? NaN : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const step = Math.round(n);
  return step >= 1 ? Math.min(step, MAX_STEP_SIZE) : fallback;
}

/**
 * Reads the long-press threshold, clamped to the bounds the panel offers.
 *
 * Out-of-range values clamp rather than fall back: a threshold of 50ms is not nonsense the
 * user needs protecting from, it is a threshold they can see and change, and 300ms is a
 * closer reading of what they asked for than the 500ms default.
 */
export function longPressMs(value) {
  return clamp(value, LONG_PRESS_MS.MIN, LONG_PRESS_MS.MAX, LONG_PRESS_MS.DEFAULT);
}