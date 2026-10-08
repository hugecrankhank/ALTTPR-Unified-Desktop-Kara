// Kara's branch (alttpr.gwaa.kiwi), generated here: her generator runs in the
// browser (worker.js), and the seed's patch goes onto her base ROM, built from
// the player's own Japanese 1.0 ROM, the same way her generator builds its
// .sfc files.

import { md5 } from '../md5.js';
import { applyBps } from '../bps.js';
import { SETTINGS, PRESETS, defaults, normalize, presetSettings, toArgs, trackerFor, trackerGaps,
  encodeSettings, decodeSettings } from './settings.js';

export { SETTINGS, PRESETS, defaults, normalize, presetSettings, toArgs, trackerFor, trackerGaps };

// Which build made a seed: her generator's commit and the Python it ran on.
// A link made with another build may give a different game for the same seed.
export const KARA_COMMIT = 'c0c177dfed071fa692766e7f43be51adf87ea4b2';
export const KARA_ID = 'gk-' + KARA_COMMIT.slice(0, 7) + '-py0.27.7';
export const KARA_TRIES = 5;   // her server's tries per seed

// ── the generator, one worker per seed ───────────────────────────────────────
let warm = null;      // a started worker waiting for a seed: { w, ready, stage }
let current = null;   // { w, reject } while a seed is being made

function startWorker() {
  const w = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  const box = { w, stage: 'Starting…', onStage: null };
  box.ready = new Promise((resolve, reject) => {
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'stage') { box.stage = m.text; if (box.onStage) box.onStage(m.text); }
      else if (m.type === 'ready') resolve();
      else if (m.type === 'error') reject(new Error(m.error));
    };
    w.onerror = (e) => reject(new Error(e.message || 'Kara\'s generator failed to start'));
  });
  box.ready.catch(() => {});
  return box;
}

/** Start Python in the background so the next Generate is quicker. */
export function prewarm() {
  if (!warm && !current) warm = startWorker();
}
export function discardWarm() {
  if (warm) { warm.w.terminate(); warm = null; }
}

/** Stop the seed being made (its promise rejects with { cancelled: true }). */
export function cancel() {
  if (!current) return false;
  current.w.terminate();
  const e = new Error('Stopped.');
  e.cancelled = true;
  current.reject(e);
  current = null;
  return true;
}

/** Make one seed: { seed, patch, spoiler, ms }. onStage(text) reports progress. */
export function generate(seed, settings, onStage) {
  const box = warm || startWorker();
  warm = null;
  return new Promise((resolve, reject) => {
    current = { w: box.w, reject };
    const done = (fn, v) => { if (current && current.w === box.w) { current = null; box.w.terminate(); fn(v); } };
    box.onStage = onStage;
    if (onStage) onStage(box.stage);
    box.ready.then(() => {
      box.w.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'stage') { if (onStage) onStage(m.text); }
        else if (m.type === 'done') done(resolve, m);
        else if (m.type === 'error') done(reject, new Error(m.error));
      };
      box.w.onerror = (e) => done(reject, new Error(e.message || 'Kara\'s generator stopped'));
      box.w.postMessage({ type: 'gen', seed, args: toArgs(settings) });
    }, (e) => done(reject, e));
  });
}

// ── the ROM ──────────────────────────────────────────────────────────────────
const BASE_MD5 = 'd80446af9eeb1726d2b6c1303bec1226';   // her base ROM (Rom.py RANDOMIZERBASEHASH)
let basePatch = null;

/** Her base ROM from the Japanese 1.0 ROM: { rom, ok }. */
export async function baseRom(jp) {
  if (!basePatch) {
    const r = await fetch(new URL('alttpr-python/data/base2current.bps', import.meta.url));
    if (!r.ok) throw new Error(`Couldn't load Kara's base patch (${r.status}).`);
    basePatch = new Uint8Array(await r.arrayBuffer());
  }
  const rom = applyBps(jp.subarray(0, 0x100000), basePatch);
  return { rom, ok: md5(rom) === BASE_MD5 };
}

/** The seed's patch onto a copy of the base ROM (2 MB, or more if it needs it). */
export function patchRom(base, patch) {
  let size = Math.max(0x200000, base.length);
  for (const [off, bytes] of Object.entries(patch)) size = Math.max(size, Number(off) + bytes.length);
  const rom = new Uint8Array(size);
  rom.set(base);
  for (const [off, bytes] of Object.entries(patch)) rom.set(bytes, Number(off));
  return rom;
}

// ── links ────────────────────────────────────────────────────────────────────
export function buildLink(seed, settings, race) {
  const u = new URL(location.pathname, location.origin);
  u.searchParams.set('gen', 'kara');
  u.searchParams.set('seed', String(seed));
  const k = encodeSettings(settings);
  if (k) u.searchParams.set('k', k);
  if (race) u.searchParams.set('race', '1');
  u.searchParams.set('v', KARA_ID);
  return u.toString();
}

/** null, or { seed, settings, race, otherBuild, problems } */
export function readLink(search) {
  const q = new URLSearchParams(search);
  if (q.get('gen') !== 'kara') return null;
  const seedText = q.get('seed');
  if (seedText === null || !/^\d{1,10}$/.test(seedText)) return null;
  const { settings, unknown } = decodeSettings(q.get('k') || '');
  const v = q.get('v');
  return { seed: Number(seedText) % 4294967296, settings, race: q.get('race') === '1', otherBuild: !!v && v !== KARA_ID, problems: unknown };
}

/** Short words for what's not default, for the shared-seed banner. */
export function describe(settings) {
  const preset = PRESETS.find((x) => x.id === presetOf(settings));
  if (preset) return [`Preset: ${preset.label}`];
  const s = normalize(settings), d = defaults();
  const parts = [];
  for (const def of SETTINGS) {
    if (s[def.key] === d[def.key]) continue;
    const v = def.values.find((x) => x[0] === s[def.key]);
    parts.push(`${def.label}: ${v ? v[1] : s[def.key]}`);
  }
  return parts.length ? parts : ['Kara\'s default settings'];
}

/** The preset these settings match, if any. */
export function presetOf(settings) {
  const s = JSON.stringify(normalize(settings));
  const p = PRESETS.find((x) => JSON.stringify(presetSettings(x.id)) === s);
  return p ? p.id : '';
}
