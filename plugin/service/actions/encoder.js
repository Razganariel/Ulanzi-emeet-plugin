/**
 * The PTZ encoders.
 *
 * Two kinds share this module because they share a dial. `encoder` cycles through pan,
 * tilt and zoom and a press changes axis; `panencoder`, `tiltencoder` and `zoomencoder`
 * are bound to one axis each and a press recentres. Both are the only actions on the deck
 * that draw anything: a knob has no key to carry the axis, so the axis is what tells the
 * user what the next turn is about to move.
 *
 * Rotations are coalesced. The host reports one event per notch and a flick is several
 * notches, so a burst used to become one camera command per notch and the head walked
 * through every intermediate position. Summing the deltas over a short window turns a
 * flick into a single movement of the total, which is what the D200X physically means.
 */

import {
  AXIS,
  ACTION,
  DEFAULT_ENCODER_STEP,
  ENCODER_ICONS,
  ENCODER_FLUSH_MS,
  PAN_DIRECTION,
} from '../core/constants.js';
import { advanceAxis, axisFor, currentAxis, rotateSteps } from '../core/dial.js';
import { driverPolarity, stepSize } from '../core/params.js';
import { setEncoderAxis } from '../core/ui.js';

/** action uuid -> the axis it is bound to; absent means the key cycles. */
const FIXED_AXIS = Object.freeze({
  [ACTION.PAN_ENCODER]: AXIS.PAN,
  [ACTION.TILT_ENCODER]: AXIS.TILT,
  [ACTION.ZOOM_ENCODER]: AXIS.ZOOM,
});

export const uuids = [ACTION.ENCODER, ACTION.PAN_ENCODER, ACTION.TILT_ENCODER, ACTION.ZOOM_ENCODER];

/**
 * Defaults per action, because the encoders do not all have the same settings.
 *
 * The pan direction belongs to the cycling encoder too: it moves pan whenever the knob is
 * on that axis, and a knob that ignores a preference the pan keys honour is a knob that
 * disagrees with them. It is offered on the cycling encoder's own panel for the same
 * reason.
 *
 * @param {string} uuid
 * @returns {object}
 */
export function defaultsFor(uuid) {
  const defaults = { stepSize: DEFAULT_ENCODER_STEP };
  if (uuid === ACTION.ENCODER || uuid === ACTION.PAN_ENCODER) {
    defaults.panDirection = PAN_DIRECTION.NORMAL;
  }
  return defaults;
}

/** The axis this action drives on its own, or null when it cycles. */
export function fixedAxisFor(uuid) {
  return FIXED_AXIS[uuid] ?? null;
}

/**
 * entry -> axis -> { delta, ctx } waiting to be sent.
 *
 * The context is kept with the movement rather than looked up later, because the camera
 * handle and the step belong to the key the notch was turned on. Keyed by axis as well as
 * by key: a press changes the axis mid-burst, and the notches before it belong to the axis
 * they were turned for.
 */
const pending = new Map();
let flushTimer = null;

/** Draws the axis a dial is currently on. */
export function render(ctx) {
  const axis = axisFor(fixedAxisFor(ctx.uuid), ctx.entry);
  setEncoderAxis(ctx.$UD, ctx.context, axis, ENCODER_ICONS[axis]);
}

/** One notch, remembered rather than sent. */
export function onDialRotate(ctx, message) {
  // A rotation with no direction is not a rotation. The host always sends one, and
  // guessing "left" for the rest would move the head on events that mean nothing.
  const direction = rotateSteps(message);
  if (direction === 0) return;

  const axis = axisFor(fixedAxisFor(ctx.uuid), ctx.entry);
  const step = stepSize(ctx.settings.stepSize, DEFAULT_ENCODER_STEP);
  // The rotation becomes a driver value through the same helper the move buttons use, so
  // turning a dial right moves the head the way the matching key would - and the pan
  // direction the user chose applies to the pan dial exactly as it does to the pan keys.
  const delta = direction * driverPolarity(axis, ctx.settings) * step;

  let slots = pending.get(ctx.entry);
  if (!slots) {
    slots = new Map();
    pending.set(ctx.entry, slots);
  }
  const slot = slots.get(axis) || { delta: 0, ctx };
  slot.delta += delta;
  slots.set(axis, slot);

  if (!flushTimer) {
    flushTimer = setTimeout(flush, ENCODER_FLUSH_MS);
    // The flush must not be the reason the host stays alive on its way out.
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
  }
}

/** Sends one movement per key and axis that were turned during the window. */
async function flush() {
  flushTimer = null;
  const batch = [...pending.values()];
  pending.clear();

  for (const slots of batch) {
    // The axis is the slot's own key, not something to recompute here: the key's axis may
    // have changed while the window was open, and a notch belongs to the axis it was
    // turned for.
    for (const [axis, { delta, ctx }] of slots) {
      try {
        await ctx.camera.move(axis, delta);
      } catch (error) {
        ctx.report(error);
      }
    }
  }
}

/** A press: recentre on a fixed encoder, change axis on a cycling one. */
export function onDialPress(ctx) {
  if (fixedAxisFor(ctx.uuid)) {
    return ctx.camera.center().catch((error) => ctx.report(error));
  }
  advanceAxis(ctx.entry);
  render(ctx);
  return undefined;
}

/**
 * Drops everything a removed key had queued.
 *
 * Called on the key being cleared and on it being re-added, so a movement can never
 * outlive the key that asked for it.
 *
 * @param {object} entry
 */
export function forget(entry) {
  pending.delete(entry);
}

/** Empties the coalescing window. Used on shutdown and by tests. */
export function reset() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pending.clear();
}

export { currentAxis };