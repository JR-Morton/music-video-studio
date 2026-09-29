#!/bin/bash
# tools/render_final.sh <slug>: the final render of videos/<slug>/gl, in segments (a crash or a timeout only costs
# one segment; reruns skip finished ones), then a lossless concat muxed with the song.
#
#   bash tools/render_final.sh <slug>                        -> videos/<slug>/gl/out/final/<slug>.mp4
#   SAMPLES=8 SHUTTER=0.3 CRF=17 SEG=16 bash tools/render_final.sh <slug>     (the defaults)
#
# SAMPLES = sub-frames per frame (motion blur + 4-tap supersampling; a multiple of 4), SHUTTER = shutter angle as a
# fraction of the frame, SEG = segment length in seconds. Frames sit on the 60 fps grid whatever the segment bounds.
# It runs for a while: from an agent shell, start it with  setsid nohup bash tools/render_final.sh <slug> > log 2>&1 &
set -u
SLUG=${1:?usage: bash tools/render_final.sh <slug>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
GL=$ROOT/videos/$SLUG/gl
[ -f "$GL/data/audio.json" ] || { echo "no $GL/data/audio.json: run gl/analysis/studio_data.py first"; exit 1; }
OUT=$GL/out/final
mkdir -p "$OUT"
SAMPLES=${SAMPLES:-8}; SHUTTER=${SHUTTER:-0.3}; CRF=${CRF:-17}; SEG=${SEG:-16}
DUR=$(python3 -c "import json; print(json.load(open('$GL/data/audio.json'))['duration'])")
BOUNDS=($(python3 -c "
d, s = $DUR, $SEG
b = [i * s for i in range(int(d // s) + 1)]
if d - b[-1] > 0.5: b.append(d)
else: b[-1] = d
print(' '.join(str(x) for x in b))"))
cd "$ROOT/gl/app"
start=$(date +%s)
for ((i=0; i<${#BOUNDS[@]}-1; i++)); do
  a=${BOUNDS[$i]}; b=${BOUNDS[$((i+1))]}
  f=$(printf "%s/seg_%02d.mp4" "$OUT" "$i")
  if [ -s "$f" ]; then echo "skip $f"; continue; fi
  echo "=== segment $i: $a -> $b  ($(date +%H:%M:%S))"
  bun scripts/render.ts video --video "$SLUG" --from "$a" --to "$b" --samples "$SAMPLES" --shutter "$SHUTTER" --crf "$CRF" \
    --noaudio --out "$f.part.mp4" && mv "$f.part.mp4" "$f" || { echo "segment $i failed"; exit 1; }
done
ls "$OUT"/seg_*.mp4 | sed "s|^$OUT/|file '|; s|$|'|" > "$OUT/list.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$OUT/list.txt" -i "$GL/audio/song.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k \
  -shortest -movflags +faststart "$OUT/$SLUG.mp4"
echo "DONE $(( $(date +%s) - start ))s -> $OUT/$SLUG.mp4"
