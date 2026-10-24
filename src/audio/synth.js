// 簡易ピアノ音源。倍音を重ねたオシレータ + ローパス + 減衰エンベロープ。

const PARTIALS = [
  ['triangle', 1, 1.0],
  ['sine', 2, 0.35],
  ['sine', 3, 0.12],
  ['sine', 4, 0.05],
];

export class Piano {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(dest);
    this.voices = new Map();
  }

  noteOn(midi, time = this.ctx.currentTime, vel = 0.8) {
    const ctx = this.ctx;
    const t = Math.max(time, ctx.currentTime);
    this.noteOff(midi, t);
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const v = Math.max(0.1, Math.min(1, vel));

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.004);
    gain.gain.setTargetAtTime(v * 0.4, t + 0.004, 0.22);
    gain.gain.setTargetAtTime(0, t + 0.4, 1.4);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(Math.min(14000, freq * 9 * v + 1000), t);
    filter.frequency.setTargetAtTime(Math.max(freq * 2.5, 900), t, 0.35);

    const oscs = PARTIALS.map(([type, mult, g]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * mult;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og).connect(filter);
      osc.start(t);
      osc.stop(t + 7);
      return osc;
    });
    filter.connect(gain).connect(this.out);
    const voice = { oscs, gain };
    this.voices.set(midi, voice);
    oscs[0].onended = () => {
      if (this.voices.get(midi) === voice) this.voices.delete(midi);
    };
  }

  noteOff(midi, time = this.ctx.currentTime) {
    const voice = this.voices.get(midi);
    if (!voice) return;
    this.voices.delete(midi);
    const t = Math.max(time, this.ctx.currentTime);
    const g = voice.gain.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
    else g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, 0.07);
    for (const osc of voice.oscs) {
      try { osc.stop(t + 0.6); } catch (_) { /* すでに停止済み */ }
    }
  }

  allOff() {
    for (const midi of [...this.voices.keys()]) this.noteOff(midi);
  }
}
