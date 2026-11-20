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

export function badge(status) {
  const map = {
    active: 'green', paid: 'green', confirmed: 'green', done: 'green', won: 'green', available: 'green', resolved: 'green', completed: 'green',
    partial: 'amber', upcoming: 'blue', pending: 'amber', paused: 'amber', contacted: 'blue', tour_scheduled: 'blue', proposal: 'blue',
    in_progress: 'blue', occupied: 'blue', reserved: 'blue', new: 'blue', open: 'amber', lead: 'blue',
    unpaid: 'amber', overdue: 'red', expired: 'red', blocked: 'red', lost: 'red', cancelled: 'gray', void: 'gray', left: 'gray', maintenance: 'gray', inactive: 'gray',
  };
  return `<span class="badge ${map[status] || 'gray'}">${esc(String(status || '').replace(/_/g, ' '))}</span>`;
}

let toastTimer;
export function toast(msg, type = 'ok') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = `toast ${type} show`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

export function modal(title, bodyHtml, { wide = false } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
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
