// Concrete Empire — the entrypoint for the make.fun gta6-01 bounty
// (Node 22, standard library only).
//
// The game itself is plain static files in game/ (game/index.html plus its
// ES modules): a desktop browser loads them offline, with no build step and
// no network request. This program hands the game in: it copies game/ and
// screenshots/ next to this file into the output directory and writes the
// dossier.json summary the judge reads, using the vendored make.fun helper.
//
// Run it directly to check the output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The caps mirror the scorer's own limits, so a local run refuses an entry
// the scorer would refuse: at most 4 screenshots of at most 256 KiB each,
// at most 993 files under game/ totalling at most 48 MiB, no game path over
// 1000 bytes, and a 160 KiB text budget for the dossier's text fields.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
