import axios from 'axios';
import fs from 'fs';
import path from 'path';

/*
Fetch historical candles from Coinbase Exchange public API and cache to CSV.

API: GET https://api.exchange.coinbase.com/products/<product>/candles
Params:
- granularity: seconds (60, 300, 900, 3600, 21600, 86400)
- start, end: ISO8601 timestamps

Response rows: [ time, low, high, open, close, volume ]

We write CSV with headers: time,close
Time is ISO string.
*/

type Args = {
  pair: string; // e.g., BTC-GBP
  granularity: number; // seconds
  start?: string; // ISO or YYYY-MM-DD
  end?: string; // ISO or YYYY-MM-DD
  out?: string; // output CSV path
};

function parseArgs(): Args {
  const argMap: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      argMap[k] = v ?? 'true';
    }
  }
  const pair = argMap.pair || 'BTC-GBP';
  const granularity = parseInt(argMap.granularity || '60', 10);
  const start = argMap.start;
  const end = argMap.end;
  const out = argMap.out;
  return { pair, granularity, start, end, out };
}

function toISO(x: string | undefined): string | undefined {
  if (!x) return undefined;
  // Accept YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) {
    return new Date(x + 'T00:00:00Z').toISOString();
  }
  const d = new Date(x);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function chunkRange(startMs: number, endMs: number, stepSec: number, maxPoints = 300): Array<{ s: number; e: number }> {
  const stepMs = stepSec * 1000 * maxPoints;
  const out: Array<{ s: number; e: number }> = [];
  let s = startMs;
  while (s < endMs) {
    const e = Math.min(endMs, s + stepMs);
    out.push({ s, e });
    s = e;
  }
  return out;
}

async function fetchWindow(pair: string, granularity: number, s: number, e: number) {
  const url = `https://api.exchange.coinbase.com/products/${pair}/candles`;
  const params = {
    granularity,
    start: new Date(s).toISOString(),
    end: new Date(e).toISOString(),
  } as const;
  const r = await axios.get(url, { params, headers: { Accept: 'application/json' } });
  if (r.status !== 200 || !Array.isArray(r.data)) {
    throw new Error(`Unexpected response (${r.status})`);
  }
  // API returns newest-first. Normalize to oldest-first.
  const rows: Array<[number, number, number, number, number, number]> = r.data;
  return rows
    .map((a) => ({
      t: a[0] as number,
      low: a[1] as number,
      high: a[2] as number,
      open: a[3] as number,
      close: a[4] as number,
      volume: a[5] as number,
    }))
    .sort((a, b) => a.t - b.t);
}

function ensureDir(p: string) {
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
}

function readExistingTimes(csvPath: string): Set<number> {
  const seen = new Set<number>();
  if (!fs.existsSync(csvPath)) return seen;
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [time] = line.split(',');
    const ts = Date.parse(time);
    if (Number.isFinite(ts)) seen.add(Math.floor(ts / 1000));
  }
  return seen;
}

function appendCsv(csvPath: string, rows: Array<{ t: number; close: number }>) {
  const exists = fs.existsSync(csvPath);
  const parts: string[] = [];
  if (!exists) parts.push('time,close');
  for (const r of rows) {
    const iso = new Date(r.t * 1000).toISOString();
    parts.push(`${iso},${r.close}`);
  }
  fs.appendFileSync(csvPath, parts.join('\n') + '\n');
}

async function main() {
  const args = parseArgs();
  const { pair, granularity } = args;
  const startIso = toISO(args.start) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(); // default 30 days
  const endIso = toISO(args.end) || new Date().toISOString();

  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new Error('Invalid start/end time');
  }

  const outPath = args.out || path.join('data', `${pair}-${granularity}s.csv`);
  ensureDir(outPath);

  const seen = readExistingTimes(outPath);

  const windows = chunkRange(startMs, endMs, granularity, 300);
  let fetched = 0;
  for (const w of windows) {
    const rows = await fetchWindow(pair, granularity, w.s, w.e);
    // Filter out rows already present
    const toWrite = rows
      .filter((r) => Number.isFinite(r.close) && !seen.has(r.t))
      .map((r) => ({ t: r.t, close: r.close }));
    if (toWrite.length) {
      appendCsv(outPath, toWrite);
      for (const r of toWrite) seen.add(r.t);
      fetched += toWrite.length;
      console.log(`Wrote ${toWrite.length} rows to ${outPath}`);
    }
  }
  console.log(`Done. Total new rows: ${fetched}. File: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
