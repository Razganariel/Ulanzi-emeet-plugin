/**
 * The camera, as the actions see it.
 *
 * Every command the plugin can issue is named here once, so an action never names a
 * camera wire command and never has to know what a failed answer looks like. A `Camera`
 * turns `{ ok: false, error }` from the helper into a thrown Error and a logged line:
 * those two things are what the actions cannot be trusted to do themselves, because
 * missing them is silent - the head simply does not move and nothing says why.
 */

import { getBridge } from './bridge.js';

export class Camera {
  /**
   * @param {object} options
   * @param {import('./bridge.js').PixyBridge} options.bridge
   * @param {(msg: string, level?: string) => void} [options.log]
   */
  constructor({ bridge, log = () => {} }) {
    this.bridge = bridge;
    this.log = log;
  }

  /**
   * One command, one answer.
   *
   * @param {string} label  what to say in the log when it fails
   * @param {object} payload
   * @returns {Promise<object>} the answer, with `ok` true
   * @throws {Error} when the helper is unreachable, times out, or reports a failure
   */
  async send(label, payload) {
    let answer;
    try {
      answer = await this.bridge.request(payload);
    } catch (error) {
      this.log(`${label} failed: ${error.message}`, 'error');
      throw error;
    }
    if (!answer || answer.ok !== true) {
      const reason = (answer && answer.error) || 'no reason given';
      this.log(`${label} failed: ${reason}`, 'error');
      throw new Error(reason);
    }
    return answer;
  }

  /**
   * Moves one axis by a signed amount.
   *
   * The delta is the request, not a promise: the helper clamps it to the range the head
   * reports, so a step larger than what is left does nothing rather than overshooting.
   */
  move(axis, delta) {
    return this.send(`move ${axis}`, { cmd: 'move', axis, delta });
  }

  /** Back to the head's own defaults: pan 0, tilt 0, zoom 100. */
  center() {
    return this.send('center', { cmd: 'center' });
  }

  /** Stores where the head is now under a name. */
  presetSave(name) {
    return this.send(`preset-save ${name}`, { cmd: 'preset-save', name });
  }

  /** Moves the head back to a stored name. */
  presetLoad(name) {
    return this.send(`preset-load ${name}`, { cmd: 'preset-load', name });
  }

  /** Names the preset to be restored at every start of the bridge. */
  presetSetStart(name) {
    return this.send(`preset-set-start ${name}`, { cmd: 'preset-set-start', name });
  }

  /**
   * Picks a camera mode over the proprietary HID channel.
   *
   * This is not a UVC control: standard, tracking and privacy are the vendor's own
   * commands, delegated by the helper to PixyHidProbe.exe. Success here means the write
   * was accepted, which is all the hardware reports - see PROJECT_CONTEXT.md section 35,
   * where the readback turned out not to be an echo of the write.
   */
  mode(value) {
    return this.send(`mode ${value}`, { cmd: 'mode', value });
  }

  /**
   * Makes the current position the one restored at start.
   *
   * Two commands rather than one, and the order is the point: the position has to be
   * stored before it can be pointed at, and pointing at a name that does not exist yet
   * would leave the bridge with no start position and silently keep the old one.
   */
  async setStartFromCurrent() {
    await this.presetSave('start');
    await this.presetSetStart('start');
    this.log('start position saved', 'info');
  }
}

/**
 * The camera the service uses.
 *
 * @param {(msg: string, level?: string) => void} [log]
 * @returns {Camera}
 */
export function getCamera(log) {
  return new Camera({ bridge: getBridge(log), log });
}