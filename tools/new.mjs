// new.mjs: set up a music video from a song (or update one when the song arrives).
//
//   node tools/new.mjs <slug> --audio=<song.mp3|wav|url> [--title="…"] [--artist="…"] [--lyrics=<file.lrc|.srt>]
//                      [--bpm=N] [--downbeat=S] [--sections=0,12.5,30] [--karaoke] [--rewrite-config]
//   node tools/new.mjs <slug>                     a project with no song yet (research, storyboard, then --audio later)
//
// It copies (or downloads, with yt-dlp) the song into videos/<slug>/, analyses it (tools/analyze.py: tempo, beat grid,
// sections, envelopes), imports the lyrics, writes video.js, and copies the gl scaffold from videos/_template/gl
// (timeline.ts: one plate per section, each playing the `slate` placeholder until gl/scenes/<section id>.ts exists).
// It never overwrites a file you may have edited: video.js is only rewritten with --rewrite-config (the old one is kept
// as video.js.bak). Re-running with a new --audio re-analyses and prints the new timing to paste into video.js.
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, renameSync, cpSync } from 'node:fs';
import { join, extname, relative, resolve } from 'node:path';
import { ROOT, VIDEOS_DIR, parseArgs, listVideos, run, has, fail, mmss } from './lib.mjs';
import { parseLyrics, writeLyricsJs, readLyricsJs } from './lyrics.mjs';

const args = parseArgs(), slug = args._[0];
if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail('usage: node tools/new.mjs <slug> --audio=<song> (slug: lowercase letters, digits, dashes)');
const dir = join(VIDEOS_DIR, slug), rel = p => relative(ROOT, p);
mkdirSync(dir, { recursive: true });
const wrote = [], kept = [];
const put = (name, txt, force = false) => { const f = join(dir, name); if (existsSync(f) && !force) { kept.push(name); return false; } writeFileSync(f, txt); wrote.push(name); return true; };

// ---------- the song ----------
let audio = null;
if (args.audio) {
  const src = String(args.audio);
  if (/^https?:\/\//.test(src)) {
    if (!has('yt-dlp')) fail('yt-dlp is needed to download audio from a URL');
    console.log('downloading audio with yt-dlp (make sure you have the rights to use it)…');
    await run('yt-dlp', ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '--no-playlist', '-o', join(dir, 'song.%(ext)s'), src]);
    audio = 'song.mp3';
  } else {
    if (!existsSync(src)) fail(`no such file: ${src}`);
    audio = 'song' + extname(src).toLowerCase();
    if (resolve(src) !== join(dir, audio)) copyFileSync(src, join(dir, audio));
  }
} else {
  audio = readdirSync(dir).find(f => /^song\.(mp3|wav|flac|m4a|ogg|opus|aac)$/i.test(f)) || null;
}

// ---------- lyrics ----------
if (args.lyrics) {
  const f = String(args.lyrics); if (!existsSync(f)) fail(`no such file: ${f}`);
  const ext = extname(f).slice(1).toLowerCase(), keep = 'lyrics.' + ext;
  if (resolve(f) !== join(dir, keep)) copyFileSync(f, join(dir, keep));
  if (ext === 'txt') console.log('plain-text lyrics have no timing: time them with  uv run tools/align_lyrics.py --video=' + slug);
  else { writeLyricsJs(join(dir, 'lyrics.js'), parseLyrics(readFileSync(f, 'utf8'), ext), keep); wrote.push('lyrics.js'); }
}
if (!existsSync(join(dir, 'lyrics.js'))) writeLyricsJs(join(dir, 'lyrics.js'), [], null);
const LY = readLyricsJs(join(dir, 'lyrics.js'));

// ---------- analysis ----------
let A = null;
if (audio) {
  if (!has('uv')) fail('uv is needed to run tools/analyze.py (https://docs.astral.sh/uv/)');
  const lyJson = join(dir, 'out', '.lyrics.json'); mkdirSync(join(dir, 'out'), { recursive: true }); writeFileSync(lyJson, JSON.stringify(LY));
  const hints = ['bpm', 'downbeat', 'sections', 'bpb'].filter(k => args[k]).flatMap(k => [`--${k}`, String(args[k])]);
  console.log(`analysing ${audio}…`);
  await run('uv', ['run', '-q', join(ROOT, 'tools', 'analyze.py'), join(dir, audio), '--out', dir, '--lyrics', lyJson, ...hints]);
  A = JSON.parse(readFileSync(join(dir, 'analysis.json'), 'utf8'));
  wrote.push('analysis.js/.json/.md/.png');
} else if (!existsSync(join(dir, 'analysis.js'))) {
  writeFileSync(join(dir, 'analysis.js'), '// no song yet: run  node tools/new.mjs ' + slug + ' --audio=<song>\nvar ANALYSIS = null;\n');
}

// ---------- video.js ----------
const title = args.title || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), artist = args.artist || '';
const sections = A ? A.sections.map(s => ({ id: s.id, name: s.name, start: s.start, label: s.label })) : [{ id: 'intro', name: 'Intro', start: 0, label: 'A' }];
const q = s => JSON.stringify(s);
const timing = A
  ? `  duration: ${A.duration},          // seconds: the video is as long as the song\n  // beat grid from tools/analyze.py (see analysis.md). offset = time of the first downbeat (bar 0, beat 1)\n  bpm: ${A.bpm}, offset: ${A.offset}, beatsPerBar: ${A.beatsPerBar}, beatGrid: ${q(A.grid.constant ? 'constant' : 'tracked')},`
  : `  duration: 60,                // placeholder until the song exists\n  bpm: 120, offset: 0, beatsPerBar: 4, beatGrid: 'constant',`;
const secLines = sections.map(s => `    { id: ${(q(s.id) + ',').padEnd(13)} name: ${(q(s.name) + ',').padEnd(13)} start: ${(s.start + ',').padEnd(9)} label: ${q(s.label)} },`).join('\n');
const videoJs = `// video.js: this video's settings. The tools read it; gl/analysis/studio_data.py takes the sections from it.
MUSIC_VIDEO({
  title: ${q(title)},
  artist: ${q(artist)},
  audio: ${audio ? q(audio) : 'null'},
${timing}
  fps: 60,
  // The song's sections, in order. Each one is a plate: gl/timeline.ts plays gl/scenes/<id>.ts from its start. Rename,
  // merge, split or move them freely (starts are song seconds; snap them to downbeats with the bar table in
  // analysis.md), then rebuild the engine data (gl/analysis/studio_data.py). label = which sections sound alike.
  sections: [
${secLines}
  ],
  youtube: {                   // tools/publish.mjs builds the upload package from this
    title: ${q(artist ? `${artist} - ${title} (Official Music Video)` : `${title} (Official Music Video)`)},
    description: \`\`,
    tags: [],
    credits: '',
    thumbnail: ${A ? (A.sections.slice().sort((a, b) => b.energy - a.energy)[0].start + 2).toFixed(2) : 5},  // song time of a thumbnail frame (publish.mjs grabs it from the master if no --thumb)
    madeForKids: false,
  },
});
`;
if (existsSync(join(dir, 'video.js')) && args['rewrite-config']) { renameSync(join(dir, 'video.js'), join(dir, 'video.js.bak')); console.log('kept the old config as video.js.bak'); }
put('video.js', videoJs);
if (A && kept.includes('video.js')) {
  console.log(`\nvideo.js exists, so it wasn't touched. The new analysis says (paste what you want, or re-run with --rewrite-config):`);
  console.log(timing.split('\n').filter(l => !l.trim().startsWith('//')).join('\n'));
  console.log('  sections: [\n' + secLines + '\n  ],');
}

// ---------- the gl scaffold ----------
const lyricsIn = (a, b) => LY.filter(l => l[0] >= a - .05 && l[0] < b - .05);
const tpl = join(VIDEOS_DIR, '_template', 'gl'), gl = join(dir, 'gl');
if (!existsSync(join(gl, 'timeline.ts'))) {
  cpSync(tpl, gl, { recursive: true, force: false, errorOnExist: false });
  wrote.push('gl/ (from videos/_template/gl)');
} else kept.push('gl/');
const secRows = sections.map((s, i) => {
  const end = i + 1 < sections.length ? sections[i + 1].start : (A ? A.duration : 60), b = A ? A.sections[i] : null;
  return `| \`${s.id}\` | ${s.name} | ${mmss(s.start)} (${s.start.toFixed(2)} s) | ${(end - s.start).toFixed(1)} s | ${b ? `${b.bar}–${b.bar + b.bars - 1}` : '—'} | ${b ? b.energy.toFixed(2) : '—'} | ${lyricsIn(s.start, end).map(l => l[2]).join(' / ') || '—'} |`;
}).join('\n');
const tr = join(gl, 'TREATMENT.md');
if (existsSync(tr) && readFileSync(tr, 'utf8').includes('{{SECTIONS}}')) {
  writeFileSync(tr, readFileSync(tr, 'utf8').replaceAll('{{TITLE}}', title + (artist ? ` — ${artist}` : ''))
    .replace('{{SONG}}', A ? `${A.bpm.toFixed(1)} BPM, ${mmss(A.duration)}, bar = ${(4 * 60 / A.bpm).toFixed(3)} s, first downbeat ${A.offset.toFixed(3)} s (analysis.md / analysis.png)` : 'no song yet')
    .replace('{{SECTIONS}}', `| id | name | start | length | bars | energy | lyrics |\n|---|---|---|---|---|---|---|\n${secRows}`));
}

// ---------- done ----------
const list = listVideos();
console.log(`\nvideos/${slug}: wrote ${wrote.join(', ') || 'nothing new'}${kept.length ? `; kept existing ${kept.join(', ')}` : ''}`);
if (A) console.log(`song: ${mmss(A.duration)}, ${A.bpm.toFixed(2)} BPM, first downbeat ${A.offset.toFixed(3)} s, ${A.sections.length} sections, ${LY.length} lyric lines`);
console.log(`next (docs/PIPELINE.md):
  stems:    uv run tools/stems.py --video=${slug} [--vocal=<clean vocal stem.wav>]
  lyrics:   uv run tools/align_lyrics.py --video=${slug} --text=videos/${slug}/lyrics.txt --audio=videos/${slug}/stems/vocals.wav
  data:     uv run gl/analysis/studio_data.py --video=${slug} --stems=videos/${slug}/stems/htdemucs_ft
  preview:  cd gl/app && bun install && VIDEO=${slug} bunx vite          (videos: ${list.join(', ')})`);
