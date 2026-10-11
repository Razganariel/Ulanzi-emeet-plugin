# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 19 actions on the D200X: pan/tilt/zoom buttons with a configurable step, center,
  four encoder actions (a mode-cycling encoder plus one encoder bound to pan, to tilt
  or to zoom), a start position and five presets (short press recalls, long press
  stores), and the three camera modes (standard, tracking, privacy).
- 73 tests over `npm test`, none of which need a camera, a deck or the helper binary.

### Fixed

- **A command the camera never answered no longer wedges the deck for the session.**
  The bridge had no deadline: a driver that stopped answering produced silence rather than
  an error, the single in-flight slot never freed, and every later command was silently
  dropped until Ulanzi Studio was restarted. Each request now carries a deadline, and a
  timeout rebuilds the pipe rather than resynchronising one that has lost its place.
- **The helper is no longer relaunched after a timeout on its own.** `serve` restores the
  start position as it comes up, so an eager relaunch would move the camera with nobody
  pressing anything. The next command starts it instead.
- **A helper that cannot start no longer leaves commands hanging.** A missing or blocked
  `PixyController.exe` rejected nothing, so every queued command stayed pending forever.
- **Lines that are not answers are ignored instead of failing the command.** A banner or a
  diagnostic printed on stdout was parsed as the answer to whatever was outstanding, and
  a command that was about to succeed failed instead.
- **A key release no longer depends on the event carrying a uuid.** The action was read
  from `jsn.uuid` on key-up; where the host omits it, recalling a preset silently did
  nothing. It is now recovered from the context, which is always present.
- **`preset-save` no longer logs "ok" when it failed** - the success line was outside the
  branch that checked the answer.
- **A settings message no longer resurrects the defaults it left out.** Panels are
  answered one at a time and each carries only its own fields; settings now merge.
- **A removed key can no longer store a preset after it is gone**, and a movement queued
  before a key was dropped is discarded with it rather than moving a head nobody is
  holding a control for.
- **Two encoders no longer share one axis.** The pending delta was a single global, so two
  dials on different axes accumulated into the same counter. It is now per key, and per
  axis within the key: notches turned before an axis change are no longer applied to the
  axis it just moved to.
- **A malformed frame no longer kills the service.** The SDK parses each inbound frame
  before anything else sees it, so a bad frame threw out of the callback that would have
  handled it. An `uncaughtException` handler logs and carries on.
- **The service now stops the helper on exit**, so closing Ulanzi Studio no longer leaves
  `PixyController.exe` holding the camera.
- `property-inspector`: the three identical `inspector.js` are now one `shared.js`, and a
  failure in a panel is shown in the panel instead of leaving it silently inert. Two dead
  `defaultSettings` constants went with them.

### Changed

- **The service is split.** `service/app.js` was one 487-line file holding the SDK
  connection, the child process, the request queue, the per-key state, the uuid parsing,
  the encoder coalescing and every action. It is now `service/app.js` (event routing only)
  plus `service/actions/` (what each press means) and `service/core/` (bridge, camera,
  context, dial, params, ui, shutdown, constants). Nothing is reachable from app.js that a
  test cannot reach without hardware.
- The three property inspectors keep their own markup and share one script.

### Removed

- `property-inspector/*/inspector.js`, superseded by `property-inspector/shared.js`.

### Repository

- **Repository restructured** to match `Ulanzi-neewer-plugin` and
  `Ulanzi-elgato-wave-link-plugin`. The installable `.ulanziPlugin` folder is no
  longer checked in and hand-edited; `plugin/` is now the source and
  `release/` is a build output.

  - `com.ulanzi.ulanzideck.pixy.ulanziPlugin/` (the old hand-maintained bundle) and
    `tools/` were replaced by `plugin/` and `native/`.
  - The Ulanzi SDK is no longer vendored into the bundle. The service imported a
    hand-copied `plugin-common-node` and the property inspectors loaded a hand-copied
    `plugin-common-html` from `property-inspector/libs/`. Both now come from
    `sdk/`, installed by `npm run sdk`, exactly as in the other two plugins.
  - The service moved from `plugin/app.js` to `plugin/service/app.js`. Two paths had
    to follow the move: the SDK import and the `PixyController.exe` location.
  - The property inspectors pointed at `../libs/` and `ulanzideckApi.js`, which only
    existed because the SDK had been vendored one level too deep. They now use
    `../../libs/` and `ulanziApi.js`. The official `ulanziApi.js` is a superset of
    the vendored `ulanzideckApi.js` and covers every method the inspectors call.
  - `PixyController.exe` and `PixyHidProbe.exe` are now compiled by
    `npm run native` (`scripts/build-native.mjs`) from `native/`, instead of being
    compiled by hand with `csc.exe` and copied between folders. The three byte-identical
    copies of each binary are gone. Note that `csc.exe` embeds a timestamp: two builds of
    the same source are not comparable by hash, so the binaries are regenerated rather
    than pinned.
  - The camera diagnostic moved to `native/PixyCameraControlDiagnostic/`. It stays out
    of the build: it is not loaded by the plugin and its README documents how to run
    it when a capability has to be re-verified on hardware.
  - `tools/pixy-test-harness/` was removed: a `WH_KEYBOARD_LL` hook mapping
    `Ctrl+Shift+Win+digit` to controller commands, so PTZ could be exercised before the
    D200X was delivered. It spawned one process per keypress and is superseded by the deck.
    The camera diagnostic and the HID probe were kept, since they are the reproducible
    evidence behind the CONFIRMED entries of PROJECT_CONTEXT.md.
### Fixed during the restructure

- `manifest.json`: the "PTZ Encoder" tooltip contained a corrupted byte sequence
  (`d<FFFD><FFFD>placement`) left over from a Latin-1 read/write of a UTF-8 file.
  It is now `déplacement`.
- The old bundle shipped no `assets/`, although `uspi.css` references
  `../assets/u_*.svg`: the checkbox, radio and tip icons rendered as broken images in
  every property inspector. `npm run build` now ships `assets/` and fails if an
  inspector references a file that is not in the output.