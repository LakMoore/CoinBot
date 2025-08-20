import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface Config {
  coinbase: {
    apiKey: string;
    apiSecret: string;
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
  server: {
    port: number;
    env: string;
  };
}

const config: Config = {
  coinbase: {
    apiKey: process.env.COINBASE_API_KEY || '',
    apiSecret: process.env.COINBASE_API_SECRET || '',
    baseUrl: process.env.COINBASE_USE_PRODUCTION
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
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
  },
};

export default config;
