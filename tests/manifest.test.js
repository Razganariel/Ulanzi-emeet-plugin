/**
 * The manifest is what the deck reads, and nothing validates it until Studio does.
 *
 * A wrong icon path or a mistyped uuid is not a crash: the action simply does not appear,
 * or appears with no icon, and the plugin looks broken in a way that reads as a Studio bug.
 * These are the checks the build already does on the output, run against the source so a
 * mistake is caught at `npm test` rather than by looking at the deck.
 *
 * One assertion here is a regression guard rather than a consistency check, and it is the
 * reason this file exists: an encoder action that declares `Devices: ["D200X"]` cannot be
 * dropped on a dial at all. That happened, and it was invisible because the manifest is
 * valid JSON either way. See PROJECT_CONTEXT.md section 37.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(ROOT, 'plugin');

const manifest = JSON.parse(readFileSync(path.join(PLUGIN, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(PLUGIN, 'package.json'), 'utf8'));
const { registry } = await import('../plugin/service/actions/index.js');
const { ACTION } = await import('../plugin/service/core/constants.js');

const exists = (relative) => existsSync(path.join(PLUGIN, relative));

/** The actions the plugin draws on a dial rather than a key. */
const isEncoder = (action) => (action.Controllers || []).includes('Encoder');

test('the plugin uuid has four segments', () => {
  assert.equal(manifest.UUID.split('.').length, 4, `got "${manifest.UUID}"`);
});

test('every action uuid hangs off the plugin uuid and is unique', () => {
  const seen = new Set();
  for (const action of manifest.Actions) {
    const parts = action.UUID.split('.');
    assert.ok(parts.length >= 5, `${action.UUID} needs 5 segments`);
    assert.equal(
      action.UUID,
      `${manifest.UUID}.${parts.at(-1)}`,
      `${action.UUID} must be ${manifest.UUID}.<suffix>`
    );
    assert.ok(!seen.has(action.UUID), `${action.UUID} is declared twice`);
    seen.add(action.UUID);
  }
});

test('every icon the manifest names exists', () => {
  const missing = [];
  for (const action of manifest.Actions) {
    if (!exists(action.Icon)) missing.push(`${action.Name}: Icon ${action.Icon}`);
    for (const state of action.States || []) {
      if (!exists(state.Image)) missing.push(`${action.Name}: state "${state.Name}" -> ${state.Image}`);
    }
  }
  if (manifest.Icon && !exists(manifest.Icon)) missing.push(`plugin Icon: ${manifest.Icon}`);
  if (manifest.CategoryIcon && !exists(manifest.CategoryIcon)) missing.push(`CategoryIcon: ${manifest.CategoryIcon}`);
  assert.deepEqual(missing, [], `\n${missing.join('\n')}\n`);
});

test('every property inspector the manifest names exists', () => {
  const missing = [];
  for (const action of manifest.Actions) {
    if (!action.PropertyInspectorPath) continue;
    if (!exists(action.PropertyInspectorPath)) {
      missing.push(`${action.Name}: ${action.PropertyInspectorPath}`);
    }
  }
  assert.deepEqual(missing, [], `\n${missing.join('\n')}\n`);
});

test('every property inspector loads the shared script, not its own copy', () => {
  // Three panels, one script. A panel that reintroduces its own inspector.js would drift
  // from the other two without anything saying so.
  const inspectors = [];
  for (const action of manifest.Actions) {
    if (action.PropertyInspectorPath && !inspectors.includes(action.PropertyInspectorPath)) {
      inspectors.push(action.PropertyInspectorPath);
    }
  }

  assert.ok(inspectors.length >= 4, 'the panels were found');
  const wrong = [];
  for (const relative of inspectors) {
    const html = readFileSync(path.join(PLUGIN, relative), 'utf8');
    if (!html.includes('../shared.js')) wrong.push(`${relative} does not load ../shared.js`);
    if (/\.\/inspector\.js/.test(html)) wrong.push(`${relative} still loads its own inspector.js`);
    for (const ref of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const target = ref[1];
      if (/^(?:https?:|data:|#|\/)/.test(target)) continue;
      if (target.includes('/libs/')) continue; // produced by the build from sdk/
      const resolved = path.join(PLUGIN, path.dirname(relative), target);
      if (!existsSync(resolved)) wrong.push(`${relative} references ${target}, which is not in the sources`);
    }
  }
  assert.deepEqual(wrong, [], `\n${wrong.join('\n')}\n`);
});

test('an encoder action must not claim a device', () => {
  // The regression this file exists for. `Devices: ["D200X"]` on an encoder action means
  // Studio will not let the action be dropped on a dial, and nothing in the manifest says
  // why. PROJECT_CONTEXT.md section 37.
  const offenders = [];
  for (const action of manifest.Actions) {
    if (!isEncoder(action)) continue;
    if ((action.Devices || []).length > 0) {
      offenders.push(`${action.Name} (${action.UUID}) declares Devices ${JSON.stringify(action.Devices)}`);
    }
    if (!action.Encoder || action.Encoder.layout !== '$UA1') {
      offenders.push(`${action.Name} has no $UA1 encoder layout`);
    }
  }
  assert.deepEqual(offenders, [], `\n${offenders.join('\n')}\n`);
});

test('a key action must claim the deck, and no dial', () => {
  const offenders = [];
  for (const action of manifest.Actions) {
    if (isEncoder(action)) continue;
    const controllers = action.Controllers || [];
    if (!controllers.includes('Keypad')) offenders.push(`${action.Name} is not offered on keys`);
    if (!(action.Devices || []).includes('D200X')) offenders.push(`${action.Name} does not target the D200X`);
    if (controllers.includes('Encoder')) offenders.push(`${action.Name} claims an encoder`);
  }
  assert.deepEqual(offenders, [], `\n${offenders.join('\n')}\n`);
});

test('the host is new enough for the encoder readout', () => {
  // setFeedbackLayout / setFeedback need 3.3.0. The calls are guarded so an older host
  // still works, it just shows no axis on the knob.
  const [major, minor, patch] = manifest.Software.MinVersion.split('.').map(Number);
  const atLeast330 = major > 3 || (major === 3 && (minor > 3 || (minor === 3 && patch >= 0)));
  assert.ok(atLeast330, `Software.MinVersion is ${manifest.Software.MinVersion}`);
});

test('the plugin is declared for Windows, which is the only platform it builds on', () => {
  const windows = (manifest.OS || []).some((entry) => entry.Platform === 'windows');
  assert.ok(windows, 'no windows entry in OS');
});

test('the version is written identically in both manifests', () => {
  assert.equal(manifest.Version, pkg.version);
});

test('the code path the manifest names is the one that exists', () => {
  assert.ok(exists(manifest.CodePath), `${manifest.CodePath} is missing`);
  assert.equal(pkg.main, manifest.CodePath, 'package.json main and CodePath must agree');
});

test('the registry holds exactly the actions the deck can place', () => {
  const declared = manifest.Actions.map((action) => action.UUID).sort();
  const registered = [...registry.keys()].sort();
  assert.deepEqual(registered, declared, 'the service answers for every action, and for nothing else');
});

test('the runtime dependency the SDK needs is declared', () => {
  // The SDK imports `ws`; without it the service cannot even be imported, and the build
  // installs whatever is listed here into the bundle.
  assert.ok(pkg.dependencies?.ws, 'ws is declared');
  assert.equal(pkg.type, 'module', 'the service is ESM');
});

test('the pan direction is offered on the pan actions and nowhere else', () => {
  // The preference has to be reachable where it applies, and absent where it does not: a
  // select that changes nothing is worse than no select. Tilt and zoom conform to the
  // documented sign, so there is nothing there to choose.
  const PAN_ACTIONS = [ACTION.PAN_LEFT, ACTION.PAN_RIGHT, ACTION.PAN_ENCODER];
  const panelOf = (uuid) => manifest.Actions.find((action) => action.UUID === uuid).PropertyInspectorPath;
  const hasField = (uuid) => {
    const html = readFileSync(path.join(PLUGIN, panelOf(uuid)), 'utf8');
    return /name="panDirection"/.test(html);
  };

  for (const uuid of PAN_ACTIONS) {
    assert.ok(hasField(uuid), `${uuid} offers the pan direction`);
  }

  const others = manifest.Actions
    .filter((action) => action.PropertyInspectorPath && !PAN_ACTIONS.includes(action.UUID))
    .map((action) => action.UUID);
  const wrong = others.filter((uuid) => hasField(uuid));
  assert.deepEqual(wrong, [], `\n${wrong.join('\n')}\n`);
});

test('pan and tilt no longer share a property inspector', () => {
  // They used to, because their step settings were identical. Pan now carries a setting
  // tilt has no use for, so one shared panel would offer tilt a control that does nothing.
  const panelOf = (uuid) => manifest.Actions.find((action) => action.UUID === uuid).PropertyInspectorPath;
  assert.notEqual(panelOf(ACTION.PAN_LEFT), panelOf(ACTION.TILT_UP));
  assert.equal(panelOf(ACTION.PAN_LEFT), panelOf(ACTION.PAN_RIGHT), 'the pan keys share one panel');
});