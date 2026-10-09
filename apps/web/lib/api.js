// All traffic goes straight from the browser to the API (Firebase App Hosting). Bearer token, no cookies.
const BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

export const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  clear: () => { try { sessionStorage.clear(); } catch {} },
};

export class ApiError extends Error {
  constructor(status, message, data = {}) { super(message); this.status = status; this.data = data; }
}

let authLost = () => {};
export const setAuthLostHandler = (fn) => { authLost = fn; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (n) => Math.min(8000, 400 * 2 ** n) + Math.random() * 400;      // jitter: 2,500 clients must not retry in lock-step

/**
 * api(path, { method, body, form, retries, onBusy })
 *  - 429 'busy' (rate limit / queue) and 502-504 and network errors are retried with backoff + jitter (honours Retry-After)
 *  - 429 'locked' (too many wrong passwords) and every 4xx are NOT retried
 */
export async function api(path, { method = 'GET', body, form, retries, onBusy } = {}) {
  const max = retries ?? (method === 'GET' ? 4 : 2);
  for (let attempt = 0; ; attempt++) {
    const headers = {}, tok = store.get('tok');
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const init = { method, headers };
    if (form) init.body = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }

    let r;
    try { r = await fetch(`${BASE}/api${path}`, init); }
    catch { if (attempt >= max) throw new ApiError(0, 'Cannot reach the server. Check your internet connection.'); await sleep(backoff(attempt)); continue; }

    const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = { detail: text }; }
    if (r.ok) return data;

    const retryable = (r.status === 429 && data.code !== 'locked') || (r.status >= 502 && r.status <= 504);
    if (retryable && attempt < max) {
      if (onBusy) onBusy(true);
      const ra = (Number(r.headers.get('Retry-After')) || data.retryAfter || 0) * 1000;
      await sleep(Math.max(ra, backoff(attempt))); continue;
    }
    if (r.status === 401 && tok && !path.includes('login')) { authLost(); throw new ApiError(401, 'Session expired', data); }
    throw new ApiError(r.status, data.detail || 'Request failed', data);
  }
}

export async function downloadCsv(path, filename) {
  const r = await fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${store.get('tok')}` } });
  if (!r.ok) throw new ApiError(r.status, 'Download failed');
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
