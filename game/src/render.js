// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Neon glow, particles and the timeline bar live here; rules live in world.js.
import { COLS, FIELD, FONT, PALETTE, ROWS, TILE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_SELECT = 'select';
export const SCREEN_SETTINGS = 'settings';
export const SCREEN_HELP = 'help';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_RESULTS = 'results';

const MEDAL_COLORS = {
  'Perfect Echo': '#ff5df2',
  Gold: '#ffc94d',
  Silver: '#cfd6e4',
  Bronze: '#d08a4d',
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

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  const particles = [];
  const bursts = [];
  let lastNow = 0;

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

  function drawWorld(world, now) {
    const st = world.state;
    const parsed = st.parsed;
    const grid = parsed.grid;
    // Floor.
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        context.fillStyle = (c + r) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        context.fillRect(c * TILE, r * TILE, TILE, TILE);
        context.fillStyle = PALETTE.grid;
        context.fillRect(c * TILE, r * TILE, TILE, 1);
        context.fillRect(c * TILE, r * TILE, 1, TILE);
      }
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
    // Walls (drawn over floor edges, with a neon top edge).
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (grid[r][c] !== '#') continue;
        const x = c * TILE;
        const y = r * TILE;
        context.fillStyle = PALETTE.wall;
        context.fillRect(x, y, TILE, TILE);
        context.fillStyle = PALETTE.wallEdge;
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
    // Artifacts.
    for (const art of parsed.artifacts) {
      if (art.taken) continue;
      const cx = art.x * TILE + TILE / 2;
      const bob = Math.sin(now / 350 + art.x) * 4;
      const cy = art.y * TILE + TILE / 2 + bob;
      context.shadowColor = PALETTE.artifact;
      context.shadowBlur = 20;
      context.fillStyle = PALETTE.artifact;
      context.beginPath();
      context.moveTo(cx, cy - 16);
      context.lineTo(cx + 12, cy);
      context.lineTo(cx, cy + 16);
      context.lineTo(cx - 12, cy);
      context.closePath();
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = '#fff6cf';
      context.beginPath();
      context.moveTo(cx, cy - 8);
      context.lineTo(cx + 5, cy);
      context.lineTo(cx, cy + 8);
      context.lineTo(cx - 5, cy);
      context.closePath();
      context.fill();
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
    // Drones and their cones.
    for (const drone of st.drones) {
      const cx = drone.x * TILE;
      const cy = drone.y * TILE;
      const fx = drone.vertical ? 0 : drone.dir;
      const fy = drone.vertical ? drone.dir : 0;
      const distracted = drone.distracted > 0;
      context.fillStyle = distracted ? 'rgba(255,201,77,0.20)' : 'rgba(180,107,255,0.16)';
      context.beginPath();
      context.moveTo(cx, cy);
      const a0 = Math.atan2(fy, fx);
      context.arc(cx, cy, 3.5 * TILE, a0 - 0.96, a0 + 0.96);
      context.closePath();
      context.fill();
      context.shadowColor = distracted ? PALETTE.gold : PALETTE.purple;
      context.shadowBlur = 14;
      context.fillStyle = distracted ? PALETTE.gold : PALETTE.purple;
      context.beginPath();
      context.arc(cx, cy, 15, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = '#1a1030';
      context.beginPath();
      context.arc(cx + fx * 5, cy + fy * 5, 5, 0, Math.PI * 2);
      context.fill();
    }
    // Echoes (ghosts): translucent, glowing, with a number showing their loop.
    st.echoes.forEach((echo, i) => {
      const cx = echo.x * TILE;
      const cy = echo.y * TILE;
      const frozen = echo.done;
      context.globalAlpha = frozen ? 0.45 : 0.75;
      context.shadowColor = PALETTE.echo;
      context.shadowBlur = 18;
      context.fillStyle = PALETTE.echo;
      context.beginPath();
      context.arc(cx, cy - 6, 11, 0, Math.PI * 2);
      context.fill();
      rr(context, cx - 13, cy + 4, 26, 20, 8);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = '#062a33';
      text(String(i + 1), cx, cy + 19, 12, '#062a33', 'center', '800');
      context.globalAlpha = 1;
    });
    // Player.
    const p = st.player;
    const px = p.x * TILE;
    const py = p.y * TILE;
    const blink = st.alarmCooldown > 0 && Math.floor(now / 90) % 2 === 0;
    if (!blink) {
      context.shadowColor = PALETTE.player;
      context.shadowBlur = 22;
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(px, py - 6, 12, 0, Math.PI * 2);
      context.fill();
      rr(context, px - 14, py + 4, 28, 22, 9);
      context.fill();
      context.shadowBlur = 0;
      // Visor: a bright slit facing the movement direction.
      context.fillStyle = '#eafcff';
      const vx = px + p.faceX * 7;
      const vy = py - 6 + p.faceY * 7;
      context.beginPath();
      context.arc(vx, vy, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    // Alarm flash.
    if (st.alarmFlash > 0) {
      context.fillStyle = `rgba(255,46,99,${Math.min(0.25, st.alarmFlash * 0.4)})`;
      context.fillRect(0, 0, FIELD.width, ROWS * TILE);
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

  function laserActiveNow(world, laser) {
    if (world.state.lasersOff) return false;
    if (!laser.timed) return true;
    const phase = world.state.loopTime % 4;
    return laser.kind === 't' ? phase < 2 : phase >= 2;
  }

  function drawHud(world, ui) {
    const st = world.state;
    const def = st.level;
    context.fillStyle = 'rgba(7,7,15,0.72)';
    context.fillRect(0, 0, FIELD.width, 40);
    text(`${def.id <= 100 ? `LEVEL ${def.id}` : def.name} · ${def.name}`, 16, 27, 19, PALETTE.text, 'left', '700');
    text(`⏱ ${fmtTime(st.time)} / ${fmtTime(def.timeLimit)}`, 330, 27, 18, PALETTE.text, 'left');
    text(`◆ ${st.artifactsGot}/${st.artifactsTotal}`, 520, 27, 18, PALETTE.gold, 'left', '700');
    text(`⚠ ${st.alarms}`, 640, 27, 18, st.alarms > 0 ? PALETTE.danger : PALETTE.muted, 'left');
    text(`↺ ${st.resets}`, 720, 27, 18, PALETTE.muted, 'left');
    text(`👻 ${st.echoes.length}/${def.maxEchoes}`, 800, 27, 18, PALETTE.echo, 'left');
    if (ui.message) text(ui.message, FIELD.width / 2, 66, 16, PALETTE.gold, 'center');
  }

  function drawTimeline(world) {
    const st = world.state;
    const y = ROWS * TILE;
    const h = FIELD.height - y;
    context.fillStyle = '#0a0a18';
    context.fillRect(0, y, FIELD.width, h);
    // Loop progress: the recording being made right now.
    const total = Math.max(60, st.loopTime);
    const recW = Math.min(1, st.recording.length / 3600);
    context.fillStyle = '#1e2a4a';
    context.fillRect(0, y, FIELD.width, h);
    context.fillStyle = PALETTE.player;
    context.fillRect(0, y, FIELD.width * recW * 0.5, h);
    // Echo segments: each echo's lifetime as a ghost bar.
    let offset = 0;
    for (const echo of st.echoes) {
      const w = (echo.frames.length / 3600) * FIELD.width * 0.5;
      context.fillStyle = 'rgba(125,249,255,0.75)';
      context.fillRect(offset, y, w, h);
      offset += w + 2;
    }
    // Playhead: where the live loop is.
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

  function drawResults(ui) {
    const r = ui.results;
    const medalColor = MEDAL_COLORS[r.medal] || PALETTE.text;
    const lines = [
      `${r.levelName} — ${fmtTime(r.time)}${r.par ? `  (par ${fmtTime(r.par)})` : ''}`,
      `Resets ${r.resets} · Alarms ${r.alarms} · Artifacts ${r.artifactsGot}/${r.artifactsTotal}`,
      r.isNewBest ? '★ NEW BEST ★' : r.bestLine || '',
    ];
    // SCORE lives inside the panel, below the lines: the panel is 150 + 3*30 tall,
    // so a fixed y below it collides with the third line and with the buttons.
    const panel = drawPanel(r.medal, lines, medalColor);
    text(`SCORE  ${r.score}`, FIELD.width / 2, panel.y + panel.height - 32, 30, PALETTE.gold, 'center', '800');
    for (const b of ui.buttons) drawButton(b);
  }

  /** Paint one frame: ambient background, the world when there is one, then the screen's UI. */
  function draw(world, ui, now) {
    const t = now || performance.now();
    const dt = lastNow === 0 ? 0.016 : Math.min(0.05, (t - lastNow) / 1000);
    updateAmbient(dt, t);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const screen = ui.screen;
    if (screen === SCREEN_TITLE) { drawTitle(ui, t); return; }
    if (screen === SCREEN_SELECT) { drawSelect(ui); return; }
    if (screen === SCREEN_SETTINGS) { drawSettings(ui); return; }
    if (screen === SCREEN_HELP) { drawHelp(ui); return; }
    if (world && world.state.parsed) {
      drawWorld(world, t);
      drawHud(world, ui);
      drawTimeline(world);
    }
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The timeline waits for you.', 'R still resets the loop when you resume.'], PALETTE.player);
      for (const b of ui.buttons) drawButton(b);
    } else if (screen === SCREEN_RESULTS) {
      drawResults(ui);
    } else if (screen === SCREEN_PLAY) {
      for (const b of ui.buttons) drawButton(b);
      if (world.state.level && world.state.time < 4 && ui.mode === 'story' && world.state.level.id <= 3) {
        context.fillStyle = 'rgba(7,7,15,0.78)';
        rr(context, 300, 560, 680, 56, 12);
        context.fill();
        text(world.state.level.intro, FIELD.width / 2, 596, 17, PALETTE.text, 'center');
      }
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

  resize();
  window.addEventListener('resize', resize);
  return { draw, burst };
}
