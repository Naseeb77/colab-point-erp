import { db, storage } from '../api.js';
import { $, esc, money, fmtDate, today, empty, toast, guard, modal, closeModal, field, formData, pills, downloadCsv, monthLabel } from '../ui.js';
import { can, vendorsList, employeesList, bust } from '../state.js';
import { METHODS } from './payments.js';

export const EXP_CATS = ['rent', 'electricity', 'internet', 'gas & water', 'generator / fuel', 'salaries', 'tea & snacks', 'cleaning', 'maintenance & repairs', 'furniture & equipment', 'stationery & printing', 'marketing', 'software & subscriptions', 'taxes & fees', 'other'];

export async function expenseForm(x = {}, onDone) {
  const [vs, es] = await Promise.all([vendorsList(), employeesList().catch(() => [])]);
  const md = modal(x.id ? 'Edit expense' : 'Add expense', `<form class="form grid">
    ${field('category', 'Category', { required: true, options: EXP_CATS, value: x.category })}
    ${field('amount', 'Amount (Rs)', { type: 'number', required: true, value: x.amount })}
    ${field('spent_on', 'Date', { type: 'date', value: x.spent_on || today(), required: true })}
    ${field('method', 'Paid by', { options: METHODS, value: x.method || 'cash' })}
    ${field('vendor_id', 'Vendor / shop', { options: [['', '—'], ...vs.map((v) => [v.id, `${v.name}${v.service ? ' · ' + v.service : ''}`])], value: x.vendor_id })}
    ${field('vendor', 'Or paid to (name)', { value: x.vendor })}
    ${field('employee_id', 'Spent by (staff)', { options: [['', '—'], ...es.map((e) => [e.id, e.full_name])], value: x.employee_id })}
    <label class="fld"><span>Receipt photo</span><input type="file" name="receipt" accept="image/*,application/pdf" capture="environment"></label>
    ${field('notes', 'Details', { type: 'textarea', value: x.notes, span: 2 })}
    <div class="span-2 form-actions">${x.id && can.admin() ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn dark" type="submit">Save</button></div>
  </form>`, { wide: true });
  const f = md.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = formData(f); const file = f.receipt.files[0]; delete d.receipt;
    d.amount = Number(d.amount); d.department = 'coworking';
    guard(e.submitter, async () => {
      if (file) d.receipt_path = await storage.upload('payment-proofs', `expenses/${Date.now()}-${file.name.replace(/[^\w.]/g, '_')}`, file);
      x.id ? await db.update('expenses', { id: x.id }, d) : await db.insert('expenses', d);
      closeModal(); toast('Expense saved'); onDone?.();
    }).catch(() => {});
  };
  const del = md.querySelector('#del');
  if (del) del.onclick = () => confirm('Delete this expense?') && guard(del, async () => { await db.remove('expenses', { id: x.id }); closeModal(); onDone?.(); });
}

export default async function expenses({ view, setTitle, actions, rerender }) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const month = params.get('m') || today().slice(0, 7);
  const cat = params.get('c') || 'all';
  setTitle('Expenses', `Office running costs for ${monthLabel(month)}`);
  actions(`<input type="month" id="month" value="${month}"><button class="btn" id="exp">Export</button><button class="btn dark" id="add">+ Add expense</button>`);
  const start = `${month}-01`;
  const end = new Date(new Date(start + 'T12:00:00').setMonth(new Date(start + 'T12:00:00').getMonth() + 1)).toISOString().slice(0, 10);
  const [rows, prev] = await Promise.all([
    db.select('expenses', { select: '*,vendors(name)', and: `(spent_on.gte.${start},spent_on.lt.${end})`, order: 'spent_on.desc' }),
    db.select('v_profit_monthly', { select: '*', order: 'month.desc', limit: 6 }),
  ]);
  const sum = (a) => a.reduce((x, r) => x + Number(r.amount), 0);
  const byCat = {};
  rows.forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + Number(r.amount); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const list = cat === 'all' ? rows : rows.filter((r) => r.category === cat);
  const total = sum(rows);
  const thisM = prev.find((p) => p.month.slice(0, 7) === month);

  view.innerHTML = `
  <div class="stats">
    <div class="stat dark"><small>Spent this month</small><strong>${money(total)}</strong><span>${rows.length} entries</span></div>
    <div class="stat"><small>Biggest cost</small><strong>${esc(cats[0]?.[0] || '—')}</strong><span>${cats[0] ? money(cats[0][1]) : ''}</span></div>
    ${thisM ? `<div class="stat good"><small>Income this month</small><strong>${money(thisM.revenue)}</strong><span>collected</span></div>
    <div class="stat ${thisM.profit < 0 ? 'danger' : 'accent'}"><small>Profit</small><strong class="${thisM.profit < 0 ? 'neg' : ''}">${money(thisM.profit)}</strong><span>income − expenses</span></div>` : ''}
  </div>
  <div class="grid-main">
    <div class="card flush">
      <div class="filters">${pills('c', [['all', 'All', rows.length], ...cats.map(([k]) => [k, k, rows.filter((r) => r.category === k).length])], cat)}</div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Paid to</th><th>Mode</th><th class="num">Amount</th></tr></thead><tbody>
        ${list.map((r) => `<tr class="clickable" data-id="${r.id}"><td>${fmtDate(r.spent_on)}</td><td><span class="badge gray">${esc(r.category)}</span>${r.notes ? `<div class="muted tiny">${esc(r.notes.slice(0, 60))}</div>` : ''}</td>
          <td>${esc(r.vendors?.name || r.vendor || '—')}${r.receipt_path ? ' <span class="chip">📎</span>' : ''}</td><td class="small">${esc(r.method || '')}</td><td class="num strong">${money(r.amount)}</td></tr>`).join('')}
      </tbody></table></div>` : empty('No expenses recorded for this month.', '<button class="btn dark" data-add>Add the first one</button>')}
    </div>
    <div class="card"><div class="card-head"><h2>Where the money went</h2></div>
      ${cats.length ? cats.map(([k, v]) => `<div style="margin-bottom:10px"><div class="row between small"><span>${esc(k)}</span><strong>${money(v)}</strong></div><div class="meter"><i style="width:${(v / total) * 100}%"></i></div></div>`).join('') : empty('Nothing yet.')}
      <h4 style="margin-top:16px">Last months</h4>
      ${prev.map((p) => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line-2)"><span>${monthLabel(p.month)}</span><span>${money(p.expenses)} <span class="muted">out</span> · <span class="${p.profit < 0 ? 'neg' : 'pos'}">${money(p.profit)}</span></span></div>`).join('')}
    </div>
  </div>`;
  const go = (patch) => { location.hash = `#/expenses?${new URLSearchParams({ m: month, c: cat, ...patch })}`; };
  $('#month').onchange = (e) => go({ m: e.target.value, c: 'all' });
  $('#add').onclick = () => expenseForm({}, rerender);
  $('#exp').onclick = () => downloadCsv(`expenses-${month}.csv`, rows, [['spent_on', 'Date'], ['category', 'Category'], [(r) => r.vendors?.name || r.vendor, 'Paid to'], ['method', 'Mode'], ['amount', 'Amount'], ['notes', 'Details']]);
  view.onclick = async (e) => {
    const pl = e.target.closest('[data-pills] .pill'); if (pl) return go({ c: pl.dataset.v });
    if (e.target.closest('[data-add]')) return expenseForm({}, rerender);
    const tr = e.target.closest('tr[data-id]'); if (tr) expenseForm(rows.find((r) => r.id === tr.dataset.id), rerender);
  };
  bust('vendors');
}
