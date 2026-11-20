// UI helpers
import { TZ } from './config.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const money = (n) => n === null || n === undefined ? '—' : 'Rs ' + Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 });
export const num = (n, d = 1) => n === null || n === undefined ? '—' : Number(n).toLocaleString('en-PK', { maximumFractionDigits: d });

export const fmtDate = (d) => d ? new Date(String(d).length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: String(d).length === 10 ? undefined : TZ }) : '—';
export const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—';
export const fmtDateTime = (d) => d ? `${fmtDate(d)} ${fmtTime(d)}` : '—';
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export const dur = (mins) => {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};
export const minsSince = (iso) => (Date.now() - new Date(iso).getTime()) / 60000;

export function waLink(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('0')) p = '92' + p.slice(1);
  if (p.length === 10 && p.startsWith('3')) p = '92' + p;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function fillTemplate(body, vars) {
  return String(body || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export function badge(status, label) {
  const map = {
    present: 'green', absent: 'red', half_day: 'amber', leave: 'violet', approved: 'green', rejected: 'gray',
    requested: 'amber', hot: 'red', warm: 'amber', cold: 'blue', nurture: 'violet', on_leave: 'violet', todo: 'gray', review: 'violet', backlog: 'gray',
    low: 'gray', normal: 'blue', high: 'amber', urgent: 'red', closed: 'gray',
    active: 'green', paid: 'green', confirmed: 'green', done: 'green', won: 'green', available: 'green', resolved: 'green', completed: 'green',
    partial: 'amber', upcoming: 'blue', pending: 'amber', paused: 'amber', contacted: 'blue', tour_scheduled: 'blue', proposal: 'blue',
    in_progress: 'blue', occupied: 'blue', reserved: 'blue', new: 'blue', open: 'amber', lead: 'blue',
    unpaid: 'amber', overdue: 'red', expired: 'red', blocked: 'red', lost: 'red', cancelled: 'gray', void: 'gray', left: 'gray', maintenance: 'gray', inactive: 'gray',
  };
  return `<span class="badge ${map[status] || 'gray'}">${esc(label ?? cap(String(status || '').replace(/_/g, ' ')))}</span>`;
}
export const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
export const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

export function pageHead(title, sub = '', actionsHtml = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actionsHtml}</div></div>`;
}

export function downloadCsv(filename, rows, cols) {
  const line = (a) => a.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  const blob = new Blob(['﻿' + [line(cols.map((c) => c[1])), ...rows.map((r) => line(cols.map((c) => (typeof c[0] === 'function' ? c[0](r) : r[c[0]]))))].join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// date helpers (YYYY-MM-DD strings in Pakistan time)
export const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export function periodRange(key, from, to) {
  const t = today();
  const m0 = t.slice(0, 8) + '01';
  const dow = (new Date(t + 'T12:00:00').getDay() + 6) % 7;
  switch (key) {
    case 'today': return [t, t];
    case 'week': return [addDays(t, -dow), t];
    case 'month': return [m0, t];
    case 'last_month': { const lm = new Date(m0 + 'T12:00:00'); lm.setMonth(lm.getMonth() - 1); const s = lm.toISOString().slice(0, 10); return [s, addDays(m0, -1)]; }
    case 'year': return [t.slice(0, 4) + '-01-01', t];
    case 'custom': return [from || m0, to || t];
    default: return [m0, t];
  }
}
export function pills(name, opts, current, label = '') {
  return `<div class="pills" data-pills="${name}">${label ? `<span>${esc(label)}</span>` : ''}${opts.map(([v, l, n]) => `<button class="pill ${v === current ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}${n !== undefined ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
}
export function seg(name, opts, current, cls = '') {
  return `<div class="seg ${cls}" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" class="${v === current ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
}
export const greeting = () => { const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ })); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
export const longDate = (d = new Date()) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
export const monthLabel = (ym) => new Date(ym.slice(0, 7) + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

let toastTimer;
export function toast(msg, type = 'ok') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = `toast ${type} show`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

export function modal(title, bodyHtml, { wide = false, top = false } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = `modal-wrap ${top ? 'top' : ''}`;
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">${bodyHtml}</div></div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(wrap);
  setTimeout(() => wrap.querySelector('input,select,textarea')?.focus(), 30);
  return wrap.querySelector('.modal');
}
export function closeModal() { $$('.modal-wrap').forEach((m) => m.remove()); }

export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else o[el.name] = el.value.trim() === '' ? null : el.value.trim();
  }
  return o;
}

// field('full_name','Full name',{required:true,value})
export function field(name, label, { type = 'text', value = '', required = false, options = null, placeholder = '', span = 1, step } = {}) {
  const req = required ? 'required' : '';
  let input;
  if (options) {
    input = `<select name="${name}" ${req}>${options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('')}</select>`;
  } else if (type === 'textarea') {
    input = `<textarea name="${name}" rows="3" placeholder="${esc(placeholder)}" ${req}>${esc(value)}</textarea>`;
  } else if (type === 'checkbox') {
    return `<label class="check span-${span}"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${esc(label)}</label>`;
  } else {
    input = `<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${step ? `step="${step}"` : ''} ${req}>`;
  }
  return `<label class="fld span-${span}"><span>${esc(label)}${required ? ' *' : ''}</span>${input}</label>`;
}

export function empty(msg, action = '') {
  return `<div class="empty"><div class="empty-icon">○</div><p>${esc(msg)}</p>${action}</div>`;
}

export function loading() { return `<div class="loading"><span class="spinner"></span></div>`; }

export function table(cols, rows, { rowAttr = () => '' } = {}) {
  if (!rows.length) return '';
  return `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr ${rowAttr(r)}>${cols.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export async function guard(btn, fn) {
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span>'; }
  try { return await fn(); }
  catch (e) { toast(e.message || 'Something went wrong', 'err'); throw e; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}
