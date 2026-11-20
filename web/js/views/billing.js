import { db } from '../api.js';
import { $, esc, money, fmtDate, fmtDateTime, today, table, empty, toast, guard, modal, closeModal, field, formData, badge, waLink, fillTemplate } from '../ui.js';
import { templates, can } from '../state.js';

const METHODS = [['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['jazzcash', 'JazzCash'], ['easypaisa', 'Easypaisa'], ['card', 'Card'], ['cheque', 'Cheque'], ['other', 'Other']];
export { addExpense };

export async function reminderText(name, inv) {
  const t = await templates();
  const overdue = inv.due_date < today();
  const tpl = t.find((x) => x.channel === 'whatsapp' && x.key === (overdue ? 'payment_overdue' : 'payment_due'));
  return fillTemplate(tpl?.body || 'Assalam-o-Alaikum {{name}}, your CoLab Point payment of PKR {{amount}} is due on {{due_date}}.', {
    name, amount: Number(inv.total - inv.amount_paid).toLocaleString('en-PK'), due_date: fmtDate(inv.due_date), invoice_no: inv.invoice_no,
  });
}

export function recordPayment(inv, onDone) {
  const bal = Number(inv.total) - Number(inv.amount_paid);
  const md = modal(`Record payment · ${inv.invoice_no}`, `<form class="form grid">
    <p class="span-2 muted">Balance due: <strong>${money(bal)}</strong></p>
    ${field('amount', 'Amount (Rs)', { type: 'number', value: bal, required: true })}
    ${field('method', 'Method', { options: METHODS, value: 'cash' })}
    ${field('reference', 'Transaction ID / reference', { span: 2 })}
    ${field('notes', 'Notes', { span: 2 })}
    <div class="span-2 form-actions"><button class="btn primary" type="submit">Save payment</button></div>
  </form>`);
  md.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const f = formData(e.target);
    f.amount = Number(f.amount); f.invoice_id = inv.id;
    guard(e.submitter, async () => {
      const [p] = await db.insert('payments', f);
      closeModal(); toast(`Payment saved · receipt ${p.receipt_no}`); onDone?.();
    }).catch(() => {});
  };
}

function newInvoice(onDone) {
  const md = modal('New invoice', `<form class="form grid">
    <input type="hidden" name="who" value="member">
    <label class="fld"><span>Member *</span><input name="q" placeholder="Name or phone" autocomplete="off" required><div class="pick" id="pick"></div></label>
    <input type="hidden" name="department" value="coworking">
    ${field('due_date', 'Due date', { type: 'date', value: today(), required: true })}
    ${field('description', 'Description', { required: true, span: 2, placeholder: 'e.g. Day pass, meeting room 2 hours, locker, late fee' })}
    ${field('quantity', 'Quantity', { type: 'number', value: 1, step: '0.5' })}
    ${field('unit_price', 'Unit price (Rs)', { type: 'number', required: true })}
    ${field('discount', 'Discount (Rs)', { type: 'number', value: 0 })}
    <div class="span-2 form-actions"><button class="btn primary" type="submit">Create invoice</button></div>
  </form>`, { wide: true });
  const f = md.querySelector('form');
  let picked = null, t;
  f.q.oninput = () => {
    clearTimeout(t); picked = null;
    const q = f.q.value.replace(/[(),*]/g, ' ').trim();
    if (q.length < 2) return ($('#pick', md).innerHTML = '');
    t = setTimeout(async () => {
      const table_ = f.who.value === 'member' ? 'members' : 'clients';
      const rows = await db.select(table_, { select: 'id,' + (table_ === 'members' ? 'full_name,phone' : 'name,phone'), or: `(${table_ === 'members' ? 'full_name' : 'name'}.ilike.*${q}*,phone.ilike.*${q}*)`, limit: 6 });
      $('#pick', md).innerHTML = rows.map((r) => `<button type="button" data-id="${r.id}">${esc(r.full_name || r.name)} <span class="muted">${esc(r.phone || '')}</span></button>`).join('') || '<span class="muted small">No match</span>';
    }, 250);
  };
  $('#pick', md).onclick = (e) => {
    const b = e.target.closest('button[data-id]'); if (!b) return;
    picked = b.dataset.id; f.q.value = b.textContent.trim(); $('#pick', md).innerHTML = '';
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!picked) return toast('Pick a customer from the list', 'err');
    const d = formData(f);
    const qty = Number(d.quantity || 1), price = Number(d.unit_price);
    guard(e.submitter, async () => {
      const [inv] = await db.insert('invoices', {
        [d.who === 'member' ? 'member_id' : 'client_id']: picked, department: d.department, due_date: d.due_date,
        subtotal: qty * price, discount: Number(d.discount || 0),
      });
      await db.insert('invoice_items', { invoice_id: inv.id, description: d.description, quantity: qty, unit_price: price });
      closeModal(); toast(`Invoice ${inv.invoice_no} created`); onDone();
    }).catch(() => {});
  };
}

function addExpense(onDone) {
  const md = modal('Add expense', `<form class="form grid">
    ${field('category', 'Category', { required: true, options: ['rent', 'electricity', 'internet', 'salaries', 'snacks & tea', 'maintenance', 'marketing / ads', 'software & tools', 'other'] })}
    ${field('department', 'Department', { options: [['general', 'General'], ['coworking', 'Coworking'], ['marketing', 'Marketing'], ['software', 'Software house']] })}
    ${field('amount', 'Amount (Rs)', { type: 'number', required: true })}
    ${field('spent_on', 'Date', { type: 'date', value: today() })}
    ${field('vendor', 'Paid to')}
    ${field('method', 'Method', { options: METHODS })}
    ${field('notes', 'Notes', { span: 2 })}
    <div class="span-2 form-actions"><button class="btn primary" type="submit">Save</button></div></form>`);
  md.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const f = formData(e.target); f.amount = Number(f.amount);
    guard(e.submitter, async () => { await db.insert('expenses', f); closeModal(); toast('Expense saved'); onDone(); }).catch(() => {});
  };
}

export default async function billing({ view, setTitle, actions, rerender }) {
  setTitle('Invoices & dues', 'Unpaid invoices, reminders and recent activity');
  actions(`<a class="btn" href="#/payments">All payments</a><button class="btn" id="exp">+ Expense</button><button class="btn dark" id="inv">+ Invoice</button>`);
  const monthStart = today().slice(0, 8) + '01';
  const [due, queue, pays, exps] = await Promise.all([
    db.select('v_outstanding', { select: '*', order: 'due_date.asc' }),
    db.select('notifications', { select: 'id,recipient,template_key,reminder_date,invoice_id,members(full_name,phone,whatsapp),invoices(invoice_no,total,amount_paid,due_date)', channel: 'eq.whatsapp', status: 'eq.queued', order: 'scheduled_for.asc', limit: 50 }),
    db.select('payments', { select: 'id,receipt_no,amount,method,paid_at,reference,invoices(invoice_no,department,members(full_name),clients(name))', order: 'paid_at.desc', limit: 25 }),
    db.select('expenses', { select: '*', spent_on: `gte.${monthStart}`, order: 'spent_on.desc' }),
  ]);
  const totalDue = due.reduce((a, r) => a + Number(r.balance), 0);
  const monthPaid = pays.filter((p) => p.paid_at.slice(0, 7) === today().slice(0, 7)).reduce((a, p) => a + Number(p.amount), 0);
  const monthExp = exps.reduce((a, r) => a + Number(r.amount), 0);

  view.innerHTML = `
  <div class="stats">
    <div class="stat danger"><small>Outstanding</small><strong>${money(totalDue)}</strong><span>${due.length} invoices</span></div>
    <div class="stat"><small>Recent collections (this month)</small><strong>${money(monthPaid)}</strong><span>from last 25 payments</span></div>
    <div class="stat"><small>Expenses this month</small><strong>${money(monthExp)}</strong><span>${exps.length} entries</span></div>
    <div class="stat ${queue.length ? 'warn' : ''}"><small>WhatsApp reminders</small><strong>${queue.length}</strong><span>ready to send</span></div>
  </div>

  ${queue.length ? `<div class="card"><div class="card-head"><h2>Reminders to send</h2><span class="muted small">tap Send — WhatsApp opens with the message ready</span></div>
    ${table([
      { label: 'Member', render: (r) => esc(r.members?.full_name) },
      { label: 'Invoice', render: (r) => `${esc(r.invoices?.invoice_no)} · ${money(r.invoices ? r.invoices.total - r.invoices.amount_paid : 0)}` },
      { label: 'Type', render: (r) => r.template_key === 'payment_overdue' ? '<span class="badge red">overdue</span>' : '<span class="badge amber">due soon</span>' },
      { label: '', cls: 'right', render: (r) => `<button class="btn sm primary" data-send="${r.id}">Send</button> <button class="btn sm ghost" data-skip="${r.id}">Skip</button>` },
    ], queue)}</div>` : ''}

  <div class="card flush"><div class="card-head pad"><h2>Unpaid invoices</h2></div>
    ${due.length ? table([
      { label: 'Invoice', render: (r) => `${esc(r.invoice_no)}<br><span class="muted small">${esc(r.department)}</span>` },
      { label: 'Customer', render: (r) => `${esc(r.customer)}<br><span class="muted small">${esc(r.phone || '')}</span>` },
      { label: 'Due', render: (r) => `${fmtDate(r.due_date)}${r.days_overdue ? `<br><span class="badge red">${r.days_overdue}d late</span>` : ''}` },
      { label: 'Total', cls: 'num', render: (r) => money(r.total) },
      { label: 'Balance', cls: 'num', render: (r) => `<strong>${money(r.balance)}</strong>` },
      { label: '', cls: 'right', render: (r) => `<button class="btn sm primary" data-pay="${r.id}">Pay</button> <button class="btn sm" data-wa="${r.id}">WhatsApp</button>` },
    ], due) : empty('No unpaid invoices. 🎉')}
  </div>

  <div class="grid-2">
    <div class="card flush"><div class="card-head pad"><h2>Recent payments</h2></div>
      ${pays.length ? table([
        { label: 'Receipt', render: (r) => `${esc(r.receipt_no)}<br><span class="muted small">${fmtDateTime(r.paid_at)}</span>` },
        { label: 'From', render: (r) => esc(r.invoices?.members?.full_name || r.invoices?.clients?.name || '') },
        { label: 'Method', render: (r) => `<span class="chip">${esc(r.method.replace('_', ' '))}</span>` },
        { label: 'Amount', cls: 'num', render: (r) => money(r.amount) },
      ], pays) : empty('No payments yet.')}
    </div>
    <div class="card flush"><div class="card-head pad"><h2>Expenses this month</h2></div>
      ${exps.length ? table([
        { label: 'Date', render: (r) => fmtDate(r.spent_on) },
        { label: 'Category', render: (r) => `${esc(r.category)}<br><span class="muted small">${esc(r.vendor || '')}</span>` },
        { label: 'Amount', cls: 'num', render: (r) => money(r.amount) },
      ], exps) : empty('No expenses this month.')}
    </div>
  </div>`;

  $('#inv').onclick = () => newInvoice(rerender);
  $('#exp').onclick = () => addExpense(rerender);
  view.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pay) {
      const inv = await db.one('invoices', { select: '*', id: `eq.${b.dataset.pay}` });
      recordPayment(inv, rerender);
    } else if (b.dataset.wa) {
      const r = due.find((x) => x.id === b.dataset.wa);
      const inv = await db.one('invoices', { select: '*', id: `eq.${r.id}` });
      window.open(waLink(r.phone, await reminderText(r.customer, inv)), '_blank', 'noopener');
    } else if (b.dataset.send) {
      const n = queue.find((x) => x.id === b.dataset.send);
      window.open(waLink(n.recipient || n.members?.whatsapp || n.members?.phone, await reminderText(n.members.full_name, n.invoices)), '_blank', 'noopener');
      await db.update('notifications', { id: n.id }, { status: 'sent', sent_at: new Date().toISOString() });
      b.closest('tr').remove();
    } else if (b.dataset.skip) {
      await db.update('notifications', { id: b.dataset.skip }, { status: 'skipped' });
      b.closest('tr').remove();
    }
  };
}
