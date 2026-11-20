import { db } from '../api.js';
import { $, esc, money, fmtTime, today, addDays, empty, toast, guard, modal, closeModal, field, formData, badge } from '../ui.js';
import { searchFilter } from './checkin.js';

export default async function bookings({ view, setTitle, actions, rerender }) {
  const day = new URLSearchParams(location.hash.split('?')[1] || '').get('d') || today();
  setTitle('Meeting rooms', 'Bookings for conference and meeting rooms');
  actions('<button class="btn dark" id="add">+ New booking</button>');
  const [rooms, list] = await Promise.all([
    db.select('seats', { select: 'id,code,seat_type,capacity,hourly_rate', seat_type: 'in.(meeting_room,conference_room)', status: 'neq.inactive', order: 'code.asc' }),
    db.select('bookings', { select: '*,seats(code),members(full_name,phone)', and: `(starts_at.gte.${day}T00:00:00+05:00,starts_at.lte.${day}T23:59:59+05:00)`, order: 'starts_at.asc' }),
  ]);
  const hours = [...Array(16).keys()].map((h) => h + 8);
  view.innerHTML = `
  <div class="card" style="padding:12px 16px"><div class="row"><button class="btn sm" data-nav="-1">‹</button><input type="date" id="d" value="${day}" style="width:auto"><button class="btn sm" data-nav="1">›</button><button class="btn sm" data-nav="0">Today</button>
    <strong>${new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div></div>
  ${rooms.length ? `<div class="card flush"><div class="table-wrap"><table><thead><tr><th>Room</th>${hours.map((h) => `<th style="text-align:center;padding:9px 2px">${h % 24}</th>`).join('')}</tr></thead><tbody>
    ${rooms.map((r) => `<tr><td><strong>${esc(r.code)}</strong><div class="muted tiny">${r.capacity} ppl${r.hourly_rate ? ' · ' + money(r.hourly_rate) + '/h' : ''}</div></td>${hours.map((h) => {
      const b = list.find((x) => x.seat_id === r.id && x.status !== 'cancelled' && new Date(x.starts_at).getTime() < new Date(`${day}T${String(h % 24).padStart(2, '0')}:59:00+05:00`).getTime() && new Date(x.ends_at).getTime() > new Date(`${day}T${String(h % 24).padStart(2, '0')}:00:00+05:00`).getTime());
      return `<td style="padding:4px 2px"><div title="${b ? esc(b.title || b.members?.full_name || b.guest_name || '') : 'free'}" style="height:26px;border-radius:5px;background:${b ? 'var(--ink-2)' : 'var(--line-2)'}"></div></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div></div>` : `<div class="card">${empty('No meeting rooms yet. Add them in Settings → Seats & lockers (type: meeting room or conference room).')}</div>`}
  <div class="card flush"><div class="card-head"><h2>Bookings</h2></div>
    <div class="list">${list.map((b) => `<div class="li"><span class="avatar sm dark">${esc(b.seats?.code?.slice(0, 2) || 'R')}</span><div class="grow"><strong>${esc(b.title || b.members?.full_name || b.guest_name || 'Booking')}</strong>
      <div class="meta">${esc(b.seats?.code)} · ${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)} · ${b.attendees || 1} people${Number(b.charge) ? ' · ' + money(b.charge) : b.uses_included_hours ? ' · included hours' : ''}</div></div>${badge(b.status)}
      ${b.status !== 'cancelled' ? `<button class="btn xs" data-cancel="${b.id}">Cancel</button>` : ''}</div>`).join('') || empty('No bookings on this day.')}</div></div>`;
  const go = (d) => { location.hash = `#/bookings?d=${d}`; };
  $('#d').onchange = (e) => go(e.target.value);
  view.onclick = async (e) => {
    const n = e.target.closest('[data-nav]'); if (n) return go(n.dataset.nav === '0' ? today() : addDays(day, Number(n.dataset.nav)));
    const c = e.target.closest('[data-cancel]');
    if (c && confirm('Cancel this booking?')) { await guard(c, () => db.update('bookings', { id: c.dataset.cancel }, { status: 'cancelled' })); rerender(); }
  };
  $('#add').onclick = () => {
    if (!rooms.length) return toast('Add a meeting room first (Settings → Seats & lockers)', 'err');
    const md = modal('New booking', `<form class="form grid">
      ${field('seat_id', 'Room', { options: rooms.map((r) => [r.id, `${r.code} (${r.capacity} ppl)`]), required: true })}${field('date', 'Date', { type: 'date', value: day, required: true })}
      ${field('from', 'From', { type: 'time', value: '10:00', required: true })}${field('to', 'To', { type: 'time', value: '11:00', required: true })}
      <label class="fld"><span>Member (optional)</span><input name="mq" placeholder="Search member" autocomplete="off"><div class="pick" id="bk-pick"></div></label>
      ${field('guest_name', 'Or guest name')}
      ${field('title', 'Purpose', { placeholder: 'Client meeting, interview…' })}${field('attendees', 'People', { type: 'number', value: 2 })}
      ${field('charge', 'Charge (Rs)', { type: 'number', value: 0 })}${field('uses_included_hours', 'Use the member’s free room hours', { type: 'checkbox' })}
      <div class="span-2 form-actions"><button class="btn dark" type="submit">Book</button></div></form>`, { wide: true });
    const f = md.querySelector('form'); let member = null, t;
    const rate = () => { const r = rooms.find((x) => x.id === f.seat_id.value); const hrs = (new Date(`2000-01-01T${f.to.value}`) - new Date(`2000-01-01T${f.from.value}`)) / 36e5; if (r?.hourly_rate && hrs > 0 && !f.uses_included_hours.checked) f.charge.value = Math.round(r.hourly_rate * hrs); };
    f.seat_id.onchange = f.from.onchange = f.to.onchange = f.uses_included_hours.onchange = rate; rate();
    f.mq.oninput = () => { clearTimeout(t); member = null; const v = f.mq.value.trim(); if (v.length < 2) return;
      t = setTimeout(async () => { const rows = await db.select('members', { select: 'id,full_name,member_no', or: searchFilter(v), limit: 6 });
        md.querySelector('#bk-pick').innerHTML = rows.map((r) => `<button type="button" data-id="${r.id}">${esc(r.full_name)} <span class="muted">#${r.member_no}</span></button>`).join('');
        md.querySelector('#bk-pick').onclick = (ev) => { const b = ev.target.closest('[data-id]'); if (b) { member = b.dataset.id; f.mq.value = b.textContent.trim(); md.querySelector('#bk-pick').innerHTML = ''; } };
      }, 220); };
    f.onsubmit = (ev) => {
      ev.preventDefault(); const d = formData(f);
      const row = { seat_id: d.seat_id, member_id: member, guest_name: d.guest_name, title: d.title, attendees: Number(d.attendees || 1), charge: Number(d.charge || 0), uses_included_hours: !!d.uses_included_hours,
        starts_at: `${d.date}T${d.from}:00+05:00`, ends_at: `${d.date}T${d.to}:00+05:00`, status: 'confirmed' };
      guard(ev.submitter, async () => {
        try { await db.insert('bookings', row); } catch (err) { throw new Error(/overlap|exclu/i.test(err.message) ? 'That room is already booked at this time.' : err.message); }
        closeModal(); toast('Booked'); d.date === day ? rerender() : go(d.date);
      }).catch(() => {});
    };
  };
}
