export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: h });
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<Partial<T>> {
  try {
    const data = await request.json();
    return data && typeof data === 'object' ? (data as Partial<T>) : {};
  } catch {
    return {};
  }
}

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Нормализованный email или null. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}
