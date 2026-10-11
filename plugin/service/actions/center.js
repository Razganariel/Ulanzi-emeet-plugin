/**
 * Center.
 *
 * Not "move to zero": it is the head's own defaults, which the helper reads from the
 * driver, so it also puts zoom back to its resting value. A plugin that sent 0/0/100
 * itself would be assuming what those defaults are and would be wrong the day they change.
 */

import { ACTION } from '../core/constants.js';

export const uuid = ACTION.CENTER;

export const defaults = {};

/** One press, one recentring. */
export async function onRun(ctx) {
  await ctx.camera.center();
}

export function render() {}