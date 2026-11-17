// All sound is synthesized with WebAudio — no audio files, no network. The ambient pad
// is two detuned oscillators through a low-pass filter; every effect is a short envelope
// on an oscillator or a filtered noise burst. Nothing here touches the DOM except the
// AudioContext, so it stays silent until the player first interacts with the page.
export function createAudio() {
  let ctx = null;
  let master = null;
  let pad = null;
  let muted = false;
  let volume = 0.7;

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
    step() { noise(0.05, 0.05, 300); },
    pickup() { tone(880, 0.12, 'sine', 0.22); tone(1318, 0.18, 'sine', 0.18, null, 0.07); },
    door() { tone(220, 0.25, 'triangle', 0.22, 440); noise(0.2, 0.08, 1200, 0.05); },
    alarm() { tone(660, 0.16, 'square', 0.12, 520); tone(520, 0.16, 'square', 0.12, 660, 0.16); },
    echo() { tone(1200, 0.4, 'sine', 0.14, 2400); tone(1800, 0.3, 'sine', 0.08, 900, 0.1); },
    reset() { tone(500, 0.3, 'sine', 0.14, 120); },
    laserOff() { tone(980, 0.15, 'triangle', 0.14, 1560); },
    click() { tone(700, 0.06, 'sine', 0.12); },
    win() {
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((n, i) => tone(n, 0.35, 'triangle', 0.18, null, i * 0.09));
    },
    fail() { tone(330, 0.4, 'sawtooth', 0.1, 110); },
  };
}
