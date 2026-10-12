/**
 * The line protocol with `PixyController.exe`.
 *
 * The helper answers one line per command, in order, and nothing on the line says which
 * command it belongs to. That makes the request/reply pairing the fragile part of the whole
 * transport: get it wrong and a single slow answer takes every answer after it down with it,
 * with no error the operator can see. None of it needs a camera, so it is tested here
 * against a fake process.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PixyBridge } from '../plugin/service/core/bridge.js';

/** Stands in for the child process: records what was written, answers on demand. */
function fakeProcess() {
  const proc = new EventEmitter();
  proc.written = [];
  proc.exitCode = null;
  proc.killed = false;
  proc.stdin = {
    write: (line) => {
      proc.written.push(String(line).trim());
    },
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdout.setEncoding = () => {};
  proc.stderr.setEncoding = () => {};
  proc.kill = () => {
    proc.killed = true;
    proc.exitCode = 0;
  };
  /** Delivers one answer line, the way the helper does. */
  proc.reply = (line) => proc.stdout.emit('data', `${line}\n`);
  /** Delivers a partial line, to check the reassembly. */
  proc.emit_partial = (chunk) => proc.stdout.emit('data', chunk);
  return proc;
}

/** A bridge over a process the test controls. */
function harness(options = {}) {
  const proc = fakeProcess();
  const logs = [];
  const bridge = new PixyBridge({
    executable: 'PixyController.exe',
    spawn: () => proc,
    log: (message) => logs.push(message),
    ...options,
  });
  return { bridge, proc, logs };
}

test('a command is answered with the line that comes back', async () => {
  const { bridge, proc } = harness();
  const answer = bridge.request({ cmd: 'get' });
  assert.deepEqual(proc.written, ['{"cmd":"get"}'], 'the command went out as one line');

  proc.reply('{"ok":true,"pan":10}');
  assert.deepEqual(await answer, { ok: true, pan: 10 });
});

test('only one command is outstanding at a time', async () => {
  // Three commands are queued while the first is still waiting. Sending them all at once
  // would mean three answers arriving with nothing to tell them apart.
  const { bridge, proc } = harness();

  const answers = [
    bridge.request({ cmd: 'a' }),
    bridge.request({ cmd: 'b' }),
    bridge.request({ cmd: 'c' }),
  ];
  assert.deepEqual(proc.written, ['{"cmd":"a"}'], 'only the first went out');

  proc.reply('{"ok":true}');
  await answers[0];
  assert.deepEqual(proc.written, ['{"cmd":"a"}', '{"cmd":"b"}'], 'the second followed the first');

  proc.reply('{"ok":true}');
  await answers[1];
  assert.deepEqual(proc.written, ['{"cmd":"a"}', '{"cmd":"b"}', '{"cmd":"c"}']);

  proc.reply('{"ok":true}');
  await answers[2];
});

test('answers are paired to the command that asked for them', async () => {
  // The pairing is the whole contract, so it is asserted on the values rather than on the
  // order: an answer that carried the wrong field would still resolve.
  const { bridge, proc } = harness();

  const first = bridge.request({ cmd: 'move', axis: 'pan', delta: 10 });
  const second = bridge.request({ cmd: 'move', axis: 'tilt', delta: -5 });

  proc.reply('{"ok":true,"axis":"pan"}');
  proc.reply('{"ok":true,"axis":"tilt"}');

  assert.equal((await first).axis, 'pan');
  assert.equal((await second).axis, 'tilt');
});

test('an answer split across reads is reassembled', async () => {
  // A read boundary falls wherever the pipe says, which is rarely between two lines.
  const { bridge, proc } = harness();
  const answer = bridge.request({ cmd: 'get' });

  proc.emit_partial('{"ok":tr');
  proc.emit_partial('ue,"pan":');
  proc.emit_partial('10}\n');

  assert.deepEqual(await answer, { ok: true, pan: 10 });
});

test('a line that is not an answer is ignored and does not fail the command', async () => {
  // The helper is documented to answer one request per line as a JSON object. A banner or a
  // diagnostic on stdout is not that, and rejecting on it would fail a command that was
  // about to succeed - the exact failure a startup banner would cause.
  const { bridge, proc, logs } = harness();
  const answer = bridge.request({ cmd: 'get' });

  proc.reply('PixyController 1.0.0');
  proc.reply('{"ok":true,"pan":10}');

  assert.deepEqual(await answer, { ok: true, pan: 10 }, 'the real answer still arrived');
  assert.ok(logs.some((line) => /ignored/.test(line)), 'the noise was reported');
});

test('a command that only gets noise is left to its deadline', async () => {
  // The bound on waiting for a helper that never answers properly is the timeout, not the
  // first line it says.
  const { bridge, proc } = harness({ timeoutMs: 40 });
  const answer = bridge.request({ cmd: 'get' });

  proc.reply('still here');
  proc.reply('still here');

  await assert.rejects(answer, /timed out/);
});

test('a command that is never answered gives up instead of wedging the deck', async () => {
  // A driver that stops answering produces silence, not an error. Without a deadline the
  // in-flight slot never frees and every later command is silently dropped for the session.
  const { bridge } = harness({ timeoutMs: 40 });
  await assert.rejects(bridge.request({ cmd: 'get' }), /timed out/);
});

test('the helper is replaced after a timeout, but not before it is needed', async () => {
  // The answer to the abandoned command may still be sitting in the pipe. Reusing the
  // stream would hand it to whichever request goes next, so a fresh helper is started.
  //
  // And it is not started straight away: `serve` restores the start position as it comes
  // up, so relaunching on the spot would move the camera with nobody pressing anything.
  const procs = [];
  const { bridge } = harness({ timeoutMs: 30 });
  bridge.spawn = () => {
    const proc = fakeProcess();
    procs.push(proc);
    return proc;
  };

  await assert.rejects(bridge.request({ cmd: 'get' }), /timed out/);
  assert.equal(procs.length, 1, 'the timed out helper was dropped');
  assert.equal(bridge.running, false, 'and nothing replaced it yet');

  const second = bridge.request({ cmd: 'get' });
  assert.equal(procs.length, 2, 'the next command started a fresh helper');
  procs[1].reply('{"ok":true}');
  assert.deepEqual(await second, { ok: true });
});

test('the queue is released when the helper dies', async () => {
  // Windows killing the helper - an update, a low-memory kill, the user closing a console -
  // leaves the commands it was holding with nothing to answer them.
  const { bridge, proc } = harness();
  const first = bridge.request({ cmd: 'a' });
  const queued = bridge.request({ cmd: 'b' });

  proc.exitCode = 1;
  proc.emit('exit', 1, null);

  await assert.rejects(first, /exited/);
  await assert.rejects(queued, /exited/);
});

test('a helper that cannot be started fails the command instead of hanging it', async () => {
  // The executable is missing or blocked. The 'error' handler reports it, and every command
  // waiting on it has to be released or the deck is dead until Studio restarts.
  const logs = [];
  const bridge = new PixyBridge({
    executable: 'nope.exe',
    spawn: () => {
      const proc = fakeProcess();
      queueMicrotask(() => proc.emit('error', new Error('ENOENT')));
      return proc;
    },
    log: (message) => logs.push(message),
  });

  await assert.rejects(bridge.request({ cmd: 'get' }), /could not start/);
  assert.ok(
    logs.some((line) => /could not start/.test(line)),
    'the failure was reported to the log'
  );
});

test('closing asks the helper to quit, then insists', async () => {
  const { bridge, proc } = harness({ quitGraceMs: 20 });
  bridge.request({ cmd: 'get' }).catch(() => {});
  proc.reply('{"ok":true}');

  bridge.close();
  assert.ok(proc.written.includes('{"cmd":"quit"}'), 'a quit was asked for, not a kill');

  // The helper ignores it.
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.ok(proc.killed, 'it was killed once the grace period passed');
});

test('a command issued after closing is refused', async () => {
  const { bridge } = harness();
  bridge.close();
  await assert.rejects(bridge.request({ cmd: 'get' }), /closed/);
});

test('a bridge is only started once', async () => {
  const spawned = [];
  const bridge = new PixyBridge({
    executable: 'PixyController.exe',
    spawn: () => {
      const proc = fakeProcess();
      spawned.push(proc);
      return proc;
    },
  });

  // Answered, so the deadline does not outlive the test.
  const first = bridge.request({ cmd: 'a' });
  spawned[0].reply('{"ok":true}');
  await first;

  const second = bridge.request({ cmd: 'b' });
  spawned[0].reply('{"ok":true}');
  await second;

  assert.equal(spawned.length, 1, 'the second command reused the running helper');
});