import { db } from '../api.js';
import { esc, fmtDate, empty, toast, guard, modal, closeModal, field, formData, badge } from '../ui.js';
import { staffProfiles } from '../state.js';
import { workForm } from './vendors.js';
import { searchFilter } from './checkin.js';

const CATS = [['internet', 'Internet / WiFi'], ['power', 'Power / UPS'], ['ac', 'AC / fans'], ['cleaning', 'Cleaning'], ['furniture', 'Furniture'], ['billing', 'Billing'], ['general', 'General / idea']];
const STAGES = [['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['closed', 'Closed']];

async function ticketForm(t = {}, done) {
  const staff = await staffProfiles();
  const md = modal(t.id ? 'Complaint' : 'New complaint or idea', `<form class="form grid">
    ${field('subject', 'Subject', { required: true, value: t.subject, span: 2, placeholder: 'WiFi slow in hall, AC not cooling…' })}
    ${field('category', 'Category', { options: CATS, value: t.category || 'general' })}${field('priority', 'Priority', { options: [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']], value: t.priority || 'normal' })}
    ${t.id ? '' : '<label class="fld span-2"><span>Reported by member (optional)</span><input name="mq" autocomplete="off" placeholder="Search member"><div class="pick" id="tk-pick"></div></label>'}
    ${field('assigned_to', 'Assigned to', { options: [['', '— unassigned —'], ...staff.map((s) => [s.id, s.full_name || s.role])], value: t.assigned_to })}${field('status', 'Status', { options: STAGES, value: t.status || 'open' })}
    ${field('description', 'Details & what was done', { type: 'textarea', value: t.description, span: 2 })}
    <div class="span-2 form-actions">${t.id ? '<button type="button" class="btn" id="wo">Create work order</button>' : ''}<button class="btn dark" type="submit">Save</button></div></form>`, { wide: true });
  const f = md.querySelector('form'); let member = t.member_id || null;
  if (f.mq) { let tm; f.mq.oninput = () => { clearTimeout(tm); const v = f.mq.value.trim(); if (v.length < 2) return;
    tm = setTimeout(async () => { const rows = await db.select('members', { select: 'id,full_name', or: searchFilter(v), limit: 6 });
      const p = md.querySelector('#tk-pick'); p.innerHTML = rows.map((r) => `<button type="button" data-id="${r.id}">${esc(r.full_name)}</button>`).join('');
      p.onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) { member = b.dataset.id; f.mq.value = b.textContent; p.innerHTML = ''; } }; }, 220); }; }
  f.onsubmit = (e) => {
    e.preventDefault(); const d = formData(f); delete d.mq; d.member_id = member;
    if (['resolved', 'closed'].includes(d.status) && !t.resolved_at) d.resolved_at = new Date().toISOString();
    guard(e.submitter, async () => { t.id ? await db.update('tickets', { id: t.id }, d) : await db.insert('tickets', d); closeModal(); toast('Saved'); done(); }).catch(() => {});
  };
  const wo = md.querySelector('#wo');
  if (wo) wo.onclick = () => workForm({ title: t.subject, description: t.description, ticket_id: t.id, category: { internet: 'it_network', power: 'electrical', ac: 'ac', cleaning: 'cleaning', furniture: 'furniture' }[t.category] || 'maintenance' }, done);
}

export default async function complaints({ view, setTitle, actions, rerender }) {
  setTitle('Complaints & ideas', 'Log it, assign it, track it until it is closed');
  actions('<button class="btn dark" id="add">+ New complaint</button>');
  const rows = await db.select('tickets', { select: '*,members(full_name),assignee:profiles!assigned_to(full_name)', order: 'created_at.desc', limit: 300 });
  view.style.setProperty('--cols', 4);
  view.innerHTML = `<div class="kanban" style="--cols:4">${STAGES.map(([k, l]) => {
    const items = rows.filter((r) => r.status === k);
    return `<div class="col"><div class="col-head"><strong>${l}</strong><span>${items.length}</span></div>
      ${items.map((r) => `<div class="kcard" data-id="${r.id}"><strong>${esc(r.subject)}</strong>
        <div class="chips">${badge(r.priority)}<span class="chip">${esc((CATS.find((c) => c[0] === r.category) || [])[1] || r.category)}</span></div>
        <span class="muted tiny">${fmtDate(r.created_at)}${r.members ? ' · ' + esc(r.members.full_name) : ''}${r.assignee ? ' · → ' + esc(r.assignee.full_name || '') : ''}</span></div>`).join('') || '<div class="muted small" style="padding:6px">—</div>'}</div>`;
  }).join('')}</div>`;
  document.getElementById('add').onclick = () => ticketForm({}, rerender);
  view.onclick = (e) => { const c = e.target.closest('.kcard'); if (c) ticketForm(rows.find((r) => r.id === c.dataset.id), rerender); };
  if (!rows.length) view.insertAdjacentHTML('beforeend', `<div class="card">${empty('No complaints yet. Members can also report issues from their portal.')}</div>`);
}
