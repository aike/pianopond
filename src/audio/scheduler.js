// 先読みスケジューラ。一定間隔で「horizon までのイベントを予約せよ」とコールバックする。

export class Scheduler {
  constructor(ctx, callback, { lookahead = 0.15, interval = 25 } = {}) {
    this.ctx = ctx;
    this.callback = callback;
    this.lookahead = lookahead;
    this.interval = interval;
    this.timer = null;
  }

  start() {
    this.stop();
    this.tick();
    this.timer = setInterval(() => this.tick(), this.interval);
  }

  tick() {
    this.callback(this.ctx.currentTime + this.lookahead);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
