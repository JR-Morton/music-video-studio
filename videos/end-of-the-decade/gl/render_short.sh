#!/bin/bash
# The YouTube Short of "End of the Decade" (verse 3 -> final chorus -> dawn), step 1: clean 4K plates.
# Renders the song window at --scale 2 (3840x2160) with no type (--notype), in segments (reruns skip finished ones).
# short.py then reframes it to 9:16 per shot, sets vertical karaoke and muxes the audio.
#   bash videos/end-of-the-decade/gl/render_short.sh        (log: out/short/render.log)
set -u
cd "$(dirname "$0")/../../../gl/app"
OUT=../../videos/end-of-the-decade/gl/out/short/plates
mkdir -p "$OUT"
SAMPLES=${SAMPLES:-8}; SHUTTER=${SHUTTER:-0.3}; CRF=${CRF:-14}
# song seconds: "So I took hold" (the string plate's first frame) .. a little past the music's end, in the dawn
BOUNDS=(106.683 115.0 123.46 131.0 138.328 146.8 155.32 161.5)
start=$(date +%s)
for ((i=0; i<${#BOUNDS[@]}-1; i++)); do
  a=${BOUNDS[$i]}; b=${BOUNDS[$((i+1))]}
  f=$(printf "%s/seg_%02d.mp4" "$OUT" "$i")
  if [ -s "$f" ]; then echo "skip $f"; continue; fi
  echo "=== segment $i: $a -> $b  ($(date +%H:%M:%S))"
  bun scripts/render.ts video --video end-of-the-decade --notype --scale 2 --from "$a" --to "$b" --samples "$SAMPLES" --shutter "$SHUTTER" \
    --crf "$CRF" --noaudio --out "$f.part.mp4" && mv "$f.part.mp4" "$f"
done
ls "$OUT"/seg_*.mp4 | sed "s|^$OUT/|file '|; s|$|'|" > "$OUT/list.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$OUT/list.txt" -c copy "$OUT/plates_4k.mp4"
echo "DONE $(( $(date +%s) - start ))s -> $OUT/plates_4k.mp4"
