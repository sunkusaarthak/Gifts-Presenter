import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist-electron', { recursive: true });

await Promise.all([
  esbuild.build({
    entryPoints: ['electron/main.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist-electron/main.cjs',
    external: ['electron'],
    sourcemap: true,
  }),
  esbuild.build({
    entryPoints: ['electron/preload.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist-electron/preload.cjs',
    external: ['electron'],
    sourcemap: true,
  }),
]);

console.log('Built Electron main & preload bundles.');

