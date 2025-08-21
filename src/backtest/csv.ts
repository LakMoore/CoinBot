import fs from 'fs';
import readline from 'readline';

export type PriceBar = { time: string; price: number };

// Supports CSV with headers where either `price` or `close` exists for price column.
// Time column accepted as `time`, `timestamp`, or first column.
export async function* readPricesCSV(filePath: string): AsyncGenerator<PriceBar> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headerParsed = false;
  let cols: string[] = [];
  let timeIdx = 0;
  let priceIdx = 1;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = parseCsvLine(trimmed);

    if (!headerParsed) {
      // If all parts are numeric-ish, assume no header
      const looksNumeric = parts.every((p) => !Number.isNaN(Number(p)));
      if (!looksNumeric) {
        cols = parts.map((c) => c.trim().toLowerCase());
        timeIdx = Math.max(0, cols.findIndex((c) => c === 'time' || c === 'timestamp'));
        const pIdx = cols.findIndex((c) => c === 'price' || c === 'close');
        priceIdx = pIdx >= 0 ? pIdx : 1;
        headerParsed = true;
        continue;
      } else {
        // No header, use defaults: col0=time, col1=price
        headerParsed = true;
      }
    }

    const time = String(parts[timeIdx] ?? '');
    const price = Number(parts[priceIdx] ?? NaN);
    if (!time || !Number.isFinite(price)) continue;
    yield { time, price };
  }
}

// Very small CSV splitter that handles quoted fields with commas
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let curr = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        curr += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(curr);
      curr = '';
    } else {
      curr += ch;
    }
  }
  out.push(curr);
  return out.map((s) => s.trim());
}
