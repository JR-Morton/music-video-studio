# Writing the song

How to write a song with a coding agent and make it in Suno Studio, ready for the video pipeline. The worked example is
[videos/end-of-the-decade/SONG.md](../videos/end-of-the-decade/SONG.md).

What the pipeline needs from this step:

- `song.wav`: the full mix, as WAV;
- `vocals.wav`: the vocal-only (VOX) stem of the same take, same start and length;
- `lyrics.txt`: the lyrics exactly as sung, one line per sung line.

Suno's features, plans and terms change often. Everything below was true when we made the example (September 2026);
check the current state before you rely on it.

## 1. Write the lyrics together

Work in a plain text file (a `SONG.md` in the video folder) and iterate in versions. The agent drafts, you cut. Ask for
several options for weak lines rather than one "fixed" line.

- **Tell the story in order.** One idea per section: set-up in verse 1, the reaction in verse 2, the turn in verse 3.
  Skip framing devices (a narrator in bed remembering). A listener should be able to follow it on one play.
- **Pick a point of view.** Decide who "I" is and keep it. In the example "I" is a woman who stays sweet and calm
  while describing something alarming. The contrast is the song.
- **Hooks.** The chorus is one line everyone remembers ("by the end of the decade"). Repeat it, and put it on the
  first and last line of the chorus. A short instrumental hook (whistle, music box) is a second earworm, and a strong
  sync point for the video.
- **A rhyme scheme you can name.** Write it down (for example: verses in rhyming couplets, pre-choruses ABAB) and keep
  it. Consistent rhyme makes Suno's phrasing more regular, which helps the lyric timing too.
- **A subtle motif.** One image that runs underneath and is never explained. In the example it's fear as a shadow,
  and strings that nobody mentions until the last verse. Hold the big reveal back: it lands harder late.
- **The last chorus changes.** Keep its melody and first lines, and change the words that matter, so the same hook
  means something new.
- **Short is better.** A 2:30 to 3:00 song is plenty for a video. Count the sung lines: the example's 34 lines (four-line
  verses, one chorus plus a final chorus) came to 2:39 at 113 BPM. If a draft runs long, cut whole sections (a second chorus, a bridge)
  before you shorten lines.
- **A story song, not a statement.** If the song is about anything that resembles real life, describe it the way a
  story would: no real names, no claims of fact, nothing the song "admits". Let the listener decide.

## 2. The style prompt

Describe the sound, never an artist or a song: Suno rejects artist and song names, and you don't want them anyway. Say
what you'd tell a session band: genre, tempo, key, voice, instruments, arrangement moves.

The example's style, for "a cheerful, deadpan video-game end-credits song":

```
end-credits indie pop, bouncy and sunny, 124 BPM, major key, cheerful deadpan female vocal, slightly robotic
pitch-corrected, sweet and polite, eerily calm, clean acoustic guitar strums, plucky synth, music box, glockenspiel,
handclaps, whistled hook, light drums, warm bass, catchy sing-along chorus, haunting ethereal bridge with breathy
sincere vocal, floor toms and choir pad, then a key change into the final chorus
```

Exclude styles: `heavy distortion, screaming, rap, trap hi-hats, dark minor key`

Tips:

- If the vocal is too emotional, add `monotone, restrained`. If it's too robotic, drop `pitch-corrected`.
- Weirdness low (about 30 to 40 %) keeps it pop. Style influence fairly high (about 65 to 75 %) keeps the signature
  instruments.
- Section tags in the lyrics steer the arrangement: `[Verse 3: the band drops out]`, `[Final Chorus: key change up]`.
  Words in parentheses usually become backing vocals: `By the end of the decade (the end of the decade)`.
- The tempo you ask for is a hint. The example asked for 124 BPM and came out at 113.

## 3. A quick first listen (Create, Custom mode)

Before building anything properly, paste the title, style, exclude styles and lyrics into Create → Custom and generate
whole songs. Each generation gives two takes; expect 5 to 15 runs. Listen for, in order:

1. **The chorus melody.** Does the hook stick after one listen? If not, regenerate. Don't plan to fix it later.
2. **The voice.** Is it the character you wrote?
3. **The words.** Every line sung, none rushed or skipped. Suno sometimes changes a word: note it, because
   `lyrics.txt` must match what is sung, not what you wrote.
4. **The structure.** Drops, builds and the ending you asked for, and a clean end (not a fade or a cut-off).

To fix a good take with one bad spot, select the region in the Song Editor and use Replace Section. Once you have a
voice you like, save it as a Persona so regenerations keep the same singer.

## 4. Building it layer by layer in Suno Studio

Suno Studio is Suno's browser multitrack workstation: tracks on a timeline, generated parts that follow the song's
tempo, MIDI, stem splitting, effects and automation, and exports of the full mix, a time range, or every track as a
stem. It gives far more control than whole-song generation. When we used it, it needed the Premier plan and Chrome on
a desktop.

1. **The project.** Set the tempo and time signature (the example: 124 BPM, 4/4, a bright major key). Put rough
   section markers on the timeline.
2. **Chords.** A MIDI track, typed or prompted ("bouncy, happy four-chord progression in D major, I–V–vi–IV for the
   verses"), then turned into audio ("clean acoustic guitar strumming"). This layer sets the mood.
3. **Hook melodies before any vocal.** The instrumental hook (a whistle, a music box counter-melody) as MIDI, then as
   audio. These become some of the video's most visible sync points.
4. **Groove.** Drums and bass with follow-tempo on. Mute them where the song should thin out (the example's verse 3):
   now the arrangement is exact rather than hoped for.
5. **The lead vocal.** Export the instrumental, then use Add Vocals on it with the lyrics and a vocal style, with
   audio strength high so the instrumental is kept. Generate until the chorus sticks. Bring the best take into Studio
   and keep only its vocal on a "Lead vocal" track. A line sung wrong: regenerate just that region.
6. **Backing vocals.** Generate them as a separate track rather than asking for harmony on top of the lead; the
   harmony version tends to drift out of sync.
7. **The big moves.** Drop-outs, key changes (transpose the region), a stripped final chorus that slams back in.
8. **Mix.** Compress and EQ the lead, a little reverb, sidechain the bass to the kick. Name the tracks clearly before
   exporting (`lead_vocal`, `backing_vocals`, `drums`, …).

## 5. Export

From the take you keep:

- **The full mix as WAV** (not MP3). This is `song.wav`.
- **The vocal-only (VOX) stem as WAV**, from the same take or session. This is `vocals.wav`. It makes lyric timing
  much more accurate than separating the vocal from the mix afterwards. From Studio you can export Multitrack instead
  and get every stem.

Both files must start at the same instant and have the same length: the tools assume the stem lines up with the mix
sample for sample.

### Trimming the length

- The cheapest place to cut is the lyric: fewer lines, or a faster tempo.
- To trim a finished take, export a **time range** from Studio, and export the full mix and the VOX stem with the same
  range so they stay aligned. Don't trim one of them in another editor.
- If the video should run on after the music (a silent ending, room for YouTube's end screen), don't pad the WAV:
  set the video's `duration` in `video.js` and pass `--pad-to=SECONDS` to `gl/analysis/studio_data.py`
  (see [PIPELINE.md](PIPELINE.md)). The example's song is 2:39 and its video 2:50.

### lyrics.txt

One line per sung line, exactly as sung. Blank lines and section tags like `[Chorus]` are ignored by the aligner. Put
backing-vocal echoes on their own line. Then continue with [PIPELINE.md](PIPELINE.md).

## 6. Rights and plan notes

- **Only publish songs you have the rights to.** Your own, licensed, or AI-generated under terms that allow it.
- **Generate on a paid plan.** When we made the example, Suno gave commercial rights (YouTube monetisation included)
  only to songs made *while* on a paid plan; a song made on the free plan stayed personal-use even after upgrading.
  Studio needed the top plan. Check the current terms.
- **Keep a record** of the plan you were on when you generated the song (a screenshot of the account page is enough).
- **Export limits.** Paid plans may cap how many takes you can export per month: export only the takes you'll use.
- **Disclose.** When uploading, answer yes to YouTube's "altered or synthetic content" question for an AI-generated
  song.
- **Content ID.** An original AI-generated song can still occasionally get a claim. The publish report's checklist
  covers what to do.
