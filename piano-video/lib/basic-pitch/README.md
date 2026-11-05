Spotify Basic Pitch 1.0.1 (Apache-2.0, see LICENSE): audio → notes model, used by "歌曲 → 钢琴版".
`../basic-pitch.min.js` = basic-pitch + @tensorflow/tfjs-core/converter/backend-webgl/backend-cpu 3.21 (Apache-2.0),
an esbuild iife exposing `window.BasicPitchLib = {BasicPitch, outputToNotesPoly, addPitchBendsToNoteEvents, noteFramesToTime, tf}`.

Rebuild:
  npm i @spotify/basic-pitch@1.0.1 @tensorflow/tfjs@3.21.0 esbuild
  tfshim.js:   import '@tensorflow/tfjs-core/dist/public/chained_ops/register_all_chained_ops'; export * from '@tensorflow/tfjs-core'; export * from '@tensorflow/tfjs-converter';
               import '@tensorflow/tfjs-backend-webgl'; import '@tensorflow/tfjs-backend-cpu';
  midistub.js: export class Midi {}
  entry.js:    import {BasicPitch,outputToNotesPoly,addPitchBendsToNoteEvents,noteFramesToTime} from '@spotify/basic-pitch/esm/index.js';
               import * as tf from '@tensorflow/tfjs-core';
               window.BasicPitchLib = {BasicPitch,outputToNotesPoly,addPitchBendsToNoteEvents,noteFramesToTime,tf};
  npx esbuild entry.js --bundle --minify --format=iife --alias:@tensorflow/tfjs=./tfshim.js --alias:@tonejs/midi=./midistub.js --outfile=basic-pitch.min.js
Model files: node_modules/@spotify/basic-pitch/model/*
