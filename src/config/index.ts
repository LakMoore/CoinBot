import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
// Try project root first (works in dev and prod when launched from root),
// then fall back to dist-relative path when needed.
const rootLoad = dotenv.config();
if (rootLoad.error) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

interface Config {
  coinbase: {
    apiKey: string;
    apiPrivateKey: string;
    baseUrl: string;
  };
  trading: {
    pair: string;
    amount: number;
    feePercentage: number;
  };
  trailingStop: {
    percentage: number;
    activationThreshold: number;
  };
  reentry: {
    maDays: number;
    buyBelowPct: number;
    trailingBuyPct: number;
  };
  server: {
    port: number;
    env: string;
  };
}

const config: Config = {
  coinbase: {
    apiKey: process.env.COINBASE_API_KEY || '',
    apiPrivateKey: process.env.COINBASE_API_PRIVATE_KEY || '',
    baseUrl:
      process.env.COINBASE_USE_PRODUCTION === 'true'
        ? 'https://api.coinbase.com/api/v3/brokerage/'
        : 'https://api-sandbox.coinbase.com/api/v3/brokerage/',
  },
  trading: {
    pair: process.env.TRADING_PAIR || 'BTC-GBP',
    amount: parseFloat(process.env.TRADE_AMOUNT_GBP || '10'),
    feePercentage: parseFloat(process.env.TRADE_FEE_PERCENTAGE || '0.5'),
  },
  trailingStop: {
    percentage: parseFloat(process.env.TRAILING_STOP_PERCENT || '2.0'),
    activationThreshold: parseFloat(
      process.env.ACTIVATION_THRESHOLD_PERCENT || '1.0'
    ),
  },
  reentry: {
    maDays: parseInt(process.env.REENTRY_MA_DAYS || '20', 10),
    buyBelowPct: parseFloat(process.env.REENTRY_BUY_BELOW_PCT || '5'),
    trailingBuyPct: parseFloat(process.env.REENTRY_TRAILING_BUY_PCT || '1'),
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
  },
};

export default config;
