import { defineConfig, normalizePath, type Plugin } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';

// One shared engine (gl/app), one folder per video: videos/<slug>/gl/ holds that video's timeline.ts,
// scenes/*.ts, data/{lyrics,audio}.json and audio/song.*. Pick the video with VIDEO=<slug> (default: end-of-the-decade).
const APP = import.meta.dirname;
const STUDIO = path.resolve(APP, '../..');
const VIDEO = process.env.VIDEO || 'end-of-the-decade';
const videoDir = path.join(STUDIO, 'videos', VIDEO, 'gl');
if (!existsSync(path.join(videoDir, 'timeline.ts'))) throw new Error(`no videos/${VIDEO}/gl/timeline.ts (set VIDEO=<slug>)`);
const assetDirs = ['audio', 'data'];

// Serve the video's audio/ and data/ at /audio/ and /data/, and copy them into builds.
function videoAssets(): Plugin {
  return {
    name: 'video-assets',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (assetDirs.some((dir) => req.url?.startsWith(`/${dir}/`))) {
          req.url = `/@fs/${encodeURI(normalizePath(videoDir))}${req.url}`;
        }
        next();
      });
    },
    writeBundle(options) {
      if (!options.dir) return;
      for (const dir of assetDirs) cpSync(path.join(videoDir, dir), path.join(options.dir, dir), { recursive: true });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [videoAssets()],
  define: { __VIDEO__: JSON.stringify(VIDEO) },
  // STUDIO_NO_HMR=1: no live reload (export renders must not reload mid-run when a file changes)
  server: { port: 5173, strictPort: false, hmr: process.env.STUDIO_NO_HMR ? false : undefined, fs: { allow: [STUDIO] } },
  resolve: {
    alias: { '@video': videoDir, '@engine': path.join(APP, 'src/engine') },
    // scenes live outside app/: resolve their bare imports (three, opentype.js) from app/node_modules
    dedupe: ['three', 'opentype.js'],
  },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});
