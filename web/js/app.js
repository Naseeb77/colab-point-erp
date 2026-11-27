import { auth, db, consumeAuthRedirect } from './api.js';
import { $, esc, toast, guard, formData, loading, modal, closeModal, longDate, initials } from './ui.js';
import { icon } from './icons.js';
import { state, can } from './state.js';
import dashboard from './views/dashboard.js';
import checkin from './views/checkin.js';
import members, { memberDetail } from './views/members.js';
import seatsView from './views/seats.js';
import bookings from './views/bookings.js';
import registrations from './views/registrations.js';
import scan from './views/scan.js';
import complaints from './views/complaints.js';
import tasks from './views/tasks.js';
import payments from './views/payments.js';
import billing from './views/billing.js';
import expenses from './views/expenses.js';
import reports from './views/reports.js';
import leads from './views/leads.js';
import attendance from './views/attendance.js';
import employees, { employeeDetail } from './views/employees.js';
import vendors from './views/vendors.js';
import stock from './views/stock.js';
import settings from './views/settings.js';
import portal from './views/portal.js';
import join from './views/join.js';

const NAV = [
  { group: 'Overview', items: [
    { path: '/', label: 'Dashboard', icon: 'dashboard', view: dashboard },
    { path: '/tasks', label: 'Tasks', icon: 'tasks', view: tasks },
  ] },
  { group: 'Members & Space', items: [
    { path: '/members', label: 'Members', icon: 'members', view: members },
    { path: '/checkin', label: 'Check-in desk', icon: 'checkin', view: checkin },
    { path: '/seats', label: 'Seat availability', icon: 'seats', view: seatsView },
    { path: '/bookings', label: 'Meeting rooms', icon: 'rooms', view: bookings },
    { path: '/registrations', label: 'New sign-ups', icon: 'registrations', view: registrations, badge: 'pending_registrations' },
    { path: '/scan', label: 'Scan a form', icon: 'scan', view: scan },
    { path: '/leads', label: 'Leads', icon: 'leads', view: leads },
    { path: '/complaints', label: 'Complaints', icon: 'complaints', view: complaints, badge: 'open_complaints' },
  ] },
  { group: 'Finance', roles: 'finance', items: [
    { path: '/payments', label: 'Payments', icon: 'payments', view: payments },
    { path: '/billing', label: 'Invoices & dues', icon: 'invoices', view: billing },
    { path: '/expenses', label: 'Expenses', icon: 'expenses', view: expenses },
    { path: '/reports', label: 'Reports', icon: 'reports', view: reports },
  ] },
  { group: 'Operations', items: [
    { path: '/attendance', label: 'Staff attendance', icon: 'attendance', view: attendance },
    { path: '/employees', label: 'Employees', icon: 'employees', view: employees, roles: 'hr' },
    { path: '/vendors', label: 'Vendors & work', icon: 'vendors', view: vendors },
    { path: '/stock', label: 'Stock & pantry', icon: 'stock', view: stock },
    { path: '/settings', label: 'Settings', icon: 'settings', view: settings, roles: 'admin' },
  ] },
];
const ALL = NAV.flatMap((g) => g.items.map((i) => ({ ...i, roles: i.roles || g.roles })));

function allowed(item) {
  if (!item.roles) return can.staff();
  return { finance: can.finance, admin: can.admin, hr: can.hr }[item.roles]();
}

function authCard(inner) {
  return `<div class="auth-card"><div class="brand big"><img class="wordmark" src="/brand/wordmark-dark.png" alt="CoLab Point"></div>${inner}</div>`;
}

function renderAuth(mode = 'login') {
  document.body.className = 'auth-page';
  $('#app').innerHTML = authCard(`
    <form id="auth-form" class="form">
      ${mode === 'signup' ? '<label class="fld"><span>Full name</span><input name="full_name" required></label>' : ''}
      <label class="fld"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
      ${mode !== 'reset' ? `<label class="fld"><span>Password</span><input name="password" type="password" minlength="6" required autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></label>` : ''}
      <button class="btn dark block" type="submit">${mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
    </form>
    <div class="auth-links">
      ${mode !== 'login' ? '<a href="#" data-mode="login">Sign in</a>' : '<a href="#" data-mode="signup">Create account</a><a href="#" data-mode="reset">Forgot password?</a>'}
    </div>
    <a class="btn block" href="#/join">New member? Fill the joining form</a>`);
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

function renderNewPassword() {
  document.body.className = 'auth-page';
  $('#app').innerHTML = authCard(`
    <form id="pw-form" class="form">
      <h3>Set a new password</h3>
      <label class="fld"><span>New password</span><input name="password" type="password" minlength="6" required autocomplete="new-password"></label>
      <button class="btn dark block" type="submit">Save password</button>
      ${state.profile ? '<a class="btn ghost block" href="#/">Cancel</a>' : ''}
    </form>`);
  $('#pw-form').onsubmit = (e) => {
    e.preventDefault();
    guard(e.submitter, async () => { await auth.updatePassword(formData(e.target).password); toast('Password updated'); location.hash = '#/'; await boot(); }).catch(() => {});
  };
}

function renderShell() {
  document.body.className = '';
  const p = state.profile;
  $('#app').innerHTML = `
  <aside class="sidebar" id="sidebar">
    <div class="brand"><img class="wordmark" src="/brand/wordmark-dark.png" alt="CoLab Point"></div>
    <nav>${NAV.map((g) => {
      const items = g.items.map((i) => ({ ...i, roles: i.roles || g.roles })).filter(allowed);
      if (!items.length) return '';
      return `<div class="nav-group"><span>${g.group}</span>${items.map((i) => `<a href="#${i.path}" data-path="${i.path}"><span class="ni">${icon(i.icon)}</span>${i.label}${i.badge ? `<span class="count hide" data-badge="${i.badge}"></span>` : ''}</a>`).join('')}</div>`;
    }).join('')}</nav>
    <div class="sidebar-foot">
      <button class="btn ghost sm block" id="chpw" style="justify-content:flex-start"><span class="ni">${icon('key')}</span>Change password</button>
      <button class="btn ghost sm block" id="logout" style="justify-content:flex-start"><span class="ni">${icon('logout')}</span>Sign out</button>
    </div>
  </aside>
  <div class="main">
    <header class="topbar">
      <button class="icon-btn menu" id="menu" aria-label="Menu">${icon('menu')}</button>
      <button class="search-trigger" id="open-search">${icon('search')}<span>Search members, leads, invoices…</span><kbd>Ctrl K</kbd></button>
      <span class="today">${longDate()}</span>
      <div class="user-chip"><div class="avatar sm">${esc(initials(p.full_name || state.email))}</div><div class="who"><strong>${esc(p.full_name || 'Me')}</strong><small>${esc(p.role)}</small></div></div>
    </header>
    <section class="view" id="view-root"><div id="page-head"></div><div id="view" style="display:grid;gap:16px"></div></section>
  </div>
  <nav class="mobile-bar">
    <a href="#/" data-path="/">${icon('dashboard')}Home</a>
    <a href="#/checkin" data-path="/checkin">${icon('checkin')}Check-in</a>
    <a href="#/scan" data-path="/scan">${icon('camera')}Scan</a>
    <a href="#/members" data-path="/members">${icon('members')}Members</a>
    <a href="#" id="more">${icon('more')}More</a>
  </nav>`;
  $('#logout').onclick = async () => { await auth.signOut(); state.profile = null; renderAuth(); };
  $('#chpw').onclick = () => renderNewPassword();
  $('#menu').onclick = () => $('#sidebar').classList.toggle('open');
  $('#more').onclick = (e) => { e.preventDefault(); $('#sidebar').classList.add('open'); };
  $('#open-search').onclick = openSearch;
  refreshBadges();
}

async function refreshBadges() {
  try {
    const s = await db.rpc('dashboard_stats');
    state.stats = s;
    document.querySelectorAll('[data-badge]').forEach((el) => {
      const n = s[el.dataset.badge] || 0;
      el.textContent = n; el.classList.toggle('hide', !n);
    });
  } catch { /* ignore */ }
}

function openSearch() {
  const md = modal('Search', `<div class="cmdk"><input id="cmdk-q" placeholder="Type a name, phone, CNIC, invoice no…" autocomplete="off"><div class="res" id="cmdk-res"><p class="muted small" style="padding:12px">Start typing to search.</p></div></div>`, { top: true });
  md.querySelector('.modal-body').style.padding = '0';
  md.querySelector('.modal-head').remove();
  const q = $('#cmdk-q'); let t;
  q.oninput = () => {
    clearTimeout(t);
    const v = q.value.replace(/[(),*]/g, ' ').trim();
    if (v.length < 2) return;
    t = setTimeout(async () => {
      const like = `*${v}*`;
      const [m, l, inv, e] = await Promise.all([
        db.select('members', { select: 'id,full_name,phone,member_no', or: `(full_name.ilike.${like},phone.ilike.${like},cnic.ilike.${like}${/^\d+$/.test(v) ? `,member_no.eq.${v}` : ''})`, limit: 6 }),
        db.select('leads', { select: 'id,name,phone,status', or: `(name.ilike.${like},phone.ilike.${like})`, limit: 4 }),
        can.finance() ? db.select('invoices', { select: 'id,invoice_no,member_id,total,status', invoice_no: `ilike.${like}`, limit: 4 }) : [],
        db.select('employees', { select: 'id,full_name,designation', full_name: `ilike.${like}`, limit: 4 }).catch(() => []),
      ]);
      const pages = ALL.filter((i) => allowed(i) && i.label.toLowerCase().includes(v.toLowerCase()));
      const sec = (title, rows) => rows.length ? `<div class="grp">${title}</div>${rows.join('')}` : '';
      $('#cmdk-res').innerHTML = sec('Members', m.map((r) => `<a href="#/members/${r.id}"><span class="avatar sm">${esc(initials(r.full_name))}</span><span class="grow">${esc(r.full_name)} <span class="muted">#${r.member_no}</span></span><span class="muted small">${esc(r.phone)}</span></a>`))
        + sec('Leads', l.map((r) => `<a href="#/leads"><span class="avatar sm">★</span><span class="grow">${esc(r.name)}</span><span class="muted small">${esc(r.status)}</span></a>`))
        + sec('Invoices', inv.map((r) => `<a href="#/members/${r.member_id}"><span class="avatar sm">₨</span><span class="grow">${esc(r.invoice_no)}</span><span class="muted small">${esc(r.status)}</span></a>`))
        + sec('Employees', e.map((r) => `<a href="#/employees/${r.id}"><span class="avatar sm">${esc(initials(r.full_name))}</span><span class="grow">${esc(r.full_name)}</span><span class="muted small">${esc(r.designation || '')}</span></a>`))
        + sec('Pages', pages.map((p) => `<a href="#${p.path}"><span class="ni">${icon(p.icon)}</span><span class="grow">${p.label}</span></a>`))
        || '<p class="muted small" style="padding:12px">Nothing found.</p>';
    }, 220);
  };
  $('#cmdk-res').onclick = (e) => { if (e.target.closest('a')) closeModal(); };
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && can.staff()) { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') closeModal();
});

async function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const path = hash.split('?')[0];
  if (path === '/join') return join($('#app'));
  if (!state.profile) return boot();
  if (!can.staff()) return portal($('#app'));
  if (!$('#sidebar')) renderShell();
  $('#sidebar')?.classList.remove('open');
  document.querySelectorAll('nav a[data-path]').forEach((a) => a.classList.toggle('active', a.dataset.path === '/' ? path === '/' : path.startsWith(a.dataset.path)));
  const view = $('#view');
  const head = $('#page-head');
  head.innerHTML = ''; view.innerHTML = loading();
  view.onclick = null; view.onchange = null; view.oninput = null;
  let title = '', sub = '', act = '';
  const paint = () => { head.innerHTML = title ? `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions" id="page-actions">${act}</div></div>` : ''; };
  const ctx = {
    view,
    setTitle: (t, s = '') => { title = t; sub = s; document.title = `${t} · CoLab Point`; paint(); },
    actions: (html) => { act = html; paint(); return $('#page-actions'); },
    rerender: () => route(),
    refreshBadges,
  };
  try {
    let m;
    if ((m = path.match(/^\/members\/([0-9a-f-]{36})/))) return await memberDetail(ctx, m[1]);
    if ((m = path.match(/^\/employees\/([0-9a-f-]{36})/))) return await employeeDetail(ctx, m[1]);
    const item = ALL.find((i) => i.path === path) || ALL[0];
    if (!allowed(item)) { view.innerHTML = '<div class="card"><p>You do not have access to this page.</p></div>'; return; }
    await item.view(ctx);
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card error"><strong>Could not load this page.</strong><p>${esc(e.message)}</p></div>`;
  }
}

async function boot() {
  if (consumeAuthRedirect() === 'recovery') return renderNewPassword();
  if (location.hash.startsWith('#/join')) return route();
  if (!auth.session) return renderAuth();
  try {
    state.email = auth.user?.email || '';
    state.profile = await db.one('profiles', { select: '*', id: `eq.${auth.userId}` });
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

// Inside the Android app (Capacitor) new windows are not supported: open external links in the phone's apps instead.
if (window.Capacitor) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[target=_blank]');
    if (a && /^(https?:|tel:|mailto:)/.test(a.href)) { e.preventDefault(); location.href = a.href; }
  }, true);
  const nativeOpen = window.open;
  window.open = (url, ...rest) => (url && /^https?:/.test(url) ? (location.href = url, null) : nativeOpen.call(window, url, ...rest));
}

window.addEventListener('hashchange', route);
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot();
