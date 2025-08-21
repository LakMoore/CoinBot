import config from '../config';

export type Trade = {
  side: 'BUY' | 'SELL';
  time: string | number;
  price: number;
  baseQty: number; // positive for buy, negative for sell
  quoteQty: number; // negative for buy, positive for sell
};

export type BacktestResult = {
  trades: Trade[];
  startQuote: number;
  endQuote: number;
  baseEndQty: number;
  realizedPnl: number;
  maxDrawdownPct: number;
};

// Lightweight simulation of the TradingService logic (no network calls)
export class SimTradingService {
  private currentPosition: 'LONG' | 'NONE' = 'NONE';
  private latestPrice = 0;

  private baseBal = 0; // e.g., BTC
  private quoteBal = 0; // e.g., GBP
  private readonly feePct = config.trading.feePercentage / 100;

  private trades: Trade[] = [];
  private maxEquity = 0; // track peak equity for drawdown
  private maxDrawdownPct = 0;

  constructor(initialQuote: number) {
    this.quoteBal = initialQuote;
  }

  public status() {
    return {
      currentPosition: this.currentPosition,
      latestPrice: this.latestPrice,
      baseBal: this.baseBal,
      quoteBal: this.quoteBal,
    };
  }

  public tick(time: string | number, price: number) {
    this.latestPrice = price;

    // Update equity and drawdown
    const equity = this.quoteBal + this.baseBal * price;
    this.maxEquity = Math.max(this.maxEquity, equity);
    if (this.maxEquity > 0) {
      const dd = (this.maxEquity - equity) / this.maxEquity;
      this.maxDrawdownPct = Math.max(this.maxDrawdownPct, dd * 100);
    }

    // Strategy controls BUY/SELL. No automatic exits here.
  }

  public buyWithQuote(
    time: string | number,
    price: number,
    quoteAmount: number
  ) {
    if (quoteAmount <= 0) return;
    const fee = quoteAmount * this.feePct;
    const spend = Math.max(0, quoteAmount - fee);
    const baseQty = spend / price;
    if (baseQty <= 0) return;

    this.quoteBal -= quoteAmount;
    this.baseBal += baseQty;

    this.currentPosition = 'LONG';

    this.trades.push({
      side: 'BUY',
      time,
      price,
      baseQty,
      quoteQty: -quoteAmount,
    });
  }

  public sellAll(time: string | number, price: number) {
    if (this.baseBal <= 0) return;
    const quoteProceeds = this.baseBal * price;
    const fee = quoteProceeds * this.feePct;
    const recv = Math.max(0, quoteProceeds - fee);

    this.trades.push({
      side: 'SELL',
      time,
      price,
      baseQty: -this.baseBal,
      quoteQty: recv,
    });

    this.quoteBal += recv;
    this.baseBal = 0;
    this.currentPosition = 'NONE';
    // trailing state handled by strategy
  }

  public results(): BacktestResult {
    const endQuote = this.quoteBal + this.baseBal * this.latestPrice;
    const startQuote = this.trades.length
      ? this.trades[0].side === 'BUY'
        ? this.trades.reduce(
            (s, t) => (t.side === 'BUY' ? s + -t.quoteQty : s),
            0
          )
        : this.quoteBal + this.baseBal * this.latestPrice
      : this.quoteBal + this.baseBal * this.latestPrice;

    const realizedPnl =
      this.trades.reduce((p, t) => p + t.quoteQty, 0); // net quote received

    return {
      trades: this.trades,
      startQuote,
      endQuote,
      baseEndQty: this.baseBal,
      realizedPnl,
      maxDrawdownPct: this.maxDrawdownPct,
    };
  }
}
