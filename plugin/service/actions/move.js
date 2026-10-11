/**
 * Pan, tilt and zoom, one direction per key.
 *
 * Six actions that differ only in an axis and a direction, so they share one module and one
 * implementation: a per-file split would put the same six lines in six places and give
 * them six chances to drift.
 *
 * The direction here is the physical one - left, right, up, down, in, out - and it is
 * converted to the driver's sign on the way out. That conversion is shared with the
 * encoders, which is what keeps a key and its dial moving the same way.
 *
 * The step is the key's own setting, in UVC units, and it is a request rather than a
 * promise - the helper clamps it to the range the head reports, so pressing a key at the
 * limit does nothing instead of wrapping to the other end.
 */

import { AXIS, ACTION, DEFAULT_MOVE_STEP, DEFAULT_ZOOM_STEP, PAN_DIRECTION } from '../core/constants.js';
import { driverPolarity, stepSize } from '../core/params.js';

/** action uuid -> [axis, physical direction] */
const MOVE_BY_UUID = Object.freeze({
  [ACTION.PAN_LEFT]: [AXIS.PAN, -1],
  [ACTION.PAN_RIGHT]: [AXIS.PAN, 1],
  [ACTION.TILT_UP]: [AXIS.TILT, 1],
  [ACTION.TILT_DOWN]: [AXIS.TILT, -1],
  [ACTION.ZOOM_IN]: [AXIS.ZOOM, 1],
  [ACTION.ZOOM_OUT]: [AXIS.ZOOM, -1],
});

export const uuids = Object.keys(MOVE_BY_UUID);

/** Zoom's default is half of pan's, because its usable range is narrower. */
export function defaultsFor(uuid) {
  const [axis] = MOVE_BY_UUID[uuid] || [];
  const defaults = { stepSize: axis === AXIS.ZOOM ? DEFAULT_ZOOM_STEP : DEFAULT_MOVE_STEP };
  // Pan is the one axis whose direction the user gets to choose, so its default is seeded
  // like any other setting: the panel shows it, and a key that has never been touched still
  // moves the way the panel says it does.
  if (axis === AXIS.PAN) defaults.panDirection = PAN_DIRECTION.NORMAL;
  return defaults;
}

/** One press, one movement. */
export async function onRun(ctx) {
  const move = MOVE_BY_UUID[ctx.uuid];
  if (!move) return;
  const [axis, direction] = move;
  const step = stepSize(ctx.settings.stepSize, defaultsFor(ctx.uuid).stepSize);
  await ctx.camera.move(axis, direction * driverPolarity(axis, ctx.settings) * step);
}

/** Nothing to draw: the icon is the direction, and the host owns the key. */
export function render() {}