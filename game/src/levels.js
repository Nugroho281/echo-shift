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
//
// Doors LATCH: once their plates are all pressed at the same moment, a door stays open.
// That is what makes an Echo useful — it can hold a plate forever while you walk away.

export const LEVELS = [
  {
    id: 1, name: 'First Steps', par: 15, perfectResets: 0, maxEchoes: 1, timeLimit: 120,
    intro: 'Move with WASD or arrows. Grab the artifact, then reach the green exit.',
    map: [
      '####################',
      '#P......A..........#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#.........X........#',
      '####################',
    ],
  },
  {
    id: 2, name: 'Heavy Lifting', par: 30, perfectResets: 0, maxEchoes: 1, timeLimit: 120,
    intro: 'Only a crate is heavy enough for the gold plate. Push it onto the plate to open the door.',
    map: [
      '####################',
      '#P.................#',
      '#......C...........#',
      '#......W...........#',
      '#####D##############',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 3, name: 'Meet Your Echo', par: 35, perfectResets: 1, maxEchoes: 2, timeLimit: 120,
    intro: 'The door needs TWO plates at once. Stand on one, press R to reset the timeline — your Echo keeps holding it while you run to the other.',
    map: [
      '####################',
      '#P.................#',
      '#..1............2..#',
      '#..................#',
      '#..................#',
      '#####J##############',
      '#..................#',
      '#..................#',
      '#..................#',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 4, name: 'Laser Switch', par: 30, perfectResets: 1, maxEchoes: 2, timeLimit: 120,
    intro: 'Lasers burn. Stand on the switch, reset the timeline, and let your Echo hold the switch while you cross.',
    map: [
      '####################',
      '#P........|........#',
      '#.........|........#',
      '#.........|........#',
      '#.........|........#',
      '#....s....|....A...#',
      '#.........|........#',
      '#.........|........#',
      '#.........|........#',
      '#.........|....X...#',
      '####################',
    ],
  },
  {
    id: 5, name: 'Blink', par: 30, perfectResets: 0, maxEchoes: 1, timeLimit: 120,
    intro: 'Timed lasers blink on and off. Cross each row only while its beams are dark.',
    map: [
      '####################',
      '#....A.........X...#',
      '#..................#',
      '#tttttttttttttttttt#',
      '#..................#',
      '#..................#',
      '#TTTTTTTTTTTTTTTTTT#',
      '#..................#',
      '#..................#',
      '#P.................#',
      '####################',
    ],
  },
  {
    id: 6, name: 'Patrol', par: 30, perfectResets: 0, maxEchoes: 1, timeLimit: 120,
    intro: 'A drone sweeps the gallery. Its cone is its eyes — cross behind it, never in front of it.',
    map: [
      '####################',
      '#P.................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#....o.............#',
      '#..................#',
      '#..................#',
      '#.........A....X...#',
      '#..................#',
      '####################',
    ],
  },
  {
    id: 7, name: 'Distraction', par: 45, perfectResets: 1, maxEchoes: 2, timeLimit: 150,
    intro: 'The drone guards the artifact. Walk into its view, let it spot you, then reset — your Echo will keep it busy on the left while you slip past on the right.',
    map: [
      '####################',
      '#P.................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#....o.............#',
      '#..................#',
      '#............A.....#',
      '#..................#',
      '#...............X..#',
      '####################',
    ],
  },
  {
    id: 8, name: 'Twin Plates', par: 50, perfectResets: 1, maxEchoes: 2, timeLimit: 150,
    intro: 'Two plates, one door, and a drone between them. Echo the first plate, then time your run to the second.',
    map: [
      '####################',
      '#P..1..............#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#....o........2....#',
      '#..................#',
      '#..................#',
      '#####J##############',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 9, name: 'Triple Echo', par: 60, perfectResets: 2, maxEchoes: 3, timeLimit: 150,
    intro: 'Three plates, one door. You will need two Echoes and yourself, all holding at once.',
    map: [
      '####################',
      '#P..1.....2......3.#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#####K##############',
      '#..................#',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 10, name: 'Crate Work', par: 60, perfectResets: 0, maxEchoes: 1, timeLimit: 150,
    intro: 'Push the crate right, then down around the wall, then right again onto the heavy plate.',
    map: [
      '####################',
      '#P.................#',
      '#....C..#####......#',
      '#..................#',
      '#........W.........#',
      '#..................#',
      '#####D##############',
      '#..................#',
      '#..................#',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 11, name: 'Grand Gallery', par: 80, perfectResets: 2, maxEchoes: 3, timeLimit: 180,
    intro: 'Everything at once: a plate, a laser switch, a drone on the top row, and a double-plate door.',
    map: [
      '####################',
      '#P..1..o..s........#',
      '#..................#',
      '#..................#',
      '#.........|........#',
      '#.........|....2...#',
      '#.........|........#',
      '#.........|........#',
      '#####J##############',
      '#.........A....X...#',
      '####################',
    ],
  },
  {
    id: 12, name: 'The Final Heist', par: 100, perfectResets: 3, maxEchoes: 3, timeLimit: 240,
    intro: 'The vault. Three plates, a laser wall, a patrolling drone, and a blinking laser floor. One last perfect loop.',
    map: [
      '####################',
      '#P..1......2.......#',
      '#..................#',
      '#....o.............#',
      '#.........|........#',
      '#....s....|....3...#',
      '#.........|........#',
      '#.........|........#',
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
  return {
    id: 100 + room, name: `Heist Room ${room}`, par: 40, perfectResets: 1,
    maxEchoes: 3, timeLimit: 90,
    intro: `Room ${room}: grab every artifact, latch the door, reach the exit.`,
    map: rows,
  };
}
