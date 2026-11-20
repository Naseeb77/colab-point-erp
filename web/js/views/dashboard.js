import { db } from '../api.js';
import { $, esc, money, num, fmtDate, fmtTime, dur, minsSince, empty, greeting, longDate, initials, waLink, today, seg, monthLabel } from '../ui.js';
import { can, state } from '../state.js';
import { recordPaymentPicker } from './payments.js';
import { openMemberForm } from './members.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function heatmap(rows) {
  if (!rows.length) return empty('Busy-hour patterns appear here after a few days of check-ins.');
  const max = Math.max(1, ...rows.map((r) => Number(r.avg_present)));
  const byKey = Object.fromEntries(rows.map((r) => [`${r.weekday}-${r.hour}`, r]));
  const hours = [...Array(24).keys()];
  let html = '<div class="heat"><div class="heat-row head"><span></span>' + hours.map((h) => `<span>${h % 3 === 0 ? h : ''}</span>`).join('') + '</div>';
  for (let d = 1; d <= 7; d++) {
    html += `<div class="heat-row"><span class="day">${DAYS[d - 1]}</span>`;
    for (const h of hours) {
      const r = byKey[`${d}-${h}`];
      const v = r ? Number(r.avg_present) : 0;
      const lvl = v === 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5));
      html += `<span class="cell l${lvl}" title="${DAYS[d - 1]} ${h}:00 — avg ${num(v)} people${r ? `, max ${r.max_present}` : ''}"></span>`;
    }
    html += '</div>';
  }
  return html + '<div class="heat-legend"><span>Quiet</span><i class="cell l1"></i><i class="cell l2"></i><i class="cell l3"></i><i class="cell l4"></i><i class="cell l5"></i><span>Busy</span></div></div>';
}

export function peakSummary(rows) {
  if (!rows.length) return '';
  const s = [...rows].sort((a, b) => b.avg_present - a.avg_present);
  const q = [...rows].filter((r) => r.hour >= 9 && r.hour <= 23).sort((a, b) => a.avg_present - b.avg_present);
  return `<p class="muted small" style="margin-top:8px">Busiest: <strong>${esc(s.slice(0, 3).map((r) => `${DAYS[r.weekday - 1]} ${r.hour}:00`).join(', '))}</strong>${q.length ? ` · Quietest: <strong>${esc(q.slice(0, 2).map((r) => `${DAYS[r.weekday - 1]} ${r.hour}:00`).join(', '))}</strong>` : ''}</p>`;
}

function seatSquares(board, shift) {
  const seats = board.filter((s) => ['shared', 'dedicated_desk'].includes(s.seat_type));
  const rooms = board.filter((s) => ['private_office', 'meeting_room', 'conference_room'].includes(s.seat_type));
  const taken = (s) => shift === 'day' ? s.day_member_id : s.night_member_id;
  const who = (s) => shift === 'day' ? s.day_member : s.night_member;
  const sq = (s) => `<a class="sq ${taken(s) ? 'taken' : ''} ${taken(s) && s.leaving_soon ? 'leaving' : ''} ${['maintenance', 'inactive'].includes(s.status) ? 'maint' : ''}" href="#/seats" title="${esc(s.code)}${who(s) ? ' · ' + esc(who(s)) : ' · free'}"></a>`;
  const t1 = seats.filter(taken).length, t2 = rooms.filter(taken).length;
  return { html: `<div class="seatmap">
    <div><div class="lbl">Seats <span>${t1} of ${seats.length}</span></div><div class="squares">${seats.map(sq).join('') || '<span class="muted small">Add seats in Settings → Seats</span>'}</div></div>
    <div><div class="lbl">Rooms & cabins <span>${t2} of ${rooms.length}</span></div><div class="squares rooms">${rooms.map(sq).join('') || '<span class="muted small">—</span>'}</div></div>
  </div>`, taken: t1 + t2, total: seats.length + rooms.length, free: seats.length + rooms.length - t1 - t2, leaving: [...seats, ...rooms].filter((s) => taken(s) && s.leaving_soon).length };
}

export default async function dashboard({ view, setTitle, actions, rerender }) {
  const name = (state.profile.full_name || '').split(' ')[0];
  setTitle(`${greeting()}${name ? ', ' + name : ''}`, `${longDate()} · <span id="sub-renew"></span>`);
  actions(`<a class="btn" href="#/checkin">Check-in desk</a><button class="btn" id="new-member">+ New member</button>${can.finance() ? '<button class="btn dark" id="rec-pay">Record payment</button>' : ''}`);
  const [s, board, income, renewals, inside, todayBookings, complaintsList, lowStock, hotLeads, bdays, overdue, peaks] = await Promise.all([
    db.rpc('dashboard_stats'),
    db.select('v_seat_board', { select: '*', order: 'code.asc' }),
    can.finance() ? db.select('v_income_6m', { select: '*' }) : [],
    db.select('v_memberships_expiring', { select: '*', order: 'end_date.asc', limit: 6 }),
    db.select('attendance_sessions', { select: 'id,check_in,check_in_source,verified,members(id,full_name)', check_out: 'is.null', member_id: 'not.is.null', order: 'check_in.asc', limit: 8 }),
    db.select('bookings', { select: 'id,title,starts_at,ends_at,guest_name,seats(code),members(full_name)', starts_at: `gte.${today()}T00:00:00+05:00`, and: `(starts_at.lte.${today()}T23:59:59+05:00)`, status: 'in.(pending,confirmed)', order: 'starts_at.asc' }),
    db.select('tickets', { select: 'id,subject,priority,created_at', status: 'in.(open,in_progress)', order: 'created_at.desc', limit: 3 }),
    db.select('v_low_stock', { select: 'id,name,qty,unit', limit: 4 }),
    db.select('leads', { select: 'id,name,phone', temperature: 'eq.hot', status: 'not.in.(won,lost)', limit: 3 }),
    db.select('v_upcoming_birthdays', { select: '*', order: 'next_birthday.asc' }),
    can.finance() ? db.select('v_outstanding', { select: '*', status: 'eq.overdue', order: 'due_date.asc', limit: 3 }) : [],
    db.select('v_peak_hours', { select: '*' }),
  ]);
  $('#sub-renew').textContent = `${s.renewals_week} renewals this week`;
  let shift = 'day';
  const occ = (t) => (t.total ? Math.round((t.taken / t.total) * 100) : 0);
  const change = s.revenue_last_month ? Math.round(((s.revenue_month - s.revenue_last_month) / s.revenue_last_month) * 100) : null;
  const maxIncome = Math.max(1, ...income.map((r) => Number(r.collected)));

  const att = [];
  if (s.pending_registrations) att.push(`<a class="att blue" href="#/registrations"><span class="ic">📝</span><div class="grow"><strong>${s.pending_registrations} new sign-up${s.pending_registrations > 1 ? 's' : ''}</strong><div class="muted small">waiting for approval</div></div></a>`);
  overdue.forEach((o) => att.push(`<a class="att red" href="#/billing"><span class="ic">₨</span><div class="grow"><strong>${esc(o.customer)}</strong><div class="muted small">${money(o.balance)} · ${o.days_overdue} days late</div></div></a>`));
  complaintsList.forEach((c) => att.push(`<a class="att amber" href="#/complaints"><span class="ic">💬</span><div class="grow"><strong>${esc(c.subject)}</strong><div class="muted small">${esc(c.priority)} priority · ${fmtDate(c.created_at)}</div></div></a>`));
  lowStock.forEach((i) => att.push(`<a class="att amber" href="#/stock"><span class="ic">📦</span><div class="grow"><strong>${esc(i.name)}</strong><div class="muted small">${num(i.qty)} ${esc(i.unit)} left</div></div></a>`));
  hotLeads.forEach((l) => att.push(`<a class="att red" href="#/leads"><span class="ic">🔥</span><div class="grow"><strong>${esc(l.name)}</strong><div class="muted small">hot lead · follow up</div></div></a>`));
  bdays.forEach((b) => att.push(`<div class="att violet"><span class="ic">🎂</span><div class="grow"><strong>${esc(b.full_name)}</strong><div class="muted small">${fmtDate(b.next_birthday)} · turns ${b.turns}${b.who === 'staff' ? ' · staff' : ''}</div></div>${b.phone ? `<a class="chip wa" target="_blank" rel="noopener" href="${waLink(b.phone, `Happy birthday ${b.full_name}! 🎉 Wishing you a wonderful year ahead — Team CoLab Point`)}">WhatsApp</a>` : ''}</div>`));
  if (s.flagged_today) att.push(`<a class="att red" href="#/reports"><span class="ic">⚑</span><div class="grow"><strong>${s.flagged_today} flagged visit${s.flagged_today > 1 ? 's' : ''} today</strong><div class="muted small">auto-closed or unusually long</div></div></a>`);

  view.innerHTML = `
  <div class="grid-main">
    <div class="card">
      <div class="card-head" style="align-items:flex-start">
        <div><small class="muted">Seats taken now</small><div class="row" style="align-items:baseline;gap:8px"><strong id="occ-n" style="font-size:40px;letter-spacing:-.03em"></strong><span class="muted" id="occ-of"></span></div></div>
        <div style="display:grid;gap:8px;justify-items:end">${seg('shift', [['day', 'Day'], ['night', 'Night']], 'day')}
          <div class="legend"><span><i class="taken"></i>Taken</span><span><i></i>Free</span><span><i class="leaving"></i>Leaving soon</span></div></div>
      </div>
      <div id="seatmap"></div>
      <div class="row between" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line-2)">
        <span class="small"><strong id="free-n"></strong> <span class="muted">free</span> &nbsp; <strong id="leave-n"></strong> <span class="muted">leaving soon</span> &nbsp; <strong>${s.inside}</strong> <span class="muted">inside right now</span></span>
        <a class="small strong" href="#/seats">Open seat plan →</a>
      </div>
    </div>
    ${can.finance() ? `<div class="card">
      <small class="muted">Income in ${new Date().toLocaleDateString('en-GB', { month: 'long' })}</small>
      <div style="font-size:28px;font-weight:750;letter-spacing:-.02em">${money(s.revenue_month)}</div>
      <div class="trend">${change === null ? '<span class="muted">first month of data</span>' : `<span class="${change < 0 ? 'neg' : 'pos'}">${change > 0 ? '+' : ''}${change}%</span> <span class="muted">on last month</span>`}</div>
      <div class="bars">${income.map((r, i) => `<div class="b ${i === income.length - 1 ? 'cur' : ''}" title="${money(r.collected)}"><i style="height:${Math.max(3, (Number(r.collected) / maxIncome) * 100)}%"></i><span>${monthLabel(r.month).split(' ')[0]}</span></div>`).join('')}</div>
      <div class="row between small" style="margin-top:12px"><span class="muted">Expenses this month</span><strong>${money(s.expenses_month)}</strong></div>
      <div class="row between small" style="margin-top:4px"><span class="muted">Outstanding dues</span><strong class="${s.outstanding ? 'neg' : ''}">${money(s.outstanding)}</strong></div>
    </div>` : `<div class="card"><div class="card-head"><h2>Busy hours</h2></div>${heatmap(peaks)}</div>`}
  </div>

  <div class="stats">
    <div class="stat accent"><small>Active members</small><strong>${s.active_members}</strong><span>${s.checkins_today} check-ins today</span></div>
    <div class="stat"><small>Inside right now</small><strong>${s.inside}</strong><span>${s.visitors_inside} visitors</span></div>
    <div class="stat good"><small>Staff present</small><strong>${s.staff_present}<span class="muted" style="font-size:14px"> / ${s.staff_total}</span></strong><span><a href="#/attendance">mark attendance →</a></span></div>
    <div class="stat ${s.open_complaints ? 'warn' : ''}"><small>Open complaints</small><strong>${s.open_complaints}</strong><span>${s.open_work} work orders open</span></div>
    ${can.finance() ? `<div class="stat ${s.overdue_count ? 'danger' : ''}"><small>Overdue invoices</small><strong>${s.overdue_count}</strong><span>${money(s.outstanding)} total due</span></div>` : ''}
  </div>

  <div class="grid-3">
    <div class="card flush"><div class="card-head"><h2>Renewals</h2><a class="small muted" href="#/members">See all</a></div>
      <div class="list">${renewals.map((r) => `<a class="li" href="#/members/${r.member_id}"><span class="avatar sm">${esc(initials(r.full_name))}</span><div class="grow"><strong>${esc(r.full_name)}</strong><div class="meta">${esc(r.plan)} · ${fmtDate(r.end_date)}</div></div>${r.days_left < 0 ? '<span class="badge red">Ended</span>' : r.days_left === 0 ? '<span class="badge red">Today</span>' : `<span class="badge amber">${r.days_left}d</span>`}</a>`).join('') || empty('No renewals in the next 7 days.')}</div>
    </div>
    <div class="card flush"><div class="card-head"><h2>Today</h2><a class="small muted" href="#/bookings">Meeting rooms</a></div>
      <div class="list">
        ${todayBookings.map((b) => `<div class="li"><span class="avatar sm dark">${esc((b.seats?.code || 'R').slice(0, 2))}</span><div class="grow"><strong>${esc(b.title || b.members?.full_name || b.guest_name || 'Booking')}</strong><div class="meta">${esc(b.seats?.code || '')} · ${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)}</div></div></div>`).join('')}
        ${inside.map((r) => `<a class="li" href="#/members/${r.members.id}"><span class="avatar sm">${esc(initials(r.members.full_name))}</span><div class="grow"><strong>${esc(r.members.full_name)}</strong><div class="meta">in since ${fmtTime(r.check_in)} · ${dur(minsSince(r.check_in))}</div></div><span class="chip">${esc(r.check_in_source)}</span></a>`).join('')}
        ${!todayBookings.length && !inside.length ? empty('No bookings or check-ins yet today.') : ''}
      </div>
    </div>
    <div class="card"><div class="card-head"><h2>Needs attention</h2></div>
      <div class="attention">${att.join('') || empty('All clear. Nothing needs you right now. ✓')}</div>
    </div>
  </div>

  ${can.finance() ? `<div class="card"><div class="card-head"><h2>Busy & quiet hours</h2><span class="muted small">average people present · last 90 days</span></div>${heatmap(peaks)}${peakSummary(peaks)}</div>` : ''}`;

  const paintSeats = () => {
    const r = seatSquares(board, shift);
    $('#seatmap').innerHTML = r.html;
    $('#occ-n').textContent = r.taken;
    $('#occ-of').textContent = `of ${r.total} · ${occ(r)}%`;
    $('#free-n').textContent = r.free;
    $('#leave-n').textContent = r.leaving;
  };
  paintSeats();
  view.onclick = (e) => {
    const b = e.target.closest('[data-seg=shift] button');
    if (b) { shift = b.dataset.v; b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); paintSeats(); }
  };
  const nm = document.getElementById('new-member');
  if (nm) nm.onclick = () => openMemberForm({}, (r) => location.hash = `#/members/${r.id}`);
  const rp = document.getElementById('rec-pay');
  if (rp) rp.onclick = () => recordPaymentPicker(rerender);
}
