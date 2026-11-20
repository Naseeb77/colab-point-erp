import { db } from '../api.js';
import { $, esc, fmtDate, today, empty, toast, guard, modal, closeModal, field, formData, waLink } from '../ui.js';
import { plans } from '../state.js';
import { openMemberForm } from './members.js';

const STAGES = [['new', 'New'], ['contacted', 'Contacted'], ['tour_scheduled', 'Tour / meeting'], ['proposal', 'Proposal'], ['won', 'Won'], ['lost', 'Lost']];
const SOURCES = ['walk-in', 'website', 'facebook', 'instagram', 'linkedin', 'youtube', 'google', 'referral', 'whatsapp', 'other'];

async function leadForm(l = {}, onDone) {
  const pl = await plans();
  const md = modal(l.id ? 'Edit lead' : 'New lead', `<form class="form grid">
    ${field('name', 'Name', { required: true, value: l.name, span: 2 })}
    ${field('phone', 'Phone', { value: l.phone })}${field('email', 'Email', { type: 'email', value: l.email })}
    ${field('department', 'Interested in', { options: [['coworking', 'Coworking'], ['marketing', 'Digital marketing'], ['software', 'Website / software']], value: l.department })}
    ${field('interested_plan_id', 'Plan', { options: [['', '—'], ...pl.map((p) => [p.id, p.name])], value: l.interested_plan_id })}
    ${field('service_interest', 'Service details', { value: l.service_interest, placeholder: 'e.g. SEO for clinic, e-commerce site' })}
    ${field('source', 'Source', { options: SOURCES, value: l.source })}
    ${field('status', 'Stage', { options: STAGES, value: l.status || 'new' })}
    ${field('next_follow_up', 'Next follow-up', { type: 'date', value: l.next_follow_up })}
    ${field('notes', 'Notes', { type: 'textarea', value: l.notes, span: 2 })}
    <div class="span-2 form-actions">${l.id && l.department === 'coworking' && !l.converted_member_id ? '<button type="button" class="btn" id="convert">Convert to member</button>' : ''}<button class="btn primary" type="submit">Save</button></div>
  </form>`, { wide: true });
  const f = md.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    guard(e.submitter, async () => {
      const d = formData(f);
      l.id ? await db.update('leads', { id: l.id }, d) : await db.insert('leads', d);
      closeModal(); toast('Lead saved'); onDone();
    }).catch(() => {});
  };
  const cv = md.querySelector('#convert');
  if (cv) cv.onclick = () => openMemberForm({ full_name: l.name, phone: l.phone, email: l.email, lead_source: l.source, notes: l.notes }, async (m) => {
    await db.update('leads', { id: l.id }, { status: 'won', converted_member_id: m.id });
    location.hash = `#/members/${m.id}`;
  });
}

export default async function leads({ view, setTitle, actions, rerender }) {
  setTitle('Leads');
  actions('<button class="btn primary" id="new-lead">+ New lead</button>');
  const rows = await db.select('leads', { select: '*', order: 'created_at.desc', limit: 300 });
  const t = today();
  view.innerHTML = `
  <p class="muted small">Enquiries from the website form land here automatically. Open a card to update its stage.</p>
  <div class="kanban">${STAGES.map(([k, label]) => {
    const items = rows.filter((r) => r.status === k);
    return `<div class="col"><div class="col-head"><strong>${label}</strong><span>${items.length}</span></div>
      ${items.map((r) => `<div class="kcard" data-id="${r.id}">
        <strong>${esc(r.name)}</strong>
        <span class="muted small">${esc(r.department)}${r.source ? ' · ' + esc(r.source) : ''}</span>
        ${r.next_follow_up ? `<span class="small ${r.next_follow_up <= t ? 'due' : 'muted'}">Follow up ${fmtDate(r.next_follow_up)}</span>` : ''}
        ${r.phone ? `<a class="chip wa" target="_blank" rel="noopener" href="${waLink(r.phone, `Assalam-o-Alaikum ${r.name}, this is CoLab Point.`)}">WhatsApp</a>` : ''}
      </div>`).join('') || '<div class="muted small pad">—</div>'}
    </div>`;
  }).join('')}</div>`;
  $('#new-lead').onclick = () => leadForm({}, rerender);
  view.onclick = (e) => {
    if (e.target.closest('a')) return;
    const c = e.target.closest('.kcard'); if (!c) return;
    leadForm(rows.find((r) => r.id === c.dataset.id), rerender);
  };
}
