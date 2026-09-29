# Song analysis: song.wav

- **Length** 2:38.90 (158.9 s)
- **Tempo** 113.00 BPM, 4/4. Beat = 0.5310 s, bar = 2.1240 s
- **First downbeat** (bar 0, beat 0) at 0.271 s
- **Grid** constant tempo: the grid is exact (beatGrid: "constant") (median beat error 4.6 ms)

### Tempo check

Beat trackers often lock onto the wrong metrical level (half, double, 2/3 or 3/2 of the real tempo). This is how many
strong kicks each alternative grid catches. Faster grids always catch more; pick the level where the song *feels* like
it bounces, and re-run with `--bpm` if it isn't the one above.

| ratio | BPM | kicks on a beat |
|---|---|---|
| 0.5 | 56.5 | 24% |
| 0.667 | 75.33 | 20% |
| 1 | 113.0 | 43% |
| 1.5 | 169.49 | 29% |

## Sections (suggested; rename and move them in video.js)

| # | id | name | start | bar | bars | similar to | energy |
|---|---|---|---|---|---|---|---|
| 0 | `intro` | Intro | 0:00.00 (0.00 s) | 0 | 8 | A | ▄▄▄ 0.55 |
| 1 | `verse1` | Verse 1 | 0:17.26 (17.26 s) | 8 | 8 | B | ▅▅▅ 0.60 |
| 2 | `verse2` | Verse 2 | 0:34.25 (34.25 s) | 16 | 15 | C | ▆▆▆ 0.71 |
| 3 | `chorus` | Chorus | 1:06.11 (66.11 s) | 31 | 3 | D | ▇▇▇ 0.78 |
| 4 | `verse3` | Verse 3 | 1:12.48 (72.48 s) | 34 | 8 | E | ▆▆▆ 0.75 |
| 5 | `verse4` | Verse 4 | 1:29.48 (89.48 s) | 42 | 8 | F | ▆▆▆ 0.70 |
| 6 | `bridge1` | Bridge 1 | 1:46.47 (106.47 s) | 50 | 8 | G | ▆▆▆ 0.67 |
| 7 | `bridge2` | Bridge 2 | 2:03.46 (123.46 s) | 58 | 7 | H | ▃▃▃ 0.44 |
| 8 | `bridge3` | Bridge 3 | 2:18.33 (138.33 s) | 65 | 8 | I | ▆▆▆ 0.67 |
| 9 | `outro` | Outro | 2:35.32 (155.32 s) | 73 | 2 | J |     0.00 |

## Energy across the song (one character per bar)

```
bar   0   ▅▅▅▄▅▆▆▅▆▅▆▆▄▄▃▃▇▆▆▆▆▇▇▇▇▇▆▅▅▄▆▇▆▆▆▆▆▆▆▇▆▆▇▆▆▆▆▅▄▅▇▆▇▇▇▄▂▂▃▄▁▄▅
bar  64  ▄▇▇▇▇▆▅▄▁  
```

Loud bars are the moments to spend your biggest visuals on. Hits (`hit(t, 'low')`) follow the actual kick drum;
`pulse(t)` follows the beat grid. See MUSIC_VIDEO_GUIDE.md.
