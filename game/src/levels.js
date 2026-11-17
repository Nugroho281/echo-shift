// The 12 handcrafted story levels, plus the procedural Endless Heist room generator.
//
// Map legend (every row is exactly 20 characters, 11 rows):
//   #  wall            .  floor           P  player start
//   A  artifact        X  exit            1/2/3  pressure plate (any actor can press)
//   W  heavy plate (a crate is the only thing heavy enough)
//   G  door, opens when plate 1 is pressed        H  door, opens when plate 2 is pressed
//   J  door, opens when plates 1+2 are pressed    K  door, opens when 1+2+3 are pressed
//   D  door, opens when heavy plate W is pressed
//   s  laser switch (lasers stay off while anything presses it)
//   -  laser beam, horizontal      |  laser beam, vertical
//   t  timed laser, horizontal (on 2 s, off 2 s)   T  timed laser, vertical, opposite phase
//   o  security drone, patrols horizontally        O  security drone, patrols vertically
//   C  movable crate
//   v  glass display case (solid decor: a vitrine with an artifact silhouette inside)
//
// Doors LATCH: once their plates are all pressed at the same moment, a door stays open.
// That is what makes an Echo useful — it can hold a plate forever while you walk away.
//
// Every level names its target artifact (def.artifact { name, kind }); the renderer
// draws a mini model of that artifact, shows its name in the intro and the HUD, and
// the museum gallery screen collects them all.

export const LEVELS = [
  {
    id: 1, name: 'First Steps', par: 15, perfectResets: 0, maxEchoes: 1, timeLimit: 120,
    artifact: { name: 'The Sun Idol', kind: 'idol' },
    intro: 'Move with WASD or arrows. Grab the artifact, then reach the green exit.',
    map: [
      '####################',
      '#P......A..........#',
      '#..................#',
      '#..vv..........vv..#',
      '#..................#',
      '#..vv..........vv..#',
      '#..................#',
      '#..................#',
      '#..vv..........vv..#',
      '#.........X........#',
      '####################',
    ],
  },
  {
    id: 2, name: 'Heavy Lifting', par: 30, perfectResets: 0, maxEchoes: 1, timeLimit: 120,
    artifact: { name: 'The Gilded Vase', kind: 'vase' },
    intro: 'Only a crate is heavy enough for the gold plate. Push it onto the plate to open the door.',
    map: [
      '####################',
      '#P.................#',
      '#......C.....vv....#',
      '#......W.....vv....#',
      '#####D##############',
      '#..................#',
      '#..vv..............#',
      '#..vv..........vv..#',
      '#..................#',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 3, name: 'Meet Your Echo', par: 45, perfectResets: 2, maxEchoes: 2, timeLimit: 120,
    artifact: { name: 'The Jade Mask', kind: 'mask' },
    intro: 'Three plates, one door. Stand on plate 1, press R — your Echo holds it. Do it twice, then hold plate 3 yourself.',
    map: [
      '####################',
      '#P.................#',
      '#..1......2......3.#',
      '#..................#',
      '#..vv..........vv..#',
      '#####K##############',
      '#..................#',
      '#..vv..........vv..#',
      '#..................#',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 4, name: 'Laser Switch', par: 30, perfectResets: 1, maxEchoes: 2, timeLimit: 120,
    artifact: { name: 'The Sapphire Orb', kind: 'orb' },
    intro: 'Lasers burn. Stand on the switch, reset the timeline, and let your Echo hold the switch while you cross.',
    map: [
      '####################',
      '#P........|........#',
      '#.........|...vv...#',
      '#.........|........#',
      '#..vv.....|.....vv.#',
      '#....s....|....A...#',
      '#.........|........#',
      '#.........|...vv...#',
      '#..vv.....|........#',
      '#.........|....X...#',
      '####################',
    ],
  },
  {
    id: 5, name: 'Blink', par: 30, perfectResets: 0, maxEchoes: 1, timeLimit: 120,
    artifact: { name: 'The Chrono Gem', kind: 'gem' },
    intro: 'Timed lasers blink on and off. Cross each row only while its beams are dark.',
    map: [
      '####################',
      '#....A.........X...#',
      '#..................#',
      '#tttttttttttttttttt#',
      '#............vv....#',
      '#............vv....#',
      '#TTTTTTTTTTTTTTTTTT#',
      '#..vv..............#',
      '#..vv..........vv..#',
      '#P.................#',
      '####################',
    ],
  },
  {
    id: 6, name: 'Patrol', par: 30, perfectResets: 0, maxEchoes: 1, timeLimit: 120,
    artifact: { name: 'The Silver Crown', kind: 'crown' },
    intro: 'A drone sweeps the gallery. Its cone is its eyes — cross behind it, never in front of it.',
    map: [
      '####################',
      '#P.................#',
      '#..vv..........vv..#',
      '#..vv..............#',
      '#..............vv..#',
      '#....o.............#',
      '#..................#',
      '#..vv..............#',
      '#.........A....X...#',
      '#..................#',
      '####################',
    ],
  },
  {
    id: 7, name: 'Distraction', par: 45, perfectResets: 1, maxEchoes: 2, timeLimit: 150,
    artifact: { name: 'The Velvet Scroll', kind: 'scroll' },
    intro: 'The drone guards the artifact. Walk into its view, let it spot you, then reset — your Echo will keep it busy on the left while you slip past on the right.',
    map: [
      '####################',
      '#P.................#',
      '#..vv..........vv..#',
      '#..vv..............#',
      '#..............vv..#',
      '#....o.............#',
      '#..................#',
      '#..vv........A.....#',
      '#..vv..............#',
      '#...............X..#',
      '####################',
    ],
  },
  {
    id: 8, name: 'Twin Plates', par: 50, perfectResets: 1, maxEchoes: 2, timeLimit: 150,
    artifact: { name: 'The Twin Daggers', kind: 'dagger' },
    intro: 'Two plates, one door, and a drone between them. Echo the first plate, then time your run to the second.',
    map: [
      '####################',
      '#P..1..............#',
      '#..................#',
      '#..vv......vv......#',
      '#..vv......vv......#',
      '#....o........2....#',
      '#..................#',
      '#..vv..........vv..#',
      '#####J##############',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 9, name: 'Triple Echo', par: 60, perfectResets: 2, maxEchoes: 3, timeLimit: 150,
    artifact: { name: 'The Golden Coin', kind: 'coin' },
    intro: 'Three plates, one door. You will need two Echoes and yourself, all holding at once.',
    map: [
      '####################',
      '#P..1.....2......3.#',
      '#..................#',
      '#..vv..........vv..#',
      '#..vv......vv......#',
      '#..................#',
      '#####K##############',
      '#..................#',
      '#..vv..........vv..#',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 10, name: 'Crate Work', par: 60, perfectResets: 0, maxEchoes: 1, timeLimit: 150,
    artifact: { name: 'The Obsidian Skull', kind: 'skull' },
    intro: 'Push the crate right, then down around the wall, then right again onto the heavy plate.',
    map: [
      '####################',
      '#P.................#',
      '#....C..#####.vv...#',
      '#..................#',
      '#........W.........#',
      '#............vv....#',
      '#####D##############',
      '#..vv..............#',
      '#..vv..........vv..#',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 11, name: 'Grand Gallery', par: 100, perfectResets: 3, maxEchoes: 3, timeLimit: 180,
    artifact: { name: 'The Moon Mirror', kind: 'mirror' },
    intro: 'The grand gallery: a switch, three plates, a drone and a laser wall. Three Echoes, one perfect loop.',
    map: [
      '####################',
      '#P..1.....s.....3..#',
      '#..................#',
      '#..................#',
      '#......o..|........#',
      '#.........|....2...#',
      '#.........|........#',
      '#####K##############',
      '#..vv..........vv..#',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 12, name: 'The Final Heist', par: 100, perfectResets: 3, maxEchoes: 3, timeLimit: 240,
    artifact: { name: 'The Phoenix Egg', kind: 'egg' },
    intro: 'The vault. Three plates, a laser wall, two patrolling drones, and a blinking laser floor. One last perfect loop.',
    map: [
      '####################',
      '#P..1......2.......#',
      '#..............v.o.#',
      '#....o.............#',
      '#.........|........#',
      '#....s....|....3...#',
      '#.........|..vv....#',
      '#.........|..vv....#',
      '#####K##############',
      '#.....tttt..A...X..#',
      '####################',
    ],
  },
];

/** Door wiring: which plate ids must be pressed at once for each door character. */
export const DOOR_NEEDS = {
  G: ['1'],
  H: ['2'],
  J: ['1', '2'],
  K: ['1', '2', '3'],
  D: ['W'],
};

/**
 * Build one Endless Heist room. Rooms are solvable by construction: an open floor, a
 * door whose plate sits in the open (press it and the door latches), artifacts in the
 * open, and hazards that only ever cost an alarm, never a dead end.
 *
 * Difficulty modifiers scale with the room number (brief E): drones patrol faster,
 * timed lasers blink faster, the loop time limit shrinks, and the room's colour theme
 * changes every 3 rooms.
 */
export function generateEndlessRoom(random, room) {
  const rows = [];
  for (let r = 0; r < 11; r += 1) {
    let line = '';
    for (let c = 0; c < 20; c += 1) line += r === 0 || r === 10 || c === 0 || c === 19 ? '#' : '.';
    rows.push(line);
  }
  const set = (c, r, ch) => { rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1); };
  set(1, 1, 'P');
  // A wall with a latched door splits the room; the plate is always on the player's side.
  const doorCol = 9 + Math.floor(random() * 3);
  for (let r = 1; r <= 9; r += 1) if (r !== 5) set(doorCol, r, '#');
  set(doorCol, 5, 'J');
  set(2 + Math.floor(random() * 3), 2 + Math.floor(random() * 2), '1');
  set(doorCol - 2 - Math.floor(random() * 3), 7 + Math.floor(random() * 2), '2');
  // Artifacts: some on each side of the door.
  const artifactCount = 2 + Math.min(3, room);
  const spots = [];
  for (let i = 0; i < artifactCount; i += 1) {
    const left = i % 2 === 0;
    const c = left ? 2 + Math.floor(random() * (doorCol - 4)) : doorCol + 2 + Math.floor(random() * (17 - doorCol));
    const r = 1 + Math.floor(random() * 9);
    if (rows[r][c] === '.') { set(c, r, 'A'); spots.push([c, r]); }
  }
  if (spots.length === 0) set(17, 8, 'A');
  set(17, 1 + Math.floor(random() * 3), 'X');
  // Hazards scale with the room number.
  if (room >= 2) {
    const lc = 4 + Math.floor(random() * 4);
    for (let r = 1; r <= 4; r += 1) if (rows[r][lc] === '.') set(lc, r, '|');
    set(lc - 2, 6, 's');
  }
  if (room >= 3) set(4 + Math.floor(random() * 8), 5 + Math.floor(random() * 3), 'o');
  if (room >= 4) {
    for (let c = 12; c <= 17; c += 1) if (rows[8][c] === '.') set(c, 8, 't');
  }
  if (room >= 5) set(14 + Math.floor(random() * 3), 3, 'O');
  if (room >= 6) set(3 + Math.floor(random() * 3), 8 + Math.floor(random() * 2), 'o');
  // Display cases fill dead floor space (never on the door column, never on a
  // mechanic tile — only plain floor, so the room stays solvable by construction).
  // Never block the two tiles flanking the door: they are the only way through.
  const vitrineCount = 3 + Math.min(3, Math.floor(room / 2));
  for (let i = 0; i < vitrineCount; i += 1) {
    const c = 2 + Math.floor(random() * 16);
    const r = 1 + Math.floor(random() * 9);
    if (r === 5 && Math.abs(c - doorCol) === 1) continue;
    if (rows[r][c] === '.' && c !== doorCol) set(c, r, 'v');
  }
  return {
    id: 100 + room, name: `Heist Room ${room}`, par: 40, perfectResets: 1,
    maxEchoes: 3, timeLimit: Math.max(45, 90 - 5 * (room - 1)),
    droneSpeed: Math.min(3.2, 1.6 + 0.15 * (room - 1)),
    laserPeriod: Math.max(2, 4 - 0.2 * (room - 1)),
    theme: Math.floor((room - 1) / 3) % 4,
    artifact: { name: 'Heist Loot', kind: 'coin' },
    intro: `Room ${room}: grab every artifact, latch the door, reach the exit.`,
    map: rows,
  };
}
