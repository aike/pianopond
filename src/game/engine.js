// ゲーム進行: 伴奏の予約、入力の判定、スコア集計。

import { buildTimeline } from '../chart/timeline.js';
import { RHYTHMS } from '../chart/rhythm.js';
import { Scheduler } from '../audio/scheduler.js';

export const JUDGE = { perfect: 0.05, good: 0.12 }; // 秒
export const SCORE = { perfect: 100, good: 60, miss: 0 };
export const TEMPO_PERCENTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
const BASS_LOW = 36; // ベースの最低音 (C2)

// テンポ割合 → スコア倍率。速く弾くほど高得点(120% なら 1.2 倍)。
export function tempoMultiplier(percent) {
  return Math.round(percent) / 100;
}

export class GameEngine {
  constructor({ ctx, piano, drums, bass, chart, settings, onJudge, onEnd }) {
    this.ctx = ctx;
    this.piano = piano;
    this.drums = drums;
    this.bass = bass;
    this.chart = chart;
    this.settings = settings;
    this.onJudge = onJudge;
    this.onEnd = onEnd;
    this.running = false;
    this.held = new Set();
    this.prepare();
  }

  prepare() {
    const { chart, settings } = this;
    const lo = settings.baseNote;
    const hi = lo + 24;
    const tl = buildTimeline(chart, lo, hi);
    this.tempoPercent = settings.tempoPercent || 100;
    this.multiplier = tempoMultiplier(this.tempoPercent);
    this.bpm = chart.bpm * this.tempoPercent / 100;
    this.beatSec = 60 / this.bpm;
    this.rhythm = RHYTHMS[chart.rhythm] || RHYTHMS['8beat'];
    this.spb = this.rhythm.stepsPerBeat;
    this.stepSec = this.beatSec / this.spb;
    this.stepsPerBar = chart.beatsPerBar * this.spb;
    this.totalBeats = tl.totalBeats;
    this.totalSteps = Math.ceil(this.totalBeats * this.spb);
    this.chords = tl.chords.map((c) => ({ ...c, status: 'pending', delta: 0, time: 0, judgeTime: 0, judgedAt: 0 }));
    this.nextJudge = 0;
    this.displayIndex = 0; // 「いま弾く」として表示中の和音。鍵が離されるまで nextJudge より遅れることがある
    this.chordPtr = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, good: 0, miss: 0 };
    this.lastJudge = null;
  }

  start() {
    const ctx = this.ctx;
    const countInBeats = this.chart.beatsPerBar;
    this.countInSteps = countInBeats * this.spb;
    this.startTime = ctx.currentTime + 0.3;
    this.songStart = this.startTime + countInBeats * this.beatSec;
    const offset = (this.settings.offsetMs || 0) / 1000;
    for (const c of this.chords) {
      c.time = this.songStart + c.beat * this.beatSec;
      c.judgeTime = c.time + offset;
    }
    this.endTime = this.songStart + this.totalBeats * this.beatSec + 1.0;
    this.nextStep = -this.countInSteps;
    this.running = true;
    this.scheduler = new Scheduler(ctx, (h) => this.schedule(h));
    this.scheduler.start();
  }

  stepTime(step) {
    return this.songStart + step * this.stepSec;
  }

  schedule(horizon) {
    while (this.nextStep < this.totalSteps && this.stepTime(this.nextStep) < horizon) {
      this.scheduleStep(this.nextStep);
      this.nextStep++;
    }
  }

  chordAtBeat(beat) {
    const cs = this.chords;
    while (this.chordPtr < cs.length - 1 && cs[this.chordPtr + 1].beat <= beat + 1e-6) this.chordPtr++;
    const c = cs[this.chordPtr];
    return c && c.beat <= beat + 1e-6 ? c : null;
  }

  scheduleStep(step) {
    const t = this.stepTime(step);
    const spb = this.spb;
    if (step < 0) {
      if ((((step % spb) + spb) % spb) === 0) this.drums.click(t, step === -this.countInSteps);
      return;
    }
    const i = step % this.stepsPerBar;
    const r = this.rhythm;
    const at = (p) => p[i % p.length];
    if (at(r.kick) === 'x') this.drums.kick(t);
    if (at(r.snare) === 'x') this.drums.snare(t);
    const h = at(r.hat);
    if (h === 'X') this.drums.hat(t, 1);
    else if (h === 'x') this.drums.hat(t, 0.55);

    const b = at(r.bass);
    if (b !== '.') {
      const chord = this.chordAtBeat(step / spb);
      if (chord) {
        const pc = chord.parsed.bass ?? chord.parsed.root;
        let midi = BASS_LOW + pc;
        if (b === '5') midi += 7;
        if (b === 'o') midi += 12;
        if (midi > BASS_LOW + 14) midi -= 12;
        const p = r.bass;
        const pi = i % p.length;
        let gap = 1;
        while (pi + gap < p.length && pi + gap < this.stepsPerBar && p[pi + gap] === '.') gap++;
        if (b === 'R') gap = Math.min(gap, this.stepsPerBar - i);
        this.bass.note(midi, t, gap * this.stepSec * 0.9);
      }
    }
  }

  // 毎フレーム呼ぶ。見逃し(Miss)判定と終了検知。
  update() {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    while (this.nextJudge < this.chords.length && now > this.chords[this.nextJudge].judgeTime + JUDGE.good) {
      this.applyJudge(this.chords[this.nextJudge], 'miss', 0);
    }
    this.syncDisplay();
    if (now >= this.endTime) this.finish();
  }

  // 「いま弾く」表示を次の和音へ進める。
  // 判定が済んでも何かの鍵が押されている間は切り替えず、全部離された時点で切り替える。
  syncDisplay() {
    if (this.displayIndex < this.nextJudge && this.held.size === 0) this.displayIndex = this.nextJudge;
  }

  noteOn(midi, time, vel = 0.8) {
    this.piano.noteOn(midi, undefined, vel);
    this.held.add(midi);
    if (this.running) this.tryJudge(time);
  }

  noteOff(midi) {
    this.piano.noteOff(midi);
    this.held.delete(midi);
    this.syncDisplay();
  }

  tryJudge(t) {
    for (;;) {
      const c = this.chords[this.nextJudge];
      if (!c) return;
      const d = t - c.judgeTime;
      if (d > JUDGE.good) {
        this.applyJudge(c, 'miss', 0);
        continue;
      }
      if (d < -JUDGE.good) return;
      if (c.notes.every((n) => this.held.has(n))) {
        this.applyJudge(c, Math.abs(d) <= JUDGE.perfect ? 'perfect' : 'good', d);
      }
      return;
    }
  }

  applyJudge(chord, type, delta) {
    chord.status = type;
    chord.delta = delta;
    chord.judgedAt = this.ctx.currentTime;
    this.nextJudge++;
    this.counts[type]++;
    this.score = Math.round(this.score + SCORE[type] * this.multiplier);
    if (type === 'miss') this.combo = 0;
    else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    this.lastJudge = { type, delta, time: chord.judgedAt };
    this.onJudge?.(this.lastJudge);
  }

  // 次に判定される和音
  currentChord() {
    return this.chords[this.nextJudge] || null;
  }

  nextChord() {
    return this.chords[this.nextJudge + 1] || null;
  }

  // 「いま弾く」に表示する和音(鍵盤の色ガイドもこれに従う)
  displayChord() {
    return this.chords[this.displayIndex] || null;
  }

  displayNextChord() {
    return this.chords[this.displayIndex + 1] || null;
  }

  result() {
    const n = this.chords.length;
    const rawScore = this.counts.perfect * SCORE.perfect + this.counts.good * SCORE.good;
    return {
      score: this.score,
      maxScore: Math.round(n * SCORE.perfect * this.multiplier),
      accuracy: n ? rawScore / (n * SCORE.perfect) : 0,
      counts: { ...this.counts },
      maxCombo: this.maxCombo,
      total: n,
      tempoPercent: this.tempoPercent,
      multiplier: this.multiplier,
      bpm: this.bpm,
    };
  }

  finish() {
    if (!this.running) return;
    this.running = false;
    this.scheduler.stop();
    this.onEnd?.(this.result());
  }

  stop() {
    this.running = false;
    this.scheduler?.stop();
    this.piano.allOff();
    this.held.clear();
  }
}
