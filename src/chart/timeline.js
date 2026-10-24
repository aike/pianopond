// 譜面から「何拍目にどの鍵を押すか」のリストを作る。
// 各和音は bassNote(左手 1 音)と rightNotes(右手)を持ち、notes はその全部。

import { parseChord } from './parser.js';
import { voiceChord } from './voicing.js';

export function buildTimeline(chart, lo, hi) {
  const chords = [];
  let beat = 0;
  let prevRight = null;
  chart.progression.forEach((e, i) => {
    const parsed = parseChord(e.chord);
    let bassNote;
    let rightNotes;
    if (e.notes && e.notes.length) {
      const notes = [...new Set(e.notes.map((n) => n + (lo - 48)))].sort((a, b) => a - b);
      const bad = notes.find((n) => n < lo || n > hi);
      if (bad !== undefined) throw new Error(`${i + 1} 番目のコード ${e.chord} の音 ${bad - (lo - 48)} は鍵盤の範囲外です`);
      bassNote = notes[0];
      rightNotes = notes.slice(1);
    } else {
      const v = voiceChord(parsed, prevRight, lo, hi);
      bassNote = v.bass;
      rightNotes = v.right;
    }
    const notes = [...new Set([bassNote, ...rightNotes])].sort((a, b) => a - b);
    chords.push({ index: i, name: e.chord, parsed, notes, bassNote, rightNotes, beat, beats: e.beats });
    beat += e.beats;
    prevRight = rightNotes;
  });
  return { chords, totalBeats: beat };
}
