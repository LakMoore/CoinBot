import WebSocket from 'ws';
import { TradingService } from './trading';
import config from '../config';
import { buildWsJwt } from '../utils/jwt';
import { TickerMessage, Level2Message, UserMessage, WsEnvelope } from '../types/coinbase-ws';

export const setupWebSocket = async (tradingService: TradingService) => {
  const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');
  let jwtRefreshTimer: NodeJS.Timeout | null = null;

  const sendUserAuthSubscribe = () => {
    try {
      const apiKey = config.coinbase.apiKey;
      const privateKey = (config.coinbase.apiSecret || '').replace(/\\n/g, '\n');
      if (!apiKey || !privateKey) {
        console.warn('API key/secret missing; skipping authenticated user channel subscription');
        return;
      }
      const jwt = buildWsJwt(apiKey, privateKey);
      const authSubscribe = {
        type: 'subscribe',
        channel: 'user',
        product_ids: [config.trading.pair],
        jwt,
      };
      ws.send(JSON.stringify(authSubscribe));
      console.log('Sent authenticated subscribe to user channel');
    } catch (e) {
      console.error('Failed to generate/send JWT for user channel subscription:', e);
    }
  };

  const sendPublicSubscribes = () => {
    // Subscribe to the ticker channel for the trading pair (public)
    const tickerSubscribe = {
      type: 'subscribe',
      product_ids: [config.trading.pair],
      channel: 'ticker',
    } as const;
    ws.send(JSON.stringify(tickerSubscribe));

    // Subscribe to public level2 order book (no JWT)
    const level2Subscribe = {
      type: 'subscribe',
      product_ids: [config.trading.pair],
      channel: 'level2',
    } as const;
    // Uncomment to enable level2 stream
    // ws.send(JSON.stringify(level2Subscribe));
  };

  ws.on('open', () => {
    console.log('Connected to Coinbase WebSocket');

    // Send public subscriptions (one message per channel)
    sendPublicSubscribes();

    // Authenticate and subscribe to private 'user' channel (requires JWT)
    sendUserAuthSubscribe();
    // Refresh JWT before expiry (tokens valid for 120s). Use 90s interval.
    jwtRefreshTimer = setInterval(() => {
      console.log('Refreshing WebSocket JWT for user channel...');
      sendUserAuthSubscribe();
    }, 90 * 1000);
  });

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const message = JSON.parse(data.toString()) as WsEnvelope<any>;

      // console.log('message ', message);
      
      // Handle ticker updates (events[0].tickers[0].price)
      if (message.channel === 'ticker' && message.events) {
        const tmsg = message as TickerMessage;
        const firstEvent = tmsg.events[0];
        const firstTicker = firstEvent?.tickers?.[0];
        const priceStr = firstTicker?.price;
        if (priceStr) {
          const currentPrice = parseFloat(priceStr);
          if (!Number.isNaN(currentPrice)) {
            // Update trading service with new price
            tradingService.updatePrice(currentPrice);
          }
        }
        
        return;
      }

      // Handle user channel events (orders, fills, etc.)
      if (message.channel === 'user' && message.events) {
        // Minimal handling: log event types. Extend as needed.
        const types = message.events.map((e: any) => e.type).join(',');
        console.log(`User channel events: ${types}`);
        // TODO: React to order updates/fills if needed
        return;
      }

      // Handle level2 order book updates (public)
      if (message.channel === 'level2' && message.events) {
        // Each event may contain updates to bids/asks; structure varies by payload version.
        // For now, just log counts to verify receipt.
        const l2msg = message as Level2Message;
        const e0 = l2msg.events[0];
        const bids = e0?.updates?.filter((u: any) => u.side === 'bid').length ?? 0;
        const asks = e0?.updates?.filter((u: any) => u.side === 'ask').length ?? 0;
        console.log(`Level2 updates - bids: ${bids}, asks: ${asks}`);
        return;
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (jwtRefreshTimer) {
      clearInterval(jwtRefreshTimer);
      jwtRefreshTimer = null;
    }
    // Attempt to reconnect after a delay
    setTimeout(() => setupWebSocket(tradingService), 5000);
  });

  return ws;
};
