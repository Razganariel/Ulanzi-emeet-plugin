/**
 * Dial helpers.
 *
 * A dial answers two host events: a rotation, reported as
 * `rotateEvent = 'left' | 'right' | 'hold-left' | 'hold-right'`, and a press, which the
 * host sends as its own event with no direction at all. Which of those means what depends
 * on the action: on a cycling encoder a press changes axis, on one bound to a single axis
 * it recentres, and on a move key there is no dial at all.
 *
 * The axis is resolved here rather than in each action because the rotation handler and
 * the press handler have to agree about it. They used not to: rotation read the key's
 * remembered axis while a press had nothing to read, and the two disagreed whenever the
 * remembered axis was not yet established.
 */

import { AXES } from './constants.js';

/**
 * A rotation as -1 or +1, or 0 for an event that is not a rotation.
 *
 * The hold-* variants count as rotations rather than as a press: they are the host
 * reporting a sustained turn, and treating them as a press would recentre the head on
 * every notch of a long turn.
 *
 * @returns {number}
 */
export function rotateSteps(message) {
  const event = message?.rotateEvent;
  if (event === 'left' || event === 'hold-left') return -1;
  if (event === 'right' || event === 'hold-right') return 1;
  return 0;
}

/**
 * Which axis a dial action drives.
 *
 * The fixed-axis encoders answer this from their own identity and never change it; only
 * the cycling encoder reads the key's remembered axis, and a press on one advances it.
 *
 * @param {string|null} fixed  the axis an action is bound to, or null to cycle
 * @param {object} entry       the key's entry, for the cycling case
 * @returns {string}
 */
export function axisFor(fixed, entry) {
  return fixed || currentAxis(entry);
}

/** The axis a cycling encoder is on, without advancing it. */
export function currentAxis(entry) {
  return AXES[entry?.axisIndex] ?? AXES[0];
}

/**
 * Advances a cycling encoder to its next axis and returns the new one.
 *
 * The axis belongs to the key, not to the plugin: two encoders on the deck can sit on
 * different axes, and each has to remember where it was left. Wrapping on the axis list
 * is what makes a press at the end come back to pan.
 */
export function advanceAxis(entry) {
  entry.axisIndex = (entry.axisIndex + 1) % AXES.length;
  return currentAxis(entry);
}