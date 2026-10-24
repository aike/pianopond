// 合成ドラム: キック、スネア、ハイハット、カウント用クリック。

export class Drums {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(dest);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  noiseSource(t) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t);
    return src;
  }

  kick(t, g = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.2 * g, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  snare(t, g = 1) {
    const ctx = this.ctx;
    const noise = this.noiseSource(t);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5 * g, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise.connect(bp).connect(ng).connect(this.out);
    noise.stop(t + 0.25);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5 * g, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  hat(t, g = 1) {
    const ctx = this.ctx;
    const noise = this.noiseSource(t);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22 * g, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.connect(hp).connect(gain).connect(this.out);
    noise.stop(t + 0.08);
  }

  click(t, accent = false) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 1600 : 1100;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.05);
  }
}
