/**
 * Positions: the start position and the five presets.
 *
 * A short press recalls, a long press stores. The threshold is the key's own setting, so
 * the same key can be quick for a preset used ten times a minute and slow for one the user
 * has to aim first.
 *
 * The timer is started on the way down and settled on the way up, which is the only way to
 * tell the two apart: the host sends no long-press event, only a press and a release. That
 * makes the key's entry the place the timer lives - see core/context.js.
 *
 * Presets are stored by the helper, in a JSON file under the user's profile, not by the
 * host. See PROJECT_CONTEXT.md section 34: the PIXY exposes no preset storage of its own
 * over UVC, and the native presets on the HID channel were not what a preset key is for.
 */

import { ACTION, LONG_PRESS_MS, PLUGIN_UUID, PRESET_COUNT } from '../core/constants.js';
import { cancelLongPress, isLongPressPending, startLongPress } from '../core/context.js';
import { longPressMs } from '../core/params.js';

/**
 * The preset name an action refers to.
 *
 * @param {string} uuid
 * @returns {string|null} 'start', 'preset1'..'preset5', or null for any other action
 */
export function nameOf(uuid) {
  if (uuid === ACTION.START) return 'start';
  const match = String(uuid).match(/\.preset([1-9])$/);
  return match ? `preset${match[1]}` : null;
}

export const uuids = [
  ACTION.START,
  ...Array.from({ length: PRESET_COUNT }, (_, i) => `${PLUGIN_UUID}.preset${i + 1}`),
];

export const defaults = { longPressMs: LONG_PRESS_MS.DEFAULT };

export function render() {}

/** The key is going down: arm the store. */
export function onKeyDown(ctx) {
  const threshold = longPressMs(ctx.settings.longPressMs);
  startLongPress(ctx.entry, threshold, () => {
    // Runs only if the key is still held when the threshold elapses. Storing is the same
    // action for every position key, including Start: the start position is the preset
    // called "start", and pointing at it is what the helper does for it.
    ctx.camera.setStartFromCurrent().catch((error) => ctx.report(error));
  });
}

/** The key is coming up: settle on whichever of the two the press turned out to be. */
export async function onKeyUp(ctx) {
  // No pending timer means the threshold already elapsed and the store has run. Cancelling
  // first is what keeps a short press from also storing: without it the timer outlives the
  // release and overwrites the preset it was just asked to recall.
  if (!isLongPressPending(ctx.entry)) return;
  cancelLongPress(ctx.entry);

  const name = nameOf(ctx.uuid);
  if (!name) return;
  try {
    await ctx.camera.presetLoad(name);
  } catch (error) {
    ctx.report(error);
  }
}