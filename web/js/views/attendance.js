import { db } from '../api.js';
import { $, esc, today, addDays, empty, toast, guard, seg, initials, downloadCsv, monthLabel, fmtDate } from '../ui.js';
import { can } from '../state.js';

const STATUSES = [['present', 'Present'], ['absent', 'Absent'], ['half_day', 'Half day'], ['leave', 'Leave']];
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Karachi' });

export default async function attendance({ view, setTitle, actions, rerender }) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const tab = params.get('tab') || 'day';
  const day = params.get('d') || today();
  const month = params.get('m') || day.slice(0, 7);
  setTitle('Staff attendance', tab === 'day' ? 'Everyone starts as present — just change the ones who are absent.' : `Monthly report · ${monthLabel(month)}`);
  actions(`<div class="seg" data-tabs>${[['day', 'Daily'], ['month', 'Monthly report']].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${can.hr() ? '<a class="btn dark" href="#/employees?new=1">+ Add staff</a>' : ''}`);
  document.querySelector('[data-tabs]').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) location.hash = `#/attendance?tab=${b.dataset.tab}&d=${day}`; };

  const emps = await db.select('employees', { select: 'id,full_name,designation,status', status: 'neq.left', order: 'full_name.asc' });
  if (!emps.length) {
    view.innerHTML = `<div class="card">${empty('No staff added yet. Add your team (receptionist, office boy, manager…) to start marking attendance.', can.hr() ? '<a class="btn dark" href="#/employees?new=1">+ Add staff</a>' : '')}</div>`;
    return;
  }

  if (tab === 'month') {
    const rows = await db.select('v_staff_month', { select: '*', month: `eq.${month}-01` });
    const by = Object.fromEntries(rows.map((r) => [r.employee_id, r]));
    view.innerHTML = `<div class="card flush"><div class="card-head"><div class="toolbar"><input type="month" id="m" value="${month}"></div><div class="actions"><button class="btn sm" id="csv">Excel (CSV)</button><button class="btn sm" onclick="print()">Print / PDF</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Staff</th><th class="num">Present</th><th class="num">Absent</th><th class="num">Half day</th><th class="num">Leave</th><th class="num">Working days</th></tr></thead><tbody>
      ${emps.map((e) => { const r = by[e.id] || {}; const wd = (r.present || 0) + (r.half_day || 0) * 0.5; return `<tr><td><div class="row"><span class="avatar sm">${esc(initials(e.full_name))}</span><div><strong>${esc(e.full_name)}</strong><div class="muted tiny">${esc(e.designation || '')}</div></div></div></td>
        <td class="num"><span class="badge green">${r.present || 0}</span></td><td class="num"><span class="badge red">${r.absent || 0}</span></td><td class="num"><span class="badge amber">${r.half_day || 0}</span></td><td class="num"><span class="badge violet">${r.leave || 0}</span></td><td class="num strong">${wd}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
    $('#m').onchange = (e) => { location.hash = `#/attendance?tab=month&m=${e.target.value}`; };
    $('#csv').onclick = () => downloadCsv(`staff-attendance-${month}.csv`, emps.map((e) => ({ ...e, ...(by[e.id] || {}) })), [['full_name', 'Staff'], ['designation', 'Designation'], [(r) => r.present || 0, 'Present'], [(r) => r.absent || 0, 'Absent'], [(r) => r.half_day || 0, 'Half day'], [(r) => r.leave || 0, 'Leave']]);
    return;
  }

  const [recs, monthRows] = await Promise.all([
    db.select('staff_attendance', { select: '*', day: `eq.${day}` }),
    db.select('v_staff_month', { select: '*', month: `eq.${day.slice(0, 7)}-01` }),
  ]);
  const rec = Object.fromEntries(recs.map((r) => [r.employee_id, r]));
  const mon = Object.fromEntries(monthRows.map((r) => [r.employee_id, r]));
  const status = (id) => rec[id]?.status || 'present';
  const counts = () => Object.fromEntries(STATUSES.map(([k]) => [k, emps.filter((e) => status(e.id) === k).length]));
  const unsaved = emps.filter((e) => !rec[e.id]).length;
  const c = counts();

  view.innerHTML = `
  <div class="card" style="padding:12px 16px"><div class="row wrap between">
    <div class="row"><button class="btn sm" data-nav="-1">‹</button><input type="date" id="d" value="${day}" style="width:auto"><button class="btn sm" data-nav="1">›</button><button class="btn sm ${day === today() ? 'accent' : ''}" data-nav="0">Today</button>
      <strong>${new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</strong></div>
    ${unsaved ? `<button class="btn dark sm" id="save-all">✓ Save ${unsaved} as present</button>` : '<span class="badge green">All marked</span>'}
  </div></div>
  <div class="stats">
    <div class="stat dark"><small>Present</small><strong>${c.present}</strong></div>
    <div class="stat danger"><small>Absent</small><strong>${c.absent}</strong></div>
    <div class="stat warn"><small>Half day</small><strong>${c.half_day}</strong></div>
    <div class="stat violet"><small>Leave</small><strong>${c.leave}</strong></div>
  </div>
  <div class="card flush"><div class="card-head"><div><h2>Attendance: ${fmtDate(day)}</h2><span class="muted small">${emps.length} active staff · ${unsaved ? `${unsaved} not saved yet` : 'saved'}</span></div></div>
    <div class="table-wrap"><table><thead><tr><th>Staff</th><th>Status</th><th>Check in</th><th>Check out</th><th>Note</th></tr></thead><tbody>
    ${emps.map((e) => { const r = rec[e.id] || {}; const m = mon[e.id] || {}; return `<tr data-emp="${e.id}">
      <td><div class="row"><span class="avatar sm">${esc(initials(e.full_name))}</span><div><strong>${esc(e.full_name)}</strong><div class="muted tiny">${esc(e.designation || '')}</div>
        <div class="chips" style="margin-top:3px"><span class="badge green">${m.present || 0}P</span><span class="badge red">${m.absent || 0}A</span><span class="badge amber">${m.half_day || 0}H</span><span class="badge violet">${m.leave || 0}L</span></div></div></div></td>
      <td>${seg('st', STATUSES, status(e.id), 'status')}${!rec[e.id] ? '<div class="muted tiny" style="margin-top:3px">not saved</div>' : ''}</td>
      <td><div class="row"><input type="time" data-f="check_in" value="${(r.check_in || '').slice(0, 5)}" style="width:110px"><button class="btn xs accent" data-now="check_in">Now</button></div></td>
      <td><div class="row"><input type="time" data-f="check_out" value="${(r.check_out || '').slice(0, 5)}" style="width:110px"><button class="btn xs accent" data-now="check_out">Now</button></div></td>
      <td><input data-f="note" placeholder="Optional note" value="${esc(r.note || '')}" style="min-width:150px"></td></tr>`; }).join('')}
    </tbody></table></div></div>`;

  const save = async (empId, patch) => {
    const base = rec[empId] || { status: 'present' };
    const row = { employee_id: empId, day, status: base.status, check_in: base.check_in || null, check_out: base.check_out || null, note: base.note || null, ...patch };
    const [saved] = await db.upsert('staff_attendance', row, 'employee_id,day');
    rec[empId] = saved;
  };
  const go = (d) => { location.hash = `#/attendance?tab=day&d=${d}`; };
  $('#d').onchange = (e) => go(e.target.value);
  view.onclick = async (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) return go(nav.dataset.nav === '0' ? today() : addDays(day, Number(nav.dataset.nav)));
    if (e.target.id === 'save-all') {
      return guard(e.target, async () => {
        await db.upsert('staff_attendance', emps.filter((x) => !rec[x.id]).map((x) => ({ employee_id: x.id, day, status: 'present' })), 'employee_id,day');
        toast('Attendance saved'); rerender();
      });
    }
    const tr = e.target.closest('tr[data-emp]'); if (!tr) return;
    const sb = e.target.closest('[data-seg] button');
    if (sb) {
      try {
        await save(tr.dataset.emp, { status: sb.dataset.v });
        sb.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === sb));
        sb.parentElement.nextElementSibling?.remove();
        toast('Saved');
      } catch (err) { toast(err.message, 'err'); }
    }
    const nb = e.target.closest('[data-now]');
    if (nb) {
      const inp = tr.querySelector(`[data-f=${nb.dataset.now}]`); inp.value = nowTime();
      try { await save(tr.dataset.emp, { [nb.dataset.now]: inp.value }); toast('Time saved'); } catch (err) { toast(err.message, 'err'); }
    }
  };
  view.onchange = async (e) => {
    const f = e.target.dataset.f; const tr = e.target.closest('tr[data-emp]');
    if (!f || !tr) return;
    try { await save(tr.dataset.emp, { [f]: e.target.value || null }); toast('Saved'); } catch (err) { toast(err.message, 'err'); }
  };
}
