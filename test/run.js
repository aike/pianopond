// ブラウザ不要の部分(コード解析、ボイシング、進行テキスト、タイムライン)の簡易テスト。
// 実行: node test/run.js

import assert from 'node:assert/strict';
import { parseChord, noteName } from '../src/chart/parser.js';
import { voiceChord } from '../src/chart/voicing.js';
import { parseProgressionText, progressionToText, normalizeChart } from '../src/chart/format.js';
import { buildTimeline } from '../src/chart/timeline.js';
import { RHYTHMS } from '../src/chart/rhythm.js';
import { GameEngine, TEMPO_PERCENTS, tempoMultiplier } from '../src/game/engine.js';
import { BUILTIN_CHARTS } from '../data/charts.js';
import { volumeToGain, volumeLabel } from '../src/audio/volume.js';
import { MidiInput, ALL_INPUTS } from '../src/midi.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`NG: ${name}\n   ${e.message}`);
    process.exitCode = 1;
  }
}

test('parseChord 基本', () => {
  assert.deepEqual(parseChord('C').pcs, [0, 4, 7]);
  assert.deepEqual(parseChord('Am7').pcs, [9, 0, 4, 7]);
  assert.deepEqual(parseChord('F#m7b5').pcs, [6, 9, 0, 4]);
  assert.deepEqual(parseChord('Bb').pcs, [10, 2, 5]);
  const slash = parseChord('G/B');
  assert.equal(slash.root, 7);
  assert.equal(slash.bass, 11);
  assert.throws(() => parseChord('H'));
  assert.throws(() => parseChord('Cxyz'));
});

test('noteName', () => {
  assert.equal(noteName(48), 'C3');
  assert.equal(noteName(61), 'C#4');
});

test('voiceChord 左手ベース + 右手、範囲内', () => {
  const lo = 48;
  const hi = 72;
  let prev = null;
  for (const name of ['C', 'G7', 'Am9', 'F/A', 'Dm7', 'G7b9', 'B', 'Bmaj7', 'Bb7', 'C']) {
    const v = voiceChord(parseChord(name), prev, lo, hi);
    assert.ok(v.bass >= lo && v.bass < lo + 12, `${name} ベース範囲外: ${v.bass}`);
    assert.ok(v.right.length >= 2 && v.right.length <= 4, `${name}: ${v.right}`);
    assert.ok(v.right.every((n) => n > v.bass && n <= hi), `${name} 右手範囲外: ${v.right}`);
    assert.deepEqual(v.right, [...v.right].sort((a, b) => a - b));
    assert.deepEqual(v.notes, [v.bass, ...v.right]);
    prev = v.right;
  }
});

test('voiceChord ベースはルート(分数コードは指定音)', () => {
  assert.equal(voiceChord(parseChord('C'), null, 48, 72).bass, 48);
  assert.equal(voiceChord(parseChord('C/E'), null, 48, 72).bass, 52);
  assert.equal(voiceChord(parseChord('G'), null, 48, 72).bass, 55);
  assert.equal(voiceChord(parseChord('B'), null, 48, 72).bass, 59);
});

test('voiceChord 右手の移動が小さい', () => {
  const c = voiceChord(parseChord('C'), null, 48, 72);
  const f = voiceChord(parseChord('F'), c.right, 48, 72);
  const move = f.right.reduce((s, n) => s + Math.min(...c.right.map((p) => Math.abs(n - p))), 0);
  assert.ok(move <= 4, `C→F の移動 ${move}: ${c.right} → ${f.right}`);
});

test('voiceChord 全コード種別 × 全ルートが範囲に収まる', () => {
  const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const quals = ['', 'm', '7', 'maj7', 'm7', 'dim', 'm7b5', 'aug', 'sus4', '6', 'add9', '9', '7b9', '5'];
  for (const r of roots) {
    for (const q of quals) {
      const v = voiceChord(parseChord(r + q), null, 48, 72);
      assert.ok(v.notes.every((n) => n >= 48 && n <= 72), `${r}${q}: ${v.notes}`);
      assert.ok(v.right[0] > v.bass, `${r}${q}: 右手がベースより下`);
    }
  }
});

test('parseProgressionText', () => {
  const p = parseProgressionText('C | Am F | G:3 C:1 | % \n Dm7 G7 // comment', 4);
  assert.deepEqual(p.map((e) => [e.chord, e.beats]), [
    ['C', 4], ['Am', 2], ['F', 2], ['G', 3], ['C', 1], ['C', 4], ['Dm7', 2], ['G7', 2],
  ]);
  const withNotes = parseProgressionText('F[53,57,60]', 4);
  assert.deepEqual(withNotes[0].notes, [53, 57, 60]);
  assert.throws(() => parseProgressionText('C:5 D', 4));
  assert.throws(() => parseProgressionText('', 4));
});

test('progressionToText 往復', () => {
  const text = 'C | Am F | G:3 C:1 | Dm7 G7';
  const prog = parseProgressionText(text, 4);
  const back = progressionToText(prog, 4);
  assert.deepEqual(parseProgressionText(back, 4), prog);
});

test('normalizeChart の検証', () => {
  assert.throws(() => normalizeChart({ bpm: 10, progressionText: 'C' }));
  assert.throws(() => normalizeChart({ bpm: 120, rhythm: 'nope', progressionText: 'C' }));
  const chart = normalizeChart({ bpm: 120, progression: [{ chord: 'C' }, { chord: 'G', beats: 2 }] });
  assert.equal(chart.progression[0].beats, 4);
  assert.equal(chart.progression[1].beats, 2);
});

test('buildTimeline 拍の積算', () => {
  const chart = normalizeChart({ bpm: 120, progressionText: 'C | Am F | G' });
  const tl = buildTimeline(chart, 48, 72);
  assert.deepEqual(tl.chords.map((c) => c.beat), [0, 4, 6, 8]);
  assert.equal(tl.totalBeats, 12);
  assert.throws(() => buildTimeline(normalizeChart({ bpm: 120, progressionText: 'C[40,44,47]' }), 48, 72));
});

test('リズムパターンの長さ', () => {
  for (const [id, r] of Object.entries(RHYTHMS)) {
    const len = r.stepsPerBeat * 4;
    for (const key of ['kick', 'snare', 'hat', 'bass']) assert.equal(r[key].length, len, `${id}.${key}`);
  }
});

test('テンポ倍率', () => {
  assert.ok(TEMPO_PERCENTS.every((p) => p % 10 === 0));
  assert.equal(TEMPO_PERCENTS[0], 10);
  assert.equal(tempoMultiplier(10), 0.1);
  assert.equal(TEMPO_PERCENTS[TEMPO_PERCENTS.length - 1], 150);
  assert.equal(tempoMultiplier(100), 1);
  assert.equal(tempoMultiplier(120), 1.2);
  assert.equal(tempoMultiplier(50), 0.5);
  assert.ok(tempoMultiplier(150) > tempoMultiplier(100));
});

test('音量: 最小は無音、上げると単調増加', () => {
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToGain('0'), 0);
  assert.equal(volumeToGain(-1), 0);
  assert.equal(volumeToGain(NaN), 0);
  assert.equal(volumeToGain(1), 1);
  let prev = 0;
  for (let v = 0.05; v <= 1.0001; v += 0.05) {
    const g = volumeToGain(v);
    assert.ok(g > prev, `v=${v}`);
    prev = g;
  }
  assert.equal(volumeLabel(0), 'ミュート');
  assert.equal(volumeLabel(0.8), '80%');
});

test('「いま弾く」表示は全鍵を離すまで切り替わらない', () => {
  const ctx = { currentTime: 0 };
  const silent = { noteOn() {}, noteOff() {}, allOff() {} };
  const chart = normalizeChart({ bpm: 120, progressionText: 'C | G | Am' });
  const e = new GameEngine({ ctx, piano: silent, drums: {}, bass: {}, chart, settings: { baseNote: 48, tempoPercent: 100, offsetMs: 0 } });
  // start() を使わず、判定時刻だけ設定して running 扱いにする
  e.chords.forEach((c, i) => { c.time = c.judgeTime = 10 + i * 2; });
  e.running = true;
  e.endTime = 100;
  e.scheduler = { stop() {} };
  assert.equal(e.displayChord().name, 'C');
  // C をちょうどのタイミングで弾く
  ctx.currentTime = 10;
  for (const n of e.chords[0].notes) e.noteOn(n, 10);
  assert.equal(e.chords[0].status, 'perfect');
  assert.equal(e.currentChord().name, 'G');
  assert.equal(e.displayChord().name, 'C', '押さえている間は切り替わらない');
  e.update();
  assert.equal(e.displayChord().name, 'C');
  // 1 鍵だけ離してもまだ切り替わらない
  e.noteOff(e.chords[0].notes[0]);
  assert.equal(e.displayChord().name, 'C');
  // 全部離すと切り替わる
  for (const n of e.chords[0].notes.slice(1)) e.noteOff(n);
  assert.equal(e.displayChord().name, 'G');
  assert.equal(e.displayNextChord().name, 'Am');
  // 鍵を押したまま G を見逃した場合も、離すまで G のまま
  e.noteOn(48, 11.9);
  ctx.currentTime = 13;
  e.update();
  assert.equal(e.chords[1].status, 'miss');
  assert.equal(e.displayChord().name, 'G');
  e.noteOff(48);
  assert.equal(e.displayChord().name, 'Am');
});

test('MidiInput: 全入力を聴き、選択ポート以外は演奏に使わない', () => {
  class FakePort {
    constructor(id, name) { this.id = id; this.name = name; this.ls = new Set(); this.opened = 0; }
    addEventListener(_, fn) { this.ls.add(fn); }
    removeEventListener(_, fn) { this.ls.delete(fn); }
    open() { this.opened++; return Promise.resolve(); }
    emit(bytes) { for (const fn of this.ls) fn({ data: Uint8Array.from(bytes), timeStamp: 1 }); }
  }
  const a = new FakePort('a', 'Keyboard A');
  const b = new FakePort('b', 'Keyboard B');
  const m = new MidiInput();
  m.access = { inputs: new Map([['a', a], ['b', b]]), outputs: new Map() };
  const ons = [];
  const offs = [];
  const seen = [];
  m.onNoteOn = (n, v) => ons.push([n, v]);
  m.onNoteOff = (n) => offs.push(n);
  m.onMessage = (info) => seen.push(info.port);

  // 既定(すべての入力)
  const active = m.select(ALL_INPUTS);
  assert.deepEqual(active.map((p) => p.id), ['a', 'b']);
  assert.equal(a.opened, 1);
  assert.equal(b.opened, 1);
  a.emit([0x90, 60, 100]);
  b.emit([0x91, 62, 0]); // ch2 の velocity 0 は Note Off
  assert.deepEqual(ons, [[60, 100 / 127]]);
  assert.deepEqual(offs, [62]);
  assert.equal(m.lastMessage.type, 'Note Off');
  assert.equal(m.lastMessage.channel, 2);

  // 特定ポートのみ
  ons.length = 0; offs.length = 0; seen.length = 0;
  assert.deepEqual(m.select('b').map((p) => p.id), ['b']);
  assert.equal(a.ls.size, 1, '古いリスナーは付け替えられる');
  a.emit([0x90, 48, 80]);
  b.emit([0x80, 50, 0]);
  assert.deepEqual(ons, [], '選択外のポートは演奏に使わない');
  assert.deepEqual(offs, [50]);
  assert.deepEqual(seen, ['Keyboard A', 'Keyboard B'], 'モニタには全ポートが出る');
  assert.equal(m.messageCount, 4);

  // 見つからない ID はすべての入力に戻る
  assert.deepEqual(m.select('zzz').map((p) => p.id), ['a', 'b']);
  assert.equal(m.selectedId, ALL_INPUTS);
});

test('内蔵譜面がすべて読める', () => {
  for (const raw of BUILTIN_CHARTS) {
    const chart = normalizeChart({ ...raw, builtin: true });
    const tl = buildTimeline(chart, 48, 72);
    assert.ok(tl.chords.length > 0, raw.title);
    for (const c of tl.chords) {
      assert.ok(c.notes.every((n) => n >= 48 && n <= 72), `${raw.title}: ${c.name}`);
      assert.equal(c.notes[0], c.bassNote);
      assert.ok(c.rightNotes.every((n) => n > c.bassNote));
    }
  }
});

console.log(`${passed} tests passed${process.exitCode ? ', some failed' : ''}`);
