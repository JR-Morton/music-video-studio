# Third-party notices

The code in this repository is MIT-licensed (see [LICENSE](LICENSE)). It includes or adapts the following third-party
work, which keeps its own license.

## The GL engine (`gl/`)

`gl/app` (the three.js engine and offline renderer) and parts of `gl/analysis` began as a port of
[pdoom-video](https://github.com/mexicat/pdoom-video), MIT-licensed. Its license is kept in [gl/LICENSE](gl/LICENSE):

```
MIT License

Copyright (c) 2026 Giacomo Magnanini

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Studio tooling (`tools/`)

Parts of the command-line tooling (song setup, lyric import and captions, the YouTube package) are adapted from
[PDoomVideo](https://github.com/JohnHeibel/PDoomVideo), MIT-licensed:

```
MIT License

Copyright (c) 2026 John Heibel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fonts (`gl/app/public/fonts/`)

- **Unbounded**, **Martian Mono** and **Instrument Serif**: SIL Open Font License 1.1. The license texts and the
  original variable fonts are in `gl/app/public/fonts/src/`; the static instances next to them are generated from those
  by `gl/analysis/make_fonts_studio.py`.
- **EMS** stroke fonts (`stroke/EMS*.svg`): SIL Open Font License 1.1 (declared in each file's metadata).
- **Hershey** stroke fonts (`stroke/Hershey*.svg`): the Hershey Fonts license. Its required acknowledgements are kept
  in each file's metadata.

## Models and packages fetched at run time (not included here)

The Python tools install their dependencies with uv, and some download models on first use: Demucs (MIT), faster-whisper
and Whisper models (MIT), and the torchaudio wav2vec2 / MMS_FA alignment models used by the example's
`videos/end-of-the-decade/gl/align/` scripts (check each model's own license before commercial use; MMS is
CC-BY-NC 4.0). None of them are redistributed in this repository.

## The example song and video

The song "End of the Decade" (audio in `videos/end-of-the-decade/gl/audio/`, lyrics) and the music video made from it
are © 2026 JR Morton, all rights reserved. They're included so you can study and reproduce the example. Please don't
re-upload them.
