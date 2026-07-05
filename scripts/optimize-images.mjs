#!/usr/bin/env node
// Optimize documentation images: downscale to a sane max width and convert to WebP.
//
// The docs are UI screenshots captured at 2x Retina density (2880px wide) but never
// display wider than ~960px CSS, so 1920px still covers 2x. Resizing + WebP q82 shrinks
// each screenshot ~78% (verified pixel-crisp on text) with no visible loss.
//
// Usage:
//   node scripts/optimize-images.mjs            # convert every raster source, remove originals
//   node scripts/optimize-images.mjs --keep     # keep the original PNG/JPG alongside the WebP
//   node scripts/optimize-images.mjs --dry       # report what would happen, change nothing
//   node scripts/optimize-images.mjs --width=1600 --quality=80
//
// Re-runnable: a screenshot re-captured as PNG (e.g. by the launch-local-deployment skill)
// is picked up on the next run. Existing .webp files that are already up to date are skipped.

import sharp from 'sharp';
import { readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = 'docs/.vuepress/public/images';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const MAX_WIDTH = Number(opt('width', 1920));
const QUALITY = Number(opt('quality', 82));
const KEEP = flag('keep');
const DRY = flag('dry');
const DIR = path.resolve(ROOT, opt('dir', DEFAULT_DIR));

const SOURCE_EXT = new Set(['.png', '.jpg', '.jpeg']);
const kb = (b) => `${(b / 1024).toFixed(0)}K`;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

async function isUpToDate(src, dest) {
  if (!existsSync(dest)) return false;
  const [s, d] = await Promise.all([stat(src), stat(dest)]);
  return d.mtimeMs >= s.mtimeMs;
}

async function run() {
  if (!existsSync(DIR)) {
    console.error(`Image directory not found: ${DIR}`);
    process.exit(1);
  }

  const sources = await walk(DIR);
  if (sources.length === 0) {
    console.log(`No PNG/JPG sources under ${path.relative(ROOT, DIR)}, nothing to do.`);
    return;
  }

  let converted = 0;
  let skipped = 0;
  let origTotal = 0;
  let newTotal = 0;

  for (const src of sources) {
    const dest = src.replace(/\.(png|jpe?g)$/i, '.webp');
    const rel = path.relative(ROOT, src);

    if (await isUpToDate(src, dest)) {
      skipped++;
      continue;
    }

    const before = (await stat(src)).size;
    origTotal += before;

    if (DRY) {
      console.log(`would convert  ${rel}  (${kb(before)})`);
      converted++;
      continue;
    }

    const buf = await sharp(src)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    await sharp(buf).toFile(dest);

    const after = buf.length;
    newTotal += after;
    const pct = (100 * (1 - after / before)).toFixed(0);
    console.log(`✓ ${path.relative(ROOT, dest)}  ${kb(before)} → ${kb(after)}  (-${pct}%)`);
    converted++;

    if (!KEEP && path.resolve(src) !== path.resolve(dest)) {
      await unlink(src);
    }
  }

  console.log('');
  if (DRY) {
    console.log(`Dry run: ${converted} would be converted, ${skipped} already up to date.`);
  } else {
    const saved = origTotal - newTotal;
    const pct = origTotal ? (100 * (saved / origTotal)).toFixed(0) : 0;
    console.log(
      `Done: ${converted} converted, ${skipped} up to date. ` +
        (converted ? `${kb(origTotal)} → ${kb(newTotal)} (-${pct}%).` : ''),
    );
    if (!KEEP && converted) console.log('Original PNG/JPG sources removed (pass --keep to retain).');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
