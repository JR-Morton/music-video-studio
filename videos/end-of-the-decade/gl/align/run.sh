#!/bin/bash
# uv run wrapper for the alignment scripts (torch 2.8 / torchaudio 2.8: MMS_FA + forced-align era APIs)
cd "$(dirname "$0")"
exec uv run --no-project --python 3.12 --with "torch==2.8.*" --with "torchaudio==2.8.*" --with numpy --with scipy \
  --with librosa --with soundfile --with soxr --with numba --with matplotlib python "$@"
