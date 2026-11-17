// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Neon glow, particles, timeline bar, the museum look (vitrines, spotlights,
// vignette), the hooded thief, ghost Echoes with trails, and real drones live here;
// rules live in world.js.
import { COLS, FIELD, FONT, PALETTE, ROWS, TILE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_SELECT = 'select';
export const SCREEN_SETTINGS = 'settings';
export const SCREEN_HELP = 'help';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_RESULTS = 'results';
export const SCREEN_GALLERY = 'gallery';

const MEDAL_COLORS = {
  'Perfect Echo': '#ff5df2',
  Gold: '#ffc94d',
  Silver: '#cfd6e4',
  Bronze: '#d08a4d',
  Failed: '#ff4d6d',
};

const ECHO_COLORS = ['#7df9ff', '#ff5df2', '#ffc94d'];

/** Room colour themes (Endless Heist changes theme every 3 rooms; story uses 0). */
const THEMES = [
  { name: 'Azure Gallery', floorA: '#101020', floorB: '#0d0d1c', wall: '#1d1d38', wallEdge: '#3d3d7a' },
  { name: 'Violet Vault', floorA: '#160f24', floorB: '#120c1e', wall: '#241a38', wallEdge: '#5a3d8a' },
  { name: 'Gilded Hall', floorA: '#1c160c', floorB: '#171206', wall: '#33270f', wallEdge: '#8a6a2a' },
  { name: 'Emerald Wing', floorA: '#0c1a14', floorB: '#0a1510', wall: '#143324', wallEdge: '#2a6a4a' },
];

export const ARTIFACT_KINDS = ['idol', 'vase', 'mask', 'orb', 'gem', 'crown', 'scroll', 'dagger', 'coin', 'skull', 'mirror', 'egg'];
const ARTIFACT_COLORS = {
  idol: '#ffd94d', vase: '#ff9d5c', mask: '#5ce8a0', orb: '#5ca8ff',
  gem: '#7df9ff', crown: '#ffd94d', scroll: '#e8d5a8', dagger: '#cfd6e4',
  coin: '#ffc94d', skull: '#e8e8e8', mirror: '#bfe8ff', egg: '#ff8a5c',
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Deterministic 0..1 hash for a tile (floor speckle placement). */
function hash2(c, r, seed) {
  const h = Math.sin(c * 127.1 + r * 311.7 + seed * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Alert colour: purple (calm) -> yellow (suspicious) -> red (about to alarm). */
function alertRGB(a) {
  if (a < 0.5) {
    const t = a * 2;
    return [Math.round(180 + 75 * t), Math.round(107 + 94 * t), Math.round(255 - 178 * t)];
  }
  const t = (a - 0.5) * 2;
  return [255, Math.round(201 - 155 * t), Math.round(77 + 22 * t)];
}

function rgba(rgb, a) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  const particles = [];
  const bursts = [];
  const ripples = [];
  const echoTrails = new Map();
  let lastNow = 0;
  let lastDrawNow = 0;
  let walkPhase = 0;
  let lastPlayerX = 0;
  let lastPlayerY = 0;
  let lastLevelId = -1;
  let lastScreen = '';
  let fadeUntil = 0;
  let shakeUntil = 0;
  let shakeMag = 0;

  for (let i = 0; i < 70; i += 1) {
    particles.push({
      x: Math.random() * FIELD.width, y: Math.random() * FIELD.height,
      vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 10,
      r: 1 + Math.random() * 2, a: 0.15 + Math.random() * 0.35,
      c: Math.random() < 0.6 ? '#22e6ff' : Math.random() < 0.5 ? '#b46bff' : '#ffc94d',
    });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function fmtTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  function updateAmbient(dt, now) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y < -4) { p.y = FIELD.height + 4; p.x = Math.random() * FIELD.width; }
      if (p.x < -4) p.x = FIELD.width + 4;
      if (p.x > FIELD.width + 4) p.x = -4;
    }
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const b = bursts[i];
      b.life -= dt;
      if (b.life <= 0) { bursts.splice(i, 1); continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 60 * dt;
    }
    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const rp = ripples[i];
      rp.life -= dt;
      rp.r += 170 * dt;
      if (rp.life <= 0) ripples.splice(i, 1);
    }
    lastNow = now;
  }

  function drawAmbient() {
    const g = context.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, '#0a0a1e');
    g.addColorStop(0.6, '#0d0d24');
    g.addColorStop(1, '#07070f');
    context.fillStyle = g;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const p of particles) {
      context.globalAlpha = p.a;
      context.fillStyle = p.c;
      context.beginPath();
      context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawButton(b) {
    const hot = b.hot && !b.disabled;
    context.fillStyle = b.disabled ? '#14142a' : hot ? PALETTE.buttonHot : PALETTE.button;
    context.strokeStyle = b.disabled ? '#22224a' : hot ? PALETTE.player : PALETTE.panelEdge;
    context.lineWidth = 1.5;
    rr(context, b.x, b.y, b.w, b.h, 10);
    context.fill();
    context.stroke();
    const color = b.disabled ? '#55557a' : b.accent || PALETTE.text;
    text(b.label, b.x + b.w / 2, b.y + b.h / 2 + (b.sub ? 2 : 8), b.sub ? 22 : 24, color, 'center', '700');
    if (b.sub) text(b.sub, b.x + b.w / 2, b.y + b.h - 12, 14, PALETTE.muted, 'center');
  }

  function drawPanel(title, lines, accent) {
    const width = 640;
    const height = 150 + lines.length * 30;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7,7,15,0.82)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    rr(context, x, y, width, height, 16);
    context.fill();
    context.stroke();
    text(title, FIELD.width / 2, y + 62, 44, accent || PALETTE.text, 'center', '800');
    lines.forEach((line, i) => {
      text(line, FIELD.width / 2, y + 108 + i * 30, 19, PALETTE.muted, 'center');
    });
    return { x, y, width, height };
  }

  // ------------------------------------------------------------ models ---
  /** A mini model of one of the 12 named artifacts, centred at (cx, cy), size s. */
  function drawArtifactModel(kind, cx, cy, s, color) {
    const c = color || ARTIFACT_COLORS[kind] || PALETTE.artifact;
    context.fillStyle = c;
    context.strokeStyle = c;
    context.lineWidth = Math.max(1.5, s / 8);
    switch (kind) {
      case 'idol':
        context.beginPath();
        context.moveTo(cx, cy - s);
        context.lineTo(cx + s * 0.7, cy + s * 0.8);
        context.lineTo(cx - s * 0.7, cy + s * 0.8);
        context.closePath();
        context.fill();
        context.beginPath();
        context.arc(cx, cy - s * 1.15, s * 0.45, 0, Math.PI * 2);
        context.fill();
        break;
      case 'vase':
        context.beginPath();
        context.ellipse(cx, cy + s * 0.2, s * 0.6, s * 0.8, 0, 0, Math.PI * 2);
        context.fill();
        context.fillRect(cx - s * 0.25, cy - s * 1.1, s * 0.5, s * 0.5);
        break;
      case 'mask':
        context.beginPath();
        context.ellipse(cx, cy, s * 0.75, s * 0.95, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#06231a';
        context.beginPath();
        context.ellipse(cx - s * 0.3, cy - s * 0.2, s * 0.16, s * 0.1, 0, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.ellipse(cx + s * 0.3, cy - s * 0.2, s * 0.16, s * 0.1, 0, 0, Math.PI * 2);
        context.fill();
        context.fillRect(cx - s * 0.25, cy + s * 0.45, s * 0.5, s * 0.08);
        break;
      case 'orb':
        context.beginPath();
        context.arc(cx, cy, s * 0.8, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#dfe9ff';
        context.lineWidth = Math.max(1, s / 10);
        context.beginPath();
        context.ellipse(cx, cy, s * 1.15, s * 0.35, -0.4, 0, Math.PI * 2);
        context.stroke();
        break;
      case 'crown':
        context.beginPath();
        context.moveTo(cx - s * 0.9, cy + s * 0.6);
        context.lineTo(cx - s * 0.9, cy - s * 0.3);
        context.lineTo(cx - s * 0.45, cy + s * 0.1);
        context.lineTo(cx, cy - s * 0.9);
        context.lineTo(cx + s * 0.45, cy + s * 0.1);
        context.lineTo(cx + s * 0.9, cy - s * 0.3);
        context.lineTo(cx + s * 0.9, cy + s * 0.6);
        context.closePath();
        context.fill();
        break;
      case 'scroll':
        context.fillRect(cx - s * 0.9, cy - s * 0.45, s * 1.8, s * 0.9);
        context.fillStyle = '#fff6cf';
        context.beginPath();
        context.arc(cx - s * 0.9, cy, s * 0.45, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(cx + s * 0.9, cy, s * 0.45, 0, Math.PI * 2);
        context.fill();
        break;
      case 'dagger':
        context.beginPath();
        context.moveTo(cx, cy - s * 1.1);
        context.lineTo(cx + s * 0.25, cy);
        context.lineTo(cx - s * 0.25, cy);
        context.closePath();
        context.fill();
        context.fillRect(cx - s * 0.6, cy, s * 1.2, s * 0.18);
        context.fillRect(cx - s * 0.12, cy + s * 0.18, s * 0.24, s * 0.6);
        break;
      case 'coin':
        context.beginPath();
        context.arc(cx, cy, s * 0.9, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#8a6a1d';
        context.lineWidth = Math.max(1.5, s / 8);
        context.beginPath();
        context.arc(cx, cy, s * 0.55, 0, Math.PI * 2);
        context.stroke();
        break;
      case 'skull':
        context.beginPath();
        context.arc(cx, cy - s * 0.15, s * 0.75, 0, Math.PI * 2);
        context.fill();
        context.fillRect(cx - s * 0.35, cy + s * 0.35, s * 0.7, s * 0.5);
        context.fillStyle = '#111111';
        context.beginPath();
        context.arc(cx - s * 0.28, cy - s * 0.2, s * 0.14, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(cx + s * 0.28, cy - s * 0.2, s * 0.14, 0, Math.PI * 2);
        context.fill();
        break;
      case 'mirror':
        context.beginPath();
        context.arc(cx, cy - s * 0.25, s * 0.75, 0, Math.PI * 2);
        context.fill();
        context.fillRect(cx - s * 0.12, cy + s * 0.4, s * 0.24, s * 0.7);
        context.strokeStyle = '#ffffff';
        context.lineWidth = Math.max(1, s / 10);
        context.beginPath();
        context.moveTo(cx - s * 0.4, cy - s * 0.6);
        context.lineTo(cx + s * 0.1, cy + s * 0.1);
        context.stroke();
        break;
      case 'egg':
        context.beginPath();
        context.ellipse(cx, cy, s * 0.7, s * 0.95, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#7a2d12';
        context.lineWidth = Math.max(1, s / 10);
        context.beginPath();
        context.moveTo(cx - s * 0.5, cy - s * 0.1);
        context.lineTo(cx - s * 0.1, cy + s * 0.2);
        context.lineTo(cx + s * 0.3, cy - s * 0.2);
        context.stroke();
        break;
      case 'gem':
      default:
        context.beginPath();
        context.moveTo(cx, cy - s);
        context.lineTo(cx + s * 0.75, cy);
        context.lineTo(cx, cy + s);
        context.lineTo(cx - s * 0.75, cy);
        context.closePath();
        context.fill();
        break;
    }
  }

  /** The hooded thief: cloak, hood, face opening, glowing eyes. Shared by the
   *  player (teal), Echoes (cyan ghost) and the Time Trial best-run ghost (gold). */
  function drawThief(cx, cy, o) {
    const bob = o.bob || 0;
    const s = o.scale || 1;
    context.save();
    context.translate(cx, cy + bob);
    context.scale(s, s);
    if (o.alpha != null) context.globalAlpha = o.alpha;
    if (o.glow) {
      context.shadowColor = o.glow;
      context.shadowBlur = 18;
    }
    // Ground shadow (stays on the floor: cancel the bob).
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.ellipse(0, 16 - bob, 15, 5, 0, 0, Math.PI * 2);
    context.fill();
    // Cloak.
    context.fillStyle = o.color;
    context.strokeStyle = o.rim;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(-12, 16);
    context.quadraticCurveTo(-14, -2, -8, -6);
    context.quadraticCurveTo(0, -14, 8, -6);
    context.quadraticCurveTo(14, -2, 12, 16);
    context.quadraticCurveTo(0, 19, -12, 16);
    context.closePath();
    context.fill();
    context.stroke();
    // Hood.
    context.fillStyle = o.hood || o.color;
    context.beginPath();
    context.arc(0, -8, 10, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    // Face opening + glowing eyes, offset toward the facing direction.
    const fx = o.faceX || 0;
    const fy = o.faceY || 0;
    context.shadowBlur = 0;
    context.fillStyle = '#05050f';
    context.beginPath();
    context.ellipse(fx * 3, -8 + fy * 2, 5.5, 6.5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = o.eye || '#eafcff';
    context.beginPath();
    context.arc(fx * 3 - 2.5, -9 + fy * 2, 1.6, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(fx * 3 + 2.5, -9 + fy * 2, 1.6, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  /** A glass display case with an artifact silhouette inside (interior '#' tiles). */
  function drawVitrine(c, r) {
    const x = c * TILE;
    const y = r * TILE;
    context.fillStyle = '#141428';
    context.fillRect(x + 8, y + TILE - 14, TILE - 16, 10);
    context.fillStyle = 'rgba(125,249,255,0.07)';
    context.fillRect(x + 10, y + 8, TILE - 20, TILE - 24);
    context.strokeStyle = 'rgba(125,249,255,0.4)';
    context.lineWidth = 1.5;
    context.strokeRect(x + 10, y + 8, TILE - 20, TILE - 24);
    context.fillStyle = 'rgba(255,201,77,0.7)';
    context.fillRect(x + 10, y + 8, TILE - 20, 3);
    const kind = ARTIFACT_KINDS[(c * 7 + r * 13) % ARTIFACT_KINDS.length];
    context.globalAlpha = 0.75;
    drawArtifactModel(kind, x + TILE / 2, y + TILE / 2 + 2, 9);
    context.globalAlpha = 1;
  }

  function laserActiveNow(world, laser) {
    if (world.state.lasersOff) return false;
    if (!laser.timed) return true;
    const period = world.state.laserPeriod || 4;
    const phase = world.state.loopTime % period;
    return laser.kind === 't' ? phase < period / 2 : phase >= period / 2;
  }

  // ------------------------------------------------------------- world ---
  function drawWorld(world, ui, now) {
    const st = world.state;
    const parsed = st.parsed;
    const grid = parsed.grid;
    const theme = THEMES[(st.level && st.level.theme) || 0] || THEMES[0];
    const levelId = st.level ? st.level.id : 0;
    if (levelId !== lastLevelId) {
      echoTrails.clear();
      lastLevelId = levelId;
      lastPlayerX = st.player.x;
      lastPlayerY = st.player.y;
    }
    // Walk bob: advance the phase while the player is actually moving.
    const dt = lastDrawNow === 0 ? 0.016 : Math.min(0.05, (now - lastDrawNow) / 1000);
    lastDrawNow = now;
    const p = st.player;
    const moved = Math.hypot(p.x - lastPlayerX, p.y - lastPlayerY);
    if (moved > 0.002) walkPhase += dt * 16;
    lastPlayerX = p.x;
    lastPlayerY = p.y;
    const bob = moved > 0.002 ? Math.sin(walkPhase) * 2.5 : Math.sin(now / 700) * 1;

    // Floor: checker + deterministic speckle texture + a diagonal sheen.
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        context.fillStyle = (c + r) % 2 === 0 ? theme.floorA : theme.floorB;
        context.fillRect(c * TILE, r * TILE, TILE, TILE);
        context.fillStyle = 'rgba(255,255,255,0.05)';
        const s1 = hash2(c, r, levelId);
        const s2 = hash2(c + 40, r + 17, levelId);
        context.fillRect(c * TILE + 8 + s1 * 44, r * TILE + 8 + s2 * 44, 2, 2);
        context.fillRect(c * TILE + 12 + s2 * 40, r * TILE + 14 + s1 * 36, 2, 2);
        context.fillStyle = PALETTE.grid;
        context.fillRect(c * TILE, r * TILE, TILE, 1);
        context.fillRect(c * TILE, r * TILE, 1, TILE);
      }
    }
    const sheen = context.createLinearGradient(0, 0, FIELD.width, ROWS * TILE);
    sheen.addColorStop(0, 'rgba(255,255,255,0.03)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.02)');
    context.fillStyle = sheen;
    context.fillRect(0, 0, FIELD.width, ROWS * TILE);
    // Spotlights on the target artifact and the exit.
    for (const art of parsed.artifacts) {
      if (art.taken) continue;
      const cx = art.x * TILE + TILE / 2;
      const cy = art.y * TILE + TILE / 2;
      const g = context.createRadialGradient(cx, cy, 8, cx, cy, 130);
      g.addColorStop(0, 'rgba(255,217,77,0.13)');
      g.addColorStop(1, 'rgba(255,217,77,0)');
      context.fillStyle = g;
      context.fillRect(cx - 130, cy - 130, 260, 260);
    }
    if (parsed.exit) {
      const cx = parsed.exit.x * TILE + TILE / 2;
      const cy = parsed.exit.y * TILE + TILE / 2;
      const g = context.createRadialGradient(cx, cy, 8, cx, cy, 110);
      g.addColorStop(0, 'rgba(57,255,136,0.10)');
      g.addColorStop(1, 'rgba(57,255,136,0)');
      context.fillStyle = g;
      context.fillRect(cx - 110, cy - 110, 220, 220);
    }
    // Plates and switches.
    for (const plate of parsed.plates) {
      const cx = plate.x * TILE + TILE / 2;
      const cy = plate.y * TILE + TILE / 2;
      const heavy = plate.id === 'W';
      context.fillStyle = plate.pressed ? PALETTE.gold : '#2a2113';
      context.strokeStyle = plate.pressed ? PALETTE.gold : PALETTE.goldDark;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(cx, cy, heavy ? 24 : 20, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      if (plate.pressed) {
        context.shadowColor = PALETTE.gold;
        context.shadowBlur = 18;
        context.fillStyle = PALETTE.gold;
        context.beginPath();
        context.arc(cx, cy, 8, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      }
      text(heavy ? 'W' : plate.id, cx, cy + 5, 15, plate.pressed ? '#201500' : PALETTE.goldDark, 'center', '700');
    }
    for (const sw of parsed.switches) {
      const cx = sw.x * TILE + TILE / 2;
      const cy = sw.y * TILE + TILE / 2;
      context.fillStyle = sw.pressed ? PALETTE.purple : '#241a33';
      context.strokeStyle = PALETTE.purple;
      context.lineWidth = 3;
      rr(context, cx - 20, cy - 20, 40, 40, 8);
      context.fill();
      context.stroke();
      if (sw.pressed) {
        context.shadowColor = PALETTE.purple;
        context.shadowBlur = 18;
        context.fillStyle = '#e9d5ff';
        context.beginPath();
        context.arc(cx, cy, 7, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      }
      text('S', cx, cy + 5, 15, sw.pressed ? '#fff' : PALETTE.purple, 'center', '700');
    }
    // Lasers.
    for (const laser of parsed.lasers) {
      const cx = laser.x * TILE + TILE / 2;
      const cy = laser.y * TILE + TILE / 2;
      const on = laserActiveNow(world, laser);
      if (!on) {
        context.fillStyle = PALETTE.laserDim;
        context.globalAlpha = 0.35;
        if (laser.vertical) context.fillRect(cx - 3, laser.y * TILE, 6, TILE);
        else context.fillRect(laser.x * TILE, cy - 3, TILE, 6);
        context.globalAlpha = 1;
        continue;
      }
      context.shadowColor = PALETTE.laser;
      context.shadowBlur = 16;
      context.fillStyle = PALETTE.laser;
      if (laser.vertical) context.fillRect(cx - 4, laser.y * TILE, 8, TILE);
      else context.fillRect(laser.x * TILE, cy - 4, TILE, 8);
      context.fillStyle = '#ffd7de';
      if (laser.vertical) context.fillRect(cx - 1.5, laser.y * TILE, 3, TILE);
      else context.fillRect(laser.x * TILE, cy - 1.5, TILE, 3);
      context.shadowBlur = 0;
    }
    // Doors.
    for (const door of parsed.doors) {
      const x = door.x * TILE;
      const y = door.y * TILE;
      if (door.open) {
        context.fillStyle = PALETTE.door;
        context.globalAlpha = 0.35;
        context.fillRect(x, y, TILE, 6);
        context.fillRect(x, y + TILE - 6, TILE, 6);
        context.globalAlpha = 1;
        continue;
      }
      context.fillStyle = PALETTE.doorClosed;
      context.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      context.strokeStyle = PALETTE.door;
      context.lineWidth = 2;
      context.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
      context.fillStyle = PALETTE.door;
      context.beginPath();
      context.arc(x + TILE / 2, y + TILE / 2, 7, 0, Math.PI * 2);
      context.fill();
      text(door.needs.join('+'), x + TILE / 2, y + TILE - 10, 12, PALETTE.door, 'center', '700');
    }
    // Walls: border walls are stone with a neon trim; interior walls are glass
    // display cases with an artifact silhouette inside.
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (grid[r][c] !== '#') continue;
        const border = c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1;
        if (!border) {
          drawVitrine(c, r);
          continue;
        }
        const x = c * TILE;
        const y = r * TILE;
        context.fillStyle = theme.wall;
        context.fillRect(x, y, TILE, TILE);
        context.fillStyle = theme.wallEdge;
        context.fillRect(x, y, TILE, 3);
        context.fillRect(x, y, 3, TILE);
      }
    }
    // Crates.
    for (const crate of st.crates) {
      const x = crate.x * TILE;
      const y = crate.y * TILE;
      context.fillStyle = '#8a6a1f';
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 2;
      rr(context, x - 22, y - 22, 44, 44, 6);
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(x - 22, y - 22);
      context.lineTo(x + 22, y + 22);
      context.moveTo(x + 22, y - 22);
      context.lineTo(x - 22, y + 22);
      context.strokeStyle = '#5c4714';
      context.stroke();
    }
    // Artifacts: the level's named prize as a mini model, bobbing in a spotlight.
    const artKind = (st.level && st.level.artifact && st.level.artifact.kind) || 'gem';
    for (const art of parsed.artifacts) {
      if (art.taken) continue;
      const cx = art.x * TILE + TILE / 2;
      const bobY = Math.sin(now / 350 + art.x) * 4;
      const cy = art.y * TILE + TILE / 2 + bobY;
      context.shadowColor = PALETTE.artifact;
      context.shadowBlur = 20;
      drawArtifactModel(artKind, cx, cy, 15);
      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(255,217,77,0.45)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.ellipse(cx, art.y * TILE + TILE - 8, 18, 5, 0, 0, Math.PI * 2);
      context.stroke();
    }
    // Exit portal.
    if (parsed.exit) {
      const cx = parsed.exit.x * TILE + TILE / 2;
      const cy = parsed.exit.y * TILE + TILE / 2;
      const ready = st.artifactsGot >= st.artifactsTotal;
      const pulse = 0.6 + 0.4 * Math.sin(now / 300);
      context.globalAlpha = ready ? 0.9 : 0.35;
      context.strokeStyle = PALETTE.exit;
      context.lineWidth = 4;
      context.shadowColor = PALETTE.exit;
      context.shadowBlur = ready ? 22 * pulse : 6;
      context.beginPath();
      context.arc(cx, cy, 22 + (ready ? 3 * pulse : 0), 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = PALETTE.exit;
      text('EXIT', cx, cy + 5, 11, ready ? '#062b16' : PALETTE.exit, 'center', '800');
      context.globalAlpha = 1;
    }
    // Drones: a real body with spinning rotors and a sensor eye, under a
    // gradient vision cone that changes colour with the alert meter.
    let worstDrone = null;
    for (const drone of st.drones) {
      const cx = drone.x * TILE;
      const cy = drone.y * TILE;
      const fx = drone.vertical ? 0 : drone.dir;
      const fy = drone.vertical ? drone.dir : 0;
      const distracted = drone.distracted > 0;
      const rgb = distracted ? [255, 201, 77] : alertRGB(drone.alert || 0);
      // Vision cone: bright near the drone, fading to nothing at the tip.
      const tipX = cx + fx * 3.5 * TILE;
      const tipY = cy + fy * 3.5 * TILE;
      const grad = context.createLinearGradient(cx, cy, tipX, tipY);
      grad.addColorStop(0, rgba(rgb, 0.30));
      grad.addColorStop(1, rgba(rgb, 0.02));
      context.fillStyle = grad;
      context.beginPath();
      context.moveTo(cx, cy);
      const a0 = Math.atan2(fy, fx);
      context.arc(cx, cy, 3.5 * TILE, a0 - 0.96, a0 + 0.96);
      context.closePath();
      context.fill();
      context.strokeStyle = rgba(rgb, 0.28);
      context.lineWidth = 1.5;
      context.stroke();
      // A brighter inner cone marks the drone's keenest sight.
      const grad2 = context.createLinearGradient(cx, cy, tipX, tipY);
      grad2.addColorStop(0, rgba(rgb, 0.16));
      grad2.addColorStop(1, rgba(rgb, 0));
      context.fillStyle = grad2;
      context.beginPath();
      context.moveTo(cx, cy);
      context.arc(cx, cy, 3.5 * TILE, a0 - 0.45, a0 + 0.45);
      context.closePath();
      context.fill();
      // Alert meter above the drone while it is suspicious.
      if ((drone.alert || 0) > 0.02) {
        context.fillStyle = 'rgba(0,0,0,0.55)';
        context.fillRect(cx - 18, cy - 34, 36, 5);
        context.fillStyle = rgba(rgb, 0.95);
        context.fillRect(cx - 18, cy - 34, 36 * Math.min(1, drone.alert), 5);
        text(`${Math.round(drone.alert * 100)}%`, cx, cy - 38, 11, rgba(rgb, 1), 'center', '700');
      }
      // Body.
      context.shadowColor = rgba(rgb, 1);
      context.shadowBlur = 14;
      context.fillStyle = '#241a33';
      context.strokeStyle = rgba(rgb, 0.9);
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(cx, cy, 16, 11, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      // Spinning rotor.
      const ra = now / 30;
      context.strokeStyle = 'rgba(139,147,184,0.75)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(cx - Math.cos(ra) * 22, cy - 4 - Math.sin(ra) * 22);
      context.lineTo(cx + Math.cos(ra) * 22, cy - 4 + Math.sin(ra) * 22);
      context.stroke();
      context.strokeStyle = 'rgba(139,147,184,0.35)';
      context.beginPath();
      context.moveTo(cx - Math.cos(ra + Math.PI / 2) * 22, cy - 4 - Math.sin(ra + Math.PI / 2) * 22);
      context.lineTo(cx + Math.cos(ra + Math.PI / 2) * 22, cy - 4 + Math.sin(ra + Math.PI / 2) * 22);
      context.stroke();
      // Sensor eye, glowing in the alert colour; a blinking light at the back.
      context.shadowColor = rgba(rgb, 1);
      context.shadowBlur = 12;
      context.fillStyle = rgba(rgb, 1);
      context.beginPath();
      context.arc(cx + fx * 8, cy + fy * 8, 5, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      if (Math.sin(now / 200) > 0) {
        context.fillStyle = PALETTE.gold;
        context.beginPath();
        context.arc(cx - fx * 12, cy - fy * 12, 2, 0, Math.PI * 2);
        context.fill();
      }
      if ((drone.alert || 0) > 0.15 && (!worstDrone || drone.alert > worstDrone.alert)) worstDrone = drone;
    }
    // Threat-direction indicator: a pulsing chevron by the player, pointing
    // at the most suspicious drone.
    if (worstDrone) {
      const dx = worstDrone.x - p.x;
      const dy = worstDrone.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ix = p.x * TILE + (dx / len) * 52;
      const iy = p.y * TILE + (dy / len) * 52;
      const ang = Math.atan2(dy, dx);
      const pulse = 0.6 + 0.4 * Math.sin(now / 120);
      context.save();
      context.translate(ix, iy);
      context.rotate(ang);
      context.globalAlpha = pulse;
      context.fillStyle = rgba(alertRGB(worstDrone.alert), 1);
      context.beginPath();
      context.moveTo(12, 0);
      context.lineTo(-8, -8);
      context.lineTo(-8, 8);
      context.closePath();
      context.fill();
      context.restore();
      context.globalAlpha = 1;
    }
    // Echoes (ghosts): the thief in cyan, translucent, with a fading trail.
    st.echoes.forEach((echo, i) => {
      const cx = echo.x * TILE;
      const cy = echo.y * TILE;
      let trail = echoTrails.get(i) || [];
      if (!echo.done) {
        trail.unshift({ x: echo.x, y: echo.y });
        if (trail.length > 18) trail.pop();
        echoTrails.set(i, trail);
      } else {
        trail = [];
        echoTrails.set(i, trail);
      }
      trail.forEach((tp, j) => {
        context.globalAlpha = (1 - j / trail.length) * 0.28;
        context.fillStyle = ECHO_COLORS[i % ECHO_COLORS.length];
        context.beginPath();
        context.arc(tp.x * TILE, tp.y * TILE, 9 - (j / trail.length) * 5, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
      const frozen = echo.done;
      drawThief(cx, cy, {
        color: '#1d7f96', rim: ECHO_COLORS[i % ECHO_COLORS.length], hood: '#1d7f96',
        faceX: 0, faceY: 0, alpha: frozen ? 0.45 : 0.78, glow: ECHO_COLORS[i % ECHO_COLORS.length],
        bob: frozen ? 0 : Math.sin(now / 350 + i) * 2,
      });
      // Loop badge.
      context.globalAlpha = frozen ? 0.6 : 0.9;
      context.fillStyle = ECHO_COLORS[i % ECHO_COLORS.length];
      context.beginPath();
      context.arc(cx + 15, cy - 16, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#062a33';
      text(String(i + 1), cx + 15, cy - 12, 11, '#062a33', 'center', '800');
      context.globalAlpha = 1;
    });
    // Time Trial best-run ghost (gold), replaying the personal best path.
    if (ui && ui.mode === 'trial' && ui.trialGhost && ui.trialGhost.length > 0) {
      const idx = Math.min(Math.floor(st.tick / 3), ui.trialGhost.length - 1);
      const g = ui.trialGhost[idx];
      if (g) {
        drawThief(g.x * TILE, g.y * TILE, {
          color: '#4a3405', rim: PALETTE.gold, hood: '#4a3405',
          faceX: 1, faceY: 0, alpha: 0.5, glow: PALETTE.gold, bob: 0,
        });
      }
    }
    // Player: the hooded thief, blinking briefly right after an alarm.
    const px = p.x * TILE;
    const py = p.y * TILE;
    const blink = st.alarmCooldown > 0 && Math.floor(now / 90) % 2 === 0;
    if (!blink) {
      drawThief(px, py, {
        color: '#0e5a6b', rim: PALETTE.player, hood: '#0a3d4a',
        faceX: p.faceX, faceY: p.faceY, alpha: 1, glow: PALETTE.player, bob,
      });
    }
    // Echo-birth ripples.
    for (const rp of ripples) {
      context.globalAlpha = Math.max(0, rp.life / rp.maxLife) * 0.8;
      context.strokeStyle = rp.color;
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    // Vignette: dark museum corners over the whole room.
    const vg = context.createRadialGradient(640, 360, 260, 640, 360, 760);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    context.fillStyle = vg;
    context.fillRect(0, 0, FIELD.width, ROWS * TILE);
    // Alarm flash: a red edge wash while the alarm is fresh.
    if (st.alarmFlash > 0) {
      context.fillStyle = `rgba(255,46,99,${Math.min(0.25, st.alarmFlash * 0.4)})`;
      context.fillRect(0, 0, FIELD.width, ROWS * TILE);
      context.strokeStyle = `rgba(255,46,99,${Math.min(0.8, st.alarmFlash)})`;
      context.lineWidth = 10;
      context.strokeRect(5, 5, FIELD.width - 10, ROWS * TILE - 10);
    }
    // Bursts.
    for (const b of bursts) {
      context.globalAlpha = Math.max(0, b.life / b.maxLife);
      context.fillStyle = b.color;
      context.beginPath();
      context.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawHud(world, ui) {
    const st = world.state;
    const def = st.level;
    const artName = def.artifact ? def.artifact.name : 'Artifact';
    context.fillStyle = 'rgba(7,7,15,0.72)';
    context.fillRect(0, 0, FIELD.width, 40);
    text(`${def.id <= 100 ? `LEVEL ${def.id}` : def.name} · ${def.name}`, 16, 27, 19, PALETTE.text, 'left', '700');
    text(`⏱ ${fmtTime(st.time)} / ${fmtTime(def.timeLimit)}`, 330, 27, 18, PALETTE.text, 'left');
    text(`◆ ${artName} ${st.artifactsGot}/${st.artifactsTotal}`, 500, 27, 18, PALETTE.gold, 'left', '700');
    text(`⚠ ${st.alarms}`, 730, 27, 18, st.alarms > 0 ? PALETTE.danger : PALETTE.muted, 'left');
    text(`↺ ${st.resets}`, 800, 27, 18, PALETTE.muted, 'left');
    text(`👻 ${st.echoes.length}/${def.maxEchoes}`, 870, 27, 18, PALETTE.echo, 'left');
    if (ui.message) text(ui.message, FIELD.width / 2, 66, 16, PALETTE.gold, 'center');
  }

  function drawTimeline(world) {
    const st = world.state;
    const y = ROWS * TILE;
    const h = FIELD.height - y;
    context.fillStyle = '#0a0a18';
    context.fillRect(0, y, FIELD.width, h);
    // Echo segments: one coloured block per Echo (its recording's share of the
    // 60 s loop budget), then the live recording, then the loop playhead.
    let offset = 0;
    st.echoes.forEach((echo, i) => {
      const w = (echo.frames.length / 3600) * FIELD.width;
      context.fillStyle = ECHO_COLORS[i % ECHO_COLORS.length];
      context.globalAlpha = 0.8;
      context.fillRect(offset, y, Math.max(2, w), h);
      context.globalAlpha = 1;
      if (w > 26) text(`E${i + 1}`, offset + 4, y + h - 4, 10, '#062a33', 'left', '800');
      offset += w + 2;
    });
    const recW = (st.recording.length / 3600) * FIELD.width;
    context.fillStyle = PALETTE.player;
    context.fillRect(offset, y, Math.max(0, recW), h);
    const px = (st.loopTime % 60) / 60 * FIELD.width;
    context.fillStyle = '#ffffff';
    context.fillRect(px - 1, y, 2, h);
    context.fillStyle = PALETTE.muted;
    text('TIMELINE — R: reset & spawn Echo', 8, y + h - 4, 10, PALETTE.muted, 'left');
    text(`loop ${fmtTime(st.loopTime)}`, FIELD.width - 8, y + h - 4, 10, PALETTE.muted, 'right');
  }

  function drawTitle(ui, now) {
    drawAmbient();
    // A museum silhouette: tall glowing doorways.
    for (let i = 0; i < 5; i += 1) {
      const x = 90 + i * 240;
      context.fillStyle = 'rgba(34,230,255,0.06)';
      rr(context, x, 150, 150, 420, 12);
      context.fill();
      context.strokeStyle = 'rgba(34,230,255,0.25)';
      context.lineWidth = 2;
      rr(context, x, 150, 150, 420, 12);
      context.stroke();
    }
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 34;
    text('ECHO', FIELD.width / 2, 190, 96, PALETTE.player, 'center', '900');
    context.shadowColor = PALETTE.purple;
    text('SHIFT', FIELD.width / 2, 280, 96, PALETTE.purple, 'center', '900');
    context.shadowBlur = 0;
    text('Steal the past. Outrun yourself. Escape the museum.', FIELD.width / 2, 330, 22, PALETTE.muted, 'center');
    text('Every move is recorded — press R and your Echo repeats it.', FIELD.width / 2, 362, 17, PALETTE.echo, 'center');
    for (const b of ui.buttons) drawButton(b);
    const best = ui.save && ui.save.best ? Object.keys(ui.save.best).length : 0;
    text(best > 0 ? `${best} level${best === 1 ? '' : 's'} cleared · Endless best: room ${ui.save.endlessBest || 0}` : 'A time-loop stealth puzzle · 12 levels · Endless Heist · Time Trial', FIELD.width / 2, 694, 15, PALETTE.muted, 'center');
  }

  function drawSelect(ui) {
    drawAmbient();
    text(ui.selectMode === 'trial' ? 'TIME TRIAL — pick a level' : 'LEVEL SELECT', FIELD.width / 2, 92, 44, PALETTE.text, 'center', '800');
    text(ui.selectMode === 'trial' ? 'Beat your best time. Medals are earned by speed.' : 'Clear a level to unlock the next. Medals are earned by speed, few resets, no alarms.', FIELD.width / 2, 126, 17, PALETTE.muted, 'center');
    for (const b of ui.buttons) drawButton(b);
  }

  function drawSettings(ui) {
    drawAmbient();
    drawPanel('Settings', [
      `Sound: ${ui.muted ? 'MUTED (press M)' : `volume ${Math.round(ui.volume * 100)}%`}`,
      'All audio is synthesized in your browser — nothing is downloaded.',
      'Move: WASD / arrows · Reset timeline: R · Pause: P or Esc · Mute: M',
    ], PALETTE.player);
    for (const b of ui.buttons) drawButton(b);
  }

  function drawHelp(ui) {
    drawAmbient();
    drawPanel('How to play', [
      'You are a thief in a neon museum. Every move is recorded.',
      'Press R: the timeline resets and your Echo replays your last loop.',
      'Echoes hold plates and switches, and distract drones. Doors latch open.',
      'Lasers burn, drones raise the alarm. Grab every artifact, reach EXIT.',
      'Medals: Perfect Echo needs par time, no alarms, and few resets.',
    ], PALETTE.purple);
    for (const b of ui.buttons) drawButton(b);
  }

  function drawGallery(ui) {
    drawAmbient();
    text('THE MUSEUM GALLERY', FIELD.width / 2, 80, 44, PALETTE.text, 'center', '800');
    text('Every artifact you steal hangs here. Clear a level to claim its prize.', FIELD.width / 2, 114, 17, PALETTE.muted, 'center');
    const cardW = 280;
    const cardH = 130;
    const gap = 20;
    const x0 = (FIELD.width - (4 * cardW + 3 * gap)) / 2;
    const y0 = 150;
    // LEVELS is imported lazily through ui.levels (main.js passes it in).
    const levels = ui.levels || [];
    levels.forEach((level, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = x0 + col * (cardW + gap);
      const y = y0 + row * (cardH + gap);
      const best = ui.save && ui.save.best && ui.save.best[level.id];
      context.fillStyle = PALETTE.panel;
      context.strokeStyle = best ? PALETTE.gold : PALETTE.panelEdge;
      context.lineWidth = best ? 2 : 1.5;
      rr(context, x, y, cardW, cardH, 12);
      context.fill();
      context.stroke();
      const kind = level.artifact ? level.artifact.kind : 'gem';
      const name = level.artifact ? level.artifact.name : 'Artifact';
      if (best) {
        context.shadowColor = PALETTE.artifact;
        context.shadowBlur = 16;
        drawArtifactModel(kind, x + 52, y + 62, 26);
        context.shadowBlur = 0;
        text(name, x + 96, y + 56, 20, PALETTE.text, 'left', '700');
        text(`${level.name} · ${best.medal}`, x + 96, y + 86, 15, PALETTE.gold, 'left');
        text(`Best score ${best.score}`, x + 96, y + 108, 14, PALETTE.muted, 'left');
      } else {
        context.globalAlpha = 0.3;
        drawArtifactModel(kind, x + 52, y + 62, 26, '#55557a');
        context.globalAlpha = 1;
        text('???', x + 96, y + 56, 20, PALETTE.muted, 'left', '700');
        text(`${level.name} — not stolen yet`, x + 96, y + 86, 15, PALETTE.muted, 'left');
        text(`Level ${level.id}`, x + 96, y + 108, 14, PALETTE.muted, 'left');
      }
    });
    for (const b of ui.buttons) drawButton(b);
  }

  function drawResults(ui, now) {
    const r = ui.results;
    const medalColor = MEDAL_COLORS[r.medal] || PALETTE.text;
    const elapsed = now - (ui.resultsAt || 0);
    const hasBreakdown = !!r.breakdown;
    const width = 640;
    const height = hasBreakdown ? 300 : 240;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7,7,15,0.82)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.strokeStyle = medalColor;
    context.lineWidth = 2;
    rr(context, x, y, width, height, 16);
    context.fill();
    context.stroke();
    // Endless name entry: a banner above the panel while initials are being typed.
    if (ui.nameEntry && ui.nameEntry.active) {
      context.fillStyle = 'rgba(20,20,8,0.92)';
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 2;
      rr(context, 340, 24, 600, 76, 12);
      context.fill();
      context.stroke();
      text(`★ NEW ENDLESS RECORD — ROOM ${ui.nameEntry.room}!`, FIELD.width / 2, 54, 20, PALETTE.gold, 'center', '800');
      const shown = (ui.nameEntry.text + '___').slice(0, 3);
      text(`Type your initials (A–Z), Enter to save:  [ ${shown.split('').join(' ')} ]`, FIELD.width / 2, 84, 16, PALETTE.text, 'center');
    }
    // Medal pops in with a glow.
    const pop = easeOutBack(Math.min(1, Math.max(0, elapsed / 600)));
    const glow = 18 + 10 * Math.sin(now / 200);
    context.save();
    context.translate(FIELD.width / 2, y + 56);
    context.scale(Math.max(0.01, pop), Math.max(0.01, pop));
    context.shadowColor = medalColor;
    context.shadowBlur = glow;
    text(r.medal, 0, 0, 40, medalColor, 'center', '800');
    context.restore();
    context.shadowBlur = 0;
    text(`${r.levelName} — ${fmtTime(r.time)}${r.par ? `  (par ${fmtTime(r.par)})` : ''}`, FIELD.width / 2, y + 92, 18, PALETTE.muted, 'center');
    if (hasBreakdown) {
      const b = r.breakdown;
      const lines = [
        ['Base score', String(b.base), PALETTE.text],
        ['Time bonus', `+${b.timeBonus}`, '#39ff88'],
        ['Medal bonus', `+${b.medalBonus}`, medalColor],
        ['Reset penalty', `-${b.resetPenalty}`, b.resetPenalty ? PALETTE.danger : PALETTE.muted],
        ['Alarm penalty', `-${b.alarmPenalty}`, b.alarmPenalty ? PALETTE.danger : PALETTE.muted],
      ];
      lines.forEach(([label, value, color], i) => {
        if (elapsed < 350 + i * 180) return;
        const ly = y + 122 + i * 24;
        text(label, x + 60, ly, 18, PALETTE.muted, 'left');
        text(value, x + width - 60, ly, 18, color, 'right', '700');
      });
      if (elapsed >= 350 + lines.length * 180) {
        context.strokeStyle = PALETTE.panelEdge;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x + 60, y + 244);
        context.lineTo(x + width - 60, y + 244);
        context.stroke();
        text('TOTAL', x + 60, y + 270, 20, PALETTE.text, 'left', '800');
        text(String(b.total), x + width - 60, y + 270, 24, PALETTE.gold, 'right', '800');
      }
      if (r.isNewBest && elapsed > 300) {
        text('★ NEW BEST ★', FIELD.width / 2, y + height - 12, 15, PALETTE.gold, 'center', '700');
      }
    } else {
      text(`Resets ${r.resets} · Alarms ${r.alarms} · Artifacts ${r.artifactsGot}/${r.artifactsTotal}`, FIELD.width / 2, y + 132, 18, PALETTE.muted, 'center');
      text(r.bestLine || '', FIELD.width / 2, y + 168, 18, PALETTE.muted, 'center');
    }
    // Endless Hall of Fame: the local top-5, beside the results panel.
    const scores = ui.save && ui.save.endlessScores;
    if (ui.mode === 'endless' && scores && scores.length > 0) {
      const sx = 984;
      const sy = y;
      const sw = 272;
      context.fillStyle = PALETTE.panel;
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 2;
      rr(context, sx, sy, sw, height, 16);
      context.fill();
      context.stroke();
      text('🏆 HALL OF FAME', sx + sw / 2, sy + 44, 20, PALETTE.gold, 'center', '800');
      scores.slice(0, 5).forEach((s, i) => {
        const ly = sy + 82 + i * 30;
        text(`${i + 1}. ${s.name}`, sx + 18, ly, 16, PALETTE.text, 'left', '700');
        text(`Room ${s.room} · ${s.score}`, sx + sw - 18, ly, 16, PALETTE.muted, 'right');
      });
    }
    for (const b of ui.buttons) drawButton(b);
  }

  /** Paint one frame: ambient background, the world when there is one, then the screen's UI. */
  function draw(world, ui, now) {
    const t = now || performance.now();
    const dt = lastNow === 0 ? 0.016 : Math.min(0.05, (t - lastNow) / 1000);
    updateAmbient(dt, t);
    // Screen transition: a quick fade whenever the screen changes.
    if (ui.screen !== lastScreen) {
      lastScreen = ui.screen;
      fadeUntil = t + 280;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    let ox = 0;
    let oy = 0;
    if (t < shakeUntil) {
      ox = (Math.random() - 0.5) * shakeMag;
      oy = (Math.random() - 0.5) * shakeMag;
    }
    context.setTransform(view.scale, 0, 0, view.scale, view.x + ox * view.scale, view.y + oy * view.scale);
    const screen = ui.screen;
    if (screen === SCREEN_TITLE) { drawTitle(ui, t); }
    else if (screen === SCREEN_SELECT) { drawSelect(ui); }
    else if (screen === SCREEN_SETTINGS) { drawSettings(ui); }
    else if (screen === SCREEN_HELP) { drawHelp(ui); }
    else if (screen === SCREEN_GALLERY) { drawGallery(ui); }
    else {
      if (world && world.state.parsed) {
        drawWorld(world, ui, t);
        drawHud(world, ui);
        drawTimeline(world);
      }
      if (screen === SCREEN_PAUSED) {
        drawPanel('Paused', ['The timeline waits for you.', 'R still resets the loop when you resume.'], PALETTE.player);
        for (const b of ui.buttons) drawButton(b);
      } else if (screen === SCREEN_RESULTS) {
        drawResults(ui, t);
      } else if (screen === SCREEN_PLAY) {
        for (const b of ui.buttons) drawButton(b);
        if (world.state.level && world.state.time < 4 && ui.mode === 'story') {
          const art = world.state.level.artifact;
          context.fillStyle = 'rgba(7,7,15,0.78)';
          rr(context, 300, 544, 680, 76, 12);
          context.fill();
          if (art) text(`STEAL:  ${art.name}`, FIELD.width / 2, 574, 19, PALETTE.gold, 'center', '800');
          text(world.state.level.intro, FIELD.width / 2, 602, 16, PALETTE.text, 'center');
        } else if (ui.hint) {
          context.fillStyle = 'rgba(7,7,15,0.78)';
          rr(context, 300, 560, 680, 56, 12);
          context.fill();
          text(ui.hint, FIELD.width / 2, 596, 17, PALETTE.text, 'center');
        }
      }
    }
    if (t < fadeUntil) {
      context.fillStyle = `rgba(7,7,15,${((fadeUntil - t) / 280) * 0.45})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function burst(x, y, color, n = 14) {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      bursts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 3, life: 0.5 + Math.random() * 0.4, maxLife: 0.9, color,
      });
    }
  }

  function ripple(x, y, color) {
    ripples.push({ x, y, r: 6, life: 0.5, maxLife: 0.5, color });
  }

  function confetti() {
    const colors = ['#ffd94d', '#22e6ff', '#ffffff', '#b46bff', '#39ff88'];
    for (let i = 0; i < 70; i += 1) {
      bursts.push({
        x: Math.random() * FIELD.width, y: Math.random() * 220,
        vx: (Math.random() - 0.5) * 120, vy: 40 + Math.random() * 80,
        r: 2 + Math.random() * 3, life: 1 + Math.random() * 0.8, maxLife: 1.8,
        color: colors[i % colors.length],
      });
    }
  }

  function shake(mag) {
    shakeMag = mag;
    shakeUntil = performance.now() + 300;
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, burst, ripple, confetti, shake };
}
