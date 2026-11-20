import { db } from '../api.js';
import { $, esc, fmtDate, empty, badge } from '../ui.js';

export default async function seats({ view, setTitle, actions }) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const filter = params.get('f') || 'all';
  setTitle('Seat availability', 'Live day / night availability for every seat and room.');
  actions(`<input class="search" id="q" placeholder="Search seat or member…" value="${esc(params.get('q') || '')}" style="width:220px">
    <select id="f">${[['all', 'All status'], ['day_free', 'Free in day'], ['night_free', 'Free at night'], ['leaving', 'Leaving soon']].map(([k, l]) => `<option value="${k}" ${k === filter ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <a class="btn" href="#/settings?t=space">Manage seats</a>`);
  const [board, lockers] = await Promise.all([
    db.select('v_seat_board', { select: '*', order: 'code.asc' }),
    db.select('lockers', { select: '*', order: 'code.asc' }),
  ]);
  const work = board.filter((s) => s.status !== 'inactive');
  const cap = work.filter((s) => ['shared', 'dedicated_desk', 'private_office'].includes(s.seat_type));
  const dayFree = cap.filter((s) => !s.day_member_id).length;
  const nightFree = cap.filter((s) => !s.night_member_id).length;
  const q = (params.get('q') || '').toLowerCase();
  const match = (s) => (!q || [s.code, s.day_member, s.night_member].join(' ').toLowerCase().includes(q))
    && (filter === 'all' || (filter === 'day_free' && !s.day_member_id) || (filter === 'night_free' && !s.night_member_id) || (filter === 'leaving' && s.leaving_soon));
  const zones = {};
  work.filter(match).forEach((s) => { const z = s.zone || ({ shared: 'Shared space', dedicated_desk: 'Dedicated desks', private_office: 'Private offices', meeting_room: 'Meeting rooms', conference_room: 'Meeting rooms' }[s.seat_type]); (zones[z] ||= []).push(s); });
  const slot = (label, who, id, end, leaving) => `<div class="slot ${id ? (leaving && end && new Date(end) <= new Date(Date.now() + 7 * 864e5) ? 'leaving' : 'taken') : ''}">
    <div class="top"><span>${label}</span>${id ? (leaving && end && new Date(end) <= new Date(Date.now() + 7 * 864e5) ? '<span class="badge yellow">Leaving soon</span>' : '<span class="badge dark">Reserved</span>') : '<span class="badge gray">Available</span>'}</div>
    ${id ? `<a class="who" href="#/members/${id}">${esc(who)}</a><span class="tiny" style="opacity:.75">until ${fmtDate(end)}</span>` : '<span class="muted small">Available</span>'}</div>`;

  view.innerHTML = `
  <div class="stats">
    <div class="stat dark"><small>Total seats / capacity</small><strong>${cap.reduce((a, s) => a + s.capacity, 0)}</strong><span>${work.length} seats & rooms</span></div>
    <div class="stat accent"><small>Day available</small><strong>${dayFree}<span class="muted" style="font-size:14px"> / ${cap.length}</span></strong><span>${cap.length - dayFree} reserved in day</span></div>
    <div class="stat"><small>Night available</small><strong>${nightFree}<span class="muted" style="font-size:14px"> / ${cap.length}</span></strong><span>${cap.length - nightFree} reserved at night</span></div>
    <div class="stat warn"><small>Leaving in 7 days</small><strong>${work.filter((s) => s.leaving_soon).length}</strong><span>renew or re-let</span></div>
  </div>
  ${Object.entries(zones).map(([z, list]) => `<div class="card flush">
    <div class="zone-head"><strong>${esc(z)}</strong><div class="chips"><span class="badge">Total ${list.length}</span><span class="badge yellow">Day ${list.filter((s) => !s.day_member_id).length} available</span><span class="badge yellow">Night ${list.filter((s) => !s.night_member_id).length} available</span></div></div>
    <div class="seat-cards">${list.map((s) => `<div class="seat-card"><div class="sc-head"><span>${esc(s.code)}</span><small>${esc(s.seat_type.replace(/_/g, ' '))}${s.capacity > 1 ? ` · ${s.capacity} ppl` : ''}</small></div>
      ${['meeting_room', 'conference_room'].includes(s.seat_type) ? `<div class="slot"><span class="muted small">Booked by the hour — <a class="link" href="#/bookings">see bookings</a></span></div>` :
      slot('DAY', s.day_member, s.day_member_id, s.day_end, s.leaving_soon) + slot('NIGHT', s.night_member, s.night_member_id, s.night_end, s.leaving_soon)}
      ${['maintenance'].includes(s.status) ? '<div class="slot"><span class="badge gray">Under maintenance</span></div>' : ''}</div>`).join('')}</div></div>`).join('') || `<div class="card">${empty('No seats match. Add seats in Settings → Seats & lockers.')}</div>`}
  ${lockers.length ? `<div class="card"><div class="card-head"><h2>Lockers</h2><span class="muted small">${lockers.filter((l) => l.status === 'free').length} free of ${lockers.length}</span></div>
    <div class="chips">${lockers.map((l) => `<span class="chip">${esc(l.code)} ${badge(l.status === 'free' ? 'available' : l.status === 'assigned' ? 'occupied' : 'maintenance', l.status)}</span>`).join('')}</div></div>` : ''}`;
  const go = (patch) => { location.hash = `#/seats?${new URLSearchParams({ f: filter, q: params.get('q') || '', ...patch })}`; };
  $('#f').onchange = (e) => go({ f: e.target.value });
  let t; $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => go({ q: e.target.value }), 500); };
  if (!work.length) view.insertAdjacentHTML('afterbegin', '');
}
