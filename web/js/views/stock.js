import { db } from '../api.js';
import { $, esc, money, num, fmtDateTime, today, table, empty, toast, guard, modal, closeModal, field, formData, pills } from '../ui.js';

const CATS = [['pantry', 'Pantry'], ['office', 'Office'], ['cleaning', 'Cleaning'], ['it', 'IT'], ['other', 'Other']];

function itemForm(i = {}, done) {
  const md = modal(i.id ? 'Edit item' : 'New stock item', `<form class="form grid">
    ${field('name', 'Item', { required: true, value: i.name, placeholder: 'Sugar, tea, coffee, A4 paper, tissue…' })}${field('category', 'Category', { options: CATS, value: i.category })}
    ${field('unit', 'Unit', { value: i.unit || 'pcs', placeholder: 'kg, pcs, packs, litres' })}${field('min_qty', 'Warn me when below', { type: 'number', value: i.min_qty ?? 0, step: '0.01' })}
    ${i.id ? '' : field('qty', 'Current quantity', { type: 'number', value: 0, step: '0.01' })}${field('cost_per_unit', 'Cost per unit (Rs)', { type: 'number', value: i.cost_per_unit })}
    <div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form>`);
  md.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const d = formData(e.target); d.min_qty = Number(d.min_qty || 0); d.cost_per_unit = d.cost_per_unit ? Number(d.cost_per_unit) : null;
    if (!i.id) d.qty = Number(d.qty || 0);
    guard(e.submitter, async () => { i.id ? await db.update('stock_items', { id: i.id }, d) : await db.insert('stock_items', d); closeModal(); done(); }).catch(() => {});
  };
}

function moveForm(i, kind, done) {
  const md = modal(`${kind === 'in' ? 'Stock in' : 'Stock out'} · ${i.name}`, `<form class="form grid">
    ${field('qty', `Quantity (${i.unit})`, { type: 'number', required: true, step: '0.01' })}
    ${kind === 'in' ? field('unit_cost', 'Cost per unit (Rs)', { type: 'number', value: i.cost_per_unit }) : '<span></span>'}
    ${field('note', kind === 'in' ? 'Bought from / note' : 'Used for / note', { span: 2 })}
    ${kind === 'in' ? field('as_expense', 'Also add the cost to expenses', { type: 'checkbox', value: true, span: 2 }) : ''}
    <div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form>`);
  md.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const d = formData(e.target); const asExp = d.as_expense; delete d.as_expense;
    d.qty = Number(d.qty); d.unit_cost = d.unit_cost ? Number(d.unit_cost) : null; d.item_id = i.id; d.kind = kind;
    if (kind === 'out' && d.qty > Number(i.qty)) return toast(`Only ${num(i.qty)} ${i.unit} in stock`, 'err');
    guard(e.submitter, async () => {
      await db.insert('stock_moves', d);
      if (asExp && d.unit_cost) await db.insert('expenses', { category: i.category === 'pantry' ? 'tea & snacks' : i.category === 'cleaning' ? 'cleaning' : 'stationery & printing', department: 'coworking', amount: d.qty * d.unit_cost, spent_on: today(), notes: `${i.name} × ${d.qty} ${i.unit}${d.note ? ' — ' + d.note : ''}`, method: 'cash' });
      closeModal(); toast('Stock updated'); done();
    }).catch(() => {});
  };
}

export default async function stock({ view, setTitle, actions, rerender }) {
  const cat = new URLSearchParams(location.hash.split('?')[1] || '').get('c') || 'all';
  setTitle('Stock & pantry', 'Tea, coffee, sugar, stationery and cleaning supplies — with low-stock warnings');
  actions('<button class="btn dark" id="add">+ Item</button>');
  const [items, moves] = await Promise.all([
    db.select('stock_items', { select: '*', active: 'eq.true', order: 'name.asc' }),
    db.select('stock_moves', { select: '*,stock_items(name,unit)', order: 'moved_at.desc', limit: 30 }),
  ]);
  const low = items.filter((i) => Number(i.qty) <= Number(i.min_qty));
  const list = cat === 'all' ? items : cat === 'low' ? low : items.filter((i) => i.category === cat);
  const monthOut = moves.filter((m) => m.kind === 'out' && m.moved_at.slice(0, 7) === today().slice(0, 7));
  view.innerHTML = `
  ${low.length ? `<div class="card soft"><div class="row between"><div><strong>Low stock</strong><div class="muted small">${low.filter((i) => Number(i.qty) <= 0).length} finished · ${low.filter((i) => Number(i.qty) > 0).length} running low</div></div></div>
    <div class="chips" style="margin-top:10px">${low.map((i) => `<span class="chip">● ${esc(i.name)} <span class="badge amber">${num(i.qty)} ${esc(i.unit)} left</span></span>`).join('')}</div></div>` : ''}
  <div class="grid-main">
    <div class="card flush"><div class="filters">${pills('c', [['all', 'All', items.length], ['low', 'Low', low.length], ...CATS.map(([k, l]) => [k, l, items.filter((i) => i.category === k).length]).filter((x) => x[2])], cat)}</div>
      ${list.length ? table([
        { label: 'Item', render: (i) => `<strong>${esc(i.name)}</strong><div class="muted tiny">${esc(i.category)}</div>` },
        { label: 'In stock', cls: 'num', render: (i) => `<strong class="${Number(i.qty) <= Number(i.min_qty) ? 'neg' : ''}">${num(i.qty, 2)}</strong> <span class="muted small">${esc(i.unit)}</span>` },
        { label: 'Min', cls: 'num', render: (i) => num(i.min_qty, 2) },
        { label: 'Value', cls: 'num', render: (i) => i.cost_per_unit ? money(i.qty * i.cost_per_unit) : '—' },
        { label: '', cls: 'right', render: (i) => `<button class="btn xs" data-in="${i.id}">+ In</button> <button class="btn xs" data-out="${i.id}">− Out</button> <button class="btn xs ghost" data-edit="${i.id}">Edit</button>` },
      ], list) : empty('No items yet.', '<button class="btn dark" data-add>Add tea, sugar, paper…</button>')}
    </div>
    <div class="card flush"><div class="card-head"><h2>Recent movements</h2><span class="muted small">${monthOut.length} uses this month</span></div>
      <div class="list">${moves.map((m) => `<div class="li"><span class="badge ${m.kind === 'in' ? 'green' : 'gray'}">${m.kind === 'in' ? 'IN' : 'OUT'}</span><div class="grow"><strong>${esc(m.stock_items?.name)}</strong> <span class="muted">${num(m.qty, 2)} ${esc(m.stock_items?.unit)}</span><div class="meta">${fmtDateTime(m.moved_at)}${m.note ? ' · ' + esc(m.note) : ''}</div></div></div>`).join('') || empty('No movements yet.')}</div>
    </div>
  </div>`;
  $('#add').onclick = () => itemForm({}, rerender);
  view.onclick = (e) => {
    const pl = e.target.closest('[data-pills] .pill'); if (pl) { location.hash = `#/stock?c=${pl.dataset.v}`; return; }
    if (e.target.closest('[data-add]')) return itemForm({}, rerender);
    const b = e.target.closest('button'); if (!b) return;
    const it = items.find((i) => i.id === (b.dataset.in || b.dataset.out || b.dataset.edit));
    if (b.dataset.in) moveForm(it, 'in', rerender);
    else if (b.dataset.out) moveForm(it, 'out', rerender);
    else if (b.dataset.edit) itemForm(it, rerender);
  };
}
