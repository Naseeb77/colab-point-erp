import { auth, db, consumeAuthRedirect } from './api.js';
import { $, esc, toast, guard, formData, loading } from './ui.js';
import { state, can } from './state.js';
import dashboard from './views/dashboard.js';
import checkin from './views/checkin.js';
import members, { memberDetail } from './views/members.js';
import billing from './views/billing.js';
import reports from './views/reports.js';
import leads from './views/leads.js';
import settings from './views/settings.js';
import portal from './views/portal.js';

const NAV = [
  { path: '/', label: 'Dashboard', icon: '◧', view: dashboard, roles: 'staff' },
  { path: '/checkin', label: 'Check-in', icon: '⇥', view: checkin, roles: 'staff' },
  { path: '/members', label: 'Members', icon: '◉', view: members, roles: 'staff' },
  { path: '/billing', label: 'Billing', icon: '₨', view: billing, roles: 'finance' },
  { path: '/leads', label: 'Leads', icon: '✦', view: leads, roles: 'staff' },
  { path: '/reports', label: 'Reports', icon: '▤', view: reports, roles: 'staff' },
  { path: '/settings', label: 'Settings', icon: '⚙', view: settings, roles: 'admin' },
];

function allowed(item) {
  if (item.roles === 'staff') return can.staff();
  if (item.roles === 'finance') return can.finance();
  if (item.roles === 'admin') return can.admin();
  return true;
}

function renderAuth(mode = 'login') {
  document.body.className = 'auth-page';
  $('#app').innerHTML = `
  <div class="auth-card">
    <div class="brand big"><span class="logo-mark">C</span><div><strong>CoLab Point</strong><small>Workspace management</small></div></div>
    <form id="auth-form" class="form">
      ${mode === 'signup' ? '<label class="fld"><span>Full name</span><input name="full_name" required></label>' : ''}
      <label class="fld"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
      ${mode !== 'reset' ? `<label class="fld"><span>Password</span><input name="password" type="password" minlength="6" required autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></label>` : ''}
      <button class="btn primary block" type="submit">${mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
    </form>
    <div class="auth-links">
      ${mode !== 'login' ? '<a href="#" data-mode="login">Sign in</a>' : '<a href="#" data-mode="signup">Create account</a><a href="#" data-mode="reset">Forgot password?</a>'}
    </div>
  </div>`;
  $('#app').querySelectorAll('[data-mode]').forEach((a) => a.onclick = (e) => { e.preventDefault(); renderAuth(a.dataset.mode); });
  $('#auth-form').onsubmit = (e) => {
    e.preventDefault();
    const f = formData(e.target);
    guard(e.submitter, async () => {
      if (mode === 'login') { await auth.signIn(f.email, f.password); await boot(); }
      else if (mode === 'signup') {
        const d = await auth.signUp(f.email, f.password, f.full_name);
        if (d.access_token) await boot();
        else { toast('Account created. Check your email to confirm, then sign in.'); renderAuth('login'); }
      } else { await auth.resetPassword(f.email); toast('Reset link sent to your email.'); renderAuth('login'); }
    }).catch(() => {});
  };
}

function renderShell() {
  document.body.className = '';
  const items = NAV.filter(allowed);
  $('#app').innerHTML = `
  <aside class="sidebar" id="sidebar">
    <div class="brand"><span class="logo-mark">C</span><div><strong>CoLab Point</strong><small>${esc(state.profile.role)}</small></div></div>
    <nav>${items.map((i) => `<a href="#${i.path}" data-path="${i.path}"><span class="ni">${i.icon}</span>${i.label}</a>`).join('')}</nav>
    <div class="sidebar-foot">
      <div class="me"><div class="avatar">${esc((state.profile.full_name || state.email || '?')[0].toUpperCase())}</div>
        <div><strong>${esc(state.profile.full_name || 'Me')}</strong><small>${esc(state.email || '')}</small></div></div>
      <button class="btn ghost sm block" id="logout">Sign out</button>
    </div>
  </aside>
  <div class="main">
    <header class="topbar"><button class="icon-btn menu" id="menu" aria-label="Menu">☰</button><h1 id="page-title"></h1><div id="page-actions" class="actions"></div></header>
    <section id="view" class="view"></section>
  </div>`;
  $('#logout').onclick = async () => { await auth.signOut(); renderAuth(); };
  $('#menu').onclick = () => $('#sidebar').classList.toggle('open');
}

async function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  if (!state.profile) return;
  if (!can.staff()) return portal($('#app'));
  $('#sidebar')?.classList.remove('open');
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.path === '/' ? hash === '/' : hash.startsWith(a.dataset.path)));
  const view = $('#view');
  $('#page-actions').innerHTML = '';
  view.innerHTML = loading();
  const ctx = {
    view, setTitle: (t) => { $('#page-title').textContent = t; document.title = `${t} · CoLab Point`; },
    actions: (html) => { $('#page-actions').innerHTML = html; return $('#page-actions'); },
    rerender: () => route(),
  };
  try {
    const m = hash.match(/^\/members\/([0-9a-f-]{36})/);
    if (m) return await memberDetail(ctx, m[1]);
    const item = NAV.find((i) => i.path === hash.split('?')[0]) || NAV[0];
    if (!allowed(item)) { view.innerHTML = '<div class="card"><p>You do not have access to this page.</p></div>'; return; }
    await item.view(ctx);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card error"><strong>Could not load this page.</strong><p>${esc(e.message)}</p></div>`;
  }
}

async function boot() {
  consumeAuthRedirect();
  if (!auth.session) return renderAuth();
  try {
    const id = auth.userId;
    state.email = auth.user?.email || '';
    state.profile = await db.one('profiles', { select: '*', id: `eq.${id}` });
    if (!state.profile) throw new Error('Profile not found');
    if (!state.profile.active) { await auth.signOut(); toast('Your account is disabled.', 'err'); return renderAuth(); }
    state.settings = await db.one('org_settings', { select: '*' });
    if (can.staff()) renderShell();
    route();
  } catch (e) {
    console.error(e);
    await auth.signOut();
    renderAuth();
  }
}

window.addEventListener('hashchange', route);
boot();
