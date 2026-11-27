import { db } from '../api.js';
import { $, esc, money, num, table, empty, toast, guard, modal, closeModal, field, formData, badge } from '../ui.js';
import { state, bust } from '../state.js';

const TABS = [['plans', 'Plans'], ['discounts', 'Discounts'], ['space', 'Seats & lockers'], ['shifts', 'Shifts'], ['staff', 'Staff'], ['general', 'General']];
const PERIODS = ['hour', 'day', 'week', 'month', 'quarter', 'half_year', 'year', 'custom'];
const PLAN_TYPES = ['shared', 'dedicated_desk', 'private_office', 'day_pass', 'hourly', 'virtual_office'];
const SEAT_TYPES = ['shared', 'dedicated_desk', 'private_office', 'meeting_room', 'conference_room'];
const ROLES = ['owner', 'admin', 'manager', 'receptionist', 'accountant', 'marketing', 'developer', 'member'];

const n = (v) => (v === null || v === '' ? null : Number(v));

function planForm(p = {}, done) {
  const md = modal(p.id ? 'Edit plan' : 'New plan', `<form class="form grid">
    ${field('name', 'Name', { required: true, value: p.name, span: 2 })}
    ${field('seat_type', 'Type', { options: PLAN_TYPES, value: p.seat_type })}
    ${field('billing_period', 'Billing period', { options: PERIODS, value: p.billing_period || 'month' })}
    ${field('price', 'Price (Rs) — empty = custom quote', { type: 'number', value: p.price })}
    ${field('overtime_hourly_rate', 'Extra hour rate (Rs)', { type: 'number', value: p.overtime_hourly_rate })}
    ${field('daily_hour_limit', 'Hours allowed per day', { type: 'number', step: '0.5', value: p.daily_hour_limit })}
    ${field('monthly_hour_limit', 'Hours allowed per month', { type: 'number', value: p.monthly_hour_limit })}
    ${field('meeting_room_hours', 'Free meeting-room hours', { type: 'number', value: p.meeting_room_hours ?? 0 })}
    ${field('print_pages', 'Free printed pages', { type: 'number', value: p.print_pages ?? 0 })}
    ${field('features', 'Features (one per line)', { type: 'textarea', value: (p.features || []).join('\n'), span: 2 })}
    ${field('includes_locker', 'Includes locker', { type: 'checkbox', value: p.includes_locker })}
    ${field('is_public', 'Show on website', { type: 'checkbox', value: p.is_public ?? true })}
    ${field('active', 'Active', { type: 'checkbox', value: p.active ?? true })}
    ${field('sort_order', 'Order', { type: 'number', value: p.sort_order ?? 0 })}
    <div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form>`, { wide: true });
  md.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const f = formData(e.target);
    for (const k of ['price', 'overtime_hourly_rate', 'daily_hour_limit', 'monthly_hour_limit', 'meeting_room_hours', 'print_pages', 'sort_order']) f[k] = n(f[k]);
    f.meeting_room_hours ??= 0; f.print_pages ??= 0; f.sort_order ??= 0;
    f.features = (f.features || '').split('\n').map((s) => s.trim()).filter(Boolean);
    guard(e.submitter, async () => {
      p.id ? await db.update('plans', { id: p.id }, f) : await db.insert('plans', f);
      bust('plans'); closeModal(); toast('Plan saved'); done();
    }).catch(() => {});
  };
}

export default async function settings({ view, setTitle }) {
  setTitle('Settings', 'Plans, seats, shifts, team access and business details');
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('t') || 'plans';
  const reload = () => { location.hash = `#/settings?t=${tab}&r=${Date.now()}`; };
  view.innerHTML = `<div class="tabs">${TABS.map(([k, l]) => `<a href="#/settings?t=${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div><div id="tab"></div>`;
  const el = $('#tab');

  if (tab === 'plans') {
    const rows = await db.select('plans', { select: '*', order: 'sort_order.asc' });
    el.innerHTML = `<div class="card flush"><div class="card-head pad"><h2>Membership plans</h2><button class="btn dark sm" id="add">+ Plan</button></div>
    ${table([
      { label: 'Plan', render: (r) => `<strong>${esc(r.name)}</strong><br><span class="muted small">${esc(r.seat_type.replace(/_/g, ' '))}</span>` },
      { label: 'Price', cls: 'num', render: (r) => `${r.price ? money(r.price) : 'custom'}<br><span class="muted small">/ ${esc(r.billing_period)}</span>` },
      { label: 'Limits', render: (r) => [r.daily_hour_limit && `${num(r.daily_hour_limit)}h/day`, r.print_pages && `${r.print_pages} pages`, r.meeting_room_hours && `${r.meeting_room_hours}h room`, r.includes_locker && 'locker'].filter(Boolean).join(' · ') || '—' },
      { label: '', render: (r) => `${r.active ? '' : badge('inactive')} ${r.is_public ? '<span class="chip">on website</span>' : ''}` },
    ], rows, { rowAttr: (r) => `class="clickable" data-id="${r.id}"` })}</div>`;
    $('#add').onclick = () => planForm({}, reload);
    el.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) planForm(rows.find((r) => r.id === tr.dataset.id), reload); };
  }

  if (tab === 'discounts') {
    const [rows, pl] = await Promise.all([db.select('discounts', { select: '*,plans(name)', order: 'name.asc' }), db.select('plans', { select: 'id,name' })]);
    el.innerHTML = `<div class="card flush"><div class="card-head pad"><h2>Discounts & coupons</h2><button class="btn dark sm" id="add">+ Discount</button></div>
      ${rows.length ? table([
        { label: 'Name', render: (r) => `<strong>${esc(r.name)}</strong>${r.code ? ` <span class="chip">${esc(r.code)}</span>` : ''}` },
        { label: 'Value', render: (r) => r.kind === 'percent' ? `${num(r.value)}%` : money(r.value) },
        { label: 'Plan', render: (r) => esc(r.plans?.name || 'any') },
        { label: 'Used', cls: 'num', render: (r) => `${r.used_count}${r.max_uses ? ` / ${r.max_uses}` : ''}` },
        { label: '', render: (r) => r.active ? badge('active') : badge('inactive') },
      ], rows) : empty('No discounts yet — e.g. "Student 15%" or "3-month advance Rs 3,000 off".')}</div>`;
    $('#add').onclick = () => {
      const md = modal('New discount', `<form class="form grid">
        ${field('name', 'Name', { required: true, placeholder: 'Student discount' })}${field('code', 'Coupon code (optional)')}
        ${field('kind', 'Type', { options: [['percent', 'Percent %'], ['fixed', 'Fixed Rs']] })}${field('value', 'Value', { type: 'number', required: true })}
        ${field('applies_to_plan', 'Only for plan', { options: [['', 'Any plan'], ...pl.map((p) => [p.id, p.name])] })}${field('min_months', 'Min. months paid in advance', { type: 'number' })}
        ${field('valid_from', 'Valid from', { type: 'date' })}${field('valid_to', 'Valid to', { type: 'date' })}
        ${field('max_uses', 'Max uses', { type: 'number' })}
        <div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form>`);
      md.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const f = formData(e.target); f.value = n(f.value); f.min_months = n(f.min_months); f.max_uses = n(f.max_uses);
        guard(e.submitter, async () => { await db.insert('discounts', f); closeModal(); reload(); }).catch(() => {});
      };
    };
  }

  if (tab === 'space') {
    const [st, lk] = await Promise.all([db.select('seats', { select: '*', order: 'code.asc' }), db.select('lockers', { select: '*', order: 'code.asc' })]);
    const counts = SEAT_TYPES.map((t) => [t, st.filter((s) => s.seat_type === t).reduce((a, s) => a + s.capacity, 0)]).filter((x) => x[1]);
    el.innerHTML = `
    <div class="card"><div class="card-head"><h2>Seats & rooms</h2><button class="btn dark sm" id="bulk">+ Add seats</button></div>
      <p class="muted small">${counts.map(([t, c]) => `${esc(t.replace(/_/g, ' '))}: <strong>${c}</strong>`).join(' · ') || 'No seats yet.'}</p>
      <div class="seat-grid">${st.map((s) => `<button class="seat ${s.status}" data-seat="${s.id}" title="${esc(s.seat_type)} · ${esc(s.status)}"><strong>${esc(s.code)}</strong><small>${esc(s.seat_type.replace(/_/g, ' '))}${s.capacity > 1 ? ` · ${s.capacity}` : ''}</small></button>`).join('')}</div>
    </div>
    <div class="card"><div class="card-head"><h2>Lockers</h2><button class="btn dark sm" id="bulk-l">+ Add lockers</button></div>
      <div class="seat-grid">${lk.map((l) => `<span class="seat ${l.status === 'assigned' ? 'occupied' : l.status === 'free' ? 'available' : 'maintenance'}"><strong>${esc(l.code)}</strong><small>${esc(l.status)}</small></span>`).join('') || '<p class="muted">No lockers yet.</p>'}</div>
    </div>`;
    $('#bulk').onclick = () => {
      const md = modal('Add seats', `<form class="form grid">
        ${field('seat_type', 'Type', { options: SEAT_TYPES })}${field('prefix', 'Code prefix', { value: 'D-', required: true })}
        ${field('from', 'Start number', { type: 'number', value: st.length + 1, required: true })}${field('count', 'How many', { type: 'number', value: 10, required: true })}
        ${field('capacity', 'People per seat/room', { type: 'number', value: 1 })}${field('hourly_rate', 'Hourly rate (rooms)', { type: 'number' })}
        <div class="span-2 form-actions"><button class="btn dark" type="submit">Create</button></div></form>`);
      md.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const f = formData(e.target);
        const rows = Array.from({ length: Number(f.count) }, (_, i) => ({ code: `${f.prefix}${String(Number(f.from) + i).padStart(2, '0')}`, seat_type: f.seat_type, capacity: Number(f.capacity || 1), hourly_rate: n(f.hourly_rate) }));
        guard(e.submitter, async () => { await db.insert('seats', rows); bust('seats'); closeModal(); toast(`${rows.length} added`); reload(); }).catch(() => {});
      };
    };
    $('#bulk-l').onclick = () => {
      const md = modal('Add lockers', `<form class="form grid">
        ${field('prefix', 'Code prefix', { value: 'L-', required: true })}${field('count', 'How many', { type: 'number', value: 10, required: true })}
        <div class="span-2 form-actions"><button class="btn dark" type="submit">Create</button></div></form>`);
      md.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const f = formData(e.target);
        const rows = Array.from({ length: Number(f.count) }, (_, i) => ({ code: `${f.prefix}${String(lk.length + i + 1).padStart(2, '0')}` }));
        guard(e.submitter, async () => { await db.insert('lockers', rows); bust('lockers'); closeModal(); reload(); }).catch(() => {});
      };
    };
    el.onclick = (e) => {
      const b = e.target.closest('[data-seat]'); if (!b) return;
      const s = st.find((x) => x.id === b.dataset.seat);
      const md = modal(`Seat ${s.code}`, `<form class="form grid">
        ${field('code', 'Code', { value: s.code, required: true })}${field('seat_type', 'Type', { options: SEAT_TYPES, value: s.seat_type })}
        ${field('status', 'Status', { options: ['available', 'occupied', 'reserved', 'maintenance', 'inactive'], value: s.status })}${field('capacity', 'Capacity', { type: 'number', value: s.capacity })}
        ${field('hourly_rate', 'Hourly rate', { type: 'number', value: s.hourly_rate })}${field('notes', 'Notes', { value: s.notes })}
        <div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form>`);
      md.querySelector('form').onsubmit = (ev) => {
        ev.preventDefault();
        const f = formData(ev.target); f.capacity = Number(f.capacity || 1); f.hourly_rate = n(f.hourly_rate);
        guard(ev.submitter, async () => { await db.update('seats', { id: s.id }, f); bust('seats'); closeModal(); reload(); }).catch(() => {});
      };
    };
  }

  if (tab === 'shifts') {
    const rows = await db.select('shifts', { select: '*', order: 'start_time.asc' });
    el.innerHTML = `<div class="card flush"><div class="card-head pad"><h2>Shifts</h2><button class="btn dark sm" id="add">+ Shift</button></div>
      ${rows.length ? table([{ label: 'Name', key: 'name' }, { label: 'Type', render: (r) => badge(r.kind === 'day' ? 'upcoming' : r.kind === 'night' ? 'inactive' : 'active', r.kind) }, { label: 'From', render: (r) => r.start_time.slice(0, 5) }, { label: 'To', render: (r) => r.end_time.slice(0, 5) }], rows) : empty('Add your Day and Night shifts — seats are shown free / taken per shift.')}</div>`;
    $('#add').onclick = () => {
      const md = modal('New shift', `<form class="form grid">${field('name', 'Name', { required: true, placeholder: 'Day / Night' })}${field('kind', 'Type', { options: [['day', 'Day'], ['night', 'Night'], ['full', 'Full day (both)']] })}
        ${field('start_time', 'Starts', { type: 'time', required: true })}${field('end_time', 'Ends', { type: 'time', required: true })}
        <div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form>`);
      md.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        guard(e.submitter, async () => { await db.insert('shifts', formData(e.target)); bust('shifts'); closeModal(); reload(); }).catch(() => {});
      };
    };
  }

  if (tab === 'staff') {
    const rows = await db.select('profiles', { select: '*', order: 'created_at.asc' });
    el.innerHTML = `<div class="card flush"><div class="card-head pad"><h2>Team & access</h2></div>
      <p class="muted small pad">Ask each staff member to create an account on this app, then set their role here. New accounts start as <em>member</em> (no admin access).</p>
      ${table([
        { label: 'Name', render: (r) => `<strong>${esc(r.full_name || '—')}</strong>${r.id === state.profile.id ? ' <span class="chip">you</span>' : ''}` },
        { label: 'Role', render: (r) => r.id === state.profile.id ? esc(r.role) : `<select data-role="${r.id}">${ROLES.map((x) => `<option ${x === r.role ? 'selected' : ''}>${x}</option>`).join('')}</select>` },
        { label: 'Department', render: (r) => `<select data-dept="${r.id}"><option value="">—</option>${['coworking', 'marketing', 'software', 'management'].map((x) => `<option ${x === r.department ? 'selected' : ''}>${x}</option>`).join('')}</select>` },
        { label: 'Active', render: (r) => r.id === state.profile.id ? '✓' : `<input type="checkbox" data-active="${r.id}" ${r.active ? 'checked' : ''}>` },
      ], rows)}</div>`;
    el.onchange = async (e) => {
      const t = e.target;
      const id = t.dataset.role || t.dataset.dept || t.dataset.active;
      if (!id) return;
      const patch = t.dataset.role ? { role: t.value } : t.dataset.dept ? { department: t.value || null } : { active: t.checked };
      try { await db.update('profiles', { id }, patch); toast('Updated'); } catch (err) { toast(err.message, 'err'); }
    };
  }

  if (tab === 'general') {
    const s = state.settings;
    el.innerHTML = `<div class="card"><form class="form grid" id="gen">
      ${field('name', 'Business name', { value: s.name, span: 2 })}
      ${field('phone', 'Phone', { value: s.phone })}${field('email', 'Email', { value: s.email })}
      ${field('address', 'Address', { value: s.address, span: 2 })}${field('website', 'Website', { value: s.website, span: 2 })}
      ${field('description', 'Short description (used on the website and for Google / AI search)', { type: 'textarea', value: s.description, span: 2 })}
      ${field('opening_hours', 'Opening hours', { value: s.opening_hours, placeholder: 'Mo-Su 09:00-23:59' })}${field('google_review_url', 'Google review link', { value: s.google_review_url, placeholder: 'https://g.page/r/…/review' })}
      ${field('google_maps_url', 'Google Maps link', { value: s.google_maps_url })}<span></span>
      ${field('latitude', 'Latitude', { value: s.latitude, placeholder: '32.57' })}${field('longitude', 'Longitude', { value: s.longitude, placeholder: '74.07' })}
      ${field('reminder_days_before', 'Remind days before due (comma separated)', { value: (s.reminder_days_before || []).join(',') })}
      ${field('reminder_days_after', 'Remind days after due', { value: (s.reminder_days_after || []).join(',') })}
      <div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form></div>`;
    $('#gen').onsubmit = (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const arr = (v) => String(v || '').split(',').map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
      f.reminder_days_before = arr(f.reminder_days_before); f.reminder_days_after = arr(f.reminder_days_after);
      f.latitude = f.latitude ? Number(f.latitude) : null; f.longitude = f.longitude ? Number(f.longitude) : null;
      guard(e.submitter, async () => { const [r] = await db.update('org_settings', { id: 1 }, f); state.settings = r; toast('Saved'); }).catch(() => {});
    };
  }
}
