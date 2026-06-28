// Durable workaround for the Bun + electron-builder crash on Windows.
//
// Bun can hand `source-map-support` a CallSite column of -1, which makes the
// bundled `source-map` throw ("Column must be greater than or equal to 0")
// while it is formatting some OTHER error's stack trace — masking the real
// failure and aborting `electron-builder`. We guard `mapSourcePosition` so a
// negative line/column falls back to the raw frame instead of throwing.
//
// Runs from `postinstall`, so it survives reinstalls. Idempotent.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = new URL(
  '../node_modules/source-map-support/source-map-support.js',
  import.meta.url
);

if (!existsSync(target)) {
  // dependency layout can vary; nothing to patch
  process.exit(0);
}

const original = readFileSync(target, 'utf8');

const needle =
  "if (sourceMap && sourceMap.map && typeof sourceMap.map.originalPositionFor === 'function') {";
const replacement =
  "if (sourceMap && sourceMap.map && typeof sourceMap.map.originalPositionFor === 'function'\n      && position && position.line >= 1 && position.column >= 0) {";

if (original.includes(replacement)) {
  console.log('[patch] source-map-support already patched');
  process.exit(0);
}

if (!original.includes(needle)) {
  console.warn('[patch] source-map-support anchor not found; skipping');
  process.exit(0);
}

writeFileSync(target, original.replace(needle, replacement));
console.log('[patch] source-map-support patched for Bun on Windows');
