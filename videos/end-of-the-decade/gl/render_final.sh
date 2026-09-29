#!/bin/bash
# Final render of "End of the Decade" (videos/end-of-the-decade/gl): segments of the timeline rendered separately (a crash or a
# timeout only costs one segment; reruns skip finished segments), then a lossless concat with the audio.
#   SAMPLES=8 SHUTTER=0.3 bash videos/end-of-the-decade/gl/render_final.sh        (log: out/final/render.log)
set -u
cd "$(dirname "$0")/../../../gl/app"
OUT=../../videos/end-of-the-decade/gl/out/final
mkdir -p "$OUT"
SAMPLES=${SAMPLES:-8}; SHUTTER=${SHUTTER:-0.3}; CRF=${CRF:-17}
# segment bounds (song seconds): plate boundaries, so each segment is one or two plates
BOUNDS=(0 18.593 34.254 66.113 72.485 91.02 106.683 123.46 138.328 155.32 170)
start=$(date +%s)
for ((i=0; i<${#BOUNDS[@]}-1; i++)); do
  a=${BOUNDS[$i]}; b=${BOUNDS[$((i+1))]}
  f=$(printf "%s/seg_%02d.mp4" "$OUT" "$i")
  if [ -s "$f" ]; then echo "skip $f"; continue; fi
  echo "=== segment $i: $a -> $b  ($(date +%H:%M:%S))"
  bun scripts/render.ts video --video end-of-the-decade --from "$a" --to "$b" --samples "$SAMPLES" --shutter "$SHUTTER" --crf "$CRF" --noaudio --out "$f.part.mp4" && mv "$f.part.mp4" "$f"
done
ls "$OUT"/seg_*.mp4 | sed "s|^$OUT/|file '|; s|$|'|" > "$OUT/list.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$OUT/list.txt" -i ../../videos/end-of-the-decade/gl/audio/song.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart "$OUT/end_of_the_decade.mp4"
echo "DONE $(( $(date +%s) - start ))s -> $OUT/end_of_the_decade.mp4"
