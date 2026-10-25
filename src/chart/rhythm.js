// リズム種別。1 小節(4 拍)分の伴奏パターンを文字列で持つ。
// kick / snare: 'x' で発音。hat: 'X' アクセント、'x' 弱。
// bass: 'r' ルート、'5' 5 度、'o' オクターブ上、'R' 小節いっぱい伸ばすルート。'.' は休み。
// 3 拍子など 4 拍以外の場合は、小節内のステップ数ぶんだけ先頭から使う。

export const RHYTHMS = {
  whole: {
    label: 'ホール(小節頭のみ)', stepsPerBeat: 4,
    kick: 'x...............', snare: '................', hat: 'X...x...x...x...', bass: 'R...............',
  },
  '4beat': {
    label: '4ビート', stepsPerBeat: 4,
    kick: 'x.......x.......', snare: '....x.......x...', hat: 'X...x...X...x...', bass: 'r...r...5...r...',
  },
  '8beat': {
    label: '8ビート', stepsPerBeat: 4,
    kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'X.x.X.x.X.x.X.x.', bass: 'r.r.r.r.r.r.r.r.',
  },
  '16beat': {
    label: '16ビート', stepsPerBeat: 4,
    kick: 'x..x..x...x..x..', snare: '....x.......x...', hat: 'XxxxXxxxXxxxXxxx', bass: 'r..r..r.r..5..o.',
  },
  shuffle: {
    label: 'シャッフル', stepsPerBeat: 3,
    kick: 'x.....x.....', snare: '...x.....x..', hat: 'X.xX.xX.xX.x', bass: 'r..r..5..r..',
  },
};

export const RHYTHM_IDS = Object.keys(RHYTHMS);
