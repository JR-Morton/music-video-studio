// video.js: this video's settings. The tools read it; gl/analysis/studio_data.py takes the sections from it.
MUSIC_VIDEO({
  title: "End of the Decade",
  artist: "",
  audio: "gl/audio/song.wav",   // the Suno master, padded with silence to 170 s (the sunrise outlasts the song)
  duration: 170,            // seconds. The song is 158.9 s; the video holds on the silent sunrise to 170 s (end screen). Audio is padded with silence.
  // beat grid from tools/analyze.py (see analysis.md). offset = time of the first downbeat (bar 0, beat 1)
  bpm: 112.997, offset: 0.2706, beatsPerBar: 4, beatGrid: "constant",
  fps: 60,
  // The song's sections, in order. Each one is a plate: gl/timeline.ts maps section ids to gl/scenes/<plate>.ts.
  // (starts are song seconds; snap them to bars with the table in analysis.md). label = which sections sound alike.
  // Real structure (lyrics + the instrumental's energy): no intro, the voice starts on bar 0. Chorus bar 16 and
  // verse 3 bar 50 open on a near-silent stop bar; the final chorus starts stripped (bass out, bars 58-64) and the
  // full band comes back at bar 65.
  sections: [
    { id: "verse1",     name: "Verse 1",                  start: 0,        label: "A" },
    { id: "pre1",       name: "Pre-chorus 1",             start: 17.262,   label: "B" },
    { id: "chorus1",    name: "Chorus",                   start: 34.254,   label: "C" },
    { id: "hook",       name: "Hook",                     start: 66.113,   label: "D" },
    { id: "verse2",     name: "Verse 2",                  start: 72.485,   label: "A" },
    { id: "pre2",       name: "Pre-chorus 2",             start: 89.477,   label: "B" },
    { id: "verse3",     name: "Verse 3",                  start: 106.469,  label: "E" },
    { id: "final",      name: "Final chorus",             start: 123.46,   label: "C" },
    { id: "finalfull",  name: "Final chorus (full band)", start: 138.328,  label: "C" },
    { id: "ending",     name: "Ending (sunrise, silent)", start: 155.32,   label: "F" },
  ],
  youtube: {                   // tools/publish.mjs builds the upload package from this
    title: "End of the Decade (Official Music Video)",
    description: ``,
    tags: [],
    credits: '',
    thumbnail: 141.1,   // song time of a thumbnail frame (tools/publish.mjs grabs it from the master if no --thumb)
    madeForKids: false,
  },
});
