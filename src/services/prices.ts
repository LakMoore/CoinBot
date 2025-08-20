import fetch from 'node-fetch';

export type RatesMap = Record<string, number>;

export class PriceService {
  private lastFiatRates: RatesMap | null = null;
  private lastFiatAt = 0;
  private lastCryptoRatesGBP: Record<string, number> = {};
  private lastCryptoAt: Record<string, number> = {};
  private ttlMs = 60 * 1000; // 1 minute cache

  constructor(ttlMs?: number) {
    if (ttlMs) this.ttlMs = ttlMs;
  }

  private isFresh(ts: number) {
    return Date.now() - ts < this.ttlMs;
  }

  // Fetch map: 1 <currency> = rate[<toCurrency>] units
  // We need GBP conversions; use Coinbase v2 exchange rates
  async getFiatToGBP(): Promise<RatesMap> {
    if (this.lastFiatRates && this.isFresh(this.lastFiatAt))
      return this.lastFiatRates;
    // API gives: base currency -> map of conversions
    // We'll fetch rates with base=GBP, then invert
    const url = 'https://api.coinbase.com/v2/exchange-rates?currency=GBP';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`FX fetch failed: ${resp.status}`);
    const json: any = await resp.json();
    const rates = json?.data?.rates || {};
    const inv: RatesMap = {};
    for (const [ccy, v] of Object.entries(rates)) {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) continue;
      // rates: 1 GBP = n ccy => 1 ccy = 1/n GBP
      inv[ccy] = 1 / n;
    }
    inv['GBP'] = 1;
    this.lastFiatRates = inv;
    this.lastFiatAt = Date.now();
    return inv;
  }

  // Spot price for CRYPTO-GBP (or fallback CRYPTO-USD then convert)
  async getCryptoGbpPrice(symbol: string): Promise<number | null> {
    const ts = this.lastCryptoAt[symbol] || 0;
    if (this.lastCryptoRatesGBP[symbol] && this.isFresh(ts))
      return this.lastCryptoRatesGBP[symbol];

    // Try direct GBP pair
    const gbpUrl = `https://api.coinbase.com/v2/prices/${symbol}-GBP/spot`;
    let price: number | null = null;
    try {
      const r = await fetch(gbpUrl);
      if (r.ok) {
        const j: any = await r.json();
        price = Number(j?.data?.amount);
      }
    } catch {}

    if (price == null || !isFinite(price)) {
      // Fallback via USD
      try {
        const usdUrl = `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`;
        const r2 = await fetch(usdUrl);
        if (r2.ok) {
          const j2: any = await r2.json();
          const usd = Number(j2?.data?.amount);
          if (isFinite(usd)) {
            const fx = await this.getFiatToGBP();
            const usdToGbp = fx['USD'];
            if (usdToGbp) price = usd * usdToGbp;
          }
        }
      } catch {}
    }

    if (price != null && isFinite(price)) {
      this.lastCryptoRatesGBP[symbol] = price;
      this.lastCryptoAt[symbol] = Date.now();
      return price;
    }
    return null;
  }
}
