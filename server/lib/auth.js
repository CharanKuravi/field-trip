import { SignJWT, jwtVerify } from 'jose';
import { HttpError, env } from './http.js';

const key = () => new TextEncoder().encode(env('PROCTOR_SECRET'));

export const signToken = (claims, hours = 8) =>
  new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${hours}h`).sign(key());

export async function verifyToken(req) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/i);
  if (!m) throw new HttpError(401, 'Missing token');
  try { return (await jwtVerify(m[1], key(), { algorithms: ['HS256'] })).payload; }
  catch { throw new HttpError(401, 'Invalid or expired token'); }
}

export async function requireAdmin(req) {
  const c = await verifyToken(req);
  if (c.role !== 'admin') throw new HttpError(403, 'Admin only');
  return c;
}
