// All sound is synthesized with WebAudio — no audio files, no network. The music is
// layered (brief D): a slow ambient pad, a gentle arpeggio, and a tension layer
// (a low pulse + heartbeat ticks) that fades in as a drone's alert meter rises and
// stings on alarm. Every effect is a short envelope on an oscillator or a filtered
// noise burst. Nothing here touches the DOM except the AudioContext, so it stays
// silent until the player first interacts with the page.
export function createAudio() {
  let ctx = null;
  let master = null;
  let pad = null;
  let arpGain = null;
  let tensionGain = null;
  let muted = false;
  let volume = 0.7;
  let tension = 0;
  let scheduler = null;
  let nextNoteTime = 0;
  let noteIndex = 0;

  // A slow, minor arpeggio that drifts over the pad (A minor pentatonic).
  const ARP_NOTES = [220, 261.63, 329.63, 392, 440, 523.25, 392, 329.63];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume * 0.5;
      master.connect(ctx.destination);
      startPad();
      startArpeggio();
      startTensionLayer();
      return true;
    } catch {
      return false;
    }
  }

  function startPad() {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    filter.connect(gain);
    gain.connect(master);
    const freqs = [55, 82.4, 110.3];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 8;
      osc.connect(filter);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    pad = { filter, gain };
  }

  function startArpeggio() {
    arpGain = ctx.createGain();
    arpGain.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    arpGain.connect(filter);
    filter.connect(master);
    nextNoteTime = ctx.currentTime + 0.1;
    noteIndex = 0;
    scheduler = setInterval(() => {
      if (!ctx) return;
      while (nextNoteTime < ctx.currentTime + 0.45) {
        const freq = ARP_NOTES[noteIndex % ARP_NOTES.length];
        arpNote(freq, nextNoteTime);
        // Heartbeat ticks ride the tension layer: a slow pulse while a drone
        // is suspicious, twice as fast when it is about to raise the alarm.
        if (tension > 0.05 && noteIndex % (tension > 0.7 ? 1 : 2) === 0) {
          kick(nextNoteTime, 0.05 + 0.12 * tension);
        }
        nextNoteTime += 0.42;
        noteIndex += 1;
      }
    }, 180);
  }

  function startTensionLayer() {
    // A low, uneasy drone whose volume follows the alert meter.
    tensionGain = ctx.createGain();
    tensionGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 58.3;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(tensionGain);
    tensionGain.connect(master);
    osc.start();
    osc2.start();
  }

  function arpNote(freq, t0) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    osc.connect(g);
    g.connect(arpGain);
    osc.start(t0);
    osc.stop(t0 + 0.55);
  }

  function kick(t0, vol) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol = 0.15, freq = 800, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  return {
    ensure,
    get muted() { return muted; },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : volume * 0.5;
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      if (master) master.gain.value = muted ? 0 : volume * 0.5;
    },
    get volume() { return volume; },
    /** 0..1 — how suspicious the nearest drone is; drives the tension layer. */
    setTension(value) {
      tension = Math.max(0, Math.min(1, value));
      if (ctx && tensionGain) {
        tensionGain.gain.setTargetAtTime(tension * 0.05, ctx.currentTime, 0.3);
      }
    },
    get tension() { return tension; },
    step() { noise(0.05, 0.05, 250 + Math.random() * 150); },
    plate() { tone(1200, 0.05, 'square', 0.10); tone(1560, 0.14, 'sine', 0.14, null, 0.05); },
    pickup() {
      tone(880, 0.12, 'sine', 0.22);
      tone(1174, 0.14, 'sine', 0.18, null, 0.07);
      tone(1568, 0.2, 'sine', 0.16, null, 0.14);
    },
    door() { tone(220, 0.25, 'triangle', 0.22, 440); noise(0.2, 0.08, 1200, 0.05); },
    laser() { tone(1800, 0.22, 'sawtooth', 0.14, 180); noise(0.18, 0.12, 3200); },
    alarm() {
      tone(880, 0.14, 'square', 0.10, 660);
      tone(660, 0.14, 'square', 0.10, 880, 0.14);
      tone(587, 0.3, 'sawtooth', 0.07, 440, 0.28);
      noise(0.3, 0.10, 2400, 0.05);
    },
    echo() { tone(1200, 0.4, 'sine', 0.14, 2400); tone(1800, 0.3, 'sine', 0.08, 900, 0.1); },
    reset() { tone(500, 0.3, 'sine', 0.14, 120); },
    laserOff() { tone(980, 0.15, 'triangle', 0.14, 1560); },
    click() { tone(700, 0.06, 'sine', 0.12); },
    win() {
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((n, i) => tone(n, 0.35, 'triangle', 0.18, null, i * 0.09));
    },
    perfect() {
      const notes = [1046, 1174, 1318, 1568, 2093];
      notes.forEach((n, i) => tone(n, 0.4, 'sine', 0.14, null, i * 0.08));
    },
    fail() { tone(330, 0.4, 'sawtooth', 0.1, 110); },
  };
}
