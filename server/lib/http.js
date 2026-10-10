export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const env = (name) => {
  const v = process.env[name];
  if (!v) throw new HttpError(500, `Server is missing required environment variable ${name}`);
  return v;
};

// CORS: the frontend lives on a different origin (Vercel). We use Bearer tokens (no cookies), so no credentials are needed.
const allowed = () => (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
export function corsHeaders(req) {
  const origin = req.headers.get('origin'), list = allowed();
  const h = { Vary: 'Origin' };
  if (origin && (list.includes('*') || list.includes(origin))) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization,Content-Type';
    h['Access-Control-Expose-Headers'] = 'Retry-After';
    h['Access-Control-Max-Age'] = '7200';          // browsers cache the preflight -> no extra OPTIONS request per call
  }
  return h;
}

// First entry of X-Forwarded-For. Spoofable, which is fine: the per-IP limit is deliberately loose and the real
// guard is the per-email limit.
export const clientIp = (req) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
