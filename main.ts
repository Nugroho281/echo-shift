// ECHO SHIFT — a best-game-01 entry (Node 22, standard library only): a time-loop stealth puzzle
// where a thief robs a futuristic museum and teams up with their own past self. The player moves
// through 12 handcrafted story levels (plus an Endless Heist and a Time Trial mode) while a
// recording of their previous loop replays as a ghostly "Echo": two timelines, one thief. Press R
// to reset the timeline and spawn the Echo; stand on pressure plates together, dodge drones, cut
// lasers, open doors, grab the artifact, and escape before the clock runs out. Medals
// (Bronze/Silver/Gold/Perfect Echo), a full title/level-select/settings/pause/results UI, and
// procedural WebAudio complete the game. The game itself is this directory's game/ folder, plain
// static files a desktop browser loads offline (game/index.html and its ES modules, no library and
// no network request), and this program hands it in: it validates the entrypoint and the four
// screenshots listed in shots.json, copies game/ and screenshots/ from beside this file to
// /output, and writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- Validate the entrypoint before anything is copied -------------------------
// The game must open on its entrypoint, and every screenshot the dossier will
// reference must actually exist. Fail loudly (naming the missing file) instead of
// handing the judge a broken bundle.
const entrypoint = join(here, 'game', 'index.html');
if (!existsSync(entrypoint)) {
  throw new Error(`ECHO SHIFT entrypoint is missing: ${entrypoint}`);
}

const shotList: { name: string; query: string }[] = JSON.parse(
  readFileSync(join(here, 'shots.json'), 'utf8'),
);
const missingShots = shotList
  .map((shot) => shot.name)
  .filter((name) => !existsSync(join(here, 'screenshots', name)));
if (missingShots.length > 0) {
  throw new Error(
    `ECHO SHIFT screenshots are missing from screenshots/: ${missingShots.join(', ')}`,
  );
}

// Count files recursively, so the summary below reports what was really handed in.
function countFiles(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    total += statSync(path).isDirectory() ? countFiles(path) : 1;
  }
  return total;
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(
  `ECHO SHIFT: handed in ${countFiles(join(out, 'game'))} game files and ` +
    `${shotList.length} screenshots (${shotList.map((s) => s.name).join(', ')}) -> ${dossierPath}`,
);
