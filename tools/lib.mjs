// lib.mjs: shared helpers for the command-line tools (paths, videos, video.js, processes, args).
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VIDEOS_DIR = join(ROOT, 'videos');

// --key=value / --flag → { key: 'value', flag: true }; bare words → args._
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const a of argv) {
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const i = a.indexOf('='), k = a.slice(2, i < 0 ? undefined : i), v = i < 0 ? true : a.slice(i + 1);
    out[k] = v;
  }
  return out;
}

export function listVideos() {
  if (!existsSync(VIDEOS_DIR)) return [];
  return readdirSync(VIDEOS_DIR).filter(d => !d.startsWith('.') && !d.startsWith('_') && existsSync(join(VIDEOS_DIR, d, 'video.js'))).sort();
}
// Which video a command is about: --video=<slug> (or -v style bare slug), $MV_VIDEO, or the only video there is.
export function pickVideo(args) {
  const list = listVideos(), v = args.video || args.v || process.env.MV_VIDEO || (list.length === 1 ? list[0] : null);
  if (!v) fail(`which video? pass --video=<slug> (have: ${list.join(', ') || 'none; make one with tools/new.mjs'})`);
  if (!list.includes(v)) fail(`no video "${v}" (have: ${list.join(', ') || 'none'}): expected videos/${v}/video.js`);
  return v;
}
// Read video.js outside the browser: it's plain JS that calls MUSIC_VIDEO({...}).
export function loadVideo(slug) {
  const dir = join(VIDEOS_DIR, slug), src = readFileSync(join(dir, 'video.js'), 'utf8');
  let cfg = null; vm.runInNewContext(src, { MUSIC_VIDEO: c => { cfg = c; } }, { filename: `videos/${slug}/video.js` });
  if (!cfg) fail(`videos/${slug}/video.js didn't call MUSIC_VIDEO({...})`);
  const sections = (cfg.sections || []).map((s, i, a) => ({ ...s, end: i + 1 < a.length ? a[i + 1].start : cfg.duration }));
  return { fps: 24, size: [1920, 1080], ...cfg, sections, slug, dir, out: join(dir, 'out'), audioPath: cfg.audio ? join(dir, cfg.audio) : null };
}

export function fail(msg) { console.error('error: ' + msg); process.exit(1); }
export const has = cmd => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
// run a command, streaming its output; resolves on exit 0
export const run = (cmd, a, o = {}) => new Promise((ok, bad) => {
  const p = spawn(cmd, a, { stdio: 'inherit', ...o });
  p.on('error', bad); p.on('close', c => c ? bad(new Error(`${cmd} exited ${c}`)) : ok());
});
// run a command and capture stdout (throws on failure)
export function capture(cmd, a) {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}
export function probe(file) {
  const j = JSON.parse(capture('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const v = j.streams.find(s => s.codec_type === 'video'), a = j.streams.find(s => s.codec_type === 'audio');
  return { duration: +j.format.duration, size: +j.format.size, bitrate: +j.format.bit_rate, video: v, audio: a };
}
export const mmss = t => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
export const fileSize = f => existsSync(f) ? statSync(f).size : 0;
