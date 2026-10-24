// 合成ベース: ノコギリ波 + ローパス。

export class Bass {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.6;
    this.out.connect(dest);
  }

  note(midi, t, dur, g = 1) {
    const ctx = this.ctx;
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = freq / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.25;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.setTargetAtTime(280, t, 0.08);

    const end = t + Math.max(0.08, dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.9 * g, t + 0.01);
    gain.gain.setValueAtTime(0.9 * g, end - 0.03);
    gain.gain.linearRampToValueAtTime(0, end);

    osc.connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(gain).connect(this.out);
    osc.start(t);
    sub.start(t);
    osc.stop(end + 0.05);
    sub.stop(end + 0.05);
  }
}
