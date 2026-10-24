// コードネームの解析。
// "C", "Am7", "F#m7b5", "G/B" などを { root, bass, intervals, pcs } に変換する。

export const ROOT_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTAL = { '': 0, '#': 1, '♯': 1, b: -1, '♭': -1 };
export const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 種別 → ルートからの半音間隔
export const QUALITIES = {
  '': [0, 4, 7], M: [0, 4, 7], maj: [0, 4, 7],
  m: [0, 3, 7], min: [0, 3, 7], '-': [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11], '△7': [0, 4, 7, 11], 'Δ7': [0, 4, 7, 11],
  m7: [0, 3, 7, 10], min7: [0, 3, 7, 10], '-7': [0, 3, 7, 10],
  mM7: [0, 3, 7, 11], mmaj7: [0, 3, 7, 11], 'm△7': [0, 3, 7, 11],
  dim: [0, 3, 6], '°': [0, 3, 6], o: [0, 3, 6],
  dim7: [0, 3, 6, 9], '°7': [0, 3, 6, 9], o7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10], 'm7-5': [0, 3, 6, 10], 'ø': [0, 3, 6, 10], 'ø7': [0, 3, 6, 10],
  aug: [0, 4, 8], '+': [0, 4, 8], '+5': [0, 4, 8],
  aug7: [0, 4, 8, 10], '7#5': [0, 4, 8, 10], '7+5': [0, 4, 8, 10],
  '7b5': [0, 4, 6, 10], '7-5': [0, 4, 6, 10],
  sus2: [0, 2, 7], sus4: [0, 5, 7], sus: [0, 5, 7], '7sus4': [0, 5, 7, 10],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '69': [0, 4, 9, 14],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], add2: [0, 2, 4, 7],
  '9': [0, 4, 10, 14], m9: [0, 3, 10, 14], maj9: [0, 4, 11, 14], M9: [0, 4, 11, 14],
  '7b9': [0, 4, 10, 13], '7#9': [0, 4, 10, 15],
  '5': [0, 7],
};

const CHORD_RE = /^([A-G])([#b♯♭]?)([^/]*)(?:\/([A-G])([#b♯♭]?))?$/;

export function parseChord(text) {
  const name = String(text).trim();
  const m = CHORD_RE.exec(name);
  if (!m) throw new Error(`コード名を解釈できません: "${name}"`);
  const root = (ROOT_PC[m[1]] + ACCIDENTAL[m[2]] + 12) % 12;
  const quality = m[3];
  const intervals = QUALITIES[quality];
  if (!intervals) throw new Error(`未対応のコード種別です: "${name}"`);
  const bass = m[4] ? (ROOT_PC[m[4]] + ACCIDENTAL[m[5]] + 12) % 12 : null;
  const pcs = [...new Set(intervals.map((i) => (root + i) % 12))];
  return { name, root, bass, intervals, pcs };
}

export function noteName(midi) {
  return PC_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}
