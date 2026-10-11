/**
 * Leaving, and staying alive.
 *
 * Two things have to be true when the host goes away, and neither is visible from the code:
 * the helper has to be stopped, or the plugin holds the camera until something kills it; and
 * a frame the SDK could not parse has to be survivable, or the deck goes silent for the rest
 * of the session with one line in a log nobody reads.
 *
 * Both are wiring on `process`, so this file replaces `process.on` and `process.exit` to
 * capture the handlers instead of letting them install for real. The replacements have to
 * stay in place for as long as a handler is *fired*, not only while it is registered: the
 * signal handler calls `process.exit`, and restoring the real one first would end the test
 * run on the spot, which looks like a file that silently does nothing rather than like a
 * broken test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installShutdownHandlers } from '../plugin/service/core/shutdown.js';

/**
 * Runs `body` with `process.on` and `process.exit` replaced by recorders.
 *
 * @param {object} options  { release, log } handed to installShutdownHandlers
 * @param {(harness: object) => void} body
 */
function withHandlers({ release = () => {}, log = () => {} } = {}, body) {
  const listeners = new Map();
  const exits = [];
  const originalOn = process.on;
  const originalExit = process.exit;

  process.on = (event, handler) => {
    listeners.set(event, [...(listeners.get(event) || []), handler]);
    return process;
  };
  process.exit = (code) => { exits.push(code); return undefined; };

  try {
    const releaseOnce = installShutdownHandlers({ release, log });
    body({ listeners, exits, releaseOnce });
  } finally {
    process.on = originalOn;
    process.exit = originalExit;
  }
}

const fire = (listeners, event, argument) => {
  for (const handler of listeners.get(event) || []) handler(argument);
};

test('every handler that matters is registered', () => {
  withHandlers({}, ({ listeners }) => {
    for (const event of ['uncaughtException', 'unhandledRejection', 'exit', 'SIGINT', 'SIGTERM']) {
      assert.ok((listeners.get(event) || []).length, `nothing listens for ${event}`);
    }
  });
});

test('the helper is stopped when the process ends', () => {
  // Otherwise the plugin holds the camera after Ulanzi Studio is closed, which reads as a
  // driver problem rather than as a plugin that forgot to tidy up.
  let released = 0;

  withHandlers({ release: () => { released += 1; } }, ({ listeners }) => {
    fire(listeners, 'exit');
  });

  assert.equal(released, 1);
});

test('a helper that will not stop does not take the exit down with it', () => {
  // `release` writes to the helper's stdin. If that pipe is already gone the write throws,
  // and a throw from an `exit` handler is reported by Node in a way that looks like a crash
  // on the way down rather than a cleanup that failed.
  const logs = [];

  withHandlers({
    release: () => { throw new Error('EPIPE'); },
    log: (message, level) => logs.push([message, level]),
  }, ({ listeners }) => {
    assert.doesNotThrow(() => fire(listeners, 'exit'));
  });

  assert.match(logs.at(-1)?.[0] || '', /EPIPE/, 'the failure was reported');
  assert.equal(logs.at(-1)?.[1], 'warn', 'and as a warning, not an error');
});

test('a bad frame is survived and reported', () => {
  // The SDK parses every inbound frame before anything else sees it, so a malformed one
  // throws inside the SDK, out of the callback that would have handled it. Without this
  // handler the service dies on the first bad frame and the deck goes quiet for the session.
  const logs = [];

  withHandlers({ log: (message, level) => logs.push([message, level]) }, ({ listeners }) => {
    assert.doesNotThrow(() => fire(listeners, 'uncaughtException', new Error('bad frame')));
  });

  assert.match(logs.at(-1)?.[0] || '', /bad frame/);
  assert.equal(logs.at(-1)?.[1], 'error');
});

test('an exception with no message is still described', () => {
  // Thrown values are not always Errors, and reading `.message` off undefined would be a
  // second failure inside the handler that exists to stop the first one.
  const logs = [];

  withHandlers({ log: (message) => logs.push(message) }, ({ listeners }) => {
    assert.doesNotThrow(() => fire(listeners, 'uncaughtException', undefined));
  });

  assert.match(logs.at(-1) || '', /uncaught exception/);
});

test('an unhandled rejection is survived and reported', () => {
  const logs = [];

  withHandlers({ log: (message, level) => logs.push([message, level]) }, ({ listeners }) => {
    assert.doesNotThrow(() => fire(listeners, 'unhandledRejection', new Error('nobody caught me')));
  });

  assert.match(logs.at(-1)?.[0] || '', /nobody caught me/);
});

test('a signal stops the helper and then exits', () => {
  // The order is the whole point: exiting first kills the write that stops the helper, so
  // the process would be gone with the helper still holding the camera. Both have to land in
  // one list, or swapping them still looks correct.
  const order = [];

  withHandlers({ release: () => order.push('release') }, ({ listeners }) => {
    const originalExit = process.exit;
    process.exit = (code) => { order.push(`exit:${code}`); return undefined; };
    try {
      fire(listeners, 'SIGINT', 'SIGINT');
    } finally {
      process.exit = originalExit;
    }
    assert.deepEqual(order, ['release', 'exit:0'], 'the helper is stopped before the exit');
  });
});

test('SIGTERM takes the same path as SIGINT', () => {
  withHandlers({}, ({ listeners, exits }) => {
    fire(listeners, 'SIGTERM', 'SIGTERM');
    assert.deepEqual(exits, [0]);
  });
});

test('a failure to stop the helper still exits', () => {
  // Otherwise a broken pipe on the way out leaves the process alive on a signal, which is
  // harder to reason about than a helper that could not be stopped.
  withHandlers({ release: () => { throw new Error('EPIPE'); }, log: () => {} }, ({ listeners, exits }) => {
    assert.doesNotThrow(() => fire(listeners, 'SIGINT', 'SIGINT'));
    assert.deepEqual(exits, [0]);
  });
});

test('the caller is handed a way to stop the helper itself', () => {
  // Called when the host disconnects, which is not the same as the process ending.
  let released = 0;

  withHandlers({ release: () => { released += 1; } }, ({ releaseOnce }) => {
    releaseOnce();
    assert.equal(released, 1);
  });
});

test('a release called twice reports both failures and still exits', () => {
  // Nothing calls it twice today, but the failure mode is asymmetric: a second call
  // throwing from the same broken pipe would, on the signal path, skip the exit.
  const logs = [];

  withHandlers({
    release: () => { throw new Error('EPIPE'); },
    log: (message) => logs.push(message),
  }, ({ releaseOnce, listeners, exits }) => {
    releaseOnce();
    assert.doesNotThrow(() => releaseOnce());
    assert.doesNotThrow(() => fire(listeners, 'SIGINT', 'SIGINT'));
    assert.deepEqual(exits, [0], 'the exit still happened');
    assert.equal(logs.length, 3, 'each attempt was reported');
  });
});