import { db } from '../api.js';
import { $, esc, money, fmtDate, today, table, empty, toast, guard, modal, closeModal, field, formData, badge, waLink, pills } from '../ui.js';
import { vendorsList, bust, can } from '../state.js';
import { METHODS } from './payments.js';

const CATS = [['maintenance', 'Maintenance'], ['electrical', 'Electrical'], ['plumbing', 'Plumbing'], ['it_network', 'IT / Internet'], ['cleaning', 'Cleaning'], ['furniture', 'Furniture'], ['ac', 'AC'], ['painting', 'Painting'], ['other', 'Other']];
const CL = Object.fromEntries(CATS);
const ST = [['requested', 'Requested'], ['in_progress', 'In progress'], ['done', 'Done'], ['cancelled', 'Cancelled']];

function vendorForm(v = {}, onDone) {
  const md = modal(v.id ? 'Edit vendor' : 'New vendor', `<form class="form grid">
    ${field('name', 'Name / company', { required: true, value: v.name, span: 2 })}
    ${field('service', 'Service', { value: v.service, placeholder: 'Electrician, plumber, internet, cleaning…' })}${field('phone', 'Phone', { value: v.phone })}
    ${field('email', 'Email', { value: v.email })}${field('address', 'Address', { value: v.address })}
    ${field('notes', 'Notes', { type: 'textarea', value: v.notes, span: 2 })}
    <div class="span-2 form-actions"><button class="btn dark" type="submit">Save</button></div></form>`);
  md.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    guard(e.submitter, async () => { v.id ? await db.update('vendors', { id: v.id }, formData(e.target)) : await db.insert('vendors', formData(e.target)); bust('vendors'); closeModal(); toast('Saved'); onDone(); }).catch(() => {});
  };
}

export async function workForm(w = {}, onDone) {
  const vs = await vendorsList();
  const md = modal(w.id ? 'Work order' : 'Log work done', `<form class="form grid">
    ${field('title', 'What was done / needs doing', { required: true, value: w.title, span: 2, placeholder: 'e.g. AC gas refill in hall, new socket at desk S-04' })}
    ${field('category', 'Type', { options: CATS, value: w.category })}${field('vendor_id', 'Vendor', { options: [['', '— in-house / none —'], ...vs.map((v) => [v.id, v.name])], value: w.vendor_id })}
    ${field('location', 'Where', { value: w.location })}${field('status', 'Status', { options: ST, value: w.status || 'requested' })}
    ${field('requested_on', 'Requested on', { type: 'date', value: w.requested_on || today() })}${field('completed_on', 'Completed on', { type: 'date', value: w.completed_on })}
    ${field('cost', 'Agreed cost (Rs)', { type: 'number', value: w.cost ?? 0 })}<span></span>
    ${field('description', 'Details', { type: 'textarea', value: w.description, span: 2 })}
    <div class="span-2 form-actions">${w.id && can.finance() && Number(w.cost) > Number(w.paid_amount) ? '<button type="button" class="btn" id="pay">Pay vendor</button>' : ''}<button class="btn dark" type="submit">Save</button></div></form>`, { wide: true });
  const f = md.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = formData(f); d.cost = Number(d.cost || 0);
    if (d.status === 'done' && !d.completed_on) d.completed_on = today();
    guard(e.submitter, async () => { w.id ? await db.update('work_orders', { id: w.id }, d) : await db.insert('work_orders', d); closeModal(); toast('Saved'); onDone(); }).catch(() => {});
  };
  const pay = md.querySelector('#pay');
  if (pay) pay.onclick = () => {
    const due = Number(w.cost) - Number(w.paid_amount);
    const m2 = modal('Pay vendor', `<form class="form grid">${field('amount', 'Amount (Rs)', { type: 'number', value: due, required: true })}${field('method', 'Method', { options: METHODS })}
      ${field('spent_on', 'Date', { type: 'date', value: today() })}<span></span><div class="span-2 form-actions"><button class="btn dark" type="submit">Pay & add to expenses</button></div></form>`);
    m2.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const d = formData(e.target); const amt = Number(d.amount);
      guard(e.submitter, async () => {
        await db.insert('expenses', { category: 'maintenance & repairs', department: 'coworking', amount: amt, spent_on: d.spent_on, method: d.method, vendor_id: w.vendor_id, work_order_id: w.id, notes: w.title });
        await db.update('work_orders', { id: w.id }, { paid_amount: Number(w.paid_amount) + amt });
        closeModal(); toast('Paid and added to expenses'); onDone();
      }).catch(() => {});
    };
  };
}

export default async function vendors({ view, setTitle, actions, rerender }) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const tab = params.get('t') || 'work';
  const st = params.get('s') || 'open';
  setTitle('Vendors & work', 'Every job done in the office — who did it, what it cost and whether it is paid');
  actions(`<button class="btn" id="nv">+ Vendor</button><button class="btn dark" id="nw">+ Log work</button>`);
  const [work, vs] = await Promise.all([
    db.select('work_orders', { select: '*,vendors(name,phone)', order: 'requested_on.desc', limit: 300 }),
    db.select('vendors', { select: '*', order: 'name.asc' }),
  ]);
  const open = work.filter((w) => ['requested', 'in_progress'].includes(w.status));
  const unpaid = work.filter((w) => w.status !== 'cancelled' && Number(w.cost) > Number(w.paid_amount));
  const list = st === 'open' ? open : st === 'unpaid' ? unpaid : work;
  view.innerHTML = `
  <div class="tabs"><a href="#/vendors?t=work" class="${tab === 'work' ? 'active' : ''}">Work done</a><a href="#/vendors?t=vendors" class="${tab === 'vendors' ? 'active' : ''}">Vendors (${vs.length})</a></div>
  ${tab === 'work' ? `
  <div class="stats">
    <div class="stat warn"><small>Open jobs</small><strong>${open.length}</strong></div>
    <div class="stat danger"><small>Unpaid to vendors</small><strong>${money(unpaid.reduce((a, w) => a + Number(w.cost) - Number(w.paid_amount), 0))}</strong></div>
    <div class="stat"><small>Spent on work this month</small><strong>${money(work.filter((w) => (w.completed_on || w.requested_on).slice(0, 7) === today().slice(0, 7)).reduce((a, w) => a + Number(w.paid_amount), 0))}</strong></div>
  </div>
  <div class="card flush"><div class="filters">${pills('s', [['open', 'Open', open.length], ['unpaid', 'Unpaid', unpaid.length], ['all', 'All', work.length]], st)}</div>
    ${list.length ? table([
      { label: 'Job', render: (w) => `<strong>${esc(w.title)}</strong><div class="muted tiny">${esc(CL[w.category])}${w.location ? ' · ' + esc(w.location) : ''}</div>` },
      { label: 'Vendor', render: (w) => esc(w.vendors?.name || 'In-house') },
      { label: 'Date', render: (w) => fmtDate(w.completed_on || w.requested_on) },
      { label: 'Cost', cls: 'num', render: (w) => money(w.cost) },
      { label: 'Paid', cls: 'num', render: (w) => Number(w.paid_amount) >= Number(w.cost) && Number(w.cost) > 0 ? badge('paid', 'Paid') : money(w.paid_amount) },
      { label: '', render: (w) => badge(w.status) },
    ], list, { rowAttr: (w) => `class="clickable" data-w="${w.id}"` }) : empty('Nothing here.')}</div>` : `
  <div class="card flush">${vs.length ? table([
    { label: 'Vendor', render: (v) => `<strong>${esc(v.name)}</strong><div class="muted tiny">${esc(v.service || '')}</div>` },
    { label: 'Phone', render: (v) => v.phone ? `${esc(v.phone)} <a class="chip wa" target="_blank" rel="noopener" href="${waLink(v.phone, 'Assalam-o-Alaikum, this is CoLab Point.')}">WhatsApp</a>` : '—' },
    { label: 'Jobs', cls: 'num', render: (v) => work.filter((w) => w.vendor_id === v.id).length },
    { label: 'Paid total', cls: 'num', render: (v) => money(work.filter((w) => w.vendor_id === v.id).reduce((a, w) => a + Number(w.paid_amount), 0)) },
  ], vs, { rowAttr: (v) => `class="clickable" data-v="${v.id}"` }) : empty('No vendors yet — add your electrician, plumber, internet provider…')}</div>`}`;
  $('#nv').onclick = () => vendorForm({}, rerender);
  $('#nw').onclick = () => workForm({}, rerender);
  view.onclick = (e) => {
    const pl = e.target.closest('[data-pills] .pill'); if (pl) { location.hash = `#/vendors?t=work&s=${pl.dataset.v}`; return; }
    const w = e.target.closest('[data-w]'); if (w) return workForm(work.find((x) => x.id === w.dataset.w), rerender);
    if (e.target.closest('a')) return;
    const v = e.target.closest('[data-v]'); if (v) vendorForm(vs.find((x) => x.id === v.dataset.v), rerender);
  };
}
