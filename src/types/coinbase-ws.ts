// Type definitions for Coinbase Advanced Trade WebSocket messages used in this app

// Generic envelope for messages with events array
export interface WsEnvelope<TEvent = unknown> {
  channel: string;
  client_id?: string;
  timestamp?: string; // ISO timestamp
  sequence_num?: number;
  events: TEvent[];
}

// Ticker event and payload based on documented schema
export interface TickerEntry {
  type: 'ticker';
  product_id: string; // e.g., BTC-USD
  price: string; // numeric string
  volume_24_h?: string;
  low_24_h?: string;
  high_24_h?: string;
  low_52_w?: string;
  high_52_w?: string;
  price_percent_chg_24_h?: string;
  best_bid?: string;
  best_bid_quantity?: string;
  best_ask?: string;
  best_ask_quantity?: string;
}

export interface TickerEvent {
  type: 'snapshot' | 'update' | string;
  tickers: TickerEntry[];
}

export type TickerMessage = WsEnvelope<TickerEvent> & { channel: 'ticker' };

// Minimal user channel typing (can be extended later)
export interface UserEvent {
  type: string;
  [k: string]: unknown;
}
export type UserMessage = WsEnvelope<UserEvent> & { channel: 'user' };

// Minimal level2 channel typing (can be extended later)
export interface Level2Update {
  side: 'bid' | 'ask' | string;
  price?: string;
  quantity?: string;
  [k: string]: unknown;
}
export interface Level2Event {
  type: string;
  updates?: Level2Update[];
  [k: string]: unknown;
}
export type Level2Message = WsEnvelope<Level2Event> & { channel: 'level2' };
