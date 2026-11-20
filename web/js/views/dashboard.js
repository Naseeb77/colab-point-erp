import { db } from '../api.js';
import { esc, money, num, fmtDate, fmtTime, dur, minsSince, table, empty } from '../ui.js';
import { can } from '../state.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function heatmap(rows) {
  if (!rows.length) return empty('Peak-hour patterns appear here after a few days of check-ins.');
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
  const sorted = [...rows].sort((a, b) => b.avg_present - a.avg_present);
  const busy = sorted.slice(0, 3).map((r) => `${DAYS[r.weekday - 1]} ${r.hour}:00`).join(', ');
  return `<p class="muted small">Busiest: <strong>${esc(busy)}</strong></p>`;
}

export default async function dashboard({ view, setTitle }) {
  setTitle('Dashboard');
  const [s, inside, expiring, peaks, outstanding] = await Promise.all([
    db.rpc('dashboard_stats'),
    db.select('attendance_sessions', { select: 'id,check_in,check_in_source,verified,members(id,full_name,member_no)', check_out: 'is.null', 'member_id': 'not.is.null', order: 'check_in.asc' }),
    db.select('v_memberships_expiring', { select: '*', order: 'end_date.asc', limit: 8 }),
    db.select('v_peak_hours', { select: '*' }),
    can.finance() ? db.select('v_outstanding', { select: '*', order: 'due_date.asc', limit: 6 }) : Promise.resolve([]),
  ]);
  const occ = s.total_seats ? Math.round((s.inside / s.total_seats) * 100) : null;

  view.innerHTML = `
  <div class="stats">
    <div class="stat accent"><small>Inside now</small><strong>${s.inside}</strong><span>${s.total_seats ? `${occ}% of ${s.total_seats} seats` : 'Add seats in Settings'}</span>
      ${s.total_seats ? `<div class="meter"><i style="width:${Math.min(100, occ)}%"></i></div>` : ''}</div>
    <div class="stat"><small>Active members</small><strong>${s.active_members}</strong><span>${s.checkins_today} check-ins today</span></div>
    <div class="stat ${s.expiring_7d ? 'warn' : ''}"><small>Expiring in 7 days</small><strong>${s.expiring_7d}</strong><span>memberships</span></div>
    ${can.finance() ? `<div class="stat ${s.overdue_count ? 'danger' : ''}"><small>Outstanding</small><strong>${money(s.outstanding)}</strong><span>${s.overdue_count} overdue</span></div>
    <div class="stat"><small>Collected this month</small><strong>${money(s.revenue_month)}</strong><span>all departments</span></div>` : ''}
    <div class="stat ${s.flagged_today ? 'warn' : ''}"><small>Flags today</small><strong>${s.flagged_today}</strong><span>${s.open_tickets} open tickets · ${s.new_leads} new leads</span></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-head"><h2>Who's inside</h2><a class="btn sm" href="#/checkin">Check-in desk</a></div>
      ${inside.length ? table([
        { label: 'Member', render: (r) => `<a href="#/members/${r.members.id}">${esc(r.members.full_name)}</a> <span class="muted">#${r.members.member_no}</span>` },
        { label: 'Since', render: (r) => fmtTime(r.check_in) },
        { label: 'Time', render: (r) => dur(minsSince(r.check_in)) },
        { label: 'Via', render: (r) => `<span class="chip">${esc(r.check_in_source)}</span>${r.verified ? ' <span class="chip ok" title="Confirmed by a second source">✓</span>' : ''}` },
      ], inside) : empty('Nobody is checked in right now.')}
    </div>
    <div class="card">
      <div class="card-head"><h2>Busy hours</h2><span class="muted small">last 90 days</span></div>
      ${heatmap(peaks)}${peakSummary(peaks)}
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-head"><h2>Expiring soon</h2></div>
      ${expiring.length ? table([
        { label: 'Member', render: (r) => `<a href="#/members/${r.member_id}">${esc(r.full_name)}</a>` },
        { label: 'Plan', key: 'plan' },
        { label: 'Ends', render: (r) => fmtDate(r.end_date) },
        { label: '', render: (r) => r.days_left < 0 ? '<span class="badge red">ended</span>' : `<span class="badge amber">${r.days_left}d left</span>` },
      ], expiring) : empty('No memberships ending this week.')}
    </div>
    ${can.finance() ? `<div class="card">
      <div class="card-head"><h2>Payments due</h2><a class="btn sm" href="#/billing">Billing</a></div>
      ${outstanding.length ? table([
        { label: 'Customer', key: 'customer' },
        { label: 'Due', render: (r) => fmtDate(r.due_date) },
        { label: 'Balance', cls: 'num', render: (r) => money(r.balance) },
        { label: '', render: (r) => r.days_overdue > 0 ? `<span class="badge red">${r.days_overdue}d late</span>` : '<span class="badge amber">due</span>' },
      ], outstanding) : empty('Everyone is paid up.')}
    </div>` : ''}
  </div>`;
}
