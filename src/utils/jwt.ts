import jwt from 'jsonwebtoken';
import type { JwtHeader } from 'jsonwebtoken';
import { randomUUID } from 'crypto';

// Build Coinbase WS JWT using jsonwebtoken (ES256)
// Claims:
//  - iss: 'cdp'
//  - sub: apiKey
//  - nbf: now
//  - exp: now + 120s
// Header:
//  - alg: ES256
//  - typ: JWT
//  - kid: apiKey
//  - nonce: random 32-hex (custom header field)
export function buildWsJwt(apiKey: string, privateKeyPem: string): string {
  if (!apiKey || !privateKeyPem) {
    throw new Error('Missing API key or private key for JWT generation');
  }

  const now = Math.floor(Date.now() / 1000);

  const header: JwtHeader & { nonce: string } = {
    alg: 'ES256',
    typ: 'JWT',
    kid: apiKey,
    nonce: randomUUID().replace(/-/g, ''),
  };

  const token = jwt.sign(
    {
      iss: 'cdp',
      sub: apiKey,
      nbf: now,
      exp: now + 120,
    },
    privateKeyPem,
    {
      algorithm: 'ES256',
      // keyid is standard; kid is also set in header below
      keyid: apiKey,
      header,
    }
  );

  return token;
}
