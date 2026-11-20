import { db } from '../api.js';
import { $, esc, money, fmtDate, today, table, empty, toast, guard, modal, closeModal, field, formData, badge, initials, waLink, monthLabel } from '../ui.js';
import { can, shifts, bust } from '../state.js';
import { METHODS } from './payments.js';

async function employeeForm(x = {}, onDone) {
  const sh = await shifts();
  const md = modal(x.id ? 'Edit staff member' : 'Add staff member', `<form class="form grid">
    ${field('full_name', 'Full name', { required: true, value: x.full_name, span: 2 })}
    ${field('designation', 'Designation', { value: x.designation, placeholder: 'Manager, Receptionist, Office boy…' })}
    ${field('phone', 'Phone', { value: x.phone })}
    ${field('cnic', 'CNIC', { value: x.cnic })}
    ${field('email', 'Email', { type: 'email', value: x.email })}
    ${field('joining_date', 'Joining date', { type: 'date', value: x.joining_date || today() })}
    ${field('date_of_birth', 'Date of birth', { type: 'date', value: x.date_of_birth })}
    ${field('salary', 'Monthly salary (Rs)', { type: 'number', value: x.salary ?? 0 })}
    ${field('shift_id', 'Shift', { options: [['', '—'], ...sh.map((s) => [s.id, s.name])], value: x.shift_id })}
    ${field('status', 'Status', { options: [['active', 'Active'], ['on_leave', 'On leave'], ['left', 'Left']], value: x.status || 'active' })}
    ${field('emergency_contact', 'Emergency contact', { value: x.emergency_contact })}
    ${field('address', 'Address', { value: x.address, span: 2 })}
    ${field('notes', 'Notes', { type: 'textarea', value: x.notes, span: 2 })}
    <div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form>`, { wide: true });
  md.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const d = formData(e.target); d.salary = Number(d.salary || 0);
    guard(e.submitter, async () => {
      const [r] = x.id ? await db.update('employees', { id: x.id }, d) : await db.insert('employees', d);
      bust('employees'); closeModal(); toast('Saved'); onDone?.(r);
    }).catch(() => {});
  };
}

export default async function employees({ view, setTitle, actions, rerender }) {
  setTitle('Employees', 'Your team, salaries and advances');
  actions('<a class="btn" href="#/attendance">Attendance</a><button class="btn dark" id="add">+ Add staff</button>');
  const [rows, adv] = await Promise.all([
    db.select('employees', { select: '*,shifts(name)', order: 'status.asc,full_name.asc' }),
    db.select('employee_advances', { select: 'employee_id,amount', recovered: 'eq.false' }),
  ]);
  const advBy = {}; adv.forEach((a) => { advBy[a.employee_id] = (advBy[a.employee_id] || 0) + Number(a.amount); });
  const active = rows.filter((r) => r.status !== 'left');
  view.innerHTML = `
  <div class="stats">
    <div class="stat dark"><small>Active staff</small><strong>${active.length}</strong></div>
    <div class="stat"><small>Monthly payroll</small><strong>${money(active.reduce((a, r) => a + Number(r.salary), 0))}</strong></div>
    <div class="stat warn"><small>Advances outstanding</small><strong>${money(Object.values(advBy).reduce((a, b) => a + b, 0))}</strong></div>
  </div>
  <div class="card flush">${rows.length ? table([
    { label: 'Name', render: (r) => `<div class="row"><span class="avatar sm">${esc(initials(r.full_name))}</span><div><strong>${esc(r.full_name)}</strong><div class="muted tiny">${esc(r.designation || '')}</div></div></div>` },
    { label: 'Phone', render: (r) => esc(r.phone || '—') },
    { label: 'Shift', render: (r) => esc(r.shifts?.name || '—') },
    { label: 'Joined', render: (r) => fmtDate(r.joining_date) },
    { label: 'Salary', cls: 'num', render: (r) => money(r.salary) },
    { label: 'Advance', cls: 'num', render: (r) => advBy[r.id] ? `<span class="badge amber">${money(advBy[r.id])}</span>` : '—' },
    { label: '', render: (r) => badge(r.status === 'active' ? 'active' : r.status) },
  ], rows, { rowAttr: (r) => `class="clickable" data-id="${r.id}"` }) : empty('No staff yet.', '<button class="btn dark" data-add>Add your first staff member</button>')}</div>`;
  $('#add').onclick = () => employeeForm({}, (r) => location.hash = `#/employees/${r.id}`);
  view.onclick = (e) => {
    if (e.target.closest('[data-add]')) return $('#add').click();
    const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/employees/${tr.dataset.id}`;
  };
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('new')) $('#add').click();
}

export async function employeeDetail(ctx, id) {
  const { view, setTitle, actions, rerender } = ctx;
  const [e, att, adv, sal] = await Promise.all([
    db.one('employees', { select: '*,shifts(name)', id: `eq.${id}` }),
    db.select('v_staff_month', { select: '*', employee_id: `eq.${id}`, order: 'month.desc', limit: 6 }),
    can.hr() ? db.select('employee_advances', { select: '*', employee_id: `eq.${id}`, order: 'given_on.desc' }) : [],
    can.hr() ? db.select('salary_payments', { select: '*', employee_id: `eq.${id}`, order: 'month.desc' }) : [],
  ]);
  if (!e) { view.innerHTML = empty('Not found.'); return; }
  setTitle(e.full_name, esc(e.designation || 'Staff'));
  actions(`<a class="btn ghost" href="#/employees">← Employees</a>${can.hr() ? '<button class="btn" id="edit">Edit</button><button class="btn" id="adv">+ Advance</button><button class="btn dark" id="pay">Pay salary</button>' : ''}`);
  const openAdv = adv.filter((a) => !a.recovered).reduce((x, a) => x + Number(a.amount), 0);
  const cur = att[0] || {};
  view.innerHTML = `
  <div class="card profile-head"><div class="avatar xl">${esc(initials(e.full_name))}</div><div class="grow">
    <h2>${esc(e.full_name)} ${badge(e.status)}</h2><p class="muted">${esc(e.designation || '')}${e.shifts ? ' · ' + esc(e.shifts.name) + ' shift' : ''}</p>
    <div class="chips" style="margin-top:8px">${e.phone ? `<a class="chip" href="tel:${esc(e.phone)}">☎ ${esc(e.phone)}</a><a class="chip wa" target="_blank" rel="noopener" href="${waLink(e.phone, `Assalam-o-Alaikum ${e.full_name},`)}">WhatsApp</a>` : ''}${e.cnic ? `<span class="chip">CNIC ${esc(e.cnic)}</span>` : ''}</div></div></div>
  <div class="stats">
    <div class="stat good"><small>Present this month</small><strong>${cur.present || 0}</strong><span>${cur.absent || 0} absent · ${cur.half_day || 0} half · ${cur.leave || 0} leave</span></div>
    ${can.hr() ? `<div class="stat"><small>Salary</small><strong>${money(e.salary)}</strong><span>joined ${fmtDate(e.joining_date)}</span></div>
    <div class="stat ${openAdv ? 'warn' : ''}"><small>Advance to recover</small><strong>${money(openAdv)}</strong></div>` : ''}
  </div>
  ${can.hr() ? `<div class="grid-2">
    <div class="card flush"><div class="card-head"><h2>Salary payments</h2></div>${sal.length ? table([
      { label: 'Month', render: (r) => monthLabel(r.month) },
      { label: 'Basic', cls: 'num', render: (r) => money(r.basic) },
      { label: '+/−', cls: 'num', render: (r) => `<span class="small">${r.bonus ? '+' + money(r.bonus) : ''} ${r.deductions ? '−' + money(r.deductions) : ''} ${r.advance_recovered ? '−adv ' + money(r.advance_recovered) : ''}</span>` },
      { label: 'Paid', cls: 'num', render: (r) => `<strong>${money(r.net)}</strong>` },
      { label: 'On', render: (r) => fmtDate(r.paid_on) },
    ], sal) : empty('No salary paid yet.')}</div>
    <div class="card flush"><div class="card-head"><h2>Advances</h2></div>${adv.length ? table([
      { label: 'Date', render: (r) => fmtDate(r.given_on) },
      { label: 'Amount', cls: 'num', render: (r) => money(r.amount) },
      { label: 'Note', render: (r) => esc(r.note || '') },
      { label: '', render: (r) => r.recovered ? badge('done', 'Recovered') : badge('pending', 'Open') },
    ], adv) : empty('No advances.')}</div>
  </div>` : ''}
  <div class="card flush"><div class="card-head"><h2>Attendance history</h2><a class="small muted" href="#/attendance?tab=month">Monthly report</a></div>${att.length ? table([
    { label: 'Month', render: (r) => monthLabel(r.month) },
    { label: 'Present', cls: 'num', render: (r) => r.present }, { label: 'Absent', cls: 'num', render: (r) => r.absent },
    { label: 'Half day', cls: 'num', render: (r) => r.half_day }, { label: 'Leave', cls: 'num', render: (r) => r.leave },
  ], att) : empty('No attendance marked yet.')}</div>
  <div class="card"><dl class="details">
    <dt>Email</dt><dd>${esc(e.email || '—')}</dd><dt>Date of birth</dt><dd>${fmtDate(e.date_of_birth)}</dd>
    <dt>Emergency</dt><dd>${esc(e.emergency_contact || '—')}</dd><dt>Address</dt><dd>${esc(e.address || '—')}</dd><dt>Notes</dt><dd>${esc(e.notes || '—')}</dd></dl></div>`;

  if (!can.hr()) return;
  $('#edit').onclick = () => employeeForm(e, rerender);
  $('#adv').onclick = () => {
    const md = modal('Give advance', `<form class="form grid">${field('amount', 'Amount (Rs)', { type: 'number', required: true })}${field('given_on', 'Date', { type: 'date', value: today() })}${field('note', 'Note', { span: 2 })}
      ${field('as_expense', 'Also record as an office expense (cash out)', { type: 'checkbox', value: true, span: 2 })}<div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form>`);
    md.querySelector('form').onsubmit = (ev) => {
      ev.preventDefault();
      const d = formData(ev.target); const asExp = d.as_expense; delete d.as_expense;
      d.amount = Number(d.amount); d.employee_id = id;
      guard(ev.submitter, async () => {
        await db.insert('employee_advances', d);
        if (asExp) await db.insert('expenses', { category: 'salaries', department: 'coworking', amount: d.amount, spent_on: d.given_on, employee_id: id, notes: `Advance to ${e.full_name}${d.note ? ' — ' + d.note : ''}`, method: 'cash' });
        closeModal(); toast('Advance saved'); rerender();
      }).catch(() => {});
    };
  };
  $('#pay').onclick = () => {
    const md = modal('Pay salary', `<form class="form grid">
      ${field('month', 'Salary month', { type: 'month', value: today().slice(0, 7), required: true })}${field('paid_on', 'Paid on', { type: 'date', value: today() })}
      ${field('basic', 'Basic (Rs)', { type: 'number', value: e.salary, required: true })}${field('bonus', 'Bonus / overtime', { type: 'number', value: 0 })}
      ${field('deductions', 'Deductions (absents etc.)', { type: 'number', value: 0 })}${field('advance_recovered', 'Recover advance', { type: 'number', value: openAdv })}
      ${field('method', 'Method', { options: METHODS })}${field('note', 'Note')}
      <div class="span-2 total-line" id="net"></div>
      <div class="span-2 form-actions"><button class="btn dark" type="submit">Pay & record</button></div></form>`);
    const f = md.querySelector('form');
    const upd = () => { md.querySelector('#net').innerHTML = `Net pay: <strong>${money(Number(f.basic.value) + Number(f.bonus.value) - Number(f.deductions.value) - Number(f.advance_recovered.value))}</strong>`; };
    f.oninput = upd; upd();
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const d = formData(f);
      const row = { employee_id: id, month: d.month + '-01', basic: Number(d.basic), bonus: Number(d.bonus || 0), deductions: Number(d.deductions || 0), advance_recovered: Number(d.advance_recovered || 0), paid_on: d.paid_on, method: d.method, note: d.note };
      const net = row.basic + row.bonus - row.deductions - row.advance_recovered;
      guard(ev.submitter, async () => {
        await db.insert('salary_payments', row);
        await db.insert('expenses', { category: 'salaries', department: 'coworking', amount: net, spent_on: row.paid_on, employee_id: id, method: row.method, notes: `Salary ${monthLabel(row.month)} — ${e.full_name}` });
        if (row.advance_recovered >= openAdv && openAdv > 0) for (const a of adv.filter((x) => !x.recovered)) await db.update('employee_advances', { id: a.id }, { recovered: true });
        closeModal(); toast('Salary recorded'); rerender();
      }).catch(() => {});
    };
  };
}
