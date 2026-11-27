import { db } from '../api.js';
import { $, esc, money, fmtDate, fmtTime, today, empty, toast, guard, modal, closeModal, field, formData, pills, periodRange, downloadCsv, initials } from '../ui.js';
import { can, state } from '../state.js';
import { recordPayment } from './billing.js';
import { searchFilter } from './checkin.js';

export const METHODS = [['cash', 'Cash'], ['bank_transfer', 'Bank'], ['jazzcash', 'JazzCash'], ['easypaisa', 'Easypaisa'], ['card', 'Card'], ['cheque', 'Cheque'], ['other', 'Other']];
const ML = Object.fromEntries(METHODS);

// Pick a member → pay an open invoice, or record a quick sale (day pass, room, printing…)
export function recordPaymentPicker(onDone, preset = null) {
  const md = modal('Record payment', `<div class="form">
    <label class="fld"><span>Member</span><input id="pp-q" placeholder="Search name, phone or #" autocomplete="off"><div class="pick" id="pp-pick"></div></label>
    <div id="pp-body"></div></div>`, { wide: true });
  let t;
  const q = md.querySelector('#pp-q');
  const show = async (m) => {
    q.value = m.full_name; md.querySelector('#pp-pick').innerHTML = '';
    const inv = await db.select('invoices', { select: '*', member_id: `eq.${m.id}`, status: 'in.(unpaid,partial,overdue)', order: 'due_date.asc' });
    md.querySelector('#pp-body').innerHTML = `
      ${inv.length ? `<h4>Open invoices</h4><div class="list">${inv.map((i) => `<div class="li"><div class="grow"><strong>${esc(i.invoice_no)}</strong><div class="meta">due ${fmtDate(i.due_date)} · balance ${money(i.total - i.amount_paid)}</div></div><button class="btn sm dark" data-inv="${i.id}">Pay</button></div>`).join('')}</div>` : '<p class="muted small">No open invoices for this member.</p>'}
      <h4 style="margin-top:14px">Or a quick sale (paid now)</h4>
      <form class="form grid" id="qs">
        ${field('description', 'For', { required: true, placeholder: 'Day pass, meeting room 2h, printing, advance…', span: 2 })}
        ${field('amount', 'Amount (Rs)', { type: 'number', required: true })}
        ${field('method', 'Method', { options: METHODS })}
        ${field('reference', 'Reference / Txn ID', { span: 2 })}
        <div class="span-2 form-actions"><button class="btn dark" type="submit">Save payment</button></div>
      </form>`;
    md.querySelector('#pp-body').onclick = (e) => {
      const b = e.target.closest('[data-inv]'); if (!b) return;
      recordPayment(inv.find((x) => x.id === b.dataset.inv), onDone);
    };
    md.querySelector('#qs').onsubmit = (e) => {
      e.preventDefault();
      const f = formData(e.target); const amt = Number(f.amount);
      guard(e.submitter, async () => {
        const [i] = await db.insert('invoices', { member_id: m.id, department: 'coworking', due_date: today(), subtotal: amt });
        await db.insert('invoice_items', { invoice_id: i.id, description: f.description, unit_price: amt });
        const [p] = await db.insert('payments', { invoice_id: i.id, amount: amt, method: f.method, reference: f.reference, notes: f.description });
        closeModal(); toast(`Saved · receipt ${p.receipt_no}`); onDone?.();
      }).catch(() => {});
    };
  };
  q.oninput = () => {
    clearTimeout(t);
    const v = q.value.trim(); if (v.length < 2) return;
    t = setTimeout(async () => {
      const rows = await db.select('members', { select: 'id,full_name,phone,member_no', or: searchFilter(v), limit: 6 });
      md.querySelector('#pp-pick').innerHTML = rows.map((r) => `<button type="button" data-id="${r.id}">${esc(r.full_name)} <span class="muted">#${r.member_no} · ${esc(r.phone)}</span></button>`).join('') || '<span class="muted small" style="padding:8px">No match</span>';
      md.querySelector('#pp-pick').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) show(rows.find((r) => r.id === b.dataset.id)); };
    }, 220);
  };
  if (preset) show(preset);
}

export function printReceipt(p) {
  const s = state.settings || {};
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return toast('Allow pop-ups to print receipts', 'err');
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(p.receipt_no)}</title><style>
    body{font-family:Inter,system-ui,sans-serif;padding:24px;color:#1d1c19} h1{font-size:18px;margin:0} .m{color:#777;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:16px} td{padding:6px 0;border-bottom:1px solid #eee;font-size:13px} td:last-child{text-align:right}
    .tot{font-size:20px;font-weight:700;text-align:right;margin-top:14px} .logo{width:40px;height:40px;border-radius:50%}
  </style></head><body>
    <div><img src="${location.origin}/brand/wordmark-dark.png" alt="" style="height:38px"><div style="margin-top:8px"><h1>${esc(s.name || 'CoLab Point')}</h1><div class="m">${esc(s.address || '')}<br>${esc(s.phone || '')} · ${esc(s.email || '')}</div></div></div>
    <h2 style="margin:20px 0 4px;font-size:15px">Payment receipt</h2><div class="m">${esc(p.receipt_no)} · ${fmtDate(p.paid_at)} ${fmtTime(p.paid_at)}</div>
    <table><tr><td>Received from</td><td>${esc(p.who)}</td></tr><tr><td>Invoice</td><td>${esc(p.invoices?.invoice_no || '')}</td></tr>
    <tr><td>Method</td><td>${esc(ML[p.method] || p.method)}${p.reference ? ' · ' + esc(p.reference) : ''}</td></tr>${p.notes ? `<tr><td>Note</td><td>${esc(p.notes)}</td></tr>` : ''}</table>
    <div class="tot">${money(p.amount)}</div><p class="m" style="margin-top:30px">Thank you for being part of ${esc(s.name || 'CoLab Point')}.</p>
    <script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}

export default async function payments({ view, setTitle, actions, rerender }) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const period = params.get('p') || 'month';
  const method = params.get('m') || 'all';
  const [from, to] = periodRange(period, params.get('f'), params.get('t'));
  setTitle('Payments', `${fmtDate(from)} – ${fmtDate(to)}`);
  actions(`<button class="btn" id="exp">Export</button><a class="btn" href="#/billing">Invoices & dues</a><button class="btn dark" id="add">+ Add payment</button>`);
  const rows = await db.select('payments', {
    select: 'id,receipt_no,amount,method,reference,notes,paid_at,invoice_id,invoices(invoice_no,member_id,members(full_name,phone),clients(name))',
    and: `(paid_at.gte.${from}T00:00:00+05:00,paid_at.lte.${to}T23:59:59+05:00)`,
    order: 'paid_at.desc', limit: 1000,
  });
  rows.forEach((r) => { r.who = r.invoices?.members?.full_name || r.invoices?.clients?.name || '—'; });
  const q = (params.get('q') || '').toLowerCase();
  const list = rows.filter((r) => (method === 'all' || r.method === method) && (!q || [r.who, r.receipt_no, r.invoices?.invoice_no, r.reference, r.notes].join(' ').toLowerCase().includes(q)));
  const sum = (a) => a.reduce((x, r) => x + Number(r.amount), 0);
  const total = sum(list), cash = sum(list.filter((r) => r.method === 'cash'));
  const digital = total - cash;
  const counts = Object.fromEntries(METHODS.map(([k]) => [k, rows.filter((r) => r.method === k).length]));

  const groups = {};
  list.forEach((r) => { const d = new Date(r.paid_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }); (groups[d] ||= []).push(r); });

  view.innerHTML = `
  <div class="stats">
    <div class="stat dark"><small>Total received</small><strong>${money(total)}</strong><span>${list.length} payments</span></div>
    <div class="stat"><small>Cash</small><strong>${money(cash)}</strong><span>${total ? Math.round((cash / total) * 100) : 0}% of received</span></div>
    <div class="stat"><small>Bank & digital</small><strong>${money(digital)}</strong><span>${total ? Math.round((digital / total) * 100) : 0}% of received</span></div>
    <div class="stat accent"><small>Average payment</small><strong>${money(list.length ? total / list.length : 0)}</strong><span>in this period</span></div>
  </div>
  <div class="card flush">
    <div class="filters">
      ${pills('m', [['all', 'All', rows.length], ...METHODS.filter(([k]) => counts[k]).map(([k, l]) => [k, l, counts[k]])], method, 'Mode')}
      <div class="row wrap between">
        ${pills('p', [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['year', 'This year'], ['custom', 'Custom']], period, 'Period')}
        <div class="toolbar">${period === 'custom' ? `<input type="date" id="f" value="${from}"><input type="date" id="t" value="${to}"><button class="btn sm dark" id="apply">Apply</button>` : ''}
          <input class="search" id="q" placeholder="Search member, receipt, invoice, note…" value="${esc(params.get('q') || '')}"></div>
      </div>
    </div>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Member</th><th>Mode</th><th>For</th><th>Receipt</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${Object.entries(groups).map(([d, rs]) => `<tr class="group"><td colspan="5">${new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</td><td class="num">${money(sum(rs))}</td><td></td></tr>
        ${rs.map((r) => `<tr><td>${fmtTime(r.paid_at)}</td>
          <td><div class="row"><span class="avatar sm">${esc(initials(r.who))}</span>${r.invoices?.member_id ? `<a class="link" href="#/members/${r.invoices.member_id}">${esc(r.who)}</a>` : esc(r.who)}</div></td>
          <td><span class="badge ${r.method === 'cash' ? 'gray' : 'green'}">${esc(ML[r.method] || r.method)}</span></td>
          <td class="small">${esc(r.notes || r.invoices?.invoice_no || '')}${r.reference ? `<div class="muted tiny">${esc(r.reference)}</div>` : ''}</td>
          <td class="small">${esc(r.receipt_no)}</td>
          <td class="num strong">${money(r.amount)}</td>
          <td class="right"><button class="btn xs" data-print="${r.id}">Receipt</button>${can.admin() ? ` <button class="btn xs danger" data-del="${r.id}">Delete</button>` : ''}</td></tr>`).join('')}`).join('')}
    </tbody></table></div>` : empty('No payments in this period.')}
  </div>`;

  const go = (patch) => {
    const p = new URLSearchParams({ p: period, m: method, q: params.get('q') || '', ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    location.hash = `#/payments?${p}`;
  };
  view.onclick = async (e) => {
    const pl = e.target.closest('[data-pills] .pill');
    if (pl) return go({ [pl.parentElement.dataset.pills]: pl.dataset.v });
    if (e.target.id === 'apply') return go({ p: 'custom', f: $('#f').value, t: $('#t').value });
    const pr = e.target.closest('[data-print]');
    if (pr) return printReceipt(list.find((r) => r.id === pr.dataset.print));
    const del = e.target.closest('[data-del]');
    if (del && confirm('Delete this payment? The invoice will become unpaid again.')) {
      await guard(del, () => db.remove('payments', { id: del.dataset.del })); toast('Payment deleted'); rerender();
    }
  };
  let t;
  $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => go({ q: e.target.value }), 500); };
  $('#add').onclick = () => recordPaymentPicker(rerender);
  $('#exp').onclick = () => downloadCsv(`payments-${from}-to-${to}.csv`, list, [[(r) => fmtDate(r.paid_at), 'Date'], [(r) => fmtTime(r.paid_at), 'Time'], ['who', 'Member'], [(r) => ML[r.method], 'Mode'], ['amount', 'Amount'], ['receipt_no', 'Receipt'], [(r) => r.invoices?.invoice_no, 'Invoice'], ['reference', 'Reference'], ['notes', 'Note']]);
}
