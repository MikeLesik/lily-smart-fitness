import type { Env } from '../env';
import { nowSec } from '../db';
import type { VideoProvider } from './index';

/**
 * Cloudflare Stream с обязательной подписью ссылок (requireSignedURLs у каждого видео).
 * Токен подписываем сами ключом подписи Stream (RS256), без запроса к API на каждый просмотр.
 * https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
 */

const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(jwkBase64: string): Promise<CryptoKey> {
  let key = keyCache.get(jwkBase64);
  if (!key) {
    const jwk = JSON.parse(atob(jwkBase64)) as JsonWebKey;
    key = crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(jwkBase64, key);
  }
  return key;
}

function base64url(data: string | ArrayBuffer): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signStreamToken(
  jwkBase64: string,
  keyId: string,
  videoUid: string,
  exp: number,
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: keyId }));
  const payload = base64url(JSON.stringify({ sub: videoUid, kid: keyId, exp }));
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await importKey(jwkBase64), new TextEncoder().encode(input));
  return `${input}.${base64url(signature)}`;
}

export function streamProvider(env: Env): VideoProvider {
  return {
    async playback(videoUid, ttlSec) {
      const code = env.STREAM_CUSTOMER_CODE?.replace(/^customer-/, '');
      if (!code || !env.STREAM_SIGNING_KEY_ID || !env.STREAM_SIGNING_JWK) return null;
      const expiresAt = nowSec() + ttlSec;
      const token = await signStreamToken(env.STREAM_SIGNING_JWK, env.STREAM_SIGNING_KEY_ID, videoUid, expiresAt);
      return { kind: 'iframe', url: `https://customer-${code}.cloudflarestream.com/${token}/iframe`, expiresAt };
    },
  };
}
