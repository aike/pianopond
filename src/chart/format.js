// 譜面データの正規化と、コード進行テキストとの相互変換。
//
// 進行テキストの文法:
//   小節は "|" または改行で区切る。小節内のコードは空白で区切り、拍を等分する。
//   "Am:2" のように ":拍数" で明示できる。"%" は直前のコードの繰り返し。
//   "F[53,57,60]" のように [MIDI番号,...] で押す音を固定できる(C3=48 基準)。
//   "//" 以降はコメント。

import { parseChord } from './parser.js';
import { RHYTHMS } from './rhythm.js';

const TOKEN_RE = /^([^\[:\s]+)(?:\[([^\]]*)\])?(?::(\d+(?:\.\d+)?))?$/;

export function parseProgressionText(text, beatsPerBar) {
  const progression = [];
  let prev = null;
  const bars = String(text).replace(/\/\/[^\n]*/g, '').split(/[|\n]/);
  bars.forEach((bar, bi) => {
    const tokens = bar.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return;
    const entries = tokens.map((tok) => {
      const m = TOKEN_RE.exec(tok);
      if (!m) throw new Error(`${bi + 1} 小節目のトークンを解釈できません: "${tok}"`);
      let chord = m[1];
      let notes;
      if (m[2] !== undefined) {
        notes = m[2].split(',').map((s) => s.trim()).filter(Boolean).map(Number);
        if (notes.some((n) => !Number.isInteger(n))) throw new Error(`${bi + 1} 小節目の音指定が不正です: "${tok}"`);
      }
      if (chord === '%' || chord === '-') {
        if (!prev) throw new Error(`${bi + 1} 小節目: 繰り返し記号の前にコードがありません`);
        chord = prev.chord;
        if (!notes && prev.notes) notes = prev.notes.slice();
      } else {
        parseChord(chord);
      }
      const beats = m[3] !== undefined ? Number(m[3]) : null;
      if (beats !== null && !(beats > 0)) throw new Error(`${bi + 1} 小節目: 拍数が不正です: "${tok}"`);
      return { chord, notes, beats };
    });
    const fixed = entries.reduce((s, e) => s + (e.beats ?? 0), 0);
    const free = entries.filter((e) => e.beats === null).length;
    const remain = beatsPerBar - fixed;
    if (free > 0 && remain <= 0) throw new Error(`${bi + 1} 小節目: 拍数が小節に収まりません`);
    for (const e of entries) {
      const entry = { chord: e.chord, beats: e.beats === null ? remain / free : e.beats };
      if (e.notes) entry.notes = e.notes;
      progression.push(entry);
      prev = entry;
    }
  });
  if (!progression.length) throw new Error('コード進行が空です');
  return progression;
}

function tokenOf(entry, beats) {
  let t = entry.chord;
  if (entry.notes) t += `[${entry.notes.join(',')}]`;
  if (beats !== null) t += `:${beats}`;
  return t;
}

export function progressionToText(progression, beatsPerBar) {
  const lines = [];
  let bar = [];
  let acc = 0;
  const flush = () => {
    if (!bar.length) return;
    const even = bar.every((e) => Math.abs(e.beats - beatsPerBar / bar.length) < 1e-6);
    lines.push(bar.map((e) => tokenOf(e, even ? null : e.beats)).join(' '));
    bar = [];
    acc = 0;
  };
  for (const e of progression) {
    if (acc + e.beats > beatsPerBar + 1e-6) flush();
    bar.push(e);
    acc += e.beats;
    if (acc >= beatsPerBar - 1e-6) flush();
  }
  flush();
  return lines.join(' | ');
}

export function normalizeChart(raw) {
  const beatsPerBar = Number(raw.beatsPerBar ?? 4);
  const chart = {
    id: raw.id || `user-${Date.now().toString(36)}`,
    title: String(raw.title ?? '').trim() || '無題',
    bpm: Number(raw.bpm),
    beatsPerBar,
    rhythm: raw.rhythm || '8beat',
    builtin: !!raw.builtin,
  };
  if (!(chart.bpm >= 30 && chart.bpm <= 300)) throw new Error('BPM は 30〜300 で指定してください');
  if (!(Number.isInteger(beatsPerBar) && beatsPerBar >= 2 && beatsPerBar <= 7)) throw new Error('拍子は 2〜7 で指定してください');
  if (!RHYTHMS[chart.rhythm]) throw new Error(`未対応のリズム種別です: ${chart.rhythm}`);
  if (raw.progressionText !== undefined) {
    chart.progression = parseProgressionText(raw.progressionText, beatsPerBar);
  } else {
    if (!Array.isArray(raw.progression) || !raw.progression.length) throw new Error('コード進行がありません');
    chart.progression = raw.progression.map((e, i) => {
      const entry = { chord: String(e.chord ?? '').trim(), beats: Number(e.beats ?? beatsPerBar) };
      parseChord(entry.chord);
      if (!(entry.beats > 0)) throw new Error(`${i + 1} 番目のコードの拍数が不正です`);
      if (Array.isArray(e.notes) && e.notes.length) entry.notes = e.notes.map(Number);
      return entry;
    });
  }
  return chart;
}

export function chartToJSON(chart) {
  return {
    title: chart.title,
    bpm: chart.bpm,
    beatsPerBar: chart.beatsPerBar,
    rhythm: chart.rhythm,
    progression: chart.progression,
  };
}
