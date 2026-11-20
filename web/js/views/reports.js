import { db } from '../api.js';
import { $, esc, money, num, fmtDate, fmtDateTime, fmtTime, dur, today, table, empty } from '../ui.js';
import { heatmap, peakSummary } from './dashboard.js';
import { can } from '../state.js';

function csv(rows, cols) {
  const line = (a) => a.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  const blob = new Blob([[line(cols.map((c) => c[1])), ...rows.map((r) => line(cols.map((c) => r[c[0]])))].join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'member-usage.csv' });
  a.click(); URL.revokeObjectURL(a.href);
}

export default async function reports({ view, setTitle, actions }) {
  setTitle('Reports');
  const month = (new URLSearchParams(location.hash.split('?')[1] || '').get('m')) || today().slice(0, 7);
  actions(`<input type="month" id="m" value="${month}"><button class="btn" id="csv">Export CSV</button>`);
  const mStart = `${month}-01`;
  const [usage, peaks, profit, flagged, mismatch] = await Promise.all([
    db.select('v_member_monthly_usage', { select: '*', month: `eq.${mStart}`, order: 'total_hours.desc' }),
    db.select('v_peak_hours', { select: '*' }),
    can.finance() ? db.select('v_profit_monthly', { select: '*', order: 'month.desc', limit: 12 }) : Promise.resolve([]),
    db.select('attendance_sessions', { select: 'id,check_in,check_out,flag_reason,member_id,members(full_name)', flagged: 'eq.true', order: 'check_in.desc', limit: 30 }),
    db.select('v_occupancy_mismatch', { select: '*', order: 'taken_at.desc', limit: 20 }),
  ]);
  const totalHours = usage.reduce((a, r) => a + Number(r.total_hours), 0);

  view.innerHTML = `
  <div class="stats">
    <div class="stat accent"><small>Members who came</small><strong>${usage.length}</strong><span>${month}</span></div>
    <div class="stat"><small>Total hours used</small><strong>${num(totalHours, 0)}</strong><span>${usage.length ? num(totalHours / usage.length) + ' h per member' : ''}</span></div>
    <div class="stat ${flagged.length ? 'warn' : ''}"><small>Flagged sessions</small><strong>${flagged.length}</strong><span>auto-closed or too long</span></div>
    <div class="stat ${mismatch.length ? 'danger' : ''}"><small>Untracked people alerts</small><strong>${mismatch.length}</strong><span>camera count &gt; check-ins</span></div>
  </div>

  <div class="card flush"><div class="card-head pad"><h2>Usage per member</h2><span class="muted small">who used how much of the space</span></div>
    ${usage.length ? table([
      { label: 'Member', render: (r) => `<a href="#/members/${r.member_id}">${esc(r.full_name)}</a>` },
      { label: 'Days', cls: 'num', render: (r) => r.days_visited },
      { label: 'Hours', cls: 'num', render: (r) => `<strong>${num(r.total_hours)}</strong>` },
      { label: 'Avg / day', cls: 'num', render: (r) => num(r.avg_hours_per_day) },
      { label: 'Over limit', cls: 'num', render: (r) => r.days_over_limit ? `<span class="badge amber">${r.days_over_limit} days</span>` : '—' },
      { label: 'Flags', cls: 'num', render: (r) => r.flagged_days ? `<span class="badge red">${r.flagged_days}</span>` : '—' },
      { label: '', render: (r) => `<div class="bar"><i style="width:${Math.min(100, (r.total_hours / Math.max(...usage.map((u) => u.total_hours))) * 100)}%"></i></div>` },
    ], usage) : empty('No attendance recorded for this month.')}
  </div>

  <div class="grid-2">
    <div class="card"><div class="card-head"><h2>Busy & quiet hours</h2><span class="muted small">avg people present, last 90 days</span></div>${heatmap(peaks)}${peakSummary(peaks)}</div>
    ${can.finance() ? `<div class="card flush"><div class="card-head pad"><h2>Revenue vs expenses</h2></div>
      ${profit.length ? table([
        { label: 'Month', render: (r) => new Date(r.month + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) },
        { label: 'Revenue', cls: 'num', render: (r) => money(r.revenue) },
        { label: 'Expenses', cls: 'num', render: (r) => money(r.expenses) },
        { label: 'Profit', cls: 'num', render: (r) => `<strong class="${r.profit < 0 ? 'neg' : 'pos'}">${money(r.profit)}</strong>` },
      ], profit) : empty('No payments or expenses yet.')}</div>` : ''}
  </div>

  <div class="grid-2">
    <div class="card flush"><div class="card-head pad"><h2>Flagged sessions</h2></div>
      ${flagged.length ? table([
        { label: 'Member', render: (r) => `<a href="#/members/${r.member_id}">${esc(r.members?.full_name || '')}</a>` },
        { label: 'When', render: (r) => `${fmtDate(r.check_in)} ${fmtTime(r.check_in)}–${r.check_out ? fmtTime(r.check_out) : '…'}` },
        { label: 'Reason', render: (r) => `<span class="small">${esc(r.flag_reason || '')}</span>` },
      ], flagged) : empty('Nothing suspicious.')}
    </div>
    <div class="card flush"><div class="card-head pad"><h2>Camera head-count vs check-ins</h2></div>
      ${mismatch.length ? table([
        { label: 'Time', render: (r) => fmtDateTime(r.taken_at) },
        { label: 'Camera saw', cls: 'num', render: (r) => r.people_count },
        { label: 'Checked in', cls: 'num', render: (r) => r.logged_count },
        { label: 'Untracked', cls: 'num', render: (r) => `<span class="badge red">${r.untracked_people}</span>` },
      ], mismatch) : empty('Works once an entrance camera is connected.')}
    </div>
  </div>`;

  $('#m').onchange = (e) => { location.hash = `#/reports?m=${e.target.value}`; };
  $('#csv').onclick = () => csv(usage, [['full_name', 'Member'], ['days_visited', 'Days'], ['total_hours', 'Hours'], ['avg_hours_per_day', 'Avg/day'], ['days_over_limit', 'Days over limit'], ['flagged_days', 'Flagged days']]);
}
