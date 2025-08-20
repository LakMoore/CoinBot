import crypto from 'crypto';
import { randomUUID } from 'crypto';

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Convert DER ECDSA signature to JOSE (r||s) format
function derToJose(signature: Buffer, keySize: number): Buffer {
  // Simple DER parser for ECDSA-Sig-Value: SEQ { r INTEGER, s INTEGER }
  let offset = 0;
  if (signature[offset++] !== 0x30) throw new Error('Invalid DER signature (no sequence)');
  let seqLen = signature[offset++];
  if (seqLen & 0x80) {
    const n = seqLen & 0x7f;
    seqLen = 0;
    for (let i = 0; i < n; i++) seqLen = (seqLen << 8) | signature[offset++];
  }
  if (signature[offset++] !== 0x02) throw new Error('Invalid DER signature (no r int)');
  let rLen = signature[offset++];
  let r = signature.slice(offset, offset + rLen);
  offset += rLen;
  if (signature[offset++] !== 0x02) throw new Error('Invalid DER signature (no s int)');
  let sLen = signature[offset++];
  let s = signature.slice(offset, offset + sLen);

  // Remove leading zeros and left-pad to keySize
  const rPad = Buffer.alloc(keySize);
  const sPad = Buffer.alloc(keySize);
  // Trim leading zeroes
  while (r.length > 0 && r[0] === 0x00) r = r.slice(1);
  while (s.length > 0 && s[0] === 0x00) s = s.slice(1);
  if (r.length > keySize || s.length > keySize) throw new Error('Invalid ECDSA signature length');
  r.copy(rPad, keySize - r.length);
  s.copy(sPad, keySize - s.length);
  return Buffer.concat([rPad, sPad]);
}

export function buildWsJwt(apiKey: string, privateKeyPem: string): string {
  if (!apiKey || !privateKeyPem) {
    throw new Error('Missing API key or private key for JWT generation');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'ES256',
    kid: apiKey,
    nonce: randomUUID().replace(/-/g, ''),
    typ: 'JWT',
  } as const;

  const payload = {
    iss: 'cdp',
    sub: apiKey,
    nbf: now,
    exp: now + 120,
  } as const;

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  sign.end();

  const derSig = sign.sign({ key: privateKeyPem, dsaEncoding: 'der' });
  const joseSig = derToJose(derSig, 32);
  const encodedSig = base64url(joseSig);

  return `${signingInput}.${encodedSig}`;
}
