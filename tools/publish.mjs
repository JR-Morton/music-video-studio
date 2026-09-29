// publish.mjs: build the YouTube upload package for a rendered video.
//
//   node tools/publish.mjs --video=<slug> [--master=<file.mp4>] [--upscale=2160|1440] [--crf=17] [--thumb=<image>]
//                          [--short=a:b] [--short-mode=blur|crop]
//
// --master defaults to videos/<slug>/gl/out/final/<slug>.mp4 (tools/render_final.sh). Writes videos/<slug>/out/youtube/:
//   <slug>.mp4        the master in YouTube's recommended upload format: H.264 High, BT.709, 4:2:0, AAC-LC 48 kHz stereo
//                     384 kb/s, moov atom up front (faststart). Without --upscale the rendered video stream is copied
//                     as is (no second generation); --upscale=2160 re-encodes to 4K (closed GOP of half the frame
//                     rate, 2 B-frames): YouTube then streams VP9/AV1 at a much higher bitrate, which keeps hairlines,
//                     grain and gradients crisp even for 1080p viewers. Recommended for the final upload.
//   thumbnail.jpg     1280×720, under 2 MB: from --thumb, else the master's frame at youtube.thumbnail (video.js)
//   description.txt   description + chapters from the sections (validated against YouTube's rules) + lyrics + credits
//   captions.srt      the lyrics as subtitles (upload under Subtitles, so viewers can turn them on and search finds them)
//   metadata.json     title, description, tags, category (10 = Music) etc., ready for a YouTube Data API upload
//   <slug>_short.mp4  with --short=a:b: a quick vertical 1080×1920 cut (blurred or cropped); for a reframed Short with
//                     its own type, see videos/end-of-the-decade/gl/short.py
//   report.md         what was made, the checks, and the upload checklist
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, parseArgs, pickVideo, loadVideo, run, probe, fail, fileSize } from './lib.mjs';
import { readLyricsJs, toSrt } from './lyrics.mjs';

const args = parseArgs(), slug = pickVideo(args), V = loadVideo(slug), Y = V.youtube || {};
const fps = V.fps || 60, OUT = join(V.out, 'youtube'), rel = p => relative(process.cwd(), p);
mkdirSync(OUT, { recursive: true });
const warn = [], notes = [];
const hhmmss = t => { t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`; };

// ---------- master ----------
const src = String(args.master || join(V.dir, 'gl', 'out', 'final', `${slug}.mp4`));
if (!existsSync(src)) fail(`no rendered video at ${rel(src)}: render it with  bash tools/render_final.sh ${slug}  (or pass --master=<file.mp4>)`);
const master = join(OUT, `${slug}.mp4`);
const up = args.upscale ? +args.upscale : 0;
if (up && ![1440, 2160].includes(up)) fail('--upscale must be 1440 or 2160');
const g = Math.max(1, Math.round(fps / 2));
console.log(`${up ? `encoding the master (upscaled to ${up}p)` : 'packaging the master (video stream copied)'} → ${rel(master)}`);
await run('ffmpeg', ['-y', '-loglevel', 'error', '-stats', '-i', src, '-map', '0:v:0', '-map', '0:a:0',
  ...(up ? ['-vf', `scale=-2:${up}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', String(args.crf || 17), '-pix_fmt', 'yuv420p',
    '-g', String(g), '-keyint_min', String(g), '-sc_threshold', '0', '-bf', '2', '-flags', '+cgop',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709']
    : ['-c:v', 'copy']),
  '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '384k', '-ar', '48000', '-ac', '2',
  '-metadata', `title=${Y.title || V.title}`, '-metadata', `artist=${V.artist || ''}`,
  '-movflags', '+faststart', master]);
if (!existsSync(master)) fail(`no master at ${rel(master)}`);

// ---------- thumbnail ----------
const thumb = join(OUT, 'thumbnail.jpg'), thumbT = Y.thumbnail ?? V.duration / 2;
const thumbIn = args.thumb ? ['-i', String(args.thumb)] : ['-ss', String(thumbT), '-i', src, '-frames:v', '1'];
console.log(args.thumb ? `thumbnail from ${args.thumb}` : `thumbnail: the master's frame at ${thumbT} s (pass --thumb=<image> for a designed one)`);
for (const q of [2, 4, 7, 10]) {
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...thumbIn, '-vf', 'scale=1280:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1280:720', '-q:v', String(q), '-update', '1', thumb]);
  if (fileSize(thumb) < 1.9e6) break;
}
if (!existsSync(thumb)) warn.push('no thumbnail was made');
else if (fileSize(thumb) >= 2e6) warn.push('thumbnail is over 2 MB (YouTube rejects it)');

// ---------- chapters ----------
// YouTube shows chapters when: the first starts at 0:00, there are at least 3, and each is at least 10 s long.
// Sections shorter than 10 s are merged into the one before them (the first into the next).
let ch = V.sections.map(s => ({ t: s.start, end: s.end, name: s.chapter || s.name }));
for (let i = 0; i < ch.length; i++) {
  if (ch.length < 2) break;
  if (ch[i].end - ch[i].t >= 10) continue;
  if (i === 0) { notes.push(`chapter "${ch[0].name}" (${(ch[0].end - ch[0].t).toFixed(1)} s) merged into "${ch[1].name}": chapters must be ≥ 10 s`); ch[1] = { ...ch[1], t: 0, name: ch[0].name + ' / ' + ch[1].name }; ch.splice(0, 1); }
  else { ch[i - 1].end = ch[i].end; notes.push(`chapter "${ch[i].name}" (${(ch[i].end - ch[i].t).toFixed(1)} s) merged into "${ch[i - 1].name}": chapters must be ≥ 10 s`); ch.splice(i, 1); }
  i = -1;
}
if (ch.length) ch[0].t = 0;
const chaptersOk = ch.length >= 3;
if (!chaptersOk) notes.push(`no chapters in the description: YouTube needs at least 3 of ≥ 10 s (have ${ch.length})`);
const chapterTxt = chaptersOk ? ch.map(c => `${hhmmss(c.t)} ${c.name}`).join('\n') : '';

// ---------- captions, description, metadata ----------
const LY = readLyricsJs(join(V.dir, 'lyrics.js'));
if (LY.length) writeFileSync(join(OUT, 'captions.srt'), toSrt(LY));
const lyricsTxt = LY.length && Y.lyricsInDescription !== false ? LY.map(l => l[2]).join('\n') : '';
const desc = [Y.description || '', chapterTxt && 'Chapters\n' + chapterTxt, lyricsTxt && 'Lyrics\n' + lyricsTxt, Y.credits || '',
  'Rendered frame by frame in code (three.js + GLSL).', (Y.hashtags || []).map(h => '#' + h.replace(/^#/, '')).join(' ')].filter(Boolean).join('\n\n').trim() + '\n';
writeFileSync(join(OUT, 'description.txt'), desc);
const title = Y.title || V.title, tags = Y.tags || [];
const tagLen = tags.reduce((n, t) => n + t.length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1);
if (title.length > 100) warn.push(`title is ${title.length} characters (max 100)`);
if (/[<>]/.test(title + desc)) warn.push('title or description contains < or >, which YouTube rejects');
if (desc.length > 5000) warn.push(`description is ${desc.length} characters (max 5000): set youtube.lyricsInDescription = false`);
if (tagLen > 500) warn.push(`tags total ${tagLen} characters (max 500)`);
if (!Y.description) notes.push('youtube.description is empty in video.js');
writeFileSync(join(OUT, 'metadata.json'), JSON.stringify({
  snippet: { title, description: desc, tags, categoryId: '10', defaultLanguage: Y.language || 'en', defaultAudioLanguage: Y.language || 'en' },
  status: { privacyStatus: 'private', selfDeclaredMadeForKids: !!Y.madeForKids, containsSyntheticMedia: Y.containsSyntheticMedia ?? true },
  files: { video: `${slug}.mp4`, thumbnail: 'thumbnail.jpg', captions: LY.length ? 'captions.srt' : null },
}, null, 2));

// ---------- short ----------
let short = null;
if (args.short) {
  const [a, b] = String(args.short).split(':').map(Number);
  if (!(b > a) || b - a > 180) fail('--short=a:b must be a stretch of at most 180 s');
  short = join(OUT, `${slug}_short.mp4`);
  const vf = args['short-mode'] === 'crop'
    ? '[0:v]crop=ih*9/16:ih:(iw-ow)/2:0,scale=1080:1920:flags=lanczos,setsar=1[v]'
    : '[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:4,eq=brightness=-0.06[bg];[b]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]';
  console.log(`cutting the Short (${a}–${b} s, ${args['short-mode'] || 'blur'}) → ${rel(short)}`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(a), '-t', String(b - a), '-i', master, '-filter_complex', vf, '-map', '[v]', '-map', '0:a',
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-g', String(Math.round(fps / 2)), '-bf', '2',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', short]);
}

// ---------- checks + report ----------
const P = probe(master), v = P.video, au = P.audio;
const [fn, fd] = v.r_frame_rate.split('/').map(Number);
const lufs = spawnSync('ffmpeg', ['-nostats', '-i', master, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const I = +(lufs.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0], TP = +(lufs.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop()?.match(/-?[\d.]+/)[0];
const checks = [
  ['container', 'MP4, faststart', true],
  ['video', `${v.codec_name} ${v.profile}, ${v.width}×${v.height}, ${(fn / fd).toFixed(3)} fps, ${v.pix_fmt}, ${v.color_primaries || '?'}`, v.codec_name === 'h264' && v.pix_fmt === 'yuv420p'],
  ['audio', `${au.codec_name} ${au.profile || ''}, ${au.sample_rate} Hz, ${au.channels} ch, ${Math.round(au.bit_rate / 1000)} kb/s`, au.codec_name === 'aac' && +au.sample_rate === 48000],
  ['length', `${P.duration.toFixed(2)} s (song ${V.duration.toFixed(2)} s)`, Math.abs(P.duration - V.duration) < .5],
  ['size', `${(P.size / 1e6).toFixed(1)} MB, ${(P.bitrate / 1e6).toFixed(1)} Mb/s`, true],
  ['loudness', isFinite(I) ? `${I} LUFS integrated, true peak ${TP} dBFS (YouTube plays everything at about −14 LUFS; louder masters are turned down)` : 'n/a', !(TP > -0.5)],
  ['thumbnail', `1280×720 JPEG, ${(fileSize(thumb) / 1e6).toFixed(2)} MB`, fileSize(thumb) < 2e6],
  ['chapters', chaptersOk ? `${ch.length}` : 'none', true],
  ['captions', LY.length ? `${LY.length} lines` : 'no lyrics', true],
];
if (TP > -0.5) warn.push(`audio true peak ${TP} dBFS: it may clip after YouTube's transcode`);
const report = `# YouTube package: ${title}

Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by tools/publish.mjs. Files are in this folder.

| check | result | ok |
|---|---|---|
${checks.map(([k, r, ok]) => `| ${k} | ${r} | ${ok ? '✓' : '✗'} |`).join('\n')}

${warn.length ? '## Warnings\n\n' + warn.map(w => '- ' + w).join('\n') + '\n\n' : ''}${notes.length ? '## Notes\n\n' + notes.map(w => '- ' + w).join('\n') + '\n\n' : ''}## Upload checklist (YouTube Studio → Create → Upload videos)

1. Upload \`${slug}.mp4\`. Leave it **Private** until it has finished processing in HD${args.upscale ? ' and 4K' : ''} (can take an hour).
2. Title: \`${title}\` · Description: paste \`description.txt\` · Thumbnail: \`thumbnail.jpg\`.
3. Audience: made for kids = ${Y.madeForKids ? 'yes' : 'no'}. Under "Show more": category **Music**, tags from metadata.json${LY.length ? ', and Subtitles → upload file → with timing → `captions.srt`' : ''}.
4. Altered or synthetic content: say **yes** if the song or visuals are AI-generated (YouTube requires disclosure for realistic synthetic media).
5. Add an end screen over the last 5–20 s (subscribe + another video): keep that stretch calm enough to sit behind it.
6. Check the song's rights: if it isn't yours, expect a Content ID claim.
${short ? `7. Short: upload \`${slug}_short.mp4\` separately from a phone or YouTube Studio; link it to the full video as "related video".\n` : ''}`;
writeFileSync(join(OUT, 'report.md'), report);
console.log('\n' + report.split('## Upload')[0].trim());
console.log(`\npackage → ${rel(OUT)}/  (see report.md for the upload checklist)`);
