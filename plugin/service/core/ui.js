/**
 * Host UI helpers.
 *
 * The encoder display commands (setFeedbackLayout / setFeedback) need UlanziStudio 3.3.0+
 * and are the only thing this plugin asks the host to draw: every action keeps a single
 * state whose image never changes, so there is nothing to repaint per key. On a dial the
 * knob shows which axis it will move.
 *
 * Each call is guarded on its own. A host that does not know a command throws inside the
 * SDK, and an unguarded throw from a display call would take the event handler that
 * issued it - which is also the handler that was about to move the camera.
 */

/** Contexts whose encoder layout has already been applied. */
const layoutsApplied = new Set();

/**
 * Draws the axis on a knob.
 *
 * The layout is sent once per key, not on every repaint. Changing the layout is what
 * makes the host rebuild the key, and until the feedback that follows arrives it has
 * nothing to draw but the name of the state, so a dial flashed its state name for a frame
 * each time anything else on the deck was touched.
 *
 * @param {object} $UD
 * @param {string} context
 * @param {string} axis
 * @param {string} icon  path to the axis icon, from the manifest's Images/ convention
 */
export function setEncoderAxis($UD, context, axis, icon) {
  try {
    if (!layoutsApplied.has(context)) {
      $UD.setFeedbackLayout(context, '$UA1');
      layoutsApplied.add(context);
    }
    $UD.setFeedback(context, { icon, title: axis.toUpperCase() });
  } catch {
    /* host without V3.1 display support */
  }
}

/**
 * Forgets the layout of a key, so the next readout applies it again.
 *
 * Called when a key is added or removed: the host rebuilds the key either way, and a
 * layout applied to the previous instance is not necessarily applied to the new one.
 *
 * @param {string} context
 */
export function forgetEncoderLayout(context) {
  layoutsApplied.delete(context);
}