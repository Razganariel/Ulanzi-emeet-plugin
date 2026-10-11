/**
 * PIXY PTZ for Ulanzi D200X - main service.
 *
 * Holds the connection to Ulanzi Studio for the whole session and nothing else. It owns no
 * camera command, no key state and no display logic: an event arrives, the action that
 * claims the uuid decides what it means, and the camera module is the only thing that
 * talks to the hardware. That split is what lets the whole surface be exercised without a
 * deck, without a camera and without the bridge.
 *
 * The order the host announces things in is not guaranteed, so nothing here assumes an
 * action has already been added. A press on a key the service has never seen still works:
 * the entry is created on the spot, with the action's own defaults.
 */

import UlanziApi from '../ulanzi-api/index.js';
import { defaultsFor, findByUuid } from './actions/index.js';
import * as encoder from './actions/encoder.js';
import { getCamera } from './core/camera.js';
import {
  actionUuidOf,
  cancelLongPress,
  createStore,
  ensureEntry,
  forget,
  mergeSettings,
} from './core/context.js';
import { installShutdownHandlers } from './core/shutdown.js';
import { forgetEncoderLayout } from './core/ui.js';

const $UD = new UlanziApi();
$UD.connect('com.ulanzi.ulanzideck.pixy');

/**
 * Logging goes to the host and to stdout.
 *
 * Two sinks because they fail differently: the host's log is what a user reporting a
 * problem will have, and stdout is what survives when the host is the thing that is broken.
 * Neither is allowed to throw - a logging failure must not become the failure.
 */
function log(message, level = 'info') {
  try {
    $UD.logMessage(message, level);
  } catch {
    /* the host is not listening, or is too old for the call */
  }
  process.stdout.write(`[pixy] ${message}\n`);
}

/** context -> { uuid, settings, axisIndex, longPressTimer } */
const contexts = createStore();
let camera = null;

/** The camera, created on first use so importing the service touches no hardware. */
function cameraFor() {
  if (!camera) camera = getCamera(log);
  return camera;
}

/**
 * Builds the context an action is handed, or null when no action claims the uuid.
 *
 * A host frame can name an action from an older or a newer build. That must produce no
 * work and no answer to a property inspector, rather than a crash or an entry that later
 * events would keep writing into.
 *
 * @param {object} message  the host event
 * @returns {object|null}
 */
function contextFor(message) {
  const uuid = actionUuidOf(message);
  const action = findByUuid(uuid);
  if (!action) return null;

  // The defaults are seeded here, and only for an entry that does not exist yet. Doing it
  // again on every add undid the user's settings: the host answers a panel before it
  // announces the key, so anything chosen in the panel was already stored when the
  // defaults landed on top of it.
  const entry = ensureEntry(contexts, message.context, uuid, defaultsFor(uuid));
  return {
    $UD,
    action,
    uuid,
    context: message.context,
    entry,
    settings: entry.settings,
    camera: cameraFor(),
    log,
    report: (error) => log(`${uuid}: ${error.message}`, 'error'),
  };
}

/** The action an event belongs to. */
function actionFor(message) {
  return findByUuid(actionUuidOf(message));
}

/** Runs an action hook and reports anything it throws. */
async function invoke(message, hook, ...args) {
  if (typeof hook !== 'function') return;
  const ctx = contextFor(message);
  if (!ctx) return;
  try {
    await hook(ctx, ...args);
  } catch (error) {
    ctx.report(error);
  }
}

/** Clears everything one key was holding, whichever kind of key it is. */
function releaseKey(context) {
  const entry = contexts.get(String(context ?? ''));
  if (entry) {
    cancelLongPress(entry);
    encoder.forget(entry);
  }
  forget(contexts, context);
  forgetEncoderLayout(context);
}

$UD.onConnected(() => {
  log('PIXY PTZ plugin connected');
});

$UD.onAdd((message) => {
  const ctx = contextFor(message);
  if (!ctx) return;
  // Only the host's own copy of the settings. The action's defaults were seeded when the
  // entry was created, and re-merging them here would overwrite whatever the user chose.
  mergeSettings(ctx.entry, message.param);
  // The host answers a request rather than volunteering, so ask it for this key's stored
  // settings. Without this the entry holds nothing but the defaults until someone happens
  // to open the panel and save, and a panel that opens before that shows the defaults
  // instead of what is actually stored.
  $UD.getSettings(ctx.context);
  log(`action added: ${message.context}`);
  ctx.action.render?.(ctx);
});

$UD.onSetActive((message) => {
  // A key can be announced again without being cleared first, and the host rebuilds the
  // key when it does, so what was drawn has to be painted again rather than assumed.
  const ctx = contextFor(message);
  if (!ctx) return;
  ctx.action.render?.(ctx);
});

$UD.onClear((message) => {
  const removed = message?.param || [];
  for (const item of removed) releaseKey(item.context);
  log(`actions cleared: ${removed.length}`);
});

$UD.onDidReceiveSettings((message) => {
  const ctx = contextFor(message);
  if (!ctx) return;
  mergeSettings(ctx.entry, message.settings);
});

// The same payload under another name, which the host sends once a panel has been opened
// for a key that moved. Ignoring it left the entry - and the panel that had just
// hydrated - describing the key the action used to be on.
$UD.onParamFromApp((message) => {
  const ctx = contextFor(message);
  if (!ctx) return;
  mergeSettings(ctx.entry, message.param);
});

$UD.onKeyDown((message) => {
  const action = actionFor(message);
  // A key that answers the press itself (the position keys, which have to tell a short
  // press from a long one) handles its own; every other key is a plain action.
  void invoke(message, action?.onKeyDown || action?.onRun);
});

$UD.onKeyUp((message) => {
  void invoke(message, actionFor(message)?.onKeyUp);
});

$UD.onDialDown((message) => {
  void invoke(message, actionFor(message)?.onDialPress);
});

$UD.onDialRotate((message) => {
  void invoke(message, actionFor(message)?.onDialRotate, message);
});

$UD.onError((error) => log(`WebSocket error: ${error}`, 'error'));

$UD.onClose(() => log('PIXY PTZ plugin disconnected'));

installShutdownHandlers({
  release: () => {
    encoder.reset();
    camera?.bridge?.close();
  },
  log,
});