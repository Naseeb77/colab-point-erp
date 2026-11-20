import { db } from '../api.js';
import { $, esc, fmtTime, dur, minsSince, table, empty, toast, guard, modal, closeModal, field, formData, badge } from '../ui.js';

export function searchFilter(q) {
  q = q.replace(/[(),*]/g, ' ').trim();
  const parts = [`full_name.ilike.*${q}*`, `phone.ilike.*${q}*`, `cnic.ilike.*${q}*`, `email.ilike.*${q}*`];
  if (/^\d+$/.test(q)) parts.push(`member_no.eq.${q}`);
  return `(${parts.join(',')})`;
}

export default async function checkin(ctx) {
  const { view, setTitle, actions } = ctx;
  setTitle('Check-in desk');
  actions('<button class="btn" id="add-visitor">+ Visitor</button>');

  view.innerHTML = `
  <div class="card search-card">
    <input id="q" class="search big" placeholder="Search name, phone, CNIC or member # …" autocomplete="off">
    <div id="results"></div>
  </div>
  <div class="grid-2">
    <div class="card"><div class="card-head"><h2>Inside now</h2><span id="inside-count" class="muted"></span></div><div id="inside"></div></div>
    <div class="card"><div class="card-head"><h2>Visitors today</h2></div><div id="visitors"></div></div>
  </div>`;

  let open = [];
  async function loadInside() {
    open = await db.select('attendance_sessions', {
      select: 'id,member_id,check_in,check_in_source,flagged,members(full_name,member_no,phone)',
      check_out: 'is.null', member_id: 'not.is.null', order: 'check_in.asc',
    });
    $('#inside-count').textContent = `${open.length} people`;
    $('#inside').innerHTML = open.length ? table([
      { label: 'Member', render: (r) => `<a href="#/members/${r.member_id}">${esc(r.members.full_name)}</a> <span class="muted">#${r.members.member_no}</span>` },
      { label: 'In', render: (r) => fmtTime(r.check_in) },
      { label: 'Time', render: (r) => dur(minsSince(r.check_in)) },
      { label: '', cls: 'right', render: (r) => `<button class="btn sm" data-out="${r.id}">Check out</button>` },
    ], open) : empty('Nobody inside yet.');
  }

  async function loadVisitors() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const v = await db.select('visitors', { select: '*,members(full_name)', check_in: `gte.${start.toISOString()}`, order: 'check_in.desc' });
    $('#visitors').innerHTML = v.length ? table([
      { label: 'Visitor', render: (r) => `${esc(r.name)}<br><span class="muted small">${esc(r.phone || '')}</span>` },
      { label: 'Meeting', render: (r) => esc(r.members?.full_name || r.purpose || '—') },
      { label: 'In', render: (r) => fmtTime(r.check_in) },
      { label: '', cls: 'right', render: (r) => r.check_out ? `<span class="muted">out ${fmtTime(r.check_out)}</span>` : `<button class="btn sm" data-vout="${r.id}">Out</button>` },
    ], v) : empty('No visitors today.');
  }

  let timer;
  $('#q').oninput = (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (q.length < 2) { $('#results').innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const rows = await db.select('members', { select: 'id,full_name,member_no,phone,status,profession', or: searchFilter(q), limit: 8, order: 'full_name.asc' });
      const openIds = new Set(open.map((o) => o.member_id));
      $('#results').innerHTML = rows.length ? `<div class="result-list">${rows.map((m) => `
        <div class="result">
          <div class="avatar">${esc(m.full_name[0])}</div>
          <div class="grow"><strong>${esc(m.full_name)}</strong> <span class="muted">#${m.member_no}</span> ${m.status !== 'active' ? badge(m.status) : ''}<br><span class="muted small">${esc(m.phone)} · ${esc(m.profession || '')}</span></div>
          ${openIds.has(m.id) ? `<button class="btn" data-out-member="${m.id}">Check out</button>` : `<button class="btn primary" data-in="${m.id}">Check in</button>`}
        </div>`).join('')}</div>` : `<p class="muted pad">No member found. <a href="#/members?new=${encodeURIComponent(q)}">Add new member</a></p>`;
    }, 250);
  };

  view.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.in) {
      await guard(b, async () => {
        const r = await db.rpc('record_access', { p_source: 'manual', p_identifier: b.dataset.in });
        if (!r.ok) throw new Error('Member not found');
        toast(r.action === 'check_in' ? 'Checked in ✓' : 'Already inside — updated');
        $('#q').value = ''; $('#results').innerHTML = '';
        await loadInside();
      });
    } else if (b.dataset.out || b.dataset.outMember) {
      const s = b.dataset.out ? open.find((o) => o.id === b.dataset.out) : open.find((o) => o.member_id === b.dataset.outMember);
      if (!s) return;
      await guard(b, async () => {
        await db.update('attendance_sessions', { id: s.id }, { check_out: new Date().toISOString(), check_out_source: 'manual' });
        toast(`${s.members.full_name} checked out · ${dur(minsSince(s.check_in))}`);
        $('#results').innerHTML = ''; $('#q').value = '';
        await loadInside();
      });
    } else if (b.dataset.vout) {
      await guard(b, async () => { await db.update('visitors', { id: b.dataset.vout }, { check_out: new Date().toISOString() }); await loadVisitors(); });
    }
  };

  $('#add-visitor').onclick = () => {
    const m = modal('Add visitor', `<form class="form grid">
      ${field('name', 'Visitor name', { required: true, span: 2 })}
      ${field('phone', 'Phone')}${field('cnic', 'CNIC')}
      ${field('purpose', 'Purpose / meeting with', { span: 2 })}
      <div class="span-2 form-actions"><button class="btn primary" type="submit">Save</button></div></form>`);
    m.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      guard(e.submitter, async () => { await db.insert('visitors', formData(e.target)); closeModal(); toast('Visitor added'); await loadVisitors(); }).catch(() => {});
    };
  };

  await Promise.all([loadInside(), loadVisitors()]);
  $('#q').focus();
}
