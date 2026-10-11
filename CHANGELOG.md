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
- **A "Pan Direction" setting on every control that moves pan** — Pan Left, Pan Right,
  Pan Encoder and the cycling PTZ Encoder. The camera's pan sign is a firmware
  non-conformance (section 50), so the correction was hardcoded — which left anyone who
  prefers the other feel with no way out, and would have broken for everyone the day EMEET
  fixed it. Tilt and zoom conform to the specification and get no such setting: a
  preference that changes nothing is worse than none.
- 126 tests over `npm test`, none of which need a camera, a deck or the helper binary.

### Fixed
- **Licensed under the GNU Affero General Public License v3.0 or later.** `LICENSE` is the
  canonical text from gnu.org; `THIRD-PARTY.md` names what ships inside the bundle under
  its own terms (`ws` MIT, the two Ulanzi SDKs Apache-2.0); both `package.json` files
  declare the SPDX identifier.

- **The third-party notices were being stripped from the built plugin.** `npm run sdk`
  kept three files from each Ulanzi SDK repository and dropped the rest, which silently
  removed their Apache-2.0 `LICENSE` files - and Apache-2.0 section 4 requires those
  notices to travel with derived code. The installer keeps them, the build ships them as
  `ulanzi-api/LICENSE` and `libs/LICENSE`, and a test fails if either list drops them
  again. It had already happened once, silently.

- **The property inspector panels could write settings but never read them.** They never
  asked the host for them — `connect()` sends nothing, and `didReceiveSettings` is the
  answer to a `getSettings()` request, not something the host volunteers. Every panel
  therefore showed its markup defaults every time it was opened, so any setting looked
  like it had reverted. Worse, saving merged the whole form, so touching one field wrote
  the markup default over every field the host had never supplied. This was invisible on
  every other setting because their panel default happened to equal the code default; only
  the pan direction, being new, exposed it.

  The panels now ask for their settings on connect, listen to `paramfromapp` as well, and
  send only the fields the user actually changed. The service asks the host for a key's
  settings when the key appears, and takes `paramfromapp` too.
- **A setting made in a property inspector panel is no longer undone when the key is
  looked at again.** The host answers a panel before it announces the key, and the
  action''s defaults were merged on top of the stored settings on every add: a pan
  direction chosen as "inverted" went back to "normal" every time the user moved to
  another button and came back. Defaults are now applied when an entry is created and
  never again — the only way a default can overwrite a choice without anything
  reporting it.
- **Pan was reversed, on both the buttons and the encoders.** Measured on the camera on
  2026-10-11: `Pan Left` and `Pan Right` moved the head the wrong way, and so did the pan
  encoder and the cycling PTZ encoder, while tilt and zoom were correct. The four symptoms
  were one defect — on this PIXY a positive pan moves the head **left**, while a positive
  tilt moves it up and a positive zoom moves it in. `AXIS_POLARITY` now carries that once,
  in `core/constants.js`, and the two places that drive an axis both obey it.

  This closes the oldest open question in the project: the effective sign of each axis had
  never been established, because every write test until then used a single step the user
  could not see. The reads proved the driver accepted the value, not that the head moved
  the right way.

  `AXIS_POLARITY` is a workaround for the camera, not a preference: Windows documents
  `CameraControl_Pan` as positive = clockwise seen from above, that is, to the **right**,
  and this camera does the opposite. Its tilt conforms, so only pan is negated — as does its
  reported pan range, -150..+150 where the spec requires -180..+180. Whether EMEET intended
  it is not determinable from this machine. **If EMEET ever corrects the sign, the pan entry
  in `AXIS_POLARITY` has to go.**

  A test now asserts that a key and its encoder move the head the same way, for all six
  button/dial pairs — two places carry the conversion, and correcting only one produces
  keys that contradict dials. Verified by mutation.
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

- `wiring.test.js` and `manifest.test.js`: the mistakes syntax checking cannot see - a
  call whose name was never imported, an action hook misspelled behind optional chaining, an
  icon path that does not exist, and an encoder action that claims a device, which stops it
  being droppable on a dial (that regression happened, PROJECT_CONTEXT.md section 37). Both
  files were verified by mutation: each one still fails on the bug it was written for.
- `npm run mock`: a stand-in Ulanzi Studio, so the plugin can be driven without a deck.
  It has no dependency of its own - it speaks RFC 6455 over `node:net`, because the only
  WebSocket package here is `ws` and that is a runtime dependency of the built plugin. It
  replaces the four `mockStudio*.cjs` harnesses that were lost with the old layout, and it
  is itself tested against Node's built-in WebSocket client.

### Removed
- `native/PixyCameraControlDiagnostic/PixyCameraControlDiagnostic.csproj`. It declared
  `net8.0-windows` while the only documented build is the .NET Framework compiler that
  ships with Windows, and the .NET 8 SDK is not installed on the build machine. A project
  file that promises an impossible `dotnet build` is worse than none.
- The stale local branch `refacto`, which had been left at the commit before the README.
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