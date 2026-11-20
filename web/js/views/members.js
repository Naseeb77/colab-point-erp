import { db, storage } from '../api.js';
import { $, esc, money, num, fmtDate, fmtDateTime, fmtTime, dur, today, table, empty, toast, guard, modal, closeModal, field, formData, badge, waLink } from '../ui.js';
import { plans, seats, lockers, shifts, can } from '../state.js';
import { searchFilter } from './checkin.js';
import { recordPayment, reminderText } from './billing.js';

const STATUSES = ['active', 'lead', 'paused', 'expired', 'blocked', 'left'];
const TYPES = [['individual', 'Individual'], ['student', 'Student'], ['team', 'Team'], ['corporate', 'Corporate'], ['staff', 'Staff']];
const SOURCES = ['', 'walk-in', 'website', 'facebook', 'instagram', 'linkedin', 'youtube', 'google', 'referral', 'other'];

function memberForm(m = {}) {
  return `<form class="form grid" id="member-form">
    <h4 class="span-2">Basic details</h4>
    ${field('full_name', 'Full name', { required: true, value: m.full_name, span: 2 })}
    ${field('phone', 'Phone', { required: true, value: m.phone, placeholder: '03xx xxxxxxx' })}
    ${field('whatsapp', 'WhatsApp (if different)', { value: m.whatsapp })}
    ${field('email', 'Email', { type: 'email', value: m.email })}
    ${field('cnic', 'CNIC', { value: m.cnic, placeholder: '35201-xxxxxxx-x' })}
    ${field('profession', 'Profession', { value: m.profession, placeholder: 'Freelancer, developer, designer…' })}
    ${field('company', 'Company', { value: m.company })}
    ${field('member_type', 'Member type', { options: TYPES, value: m.member_type || 'individual' })}
    ${field('status', 'Status', { options: STATUSES, value: m.status || 'active' })}
    ${field('lead_source', 'How did they find us?', { options: SOURCES, value: m.lead_source })}
    ${field('date_of_birth', 'Date of birth', { type: 'date', value: m.date_of_birth })}
    ${field('security_deposit', 'Security deposit (Rs)', { type: 'number', value: m.security_deposit ?? 0 })}
    ${field('deposit_returned', 'Deposit returned', { type: 'checkbox', value: m.deposit_returned })}
    ${field('address', 'Address', { value: m.address, span: 2 })}
    <h4 class="span-2">Emergency contact</h4>
    ${field('emergency_contact_name', 'Name', { value: m.emergency_contact_name })}
    ${field('emergency_contact_phone', 'Phone', { value: m.emergency_contact_phone })}
    <h4 class="span-2">Attendance identifiers</h4>
    ${field('fingerprint_user_id', 'Fingerprint device user ID', { value: m.fingerprint_user_id })}
    ${field('rfid_card', 'RFID card no.', { value: m.rfid_card })}
    ${field('tracking_consent', 'Member agreed to fingerprint / camera / WiFi attendance tracking', { type: 'checkbox', value: m.tracking_consent, span: 2 })}
    ${field('notes', 'Notes', { type: 'textarea', value: m.notes, span: 2 })}
    <div class="span-2 form-actions"><button class="btn primary" type="submit">${m.id ? 'Save changes' : 'Add member'}</button></div>
  </form>`;
}

export function openMemberForm(m = {}, onSaved) {
  const md = modal(m.id ? 'Edit member' : 'New member', memberForm(m), { wide: true });
  md.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (f.tracking_consent && !m.tracking_consent) f.tracking_consent_at = new Date().toISOString();
    f.security_deposit = Number(f.security_deposit || 0);
    guard(e.submitter, async () => {
      const [row] = m.id ? await db.update('members', { id: m.id }, f) : await db.insert('members', f);
      closeModal(); toast(m.id ? 'Saved' : 'Member added');
      onSaved?.(row);
    }).catch(() => {});
  };
}

export default async function members({ view, setTitle, actions }) {
  setTitle('Members', 'Everyone who works from CoLab Point');
  actions('<a class="btn" href="#/scan">Scan form</a><a class="btn" href="#/registrations">Sign-ups</a><button class="btn dark" id="new-member">+ New member</button>');
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  view.innerHTML = `
  <div class="toolbar">
    <input id="mq" class="search" placeholder="Search name, phone, CNIC, email or #">
    <select id="mstatus"><option value="">All statuses</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
  </div>
  <div class="card flush" id="list"></div>`;
  view.style.gap = '16px';

  async function load() {
    const q = $('#mq').value.trim();
    const st = $('#mstatus').value;
    const rows = await db.select('members', {
      select: 'id,member_no,full_name,phone,profession,status,joined_at,memberships(end_date,status,plans(name))',
      or: q.length >= 2 ? searchFilter(q) : undefined,
      status: st ? `eq.${st}` : undefined,
      order: 'created_at.desc', limit: 200,
    });
    $('#list').innerHTML = rows.length ? table([
      { label: '#', render: (r) => `<span class="muted">${r.member_no}</span>` },
      { label: 'Name', render: (r) => `<strong>${esc(r.full_name)}</strong><br><span class="muted small">${esc(r.profession || '')}</span>` },
      { label: 'Phone', key: 'phone' },
      { label: 'Plan', render: (r) => {
        const cur = (r.memberships || []).filter((x) => x.status === 'active').sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
        return cur ? `${esc(cur.plans?.name)}<br><span class="muted small">until ${fmtDate(cur.end_date)}</span>` : '<span class="muted">—</span>';
      } },
      { label: 'Status', render: (r) => badge(r.status) },
    ], rows, { rowAttr: (r) => `class="clickable" data-id="${r.id}"` }) : empty('No members yet.', '<button class="btn primary" data-new>Add your first member</button>');
  }

  let t;
  $('#mq').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $('#mstatus').onchange = load;
  $('#list').onclick = (e) => {
    if (e.target.closest('[data-new]')) return openMemberForm({}, (r) => location.hash = `#/members/${r.id}`);
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = `#/members/${tr.dataset.id}`;
  };
  $('#new-member').onclick = () => openMemberForm({ full_name: params.get('new') && !/^\d/.test(params.get('new')) ? params.get('new') : '' }, (r) => location.hash = `#/members/${r.id}`);
  if (params.get('new') !== null) $('#new-member').click();
  await load();
}

function assignPlan(member, onDone) {
  Promise.all([plans(), seats(), lockers(), shifts()]).then(([pl, st, lk, sh]) => {
    const active = pl.filter((p) => p.active);
    const md = modal('Assign plan', `<form class="form grid">
      ${field('p_plan', 'Plan', { required: true, options: active.map((p) => [p.id, `${p.name} — ${p.price ? money(p.price) : 'custom'} / ${p.billing_period}`]), span: 2 })}
      ${field('p_start', 'Start date', { type: 'date', value: today(), required: true })}
      ${field('p_end', 'End date (auto if empty)', { type: 'date' })}
      ${field('p_price', 'Price (Rs)', { type: 'number', value: active[0]?.price ?? '' })}
      ${field('p_discount', 'Discount (Rs)', { type: 'number', value: 0 })}
      ${field('p_seat', 'Seat', { options: [['', '— none —'], ...st.filter((s) => s.status === 'available' && s.seat_type !== 'conference_room' && s.seat_type !== 'meeting_room').map((s) => [s.id, `${s.code} (${s.seat_type.replace('_', ' ')})`])] })}
      ${field('p_locker', 'Locker', { options: [['', '— none —'], ...lk.filter((l) => l.status === 'free').map((l) => [l.id, l.code])] })}
      ${sh.length ? field('p_shift', 'Shift', { options: [['', '— any —'], ...sh.map((s) => [s.id, `${s.name} (${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)})`])] }) : ''}
      ${field('p_due', 'Payment due date', { type: 'date', value: today() })}
      <div class="span-2 total-line" id="total"></div>
      ${field('p_notes', 'Notes', { span: 2 })}
      <div class="span-2 form-actions"><button class="btn primary" type="submit">Create membership & invoice</button></div>
    </form>`, { wide: true });
    const f = md.querySelector('form');
    const upd = () => { $('#total', md).innerHTML = `Invoice total: <strong>${money((Number(f.p_price.value) || 0) - (Number(f.p_discount.value) || 0))}</strong>`; };
    f.p_plan.onchange = () => { const p = active.find((x) => x.id === f.p_plan.value); f.p_price.value = p?.price ?? ''; upd(); };
    f.p_price.oninput = f.p_discount.oninput = upd; upd();
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = formData(f);
      d.p_member = member.id;
      d.p_price = d.p_price ? Number(d.p_price) : null;
      d.p_discount = Number(d.p_discount || 0);
      guard(e.submitter, async () => {
        await db.rpc('create_membership', d);
        closeModal(); toast('Membership created & invoice issued'); onDone();
      }).catch(() => {});
    };
  });
}

export async function memberDetail(ctx, id) {
  const { view, setTitle, actions, rerender } = ctx;
  const [m, ms, sessions, invoices, usage, scans] = await Promise.all([
    db.one('members', { select: '*', id: `eq.${id}` }),
    db.select('memberships', { select: '*,plans(name,daily_hour_limit,print_pages),seats(code),lockers(code),shifts(name)', member_id: `eq.${id}`, order: 'start_date.desc' }),
    db.select('attendance_sessions', { select: '*', member_id: `eq.${id}`, order: 'check_in.desc', limit: 30 }),
    can.finance() ? db.select('invoices', { select: '*', member_id: `eq.${id}`, order: 'issue_date.desc' }) : Promise.resolve([]),
    db.select('v_member_monthly_usage', { select: '*', member_id: `eq.${id}`, order: 'month.desc', limit: 6 }),
    db.select('form_scans', { select: 'id,image_path,created_at', member_id: `eq.${id}`, order: 'created_at.desc' }),
  ]);
  if (!m) { view.innerHTML = empty('Member not found.'); return; }
  setTitle(m.full_name);
  actions(`<a class="btn ghost" href="#/members">← Members</a><button class="btn" id="edit">Edit</button>${can.finance() ? '<button class="btn" id="take-pay">Record payment</button><button class="btn dark" id="assign">Assign plan</button>' : ''}`);

  const cur = ms.find((x) => x.status === 'active');
  const thisMonth = usage[0];
  const balance = invoices.filter((i) => ['unpaid', 'partial', 'overdue'].includes(i.status)).reduce((a, i) => a + (i.total - i.amount_paid), 0);
  const wa = m.whatsapp || m.phone;

  view.innerHTML = `
  <div class="profile-head card">
    <div class="avatar xl">${esc(m.full_name[0])}</div>
    <div class="grow">
      <h2>${esc(m.full_name)} <span class="muted">#${m.member_no}</span> ${badge(m.status)}</h2>
      <p class="muted">${esc([m.profession, m.company].filter(Boolean).join(' · ') || '—')}</p>
      <div class="chips">
        <a class="chip" href="tel:${esc(m.phone)}">☎ ${esc(m.phone)}</a>
        <a class="chip wa" target="_blank" rel="noopener" href="${waLink(wa, `Assalam-o-Alaikum ${m.full_name},`)}">WhatsApp</a>
        ${m.email ? `<a class="chip" href="mailto:${esc(m.email)}">✉ ${esc(m.email)}</a>` : ''}
        ${m.tracking_consent ? '<span class="chip ok">Tracking consent ✓</span>' : '<span class="chip">No tracking consent</span>'}
      </div>
    </div>
  </div>

  <div class="stats">
    <div class="stat accent"><small>Current plan</small><strong>${esc(cur?.plans?.name || 'None')}</strong><span>${cur ? `until ${fmtDate(cur.end_date)}` : 'Assign a plan'}</span></div>
    <div class="stat"><small>Hours this month</small><strong>${num(thisMonth?.total_hours ?? 0)}</strong><span>${thisMonth?.days_visited ?? 0} days visited</span></div>
    <div class="stat ${thisMonth?.days_over_limit ? 'warn' : ''}"><small>Over daily limit</small><strong>${thisMonth?.days_over_limit ?? 0}</strong><span>days this month${cur?.plans?.daily_hour_limit ? ` (limit ${num(cur.plans.daily_hour_limit)}h)` : ''}</span></div>
    ${can.finance() ? `<div class="stat ${balance ? 'danger' : ''}"><small>Balance due</small><strong>${money(balance)}</strong><span>${invoices.length} invoices</span></div>` : ''}
  </div>

  <div class="grid-2">
    <div class="card"><div class="card-head"><h2>Memberships</h2></div>
      ${ms.length ? table([
        { label: 'Plan', render: (r) => `${esc(r.plans?.name)}${r.shifts ? ` <span class="chip">${esc(r.shifts.name)}</span>` : ''}${r.seats ? `<br><span class="muted small">Seat ${esc(r.seats.code)}${r.lockers ? ` · Locker ${esc(r.lockers.code)}` : ''}</span>` : ''}` },
        { label: 'Period', render: (r) => `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}` },
        { label: 'Price', cls: 'num', render: (r) => `${money(r.final_price)}${Number(r.discount_amount) ? `<br><span class="muted small">−${money(r.discount_amount)}</span>` : ''}` },
        { label: '', render: (r) => badge(r.status) },
      ], ms) : empty('No plan assigned yet.')}
    </div>
    ${can.finance() ? `<div class="card"><div class="card-head"><h2>Invoices</h2></div>
      ${invoices.length ? table([
        { label: 'Invoice', render: (r) => `${esc(r.invoice_no)}<br><span class="muted small">due ${fmtDate(r.due_date)}</span>` },
        { label: 'Total', cls: 'num', render: (r) => money(r.total) },
        { label: 'Paid', cls: 'num', render: (r) => money(r.amount_paid) },
        { label: '', render: (r) => badge(r.status) },
        { label: '', cls: 'right', render: (r) => ['unpaid', 'partial', 'overdue'].includes(r.status)
          ? `<button class="btn sm primary" data-pay="${r.id}">Pay</button> <a class="btn sm" target="_blank" rel="noopener" data-remind="${r.id}" href="#">Remind</a>` : '' },
      ], invoices) : empty('No invoices.')}
    </div>` : ''}
  </div>

  <div class="card"><div class="card-head"><h2>Attendance</h2><span class="muted small">last 30 visits</span></div>
    ${sessions.length ? table([
      { label: 'Date', render: (r) => fmtDate(r.check_in) },
      { label: 'In', render: (r) => `${fmtTime(r.check_in)} <span class="chip">${esc(r.check_in_source)}</span>` },
      { label: 'Out', render: (r) => r.check_out ? `${fmtTime(r.check_out)} <span class="chip">${esc(r.check_out_source || '')}</span>` : '<span class="badge blue">inside</span>' },
      { label: 'Duration', render: (r) => dur(r.duration_minutes) },
      { label: '', render: (r) => `${r.verified ? '<span class="chip ok" title="Confirmed by 2 sources">✓ verified</span>' : ''}${r.flagged ? ` <span class="badge red" title="${esc(r.flag_reason || '')}">flag</span>` : ''}` },
    ], sessions) : empty('No visits recorded yet.')}
  </div>

  <div class="card"><div class="card-head"><h2>Details</h2></div>
    <dl class="details">
      <dt>CNIC</dt><dd>${esc(m.cnic || '—')}</dd>
      <dt>Member type</dt><dd>${esc(m.member_type)}</dd>
      <dt>Joined</dt><dd>${fmtDate(m.joined_at)}</dd>
      <dt>Source</dt><dd>${esc(m.lead_source || '—')}</dd>
      <dt>Emergency</dt><dd>${esc([m.emergency_contact_name, m.emergency_contact_phone].filter(Boolean).join(' · ') || '—')}</dd>
      <dt>Fingerprint ID</dt><dd>${esc(m.fingerprint_user_id || '—')}</dd>
      <dt>Address</dt><dd>${esc(m.address || '—')}</dd>
      <dt>Security deposit</dt><dd>${money(m.security_deposit)}${Number(m.security_deposit) ? (m.deposit_returned ? ' · returned' : ' · held') : ''}</dd>
      <dt>Notes</dt><dd>${esc(m.notes || '—')}</dd>
      ${scans.length ? `<dt>Paper form</dt><dd>${scans.map((s) => `<button class="btn xs" data-scan="${esc(s.image_path)}">View scan · ${fmtDate(s.created_at)}</button>`).join(' ')}</dd>` : ''}
    </dl>
  </div>`;

  $('#edit').onclick = () => openMemberForm(m, rerender);
  $('#assign') && ($('#assign').onclick = () => assignPlan(m, rerender));
  $('#take-pay') && ($('#take-pay').onclick = () => import('./payments.js').then((x) => x.recordPaymentPicker(rerender, m)));
  view.onclick = async (e) => {
    const sc = e.target.closest('[data-scan]');
    if (sc) return guard(sc, async () => window.open(await storage.signedUrl('form-scans', sc.dataset.scan), '_blank', 'noopener'));
    const pay = e.target.closest('[data-pay]');
    if (pay) return recordPayment(invoices.find((i) => i.id === pay.dataset.pay), rerender);
    const rem = e.target.closest('[data-remind]');
    if (rem) {
      e.preventDefault();
      const inv = invoices.find((i) => i.id === rem.dataset.remind);
      window.open(waLink(wa, await reminderText(m.full_name, inv)), '_blank', 'noopener');
    }
  };
}
