// Minimal Supabase client (Auth + REST + RPC) using fetch — no dependencies.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SKEY = 'colab.session';
let session = null;
try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { session = null; }

function saveSession(s) {
  session = s;
  try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch {}
}

async function authFetch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || 'Login failed');
  return data;
}

function withExpiry(d) {
  return { ...d, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600) };
}

export const auth = {
  get session() { return session; },
  get user() { return session?.user || null; },
  get userId() {
    if (session?.user?.id) return session.user.id;
    try { return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch { return null; }
  },
  async signIn(email, password) {
    saveSession(withExpiry(await authFetch('token?grant_type=password', { email, password })));
    return session;
  },
  async signUp(email, password, full_name) {
    const d = await authFetch('signup', { email, password, data: { full_name } });
    if (d.access_token) saveSession(withExpiry(d));
    return d;
  },
  async resetPassword(email) {
    return authFetch('recover', { email });
  },
  async refresh() {
    if (!session?.refresh_token) return null;
    try {
      saveSession(withExpiry(await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token })));
    } catch { saveSession(null); }
    return session;
  },
  async signOut() {
    if (session) {
      fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` } }).catch(() => {});
    }
    saveSession(null);
  },
};

// Handle magic/confirmation links that land with #access_token=...
export function consumeAuthRedirect() {
  if (!location.hash.includes('access_token=')) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  saveSession(withExpiry({
    access_token: p.get('access_token'), refresh_token: p.get('refresh_token'),
    expires_in: Number(p.get('expires_in') || 3600), user: null,
  }));
  history.replaceState(null, '', location.pathname + '#/');
  return true;
}

async function token() {
  if (session && session.expires_at - 60 < Date.now() / 1000) await auth.refresh();
  return session?.access_token;
}

async function request(method, path, { body, headers = {}, prefer } = {}) {
  const t = await token();
  const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...headers };
  if (t) h.Authorization = `Bearer ${t}`;
  if (prefer) h.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && session) { await auth.refresh(); }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.hint || `Request failed (${res.status})`);
  return data;
}

// db.select('members', { select: '*', order: 'created_at.desc', 'status': 'eq.active', limit: 50 })
export const db = {
  select(table, params = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.append(k, v);
    return request('GET', `${table}?${q}`);
  },
  async one(table, params = {}) {
    const rows = await db.select(table, { ...params, limit: 1 });
    return rows[0] || null;
  },
  insert(table, row) { return request('POST', table, { body: row, prefer: 'return=representation' }); },
  update(table, match, patch) {
    const q = new URLSearchParams(Object.entries(match).map(([k, v]) => [k, `eq.${v}`]));
    return request('PATCH', `${table}?${q}`, { body: patch, prefer: 'return=representation' });
  },
  remove(table, match) {
    const q = new URLSearchParams(Object.entries(match).map(([k, v]) => [k, `eq.${v}`]));
    return request('DELETE', `${table}?${q}`);
  },
  rpc(fn, args = {}) { return request('POST', `rpc/${fn}`, { body: args }); },
};
