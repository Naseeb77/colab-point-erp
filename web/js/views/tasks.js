import { db } from '../api.js';
import { esc, fmtDate, today, empty, toast, guard, modal, closeModal, field, formData, badge, pills, waLink } from '../ui.js';
import { staffProfiles, state } from '../state.js';

const ST = [['todo', 'To do'], ['in_progress', 'In progress'], ['review', 'Check'], ['done', 'Done']];

async function taskForm(t = {}, done) {
  const staff = await staffProfiles();
  const md = modal(t.id ? 'Task' : 'New task', `<form class="form grid">
    ${field('title', 'Task', { required: true, value: t.title, span: 2, placeholder: 'Refill water dispenser, follow up Ali’s payment, clean meeting room…' })}
    ${field('assignee_id', 'Assign to', { options: [['', '— me —'], ...staff.map((s) => [s.id, s.full_name || s.role])], value: t.assignee_id })}${field('due_date', 'Due', { type: 'date', value: t.due_date || today() })}
    ${field('priority', 'Priority', { options: [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']], value: t.priority || 'normal' })}${field('status', 'Status', { options: ST, value: t.status || 'todo' })}
    ${field('description', 'Details', { type: 'textarea', value: t.description, span: 2 })}
    <div class="span-2 form-actions">${t.id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn dark" type="submit">Save</button></div></form>`);
  const f = md.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault(); const d = formData(f);
    d.assignee_id ||= state.profile.id;
    if (d.status === 'done' && t.status !== 'done') d.completed_at = new Date().toISOString();
    guard(e.submitter, async () => { t.id ? await db.update('tasks', { id: t.id }, d) : await db.insert('tasks', d); closeModal(); toast('Saved'); done(); }).catch(() => {});
  };
  const del = md.querySelector('#del'); if (del) del.onclick = () => guard(del, async () => { await db.remove('tasks', { id: t.id }); closeModal(); done(); });
}

export default async function tasks({ view, setTitle, actions, rerender }) {
  const who = new URLSearchParams(location.hash.split('?')[1] || '').get('w') || 'all';
  setTitle('Tasks', 'Daily office jobs, assigned to your team');
  actions('<button class="btn dark" id="add">+ New task</button>');
  const rows = await db.select('tasks', { select: '*,assignee:profiles!assignee_id(full_name)', project_id: 'is.null', order: 'due_date.asc.nullslast', limit: 400 });
  const mine = rows.filter((r) => r.assignee_id === state.profile.id);
  const overdue = rows.filter((r) => r.status !== 'done' && r.due_date && r.due_date < today());
  const list = who === 'mine' ? mine : who === 'overdue' ? overdue : rows;
  view.innerHTML = `<div class="toolbar">${pills('w', [['all', 'All', rows.filter((r) => r.status !== 'done').length], ['mine', 'Mine', mine.filter((r) => r.status !== 'done').length], ['overdue', 'Overdue', overdue.length]], who)}</div>
  <div class="kanban" style="--cols:4">${ST.map(([k, l]) => {
    const items = list.filter((r) => r.status === k).slice(0, k === 'done' ? 15 : 100);
    return `<div class="col"><div class="col-head"><strong>${l}</strong><span>${list.filter((r) => r.status === k).length}</span></div>
      ${items.map((r) => `<div class="kcard" data-id="${r.id}"><strong>${esc(r.title)}</strong><div class="chips">${r.priority !== 'normal' ? badge(r.priority) : ''}${r.due_date ? `<span class="chip ${r.status !== 'done' && r.due_date < today() ? 'due' : ''}">${fmtDate(r.due_date)}</span>` : ''}</div>
        <span class="muted tiny">→ ${esc(r.assignee?.full_name || '—')}</span>
        ${k !== 'done' ? `<button class="btn xs" data-done="${r.id}">✓ Done</button>` : ''}</div>`).join('') || '<div class="muted small" style="padding:6px">—</div>'}</div>`;
  }).join('')}</div>`;
  document.getElementById('add').onclick = () => taskForm({}, rerender);
  view.onclick = async (e) => {
    const pl = e.target.closest('[data-pills] .pill'); if (pl) { location.hash = `#/tasks?w=${pl.dataset.v}`; return; }
    const d = e.target.closest('[data-done]');
    if (d) { e.stopPropagation(); await guard(d, () => db.update('tasks', { id: d.dataset.done }, { status: 'done', completed_at: new Date().toISOString() })); toast('Done ✓'); return rerender(); }
    const c = e.target.closest('.kcard'); if (c) taskForm(rows.find((r) => r.id === c.dataset.id), rerender);
  };
}
