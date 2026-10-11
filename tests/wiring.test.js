/**
 * Wiring mistakes that syntax checking cannot see.
 *
 * `node --check` only parses. A name that is used but never imported parses perfectly and
 * throws a ReferenceError the first time it runs. In the main service that error lands in
 * the `uncaughtException` handler, which logs it and lets the process carry on, so the
 * plugin still works and the broken line is one log entry nobody reads.
 *
 * That is not hypothetical. It happened on this project while the service was being split:
 * a `bridge` object was invented at the call site to satisfy a signature that took one, and
 * a context field was read as `ctx.action` while the builder called it `action`. Both parse.
 * Both would have been invisible. The sibling plugins hit the same class of bug.
 *
 * Scope is deliberately narrow: only calls at column zero, which is module-level wiring,
 * runs on import, and is what gets swallowed. Calls inside a function body and method calls
 * are out of scope here to keep the check free of false alarms.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = path.join(ROOT, 'plugin', 'service');

function serviceFiles(dir = SERVICE, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) serviceFiles(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Everything the file brings into scope: imports, plus anything it declares. */
function boundNames(text) {
  const bound = new Set();

  for (const m of text.matchAll(/import\s+([\w$]+)\s+from/g)) bound.add(m[1]);
  for (const m of text.matchAll(/import\s*\*\s*as\s+([\w$]+)\s+from/g)) bound.add(m[1]);
  for (const m of text.matchAll(/import\s+([\w$]+)\s*,/g)) bound.add(m[1]);
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) bound.add(name);
    }
  }

  for (const m of text.matchAll(/(?:function|class)\s+([\w$]+)/g)) bound.add(m[1]);
  for (const m of text.matchAll(/(?:const|let|var)\s+([\w$]+)/g)) bound.add(m[1]);
  // Destructuring, however it is written: const { a, b: c } = x
  for (const m of text.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/[:=]/)[0].trim();
      if (/^[\w$]+$/.test(name)) bound.add(name);
    }
  }

  return bound;
}

const GLOBALS = new Set(['process', 'console', 'globalThis', 'structuredClone', 'queueMicrotask']);

/** Words that look like a call at the start of a line but are not one. */
const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'await', 'new',
  'function', 'do', 'else', 'with', 'delete', 'void', 'yield', 'throw', 'case',
  'constructor',
]);

/** Column-zero calls, which is where the module-level wiring lives. */
function moduleLevelCalls(text) {
  return [...text.matchAll(/^([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
}

test('every module-level call in the service resolves to something in scope', () => {
  const files = serviceFiles();
  assert.ok(files.length >= 10, 'the service was found');

  const problems = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const bound = boundNames(text);
    text.split('\n').forEach((line, i) => {
      const m = /^([A-Za-z_$][\w$]*)\s*\(/.exec(line);
      if (!m) return;
      const name = m[1];
      if (bound.has(name) || GLOBALS.has(name) || KEYWORDS.has(name)) return;
      problems.push(`${path.relative(ROOT, file)}:${i + 1} calls "${name}", never imported or declared`);
    });
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

test('the main service still wires the host and the shutdown handlers', () => {
  // Named on its own because the check above proves a name is in scope, not that the call
  // is still there. Dropping either one leaves a plugin that connects to nothing, or one
  // that leaves the camera held when Studio closes, with no error either way.
  const text = readFileSync(path.join(SERVICE, 'app.js'), 'utf8');
  const called = moduleLevelCalls(text);

  assert.ok(called.includes('installShutdownHandlers'), 'the shutdown handlers are installed');
  assert.ok(text.includes('$UD.connect('), 'the service connects to the host');
});

test('the hooks app.js dispatches to are the ones the actions export', async () => {
  // Optional chaining makes a misspelled hook a no-op rather than a crash, so the contract
  // between the router and the actions has to be asserted from both sides.
  const { registry } = await import('../plugin/service/actions/index.js');
  const DISPATCHED = ['onRun', 'onKeyDown', 'onKeyUp', 'onDialPress', 'onDialRotate', 'render'];
  const problems = [];

  for (const [uuid, action] of registry) {
    for (const key of Object.keys(action)) {
      if ((key.startsWith('on') || key === 'render') && !DISPATCHED.includes(key)) {
        problems.push(`${uuid} exports ${key}, which app.js never dispatches to`);
      }
    }
    if (typeof action.render !== 'function') problems.push(`${uuid} has no render()`);
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

test('every action has at least one hook app.js can reach', async () => {
  // An action whose only entry point is misspelled registers, appears in the manifest,
  // and does nothing at all when its key is pressed.
  const { registry } = await import('../plugin/service/actions/index.js');
  const REACHABLE = ['onRun', 'onKeyDown', 'onDialPress', 'onDialRotate'];
  const inert = [];

  for (const [uuid, action] of registry) {
    if (!REACHABLE.some((hook) => typeof action[hook] === 'function')) inert.push(uuid);
  }

  assert.deepEqual(inert, [], `\n${inert.join('\n')}\n`);
});

test('every action declares its defaults exactly one way', async () => {
  // `defaultsFor` reads `action.defaults`, or `action.defaultsFor(uuid)` for the move
  // actions. Declaring neither gives undefined; declaring both means one of them is dead.
  const { registry } = await import('../plugin/service/actions/index.js');
  const problems = [];

  for (const [uuid, action] of registry) {
    const perUuid = typeof action.defaultsFor === 'function';
    const shared = action.defaults !== undefined && typeof action.defaults === 'object';
    if (!perUuid && !shared) problems.push(`${uuid} declares neither defaults nor defaultsFor()`);
    if (perUuid && shared) problems.push(`${uuid} declares both defaults and defaultsFor()`);
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

test('the service imports nothing it does not use', () => {
  // The other direction, and the cheaper one to get wrong during a split: an import left
  // behind by a module that used to need it reads as intent that is no longer there.
  const problems = [];

  for (const file of serviceFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/import\s+\*\s*as\s+([\w$]+)\s+from/g)) {
      if (!new RegExp(`\\b${m[1]}\\.`).test(text)) {
        problems.push(`${path.relative(ROOT, file)} imports ${m[1]} and never uses it`);
      }
    }
    for (const m of text.matchAll(/import\s+\{([^}]*)\}\s*from/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        const uses = [...text.matchAll(new RegExp(`(?<![.\\w$])${name}\\b`, 'g'))].length;
        if (uses <= 1) problems.push(`${path.relative(ROOT, file)} imports ${name} and never uses it`);
      }
    }
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

test('only the bridge spawns the helper', () => {
  // The bridge owns the process. A second spawn anywhere else would mean two helpers
  // competing for the camera, which is the one thing that must never happen: the head
  // stops responding to both.
  const problems = [];

  for (const file of serviceFiles()) {
    const text = readFileSync(file, 'utf8');
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    if (/from\s+['"]node:child_process['"]/.test(text) && relative !== 'plugin/service/core/bridge.js') {
      problems.push(`${relative} imports node:child_process`);
    }
    if (/\bspawn\s*\(/.test(text) && relative !== 'plugin/service/core/bridge.js') {
      problems.push(`${relative} calls spawn()`);
    }
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});