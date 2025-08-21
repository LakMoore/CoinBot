import config from '../config';

export type Position = 'LONG' | 'NONE';
export type Signal = 'BUY' | 'SELL' | 'HOLD';

export type StrategyParams = {
  maDays: number; // e.g., 20
  buyBelowPct: number; // price below MA to arm trailing buy, e.g., 5
  trailingBuyPct: number; // bounce from local low to execute buy, e.g., 1
  trailingStopPct: number; // e.g., config.trailingStop.percentage
  activationThresholdPct: number; // e.g., config.trailingStop.activationThreshold
};

type Sample = { tMs: number; price: number };

export class EntryExitStrategy {
  private params: StrategyParams;

  // SMA state (time-based window)
  private window: Sample[] = [];
  private sum = 0;
  private windowMs: number;

  // Entry state
  private trackingEntry = false;
  private localLow = Infinity;

  // Exit (trailing stop) state
  private highestPrice = 0;
  private trailingStopPrice = 0;
  private active = false; // trailing activation after threshold
  private entryPrice = 0; // last executed buy price (for never-sell-at-loss)

  constructor(p?: Partial<StrategyParams>) {
    this.params = {
      maDays: p?.maDays ?? config.reentry.maDays ?? 20,
      buyBelowPct: p?.buyBelowPct ?? config.reentry.buyBelowPct ?? 5,
      trailingBuyPct: p?.trailingBuyPct ?? config.reentry.trailingBuyPct ?? 1,
      trailingStopPct: p?.trailingStopPct ?? config.trailingStop.percentage,
      activationThresholdPct:
        p?.activationThresholdPct ?? config.trailingStop.activationThreshold,
    };
    this.windowMs = this.params.maDays * 24 * 60 * 60 * 1000;
  }

  nextSignal(position: Position, time: string | number, price: number): Signal {
    this.updateSma(time, price);

    // Update trailing stop state based on position
    if (position === 'LONG') {
      if (price > this.highestPrice) {
        this.highestPrice = price;
        this.updateTrailingStop();
      }
      if (this.trailingStopPrice > 0 && price <= this.trailingStopPrice) {
        // Never sell at a loss: only allow if price is >= entry price (breakeven+)
        if (this.entryPrice > 0 && price >= this.entryPrice) {
          return 'SELL';
        }
        // Otherwise, hold through drawdown until at least breakeven
        return 'HOLD';
      }
      // no entry logic while long
      this.trackingEntry = false;
      this.localLow = Infinity;
      return 'HOLD';
    }

    // Flat: look for entry
    const ma = this.getMa();
    if (Number.isFinite(ma)) {
      const threshold = (ma as number) * (1 - this.params.buyBelowPct / 100);
      if (!this.trackingEntry) {
        if (price <= threshold) {
          this.trackingEntry = true;
          this.localLow = price;
        }
      } else {
        if (price < this.localLow) this.localLow = price;
        const buyTrigger = this.localLow * (1 + this.params.trailingBuyPct / 100);
        if (price >= buyTrigger) {
          // Reset trailing stop state for next long leg
          this.highestPrice = price;
          this.updateTrailingStop();
          this.trackingEntry = false;
          this.localLow = Infinity;
          return 'BUY';
        }
      }
    }

    return 'HOLD';
  }

  notifyExecuted(position: Position, execPrice: number) {
    // Allow external systems to reset internal state on actual execution
    if (position === 'LONG') {
      this.highestPrice = execPrice;
      this.updateTrailingStop();
      this.trackingEntry = false;
      this.localLow = Infinity;
      this.entryPrice = execPrice;
    } else {
      // Flat after a sell
      this.active = false;
      this.trailingStopPrice = 0;
      this.highestPrice = 0;
      this.entryPrice = 0;
    }
  }

  private updateSma(time: string | number, price: number) {
    // Accept ISO strings, epoch milliseconds, or epoch seconds
    let tMs: number;
    const asNum = typeof time === 'number' ? time : Number(time);
    if (Number.isFinite(asNum)) {
      // Heuristic: < 1e12 likely seconds; >= 1e12 likely ms
      tMs = asNum < 1e12 ? asNum * 1000 : asNum;
    } else {
      const parsed = Date.parse(String(time));
      if (!Number.isFinite(parsed)) return;
      tMs = parsed;
    }

    this.window.push({ tMs, price });
    this.sum += price;
    const latest = tMs;
    while (this.window.length && latest - this.window[0].tMs > this.windowMs) {
      const old = this.window.shift();
      if (old) this.sum -= old.price;
    }
  }

  private getMa(): number {
    return this.window.length ? this.sum / this.window.length : Number.NaN;
  }

  private updateTrailingStop() {
    if (this.highestPrice > 0) {
      const activationPrice =
        this.highestPrice * (1 - this.params.activationThresholdPct / 100);
      this.trailingStopPrice =
        this.highestPrice * (1 - this.params.trailingStopPct / 100);
      if (!this.active && this.highestPrice >= activationPrice) {
        this.active = true;
      }
    }
  }

  // Expose current strategy state for consumers (UI/status)
  public status() {
    const ma = this.getMa();
    return {
      params: this.params,
      ma,
      samples: this.window.length,
      entry: {
        tracking: this.trackingEntry,
        localLow: Number.isFinite(this.localLow) ? this.localLow : null,
      },
      trailing: {
        highestPrice: this.highestPrice || null,
        trailingStopPrice: this.trailingStopPrice || null,
        active: this.active,
      },
    } as const;
  }
}
