/**
 * Compiles the .NET helpers the plugin ships into plugin/native/:
 *
 *   native/PixyController/Program.cs        -> plugin/native/PixyController.exe
 *   native/PixyHidProbe/Program.cs          -> plugin/native/PixyHidProbe.exe
 *
 * PixyController is the long-lived bridge: the Node service speaks NDJSON to it over
 * stdin/stdout and it drives the camera through DirectShow IAMCameraControl, delegating
 * the proprietary HID writes to PixyHidProbe.exe, which must sit next to it. Both are
 * built from the .NET Framework compiler that ships with Windows, so no toolchain has to
 * be installed: `npm run native` works on a clean machine.
 *
 * The camera diagnostic under native/PixyCameraControlDiagnostic is deliberately NOT
 * built here. It is a one-off research probe, it is not loaded by the plugin, and its
 * README documents how to build it when a capability has to be re-verified on hardware.
 *
 * csc.exe embeds a timestamp, so two builds of the same Program.cs do NOT produce the
 * same bytes. The binaries are therefore not comparable by hash: the guarantee that
 * matters is that plugin/native/ is always regenerated from native/ by this script.
 */

import { mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'plugin', 'native');

const CSC = path.join(
  process.env.WINDIR || 'C:\\Windows',
  'Microsoft.NET',
  'Framework64',
  'v4.0.30319',
  'csc.exe'
);

const TARGETS = [
  { name: 'PixyController', src: path.join(ROOT, 'native', 'PixyController', 'Program.cs') },
  { name: 'PixyHidProbe', src: path.join(ROOT, 'native', 'PixyHidProbe', 'Program.cs') },
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('the PIXY helpers are Windows-only and need the .NET Framework compiler');
  }
  if (!(await exists(CSC))) {
    throw new Error(`C# compiler not found at ${CSC}`);
  }

  await mkdir(OUT, { recursive: true });

  for (const target of TARGETS) {
    if (!(await exists(target.src))) {
      throw new Error(`missing source ${path.relative(ROOT, target.src)}`);
    }
    const out = path.join(OUT, `${target.name}.exe`);
    console.log(`[native] ${target.name}.exe`);
    try {
      await run(CSC, ['/nologo', '/target:exe', `/out:${out}`, target.src], {
        maxBuffer: 1024 * 1024 * 8,
        cwd: path.dirname(target.src),
      });
    } catch (err) {
      console.error(String(err.stdout || '').trim());
      console.error(String(err.stderr || err.message).trim());
      throw new Error(`${target.name} failed to compile`);
    }
  }

  // The bridge resolves PixyHidProbe.exe relative to its own directory; shipping one
  // without the other produces a camera that moves but never changes mode.
  for (const target of TARGETS) {
    const out = path.join(OUT, `${target.name}.exe`);
    const { size } = await stat(out);
    console.log(`[native] ${path.relative(ROOT, out)} (${Math.round(size / 1024)} KB)`);
  }

  console.log(`[native] done on ${os.hostname()} - output in ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(`[native] ${err.message}`);
  process.exitCode = 1;
});