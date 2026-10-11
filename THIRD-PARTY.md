# Third-party components

The plugin is licensed under the GNU Affero General Public License v3.0 — see [LICENSE](LICENSE).
That covers this project's own code only. The components below are redistributed inside the
built plugin and keep their own licenses; their notices ship with them.

| Component | License | Where it ends up in the built plugin |
|---|---|---|
| [ws](https://github.com/websockets/ws) | MIT | `node_modules/ws/` |
| [plugin-common-node](https://github.com/UlanziTechnology/plugin-common-node) — Ulanzi SDK, main service | Apache-2.0 | `ulanzi-api/` (with its `LICENSE`) |
| [plugin-common-html](https://github.com/UlanziTechnology/plugin-common-html) — Ulanzi SDK, property inspectors | Apache-2.0 | `libs/` (with `libs/LICENSE`) |

## Why this file exists

Apache-2.0 section 4 requires the copyright, patent, trademark and attribution notices to
survive into anything derived from it. The SDK installer used to keep only three files from
each SDK repository and dropped the rest, which silently stripped those notices from the
plugin. The installer now keeps them, `npm run build` copies them into the bundle, and this
file names what is included so nobody has to unpack a .zip to find out.

## Compatibility

Apache-2.0 is one of the licenses the FSF designates as compatible with GPLv3, and AGPLv3
section 13 allows combining a covered work with a GPLv3-licensed work. Bundling the Ulanzi
SDKs and `ws` in an AGPL-3.0 plugin is therefore sound. The reverse would not be: the SDKs
cannot be relicensed under terms that forbid what Apache-2.0 permits.