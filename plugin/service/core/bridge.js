/**
 * The bridge to the camera.
 *
 * The plugin cannot drive a UVC camera from Node: pan, tilt and zoom are reached through
 * DirectShow's IAMCameraControl, which has no JavaScript binding. `PixyController.exe`
 * exists for that reason and nothing else. The service starts it once and keeps it for
 * the whole session - launching a process per dial notch would add tens of milliseconds
 * to every step and would fight the head for the camera handle each time.
 *
 * The transport is one request line in, one response line out, in order, and nothing on a
 * line says which request it answers. That makes the pairing the fragile part: get it
 * wrong and one slow answer takes every answer after it down with it, with nothing for
 * the user to see. Three things protect it here:
 *
 *  - requests are serialised, so at most one is ever outstanding;
 *  - each one carries a deadline, because a driver that stops answering produces silence
 *    rather than an error, and silence would otherwise wedge the deck for the session;
 *  - a timeout or a dead process tears the bridge down rather than trying to resynchronise
 *    a stream that has lost its place.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import { BRIDGE_QUIT_GRACE_MS, BRIDGE_TIMEOUT_MS } from './constants.js';

/**
 * Where `npm run native` puts the helper.
 *
 * Overridable because the path differs between the built plugin and a test run, and
 * because pointing it at a missing file is the cheapest way to exercise the
 * "no camera helper" path without uninstalling anything.
 */
export function controllerPath() {
  return process.env.PIXY_CONTROLLER_PATH
    || path.join(import.meta.dirname, '..', '..', 'native', 'PixyController.exe');
}

export class PixyBridge {
  /**
   * @param {object} options
   * @param {string} options.executable  path to PixyController.exe
   * @param {string[]} [options.args]    arguments, `serve` selects the line protocol
   * @param {Function} [options.spawn]   child_process.spawn, injectable for tests
   * @param {number} [options.timeoutMs] per-request deadline
   * @param {number} [options.quitGraceMs]  how long a quit is given before the kill
   * @param {(msg: string, level?: string) => void} [options.log]
   */
  constructor({
    executable,
    args = ['serve'],
    spawn = nodeSpawn,
    timeoutMs = BRIDGE_TIMEOUT_MS,
    quitGraceMs = BRIDGE_QUIT_GRACE_MS,
    log = () => {},
  }) {
    this.executable = executable;
    this.args = args;
    this.spawn = spawn;
    this.timeoutMs = timeoutMs;
    this.quitGraceMs = quitGraceMs;
    this.log = log;

    this.child = null;
    this.buffer = '';
    this.queue = [];
    this.inFlight = null;
    this.quitTimer = null;
    this.closed = false;
  }

  /** True while a helper process is running. */
  get running() {
    return Boolean(this.child) && this.child.exitCode === null;
  }

  /**
   * Sends one command and resolves with the camera's answer.
   *
   * @param {object} payload e.g. `{ cmd: 'move', axis: 'pan', delta: 10 }`
   * @returns {Promise<object>} the parsed response
   */
  request(payload) {
    if (this.closed) return Promise.reject(new Error('bridge is closed'));
    return new Promise((resolve, reject) => {
      this.queue.push({ line: JSON.stringify(payload), resolve, reject });
      this.drain();
    });
  }

  /** Starts the helper if it is not already up. */
  start() {
    if (this.running) return this.child;

    this.child = this.spawn(this.executable, this.args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.buffer = '';

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.onData(chunk));

    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) this.log(`PixyController stderr: ${text}`, 'warn');
    });

    this.child.on('exit', (code, signal) => {
      this.log(`PixyController exited (code=${code} signal=${signal})`, 'warn');
      this.failAll(new Error('camera bridge exited'));
    });

    this.child.on('error', (error) => {
      this.log(`PixyController could not start: ${error.message}`, 'error');
      this.failAll(new Error(`camera bridge could not start: ${error.message}`));
    });

    return this.child;
  }

  /** Sends the next queued request, if nothing is already outstanding. */
  drain() {
    if (this.inFlight || this.queue.length === 0 || this.closed) return;

    let child;
    try {
      child = this.start();
    } catch (error) {
      this.failAll(error);
      return;
    }

    if (!this.running) {
      // `start()` produced no usable process. The 'error' handler above reports it, and
      // this keeps the queue from being held open on a child that will never answer.
      this.failAll(new Error('camera bridge is not running'));
      return;
    }

    const entry = this.queue.shift();
    this.inFlight = entry;
    entry.timer = setTimeout(() => {
      if (this.inFlight !== entry) return;
      this.inFlight = null;
      entry.reject(new Error(`camera bridge timed out after ${this.timeoutMs}ms`));
      // The answer to that request may still be sitting in the pipe. Reusing the stream
      // would hand it to whichever request goes next, so the helper is replaced instead.
      this.restart();
    }, this.timeoutMs);

    try {
      child.stdin.write(`${entry.line}\n`);
    } catch (error) {
      this.settleInFlight(entry, () => entry.reject(new Error(`camera bridge write failed: ${error.message}`)));
    }
  }

  onData(chunk) {
    this.buffer += chunk;
    let at = this.buffer.indexOf('\n');
    while (at !== -1) {
      const line = this.buffer.slice(0, at).trim();
      this.buffer = this.buffer.slice(at + 1);
      if (line) this.onLine(line);
      at = this.buffer.indexOf('\n');
    }
  }

  onLine(line) {
    let answer;
    try {
      answer = JSON.parse(line);
    } catch {
      answer = null;
    }

    // The helper is documented to answer one request per line, as a JSON object. Anything
    // else - a banner, a diagnostic on stdout, a crash message - is noise. Waiting for the
    // real answer is right even when a request is outstanding, because rejecting here would
    // fail a command that was about to succeed; the request's deadline still bounds how long
    // the deck waits on a helper that only ever sends noise.
    if (typeof answer !== 'object' || answer === null) {
      this.log(`camera bridge: ignored "${line}", not an answer`, 'warn');
      return;
    }

    if (!this.inFlight) {
      this.log(`camera bridge: ignored "${line}", nothing was waiting for it`, 'warn');
      return;
    }

    const entry = this.inFlight;
    this.settleInFlight(entry, () => entry.resolve(answer));
    this.drain();
  }

  /** Releases the in-flight slot, clearing its deadline. */
  settleInFlight(entry, body) {
    this.inFlight = null;
    clearTimeout(entry.timer);
    entry.timer = null;
    body();
  }

  /** Rejects everything outstanding and drops the child. */
  failAll(error) {
    const entries = this.inFlight ? [this.inFlight, ...this.queue] : this.queue.slice();
    this.queue = [];
    this.inFlight = null;
    for (const entry of entries) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.discardChild();
  }

  /** Kills and forgets the helper without failing the queue it may still hold. */
  discardChild() {
    const child = this.child;
    this.child = null;
    this.buffer = '';
    if (this.quitTimer) {
      clearTimeout(this.quitTimer);
      this.quitTimer = null;
    }
    if (child && child.exitCode === null) {
      child.removeAllListeners?.('exit');
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
  }

  /**
   * Drops the helper after a failure, so the next command starts clean.
   *
   * Deliberately does not start a replacement. `serve` restores the start position the
   * moment it comes up, so eagerly relaunching after a timeout would move the camera on its
   * own, with nobody pressing anything. The next command starts it instead.
   *
   * Nothing is rejected here: the caller already learned about the timeout that got us here.
   */
  restart() {
    this.discardChild();
  }

  /**
   * Asks the helper to stop, then insists.
   *
   * `quit` is a courtesy so the helper can restore the camera; a helper that will not
   * leave is killed after the grace period rather than being left holding the camera for
   * the rest of the session, which is what makes the plugin appear to lock the device.
   */
  close() {
    this.closed = true;
    const child = this.child;
    if (!child || child.exitCode !== null) {
      this.discardChild();
      return;
    }

    try {
      child.stdin.write('{"cmd":"quit"}\n');
    } catch {
      /* the pipe is already gone, the kill below still applies */
    }

    this.quitTimer = setTimeout(() => this.discardChild(), this.quitGraceMs);
    if (typeof this.quitTimer.unref === 'function') this.quitTimer.unref();
    child.once?.('exit', () => {
      if (this.quitTimer) {
        clearTimeout(this.quitTimer);
        this.quitTimer = null;
      }
    });
  }
}

/** The bridge the service uses. Created on first use, never at import. */
let bridge = null;

/**
 * @param {(msg: string, level?: string) => void} [log]
 * @returns {PixyBridge}
 */
export function getBridge(log) {
  if (!bridge) bridge = new PixyBridge({ executable: controllerPath(), log });
  return bridge;
}

/**
 * Replaces the bridge the service will use.
 *
 * The service is the only caller and it must not own the helper's lifetime, so the
 * instance lives here instead. Tests use this to put a recording bridge in place of a
 * camera that is not there.
 *
 * @param {PixyBridge|null} next  null restores the real bridge
 */
export function setBridge(next) {
  bridge = next;
}