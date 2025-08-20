# Coinbase Trading Bot

A TypeScript-based trading bot for Coinbase Advanced Trade that implements a trailing stop-loss system with backtesting capabilities.

## Features

- Real-time price monitoring via WebSocket
- Trailing stop-loss functionality
- Simple REST API for control and monitoring
- Backtesting capabilities
- Configurable trading parameters

## Prerequisites

- Node.js 16+ and npm
- Coinbase Advanced Trade API credentials

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and update with your API credentials:
   ```
   cp .env.example .env
   ```
4. Edit the `.env` file with your Coinbase API key and secret

## Configuration

Edit the `.env` file to configure:

- Trading pair (default: BTC-GBP)
- Trade amount in GBP
- Trailing stop percentage
- Activation threshold
- Server port

## Running the Bot

Development mode with hot-reload:
```bash
npm run dev
```

Production build and start:
```bash
npm run build
npm start
```

## API Endpoints

- `GET /api/status` - Get current trading status
- `POST /api/buy` - Execute a buy order
- `POST /api/sell` - Execute a sell order
- `GET /api/history` - Get historical trading data

## Backtesting

To run backtests, use the backtesting script:
```bash
ts-node src/scripts/backtest.ts
```

## License

MIT
