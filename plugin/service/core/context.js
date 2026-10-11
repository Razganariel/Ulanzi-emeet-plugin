/**
 * Action instance bookkeeping.
 *
 * The host identifies an action instance with a context string built by the SDK as
 * "<action uuid>___<key>___<actionid>". That string is the only handle on "which key holds
 * which action", so every event carries one and a removal must not leave an entry behind
 * that a later event would reuse.
 *
 * One entry per key holds the three things an action needs between two events: its
 * settings, the axis a cycling encoder is currently on, and the timer for a position key
 * being held. Keeping them together - rather than in three maps keyed by context, as the
 * first version did - is what makes a removal complete: there is no second place left to
 * forget to clean up.
 */

/** Separator the SDK uses in encodeContext(). */
const SEP = '___';

/**
 * Splits a context string.
 *
 * The host is allowed to omit fields, so every part can be missing: `undefined` becomes
 * an empty string rather than the string "undefined".
 */
export function decodeContext(context) {
  const [uuid = '', key = '', actionid = ''] = String(context ?? '').split(SEP);
  return {
    uuid: uuid === 'undefined' ? '' : uuid,
    key: key === 'undefined' ? '' : key,
    actionid: actionid === 'undefined' ? '' : actionid,
  };
}

/**
 * The action uuid an event refers to.
 *
 * Events that name one carry it in `uuid`; the rest carry only the context, which is
 * where the uuid is the first segment. Trusting `uuid` first and falling back means an
 * event whose uuid field is stale cannot retarget a key: the context is what the host
 * built the event around.
 */
export function actionUuidOf(message) {
  if (message?.uuid) return String(message.uuid).toLowerCase();
  return decodeContext(message?.context).uuid.toLowerCase();
}

/** context -> entry */
export function createStore() {
  return new Map();
}

/**
 * The entry for a context, created on first sight.
 *
 * Settings accumulate rather than replace: the host answers one property inspector panel
 * at a time, and each panel only carries the fields it owns. Rebuilding the object from
 * the defaults on each message is what made saving a preset list put the encoder's own
 * step back to its default.
 *
 * The defaults are applied **once, here**, on creation. They used to be merged again on
 * every add, which silently undid the user's choices: the host sends `didReceiveSettings`
 * before `add`, so the stored settings were already in the entry when the defaults landed
 * on top of them. A pan direction chosen as "inverted" went back to "normal" every time
 * the key was looked at again.
 *
 * @param {Map} store
 * @param {string} context
 * @param {string} uuid
 * @param {object} [defaults]  the action's own defaults, applied only to a new entry
 */
export function ensureEntry(store, context, uuid, defaults = {}) {
  const key = String(context ?? '');
  const found = store.get(key);
  if (found && (!uuid || found.uuid === uuid)) return found;

  const entry = {
    uuid: uuid || decodeContext(key).uuid.toLowerCase(),
    settings: { ...defaults },
    axisIndex: 0,
    longPressTimer: null,
  };
  store.set(key, entry);
  return entry;
}

/** Merges a settings payload into an entry. */
export function mergeSettings(entry, settings) {
  if (!settings) return entry;
  entry.settings = { ...entry.settings, ...settings };
  return entry;
}

/**
 * Drops an entry and cancels anything it was still holding.
 *
 * A pending long press is cancelled rather than left to fire: the key is gone, and the
 * timer would store the head's position against a preset the user can no longer see.
 *
 * @returns {boolean} whether an entry was there to drop
 */
export function forget(store, context) {
  const key = String(context ?? '');
  const entry = store.get(key);
  if (!entry) return false;
  cancelLongPress(entry);
  store.delete(key);
  return true;
}

/** Cancels a pending long press on an entry. */
export function cancelLongPress(entry) {
  if (!entry?.longPressTimer) return;
  clearTimeout(entry.longPressTimer);
  entry.longPressTimer = null;
}

/**
 * Starts the timer that turns a press into a store.
 *
 * @param {object} entry
 * @param {number} delayMs
 * @param {Function} fire  called when the key is still held
 */
export function startLongPress(entry, delayMs, fire) {
  cancelLongPress(entry);
  entry.longPressTimer = setTimeout(() => {
    entry.longPressTimer = null;
    fire();
  }, delayMs);
  // A held key must not be the reason the host stays alive on its way out.
  if (typeof entry.longPressTimer.unref === 'function') entry.longPressTimer.unref();
}

/** True while the key is held but not yet long enough to store. */
export function isLongPressPending(entry) {
  return Boolean(entry?.longPressTimer);
}