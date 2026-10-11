/**
 * The three camera modes: standard, tracking, privacy.
 *
 * These are not UVC controls. Each is the vendor's own command, sent over the PIXY's
 * proprietary HID channel, which the helper delegates to PixyHidProbe.exe. Nothing about
 * them is reachable through IAMCameraControl, which is why they live here rather than
 * being folded into the pan/tilt/zoom actions.
 *
 * Success means the write was accepted and nothing more. The readback of that HID group
 * is not an echo of the write - see PROJECT_CONTEXT.md section 35, where a mode reported
 * "not privacy" immediately after privacy had been set - so there is nothing to compare
 * the answer against and no state worth keeping per key.
 */

import { ACTION } from '../core/constants.js';

/** action uuid -> mode name understood by the helper. */
const MODE_BY_UUID = Object.freeze({
  [ACTION.MODE_STANDARD]: 'standard',
  [ACTION.MODE_TRACKING]: 'tracking',
  [ACTION.MODE_PRIVACY]: 'privacy',
});

export const uuids = Object.keys(MODE_BY_UUID);

export const defaults = {};

export function render() {}

/** One press, one mode. */
export async function onRun(ctx) {
  const mode = MODE_BY_UUID[ctx.uuid];
  if (!mode) return;
  await ctx.camera.mode(mode);
}