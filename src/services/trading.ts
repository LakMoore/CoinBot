import config from '../config';
import { CoinbaseAdvTradeClient, CoinbaseAdvTradeCredentials, OrdersService, AccountsService } from '@coinbase-sample/advanced-trade-sdk-ts';
import { OrderSide } from '@coinbase-sample/advanced-trade-sdk-ts/dist/model/enums/OrderSide';
import { EventEmitter } from 'events';
import { PriceService } from './prices';
import { ListOrdersRequest } from '@coinbase-sample/advanced-trade-sdk-ts/dist/rest/orders/types';

export class TradingService {
  private client: CoinbaseAdvTradeClient;
  private ordersService: OrdersService;
  private accountsService: AccountsService;
  private highestPrice: number = 0;
  private trailingStopPrice: number = 0;
  private isActive: boolean = false;
  private currentPosition: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
  private latestPrice: number = 0;
  private emitter = new EventEmitter();
  private balances: Record<string, number> = {};
  private balancePollTimer: NodeJS.Timeout | null = null;
  private prices = new PriceService(60 * 1000);
  private portfolio: {
    fiat: Array<{ currency: string; amount: number; gbpValue: number }>;
    crypto: Array<{ asset: string; amount: number; gbpPrice: number | null; gbpValue: number | null; avgEntryGbp?: number | null; pnlGbp?: number | null; pnlPct?: number | null }>;
    totals: { fiatGbp: number; cryptoGbp: number; grandGbp: number };
  } = { fiat: [], crypto: [], totals: { fiatGbp: 0, cryptoGbp: 0, grandGbp: 0 } };

  constructor() {
    const normalizedSecret = (config.coinbase.apiSecret || '').replace(/\\n/g, '\n');
    const credentials = new CoinbaseAdvTradeCredentials(
        config.coinbase.apiKey,
        normalizedSecret,
      );
    // this.client = new CoinbaseAdvTradeClient(credentials, config.coinbase.baseUrl);
    this.client = new CoinbaseAdvTradeClient(credentials);
    this.ordersService = new OrdersService(this.client);
    this.accountsService = new AccountsService(this.client);
  }

  public async initialize() {
    // Initial balances fetch
    await this.refreshBalances();
    // Poll balances periodically
    this.balancePollTimer = setInterval(() => {
      this.refreshBalances().catch((e) => console.error('Balance refresh failed:', e));
    }, 30 * 1000);
    console.log('Trading service initialized');
  }

  public async cleanup() {
    // Clean up resources
    if (this.balancePollTimer) {
      clearInterval(this.balancePollTimer);
      this.balancePollTimer = null;
    }
    console.log('Cleaning up trading service');  }

  public async executeBuy(amount: number) {
    try {
      console.log(`Executing buy order for ${amount} ${config.trading.pair}`);
      if (!amount || amount <= 0) {
        throw new Error('Buy amount must be greater than 0');
      }

      const request = {
        clientOrderId: `bot-${Date.now()}`,
        productId: config.trading.pair,
        side: OrderSide.Buy,
        orderConfiguration: {
          marketMarketIoc: {
            // Treat amount as quote currency size (e.g., USD on BTC-USD)
            quoteSize: amount.toString(),
          },
        },
      } as const;

      const response = await this.ordersService.createOrder(request);
      console.log('Buy order response:', response);

      // Update state post order placement
      this.currentPosition = 'LONG';
      this.highestPrice = await this.getCurrentPrice();
      this.updateTrailingStop();
      this.emitStatus();
      return { success: true, response };
    } catch (error) {
      console.error('Error executing buy order:', error);
      throw error;
    }
  }

  public async executeSell(amount: number) {
    try {
      console.log(`Executing sell order for ${amount} ${config.trading.pair}`);
      if (!amount || amount <= 0) {
        throw new Error('Sell amount must be greater than 0');
      }

      const request = {
        clientOrderId: `bot-${Date.now()}`,
        productId: config.trading.pair,
        side: OrderSide.Sell,
        orderConfiguration: {
          marketMarketIoc: {
            // For SELL you can specify baseSize or quoteSize. We keep quote for symmetry.
            quoteSize: amount.toString(),
          },
        },
      } as const;

      const response = await this.ordersService.createOrder(request);
      console.log('Sell order response:', response);

      this.currentPosition = 'NONE';
      this.emitStatus();
      return { success: true, response };
    } catch (error) {
      console.error('Error executing sell order:', error);
      throw error;
    }
  }

  public updatePrice(currentPrice: number) {
    // Always cache the latest observed price
    this.latestPrice = currentPrice;

    if (this.currentPosition === 'LONG') {
      // Update highest price if current price is higher
      if (currentPrice > this.highestPrice) {
        this.highestPrice = currentPrice;
        this.updateTrailingStop();
      }

      // Check if stop loss is triggered
      if (currentPrice <= this.trailingStopPrice && this.trailingStopPrice > 0) {
        console.log(`Stop loss triggered at ${currentPrice}`);
        this.executeSell(0/* amount */);
      }
    }
    // Emit on every price update so UI stays current
    this.emitStatus();
  }

  private updateTrailingStop() {
    if (this.highestPrice > 0) {
      const activationPrice = this.highestPrice * (1 - config.trailingStop.activationThreshold / 100);
      this.trailingStopPrice = this.highestPrice * (1 - config.trailingStop.percentage / 100);
      
      if (!this.isActive && this.highestPrice >= activationPrice) {
        this.isActive = true;
        console.log('Trailing stop activated');
      }
    }
  }

  private async getCurrentPrice(): Promise<number> {
    // Return the latest cached price from WebSocket updates
    return this.latestPrice;
  }

  public getStatus() {
    return {
      currentPosition: this.currentPosition,
      highestPrice: this.highestPrice,
      trailingStopPrice: this.trailingStopPrice,
      isActive: this.isActive,
      tradingPair: config.trading.pair,
      latestPrice: this.latestPrice,
      balances: this.balances,
      desiredAction: this.getDesiredAction(),
      portfolio: this.portfolio,
    };
  }

  public onStatus(listener: (status: ReturnType<TradingService['getStatus']>) => void) {
    this.emitter.on('status', listener);
    return () => this.emitter.off('status', listener);
  }

  private emitStatus() {
    this.emitter.emit('status', this.getStatus());
  }

  // --- Balances and decision helpers ---
  private parsePair() {
    // Expect format BASE-QUOTE, e.g., BTC-GBP
    const [base, quote] = (config.trading.pair || '').split('-');
    return { base, quote };
  }

  private getDesiredAction(): 'BUY' | 'SELL' | 'HOLD' {
    const { base, quote } = this.parsePair();
    if (!base || !quote) return 'HOLD';
    const baseBal = this.balances[base] || 0;
    const quoteBal = this.balances[quote] || 0;
    // If we hold base asset, we're looking to SELL; otherwise BUY if we have quote
    if (baseBal > 0) return 'SELL';
    if (quoteBal > 0) return 'BUY';
    return 'HOLD';
  }

  private async refreshBalances() {
    try {
      let cursor: string | undefined = undefined;
      const accs: Array<{ currency?: string; availableBalance?: { value?: string } }> = [];
      do {
        const resp: any = await this.accountsService.listAccounts({ limit: 250, cursor });
        if (resp && 'accounts' in resp) {
          accs.push(...(resp.accounts || []));
          cursor = resp.hasNext ? resp.cursor : undefined;
        } else {
          // If SDK returned an exception type, stop paging
          cursor = undefined;
          console.error('AccountsService.listAccounts returned error-like response');
        }
      } while (cursor);

      const nextBalances: Record<string, number> = {};
      for (const a of accs) {
        const ccy = a.currency;
        const valStr = a.availableBalance?.value;
        if (!ccy || !valStr) continue;
        const v = parseFloat(valStr);
        if (!Number.isNaN(v)) nextBalances[ccy] = (nextBalances[ccy] || 0) + v;
      }
      this.balances = nextBalances;
      await this.recomputePortfolio();
      this.emitStatus();
    } catch (e) {
      console.error('Failed to fetch balances:', e);
    }
  }

  private isFiat(ccy: string): boolean {
    const FIAT = new Set(['GBP','USD','EUR','AUD','CAD','CHF','JPY','NZD','SGD']);
    return FIAT.has(ccy.toUpperCase());
  }

  private async recomputePortfolio() {
    const fx = await this.prices.getFiatToGBP();
    const fiat: Array<{ currency: string; amount: number; gbpValue: number }> = [];
    const crypto: Array<{ asset: string; amount: number; gbpPrice: number | null; gbpValue: number | null; avgEntryGbp?: number | null; pnlGbp?: number | null; pnlPct?: number | null }> = [];

    for (const [ccy, amt] of Object.entries(this.balances)) {
      if (!amt || !isFinite(amt) || amt <= 0) continue;
      if (this.isFiat(ccy)) {
        const toGbp = fx[ccy] ?? null;
        const gbpValue = toGbp ? amt * toGbp : 0;
        fiat.push({ currency: ccy, amount: amt, gbpValue });
      } else {
        const gbpPrice = await this.prices.getCryptoGbpPrice(ccy);
        const gbpValue = gbpPrice != null ? amt * gbpPrice : null;
        crypto.push({ asset: ccy, amount: amt, gbpPrice, gbpValue, avgEntryGbp: null, pnlGbp: null, pnlPct: null });
      }
    }

    // sort by value desc
    fiat.sort((a,b) => b.gbpValue - a.gbpValue);
    crypto.sort((a,b) => (b.gbpValue ?? 0) - (a.gbpValue ?? 0));

    const fiatGbp = fiat.reduce((s, r) => s + (r.gbpValue || 0), 0);
    const cryptoGbp = crypto.reduce((s, r) => s + (r.gbpValue || 0), 0);
    this.portfolio = { fiat, crypto, totals: { fiatGbp, cryptoGbp, grandGbp: fiatGbp + cryptoGbp } };

    // Enrich crypto with avg entry and returns using fills
    await this.enrichCryptoWithCostBasis();
  }

  private async enrichCryptoWithCostBasis() {
    // Map of asset -> cost basis info in GBP
    if (!this.portfolio.crypto.length) return;
    const fx = await this.prices.getFiatToGBP();

    for (const row of this.portfolio.crypto) {
      const asset = row.asset;
      // reset fields to avoid any stale values from previous iterations
      row.avgEntryGbp = null as any;
      row.pnlGbp = null as any;
      row.pnlPct = null as any;
      try {
        // Prefer GBP orders, but also include other fiat-quoted orders we can convert (e.g., USD, EUR)
        const gbpMarket = `${asset}-GBP`;
        const usdMarket = `${asset}-USD`;
        const eurMarket = `${asset}-EUR`;
        const ordersRaw = await this.fetchAllOrders({ productIds: [gbpMarket, usdMarket, eurMarket], limit: 250 });
        // Filter strictly to this asset and a fiat quote that we have an FX rate for
        const fxMap = fx || {};
        const orders = (ordersRaw || []).filter((o: any) => {
          const pid = (o.productId || '').toUpperCase();
          const parts = pid.split('-');
          if (parts.length !== 2) return false;
          const [base, quote] = parts;
          if (base !== asset.toUpperCase()) return false;
          if (quote === 'GBP') return true;
          return fxMap[quote] != null && isFinite(fxMap[quote]);
        });
        if (!orders.length) {
          row.avgEntryGbp = null;
          row.pnlGbp = null;
          row.pnlPct = null;
          continue;
        }

        // Sort by createdTime ascending
        orders.sort((a: any, b: any) => Date.parse(a.createdTime || '') - Date.parse(b.createdTime || ''));

        // Build FIFO lots from BUY orders using filledSize and averageFilledPrice (already GBP); consume with SELL orders
        type Lot = { qty: number; priceGbp: number };
        const lots: Lot[] = [];
        for (const o of orders) {
          const status = (o.status || '').toString().toUpperCase();
          if (status !== 'FILLED' && status !== 'CANCELLED' && status !== 'EXPIRED' && status !== 'OPEN') {
            // proceed; we rely on filledSize
          }
          const side = (o.side || '').toString().toUpperCase();
          const qty = parseFloat(o.filledSize || '0');
          const avgPx = parseFloat(o.averageFilledPrice || '0');
          const totalFees = parseFloat((o.totalFees as any) || '0');
          const totalAfterFees = parseFloat((o.totalValueAfterFees as any) || '0');
          const filledValue = parseFloat((o.filledValue as any) || '0');
          if (!isFinite(qty) || qty <= 0) continue; // only filled quantities matter
          // Determine quote currency and conversion to GBP
          const pid = (o.productId || '').toUpperCase();
          const parts2 = pid.split('-');
          const quote = parts2.length === 2 ? parts2[1] : 'GBP';
          const conv = quote === 'GBP' ? 1 : (fx[quote] || 0);
          if (!conv) continue; // unknown quote currency; skip
          // Compute per-unit price in quote ccy first, then convert to GBP, including commissions for BUY
          let unitPriceQuote = isFinite(avgPx) ? avgPx : NaN;
          if (side === 'BUY') {
            if (isFinite(totalAfterFees) && totalAfterFees > 0) {
              unitPriceQuote = totalAfterFees / qty;
            } else if (isFinite(filledValue) && isFinite(totalFees) && (filledValue + totalFees) > 0) {
              unitPriceQuote = (filledValue + totalFees) / qty;
            } else if (isFinite(avgPx) && isFinite(totalFees) && totalFees > 0) {
              unitPriceQuote = avgPx + (totalFees / qty);
            }
          }
          if (!isFinite(unitPriceQuote) || unitPriceQuote <= 0) continue;
          const unitPriceGbp = unitPriceQuote * conv;
          if (side === 'BUY') {
            lots.push({ qty, priceGbp: unitPriceGbp });
          } else if (side === 'SELL') {
            let remaining = qty;
            while (remaining > 0 && lots.length) {
              const lot = lots[0];
              const use = Math.min(lot.qty, remaining);
              lot.qty -= use;
              remaining -= use;
              if (lot.qty <= 1e-12) lots.shift();
            }
          }
        }

        const qtyOpen = lots.reduce((s, l) => s + l.qty, 0);
        if (qtyOpen <= 0) {
          row.avgEntryGbp = null;
          row.pnlGbp = null;
          row.pnlPct = null;
          continue;
        }

        // Align to current holding
        let targetQty = Math.min(row.amount, qtyOpen);
        let totalCostGbp = 0;
        for (const lot of lots) {
          if (targetQty <= 0) break;
          const use = Math.min(lot.qty, targetQty);
          totalCostGbp += use * lot.priceGbp;
          targetQty -= use;
        }
        const effectiveQty = Math.min(row.amount, qtyOpen);
        const avgEntryGbp = effectiveQty > 0 ? totalCostGbp / effectiveQty : null;
        row.avgEntryGbp = avgEntryGbp;
        if (avgEntryGbp != null && row.gbpPrice != null && isFinite(row.gbpPrice)) {
          const pnlPerUnit = row.gbpPrice - avgEntryGbp;
          const pnlGbp = pnlPerUnit * effectiveQty;
          row.pnlGbp = pnlGbp;
          row.pnlPct = avgEntryGbp > 0 ? (pnlPerUnit / avgEntryGbp) * 100 : null;
        } else {
          row.pnlGbp = null;
          row.pnlPct = null;
        }
      } catch (e) {
        console.error(`Cost basis calc failed for ${asset}:`, e);
      }
    }

    // Recompute totals with potential updated gbpValue (unchanged) but we added more fields
  }

  private async fetchAllFills(params: { productIds?: string[]; limit?: number }) {
    const all: any[] = [];
    let cursor: string | undefined = undefined;
    do {
      const req: any = { ...params, cursor };
      const resp: any = await this.ordersService.listFills(req);
      if (resp && 'fills' in resp) {
        const fills = (resp.fills || []) as any[];
        all.push(...fills);
        cursor = (resp as any).cursor || undefined;
      } else {
        cursor = undefined;
      }
    } while (cursor);
    return all;
  }

  private async fetchAllOrders(params: { productIds?: string[]; orderSide?: any; limit?: number }) {
    const all: any[] = [];
    const ids = params.productIds && params.productIds.length ? params.productIds : [undefined as any];
    // If multiple productIds are provided, fetch each separately to avoid server ignoring the filter
    for (const pid of ids) {
      let cursor: string | undefined = undefined;
      do {
        const req: any = {  };
        const resp: any = await this.ordersService.listOrders(req);
        if (resp && 'orders' in resp) {
          const orders = (resp.orders || []) as any[];
          all.push(...orders);
          cursor = (resp as any).cursor || undefined;
        } else {
          cursor = undefined;
        }
      } while (cursor);
    }
    return all;
  }
}

