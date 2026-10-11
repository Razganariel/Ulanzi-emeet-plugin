# EMEET PIXY 4K PTZ — plugin Ulanzi D200X

Drives the pan, tilt, zoom and camera modes of an **EMEET PIXY 4K** webcam from the keys and
the dials of an **Ulanzi D200X**.

The **EMEET Studio** app is **not** required. Pan, tilt and zoom go through the Windows UVC
driver's own `IAMCameraControl` interface; the three camera modes use the camera's
proprietary HID channel. The plugin never touches the video pipeline, so **OBS keeps
capturing the PIXY as a normal webcam**.

Pilote le panoramique, l'inclinaison, le zoom et les modes caméra d'une **EMEET PIXY 4K**
depuis les touches et les molettes d'un **Ulanzi D200X**.

L'application **EMEET Studio** n'est **pas** nécessaire. Le panoramique, l'inclinaison et
le zoom passent par l'interface `IAMCameraControl` du pilote UVC de Windows ; les trois
modes caméra utilisent le canal HID propriétaire de la caméra. Le plugin ne touche jamais
au flux vidéo : **OBS continue de capturer la PIXY comme une webcam normale**.

---

<br>
<table>
  <tr>
    <td align="center"><img src="docs/ulanzi-icon.jpg" height="96" alt="Ulanzi"></td>
    <td align="center"><a href="https://ko-fi.com/razganariel"><img src="docs/Hibou-Ko-fi.png" height="96" alt="Ko-fi"></a></td>
  </tr>
</table>
<br>

---

## 1. Actions

| Action | Key / dial — Touche / molette | Settings — Réglages |
|---|---|---|
| **Pan Left** / **Pan Right** | key: one step — touche : un cran | step, pan direction — pas, sens du panoramique |
| **Tilt Up** / **Tilt Down** | key: one step — touche : un cran | step — pas |
| **Zoom In** / **Zoom Out** | key: one step — touche : un cran | step — pas |
| **Center** | key: back to the head's own defaults — touche : retour aux défauts de la tête | — |
| **PTZ Encoder** | dial: rotate to move, press to change axis — molette : rotation = déplacement, appui = changement d'axe | step, pan direction — pas, sens du panoramique |
| **Pan / Tilt / Zoom Encoder** | dial: rotate to move that axis, press to recentre — molette : rotation = cet axe, appui = recentrer | step, pan direction — pas, sens du panoramique |
| **Start** | key: short press recalls, long press stores — appui court : rappelle, appui long : enregistre | long press — appui long |
| **Preset 1** … **Preset 5** | idem, five separate keys — idem, cinq touches séparées | long press — appui long |
| **Mode Standard** | key: manual mode (HID) — touche : mode manuel (HID) | — |
| **Mode Tracking** | key: auto-follow (HID) — touche : suivi automatique (HID) | — |
| **Mode Privacy** | key: privacy (HID) — touche : confidentiel (HID) | — |

## 2. What the PIXY exposes

Read from the driver, not from documentation — see `PROJECT_CONTEXT.md` §27.

| Control | Available | Min | Max | Step | Default |
|---|---|---:|---:|---:|---:|
| `CameraControl_Pan` | yes (`S_OK`) | -150 | 150 | 1 | 0 |
| `CameraControl_Tilt` | yes (`S_OK`) | -90 | 90 | 1 | 0 |
| `CameraControl_Zoom` | yes (`S_OK`) | 100 | 150 | 1 | 100 |

The driver exposes only the `Manual` mode on these three controls; the standard / tracking /
privacy modes are separate HID commands. Every value sent is a *request*: the helper clamps
it to the range above, so a key pressed at the limit does nothing rather than wrapping.

Le pilote n'expose que le mode `Manual` sur ces trois contrôles ; les modes standard /
suivi / confidentiel sont des commandes HID distinctes. Chaque valeur envoyée est une
*requête* : le helper la borne à la plage ci-dessus, donc une touche pressée en butée ne
fait rien au lieu de revenir à l'autre extrémité.

### Pan direction

This camera's pan sign does not match the documented one. Windows documents
`CameraControl_Pan` as *positive = clockwise seen from above*, which is to the **right**,
and this camera does the opposite — its tilt conforms, so only pan is inverted. The
correction is built in, and `Pan Left` moves the head left.

`Pan Direction` on the pan keys and both dials lets you choose the opposite instead. On the
cycling PTZ encoder it applies while the knob is on pan, and has no effect on the other two
axes.
Tilt and zoom do not have the setting: they follow the specification, so there is nothing
to choose.

Le signe du panoramique de cette caméra ne correspond pas à celui documenté : Windows
documente `CameraControl_Pan` comme *positif = horaire vu du dessus*, soit vers la
**droite**, et cette caméra fait l'inverse. Son tilt est conforme, seul le pan est inversé.
La correction est intégrée : `Pan Gauche` déplace la tête vers la gauche.

`Sens du panoramique` sur les touches Pan et la molette Pan permet de choisir l'inverse.
Tilt et zoom n'ont pas ce réglage : ils suivent la spécification, il n'y a rien à choisir.

**If EMEET ever fixes the sign in a firmware update, delete the `pan` entry in
`AXIS_POLARITY`.** Anyone left on `normal` would then be the only one affected.

## 3. Architecture

```
Ulanzi D200X
      |
      v
Ulanzi Studio
      |
      v
Node.js plugin  (plugin/service/)
      |  one NDJSON line in, one out, over stdin/stdout
      v
PixyController.exe  (persistent, one per session)
      |                    \
      |                     \  PixyHidProbe.exe  -> proprietary HID channel
      v                       (camera modes)
DirectShow IAMCameraControl  ->  UVC driver  ->  EMEET PIXY
   (pan / tilt / zoom / center / presets)
```

Node cannot reach `IAMCameraControl`, so a small .NET helper does it. It is started once and
kept for the whole session: launching a process per dial notch would add tens of milliseconds
to every step. Dial notches are also coalesced over an 80 ms window, so one flick is one
movement of the summed distance rather than one command per notch.

Node ne peut pas accéder à `IAMCameraControl`, d'où ce petit helper .NET. Il est démarré une
seule fois et conservé pour toute la session : lancer un processus par cran de molette
ajouterait plusieurs dizaines de millisecondes à chaque pas. Les crans sont aussi regroupés
sur 80 ms, donc un geste est un seul déplacement de la distance totale.

Presets are stored by the helper in `%APPDATA%\PixyController\presets.json`, not by the
camera — the PIXY exposes no preset storage of its own over UVC. The preset named `start` is
restored automatically every time the helper starts.

Les presets sont stockés par le helper dans `%APPDATA%\PixyController\presets.json`, pas par
la caméra : la PIXY n'expose aucun stockage de presets via UVC. Le preset nommé `start` est
restauré automatiquement à chaque démarrage du helper.

## 4. Requirements

- Windows 10 or later
- Ulanzi Studio **3.3.0** or later (the encoder readout needs it)
- Node.js 20 or later, only to build — not to run the plugin
- A working UVC driver for the PIXY, which Windows installs on its own
- **No** EMEET Studio, **no** replacement driver, **no** libusb

## 5. Install

```powershell
npm run release
```

Then copy `release/com.ulanzi.ulanzideck.pixy.ulanziPlugin` into the Ulanzi Studio plugins
directory, keeping the folder name:

- Windows: `%AppData%\Ulanzi\UlanziDeck\Plugins`
- macOS: `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins`

**Close Ulanzi Studio first.** A running plugin holds `native/PixyController.exe` open for
the whole session — the helper is started on the first action and kept until Studio exits —
so a copy over the top fails on that one file and leaves a half-updated plugin folder. If
that happens, close Studio and copy again; nothing else is locked.

## 6. Development

| Command | What it does |
|---|---|
| `npm run sdk` | Fetches the two official Ulanzi SDK repos into `sdk/` |
| `npm run native` | Compiles `PixyController.exe` and `PixyHidProbe.exe` into `plugin/native/` |
| `npm run build` | Assembles `release/<uuid>.ulanziPlugin/` and checks it |
| `npm test` | 125 tests, no camera, no deck, no helper binary |
| `npm run mock` | A stand-in Ulanzi Studio on port 3906, to drive the plugin without a deck |
| `npm run release` | All three, then the tests |

`npm run build` refuses to produce a bundle that would not start: it validates the UUIDs,
the icon and inspector paths, the version in both manifests, that every file an inspector
references exists in the output, and that every service and inspector module parses.

`npm run native` needs no toolchain — it uses the .NET Framework compiler that ships with
Windows. Note that `csc.exe` embeds a timestamp, so the binaries are **not** comparable by
hash: they are regenerated from `native/` rather than pinned.

To point the service at a different helper, for a debug run:

```powershell
$env:PIXY_CONTROLLER_PATH = 'D:\chemin\vers\PixyController.exe'
```

### Driving the plugin without a deck

`npm run mock` starts a stand-in Ulanzi Studio and waits:

```
mock> key panright
mock> dial panencoder left
mock> place zoomout
mock> frames
```

It has no dependency of its own: it speaks RFC 6455 over `node:net`, because the only
WebSocket package in this project is `ws`, and that is a runtime dependency of the built
plugin rather than something a dev tool should reach into. It announces actions, presses
keys, turns dials, and prints what the plugin sent back — it is not a second Ulanzi Studio.

## 7. Tests

`npm test` runs 125 tests. None of them touch hardware:

- `bridge.test.js` — the line protocol against a fake process: pairing, serialisation,
  partial reads, deadlines, a dead helper, a missing one, quit-then-kill.
- `actions.test.js` — what each press issues, with a camera that only records.
- `app.test.js` — the service driven through the real SDK with frames arriving on a fake
  socket, which is how the host drives it.
- `params.test.js`, `dial.test.js` — the parsing and the axis rules.
- `wiring.test.js` — the mistakes syntax checking cannot see: a call whose name was never
  imported, an action hook misspelled behind optional chaining, a second place spawning the
  camera helper.
- `manifest.test.js` — the deck's own view: icons and inspector paths exist, the uuids are
  well formed, and an encoder action does not claim a device (which would stop it being
  droppable on a dial — that regression happened, see PROJECT_CONTEXT.md §37).
- `mock-studio.test.js` — the stand-in Studio over a real socket, against Node's built-in
  WebSocket client. Both are exercised so neither can be right in the same wrong way.
- `property-inspector.test.js` — the panels, loaded in a VM against a fake DOM and a fake
  host SDK, and driven by the same events the host sends. They were write-only until this
  existed: a panel that never asks the host for its settings cannot show them, and nothing
  else noticed.

## 8. Hardware verification

Everything below was run against a real PIXY. See `PROJECT_CONTEXT.md` for the protocol and
the raw results; it is the reference for anything not listed here.

- **CONFIRMED** — the camera is found on `VID_328F&PID_00C0`; `IAMCameraControl` returns
  `S_OK` for all three controls. The diagnostic was built and run as both 64-bit and 32-bit
  and returned identical values.
- **CONFIRMED** — reversible writes on each axis in isolation, with the value read back and
  restored after each one.
- **CONFIRMED** — PTZ while **OBS Studio 32.2.2** was capturing the PIXY: all three axes
  wrote and read back `S_OK`, the preview stayed up. This is the load-bearing result — the
  plugin does not take the camera away from OBS.
- **CONFIRMED** — step sizes measured on the camera: pan 10 → 20 at the default step, tilt
  -9 → 36 at a step of 45, zoom 150 → 145 at the default step. A step of 45 is therefore
  accepted, not clamped to the values the panels offer.
- **CONFIRMED** — standard / tracking / privacy are written over the HID channel, the HID
  probe reads back 02/01/00.
- **CONFIRMED** — the standard / tracking / privacy HID group readback is *not* an echo of
  the write, so success means the write was accepted and nothing more.

**Not verified:** the refactor in this branch (§47) has been checked by tests only. The
camera has not been driven through it, and in particular the 4-second bridge deadline and
the rebuild after a timeout still need a physical run.

**Non vérifié :** la refactorisation de cette branche (§47) n'a été validée que par tests. La
caméra n'a pas été pilotée à travers, et en particulier le délai de 4 s et la reconstruction
du bridge demandent encore un essai physique.

## 9. Limitations

- **Windows only.** The helper is DirectShow.
- **The encoder readout needs Ulanzi Studio 3.3.0+.** On an older host the axis icon is
  silently skipped; the movement still works.
- **Camera modes are write-only.** The HID readback does not confirm them, so the plugin
  does not display a mode it cannot read back.
- **Presets live in a JSON file**, not in the camera. Clearing `%APPDATA%\PixyController`
  clears them.

## 10. License

**GNU Affero General Public License v3.0 or later** — see [LICENSE](LICENSE).

That covers this project's own code. The components redistributed inside the built plugin —
the Ulanzi SDKs (Apache-2.0) and `ws` (MIT) — keep their own licenses, their notices ship
inside the bundle, and they are listed in [THIRD-PARTY.md](THIRD-PARTY.md).

This is the strongest copyleft of the GNU family: anyone redistributing the plugin, modified
or not, has to pass on the source under the same terms. The Affero clause — the obligation to
offer the corresponding source to users interacting over a network — is what distinguishes it
from GPL-3.0; for a plugin that runs locally on the user's own machine it rarely bites, but
it does apply if the software is ever run as a service.

AGPL-3.0 covers this project only. The Ulanzi SDKs are Apache-2.0, which is compatible in
one direction only: they can be bundled here, but they cannot be relicensed under terms that
forbid what Apache-2.0 permits.