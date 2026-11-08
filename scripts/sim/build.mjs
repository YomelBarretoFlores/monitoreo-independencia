#!/usr/bin/env node
// Builds the Palcacocha simulator with the teardown kit and copies it into the app:
//   public/simulador/palcacocha.html  the interactive page (three.js, fonts and code inlined)
//   public/simulador/elevation.glb    the valley's elevation grid, fetched by the page
//
// The kit is a local Claude Code skill (not an npm dependency), so the generated files are committed and the
// app's own build does not need it. Run after changing sims/palcacocha-*:
//   npm run build:sim                       (TEARDOWN_DIR defaults to ~/.claude/skills/teardown)
//   npm run build:sim -- --film             also builds the film page into teardown-out/dist for recording
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const kit = process.env.TEARDOWN_DIR || join(homedir(), '.claude/skills/teardown');
const builder = join(kit, 'sims/build.mjs');
if (!existsSync(builder)) {
  console.error(`teardown kit not found at ${kit}; set TEARDOWN_DIR`);
  process.exit(1);
}

const build = (entry, out) =>
  execFileSync(process.execPath, [builder, join(root, 'sims', entry)], {
    cwd: root,
    env: {...process.env, TEARDOWN_OUT: out},
    stdio: 'inherit',
  });

const scratch = mkdtempSync(join(tmpdir(), 'palcacocha-'));
try {
  build('palcacocha-live', scratch);
  const dist = join(scratch, 'dist');
  const dest = join(root, 'public/simulador');
  mkdirSync(dest, {recursive: true});
  const html = readFileSync(join(dist, 'palcacocha-live.html'), 'utf8')
    .replace('<html lang="en">', '<html lang="es">')
    .replace(/<title>[^<]*<\/title>/, '<title>Aluvión de la laguna Palcacocha · simulación 3D</title>')
    .replace(
      '<meta name="viewport"',
      '<meta name="description" content="Simulación ilustrativa en 3D de un aluvión de la laguna Palcacocha hacia Huaraz e Independencia, con cifras de estudios publicados.">\n<meta name="viewport"',
    );
  writeFileSync(join(dest, 'palcacocha.html'), html);
  copyFileSync(join(dist, 'elevation.glb'), join(dest, 'elevation.glb'));
  console.log(`public/simulador/palcacocha.html  ${(html.length / 1024).toFixed(0)} KB`);
} finally {
  rmSync(scratch, {recursive: true, force: true});
}

if (process.argv.includes('--film')) build('palcacocha-film', join(root, 'teardown-out'));
