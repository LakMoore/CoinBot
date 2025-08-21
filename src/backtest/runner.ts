import path from 'path';
import { readPricesCSV } from './csv';
import { SimTradingService } from './simTrading';
import { EntryExitStrategy } from '../strategy/entryExit';
import type { Position } from '../strategy/entryExit';
import config from '../config';

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.split('=');
      args[k.slice(2)] = v === undefined ? true : v;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const csv = String(
    args.csv || path.resolve(process.cwd(), 'data/sample.csv')
  );
  const initialQuote = Number(args.initialQuote ?? 1000);
  const investQuote = Number(args.investQuote ?? 100);
  const reenter = args.reenter === 'false' ? false : Boolean(args.reenter ?? true);
  const maDays =
    args.maDays !== undefined
      ? Number(args.maDays)
      : Number(config.reentry.maDays);
  const buyBelowPct =
    args.buyBelowPct !== undefined
      ? Number(args.buyBelowPct)
      : Number(config.reentry.buyBelowPct); // % below MA to arm trailing buy
  const trailingBuyPct =
    args.trailingBuyPct !== undefined
      ? Number(args.trailingBuyPct)
      : Number(config.reentry.trailingBuyPct); // % bounce from local low to execute buy
  const trailingStopPct =
    args.trailingStopPct !== undefined
      ? Number(args.trailingStopPct)
      : Number(config.trailingStop.percentage);
  const activationThresholdPct =
    args.activationThresholdPct !== undefined
      ? Number(args.activationThresholdPct)
      : Number(config.trailingStop.activationThreshold);

  console.log('Backtest config:', {
    csv,
    initialQuote,
    investQuote,
    reenter,
    maDays,
    buyBelowPct,
    trailingBuyPct,
    trailingStopPct,
    activationThresholdPct,
  });

  const sim = new SimTradingService(initialQuote);
  const strategy = new EntryExitStrategy({
    maDays,
    buyBelowPct,
    trailingBuyPct,
    trailingStopPct,
    activationThresholdPct,
  });

  for await (const { time, price } of readPricesCSV(csv)) {
    sim.tick(time, price);

    const st = sim.status();
    const pos: Position = st.currentPosition;
    const signal = strategy.nextSignal(pos, time, price);
    if (signal !== 'HOLD')
      console.log(
        'Signal',
        signal,
        't=',
        time,
        'px=',
        price,
        'st=',
        strategy.status()
      );

    if (signal === 'BUY' && !reenter) {
      // If reentry disabled, ignore buys unless it's the first ever
    }

    if (signal === 'BUY' && pos === 'NONE' && st.quoteBal >= investQuote) {
      sim.buyWithQuote(time, price, investQuote);
      strategy.notifyExecuted('LONG', price);
    } else if (signal === 'SELL' && pos === 'LONG') {
      sim.sellAll(time, price);
      strategy.notifyExecuted('NONE', price);
    }
  }

  const res = sim.results();
  console.log('\n=== Backtest Results ===');
  console.log('Trades:', res.trades.length);
  console.log('Realized PnL (quote):', res.realizedPnl.toFixed(2));
  console.log('Start Quote:', res.startQuote.toFixed(2));
  console.log('End Quote (mark-to-market):', res.endQuote.toFixed(2));
  console.log('Base End Qty:', res.baseEndQty);
  console.log('Max Drawdown %:', res.maxDrawdownPct.toFixed(2));

  // Optional: print trades
  for (const t of res.trades) {
    console.log(
      `${t.time} ${t.side} px=${t.price} base=${t.baseQty} quote=${t.quoteQty}`
    );
  }
}

main().catch((e) => {
  console.error('Backtest failed:', e);
  process.exit(1);
});
