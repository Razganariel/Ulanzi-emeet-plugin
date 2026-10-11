/**
 * Action registry.
 *
 * Every action in the manifest is one entry here, and app.js routes host events to
 * whatever module claims the uuid. A host frame can name an action from an older or a
 * newer build, so an unknown uuid resolves to nothing and produces no work and no answer
 * to a property inspector, rather than a crash.
 *
 * A module may register under one `uuid` or several `uuids`: pan, tilt and zoom are six
 * actions that differ only in a sign, and six files would be six copies of the same code.
 */

import * as center from './center.js';
import * as encoder from './encoder.js';
import * as mode from './mode.js';
import * as move from './move.js';
import * as position from './position.js';

const MODULES = [move, center, encoder, position, mode];

/** @type {Map<string, object>} action uuid -> module */
export const registry = new Map();

for (const mod of MODULES) {
  const uuids = mod.uuids || (mod.uuid ? [mod.uuid] : []);
  for (const uuid of uuids) registry.set(uuid, mod);
}

/**
 * The action a uuid belongs to.
 *
 * @param {string} uuid
 * @returns {object|null}
 */
export function findByUuid(uuid) {
  return registry.get(uuid) || null;
}

/**
 * The settings defaults for one action.
 *
 * The move actions default per axis rather than per module, so the lookup goes through
 * the module's own `defaultsFor` when it has one.
 *
 * @param {string} uuid
 * @returns {object}
 */
export function defaultsFor(uuid) {
  const action = findByUuid(uuid);
  if (!action) return {};
  return action.defaultsFor ? action.defaultsFor(uuid) : action.defaults || {};
}