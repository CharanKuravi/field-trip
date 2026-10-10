// One catch-all route handler + a tiny router (keeps the API in a few readable files and one cold-start bundle).
import { HttpError, corsHeaders, clientIp } from './http.js';
import { examRoutes } from './exam.js';
import { adminRoutes } from './admin.js';

const health = async () => ({ ok: true, time: Date.now() });
const ROUTES = [['GET', '/health', health], ...examRoutes, ...adminRoutes]
  .map(([method, pattern, fn]) => ({ method, parts: pattern.split('/').filter(Boolean), fn }));

function match(parts, segs) {
  if (parts.length !== segs.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) params[parts[i].slice(1)] = segs[i];
    else if (parts[i] !== segs[i]) return null;
  }
  return params;
}

export async function dispatch(req, ctx) {
  const cors = { ...corsHeaders(req), 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const { path = [] } = await ctx.params, segs = path.map(decodeURIComponent);
    for (const r of ROUTES) {
      if (r.method !== req.method) continue;
      const params = match(r.parts, segs); if (!params) continue;
      const json = async () => { try { return await req.json(); } catch { throw new HttpError(400, 'Invalid JSON body'); } };
      const out = await r.fn({ req, params, ip: clientIp(req), url: new URL(req.url), json });
      if (out instanceof Response) { for (const [k, v] of Object.entries(cors)) out.headers.set(k, v); return out; }
      return Response.json(out, { headers: cors });
    }
    throw new HttpError(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) {
      const h = { ...cors }; if (e.extra?.retryAfter) h['Retry-After'] = String(e.extra.retryAfter);
      return Response.json({ detail: e.message, ...e.extra }, { status: e.status, headers: h });
    }
    console.error('unhandled', e);
    return Response.json({ detail: 'Internal error' }, { status: 500, headers: cors });
  }
}
