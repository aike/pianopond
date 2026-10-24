// 内蔵譜面。progressionText の文法は src/chart/format.js を参照。
// このファイルの譜面データ(BPM・拍子・リズム種別・コード進行)は CC0 1.0 で提供します。
// 既存曲のものは、パブリックドメインの楽曲のコード進行を本プロジェクトで独自に採譜したものです。
// 詳細は README の「ライセンス」を参照してください。

export const BUILTIN_CHARTS = [
  {
    id: 'builtin-canon',
    title: 'カノン進行 (D) 〔初級〕',
    bpm: 72, beatsPerBar: 4, rhythm: 'whole',
    progressionText: 'D | A | Bm | F#m | G | D | G | A | D | A | Bm | F#m | G | D | G | A',
  },
  {
    id: 'builtin-1645',
    title: '1-6-4-5 進行 (C) 〔初級〕',
    bpm: 112, beatsPerBar: 4, rhythm: 'shuffle',
    progressionText: 'C | Am | F | G | C | Am | F | G | C | Am | F | G | C | Am | F | G',
  },
  {
    id: 'builtin-oudou',
    title: '王道進行 (C) 〔中級〕',
    bpm: 120, beatsPerBar: 4, rhythm: '8beat',
    progressionText: 'F | G | Em | Am | F | G | Em | Am | F | G | Em | Am | F | G | C | C',
  },
  {
    id: 'builtin-komuro',
    title: '小室進行 (Am) 〔中級〕',
    bpm: 132, beatsPerBar: 4, rhythm: '16beat',
    progressionText: 'Am | F | G | C | Am | F | G | C | Am | F | G | C | Am | F | G | E',
  },
  {
    id: 'builtin-blues',
    title: '12 小節ブルース (C) 〔中級〕',
    bpm: 96, beatsPerBar: 4, rhythm: 'shuffle',
    progressionText: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | G7 | C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | C7',
  },
  {
    id: 'builtin-251',
    title: 'ツーファイブワン (C) 〔上級〕',
    bpm: 120, beatsPerBar: 4, rhythm: '4beat',
    progressionText: 'Dm7 | G7 | Cmaj7 | Cmaj7 | Em7 | A7 | Dm7 | G7 | Cmaj7 | Am7 | Dm7 G7 | Cmaj7 | Fmaj7 | Bm7b5 E7 | Am7 | Dm7 G7 | Cmaj7',
  },
  {
    id: 'builtin-twinkle',
    title: 'きらきら星 (C) 〔初級〕',
    bpm: 100, beatsPerBar: 4, rhythm: '8beat',
    progressionText: 'C | F C | F C | G C | C G | C G | C G | C G | C | F C | F C | G C',
  },
  {
    id: 'builtin-ode',
    title: '歓喜の歌 (C) 〔初級〕',
    bpm: 108, beatsPerBar: 4, rhythm: '4beat',
    progressionText: 'C | C G | C | G C | C | C G | C | G C | G | C G | G C | G | C | C G | C | G C',
  },
  {
    id: 'builtin-birthday',
    title: 'ハッピーバースデー (C) 〔初級〕 3拍子',
    bpm: 120, beatsPerBar: 3, rhythm: 'whole',
    progressionText: 'C | G | G | C | C | F | C G | C',
  },
  {
    id: 'builtin-amazing',
    title: 'アメイジング・グレイス (G) 〔中級〕 3拍子',
    bpm: 84, beatsPerBar: 3, rhythm: 'whole',
    progressionText: 'G | G | C G | G | G | G | D | D | G | G | C G | G | G | D | G | G',
  },
];
