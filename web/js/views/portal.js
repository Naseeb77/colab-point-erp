// Member self-service portal (role = member)
import { db, auth } from '../api.js';
import { esc, money, num, fmtDate, fmtTime, dur, table, empty, badge, modal, closeModal, field, formData, guard, toast } from '../ui.js';
import { state } from '../state.js';

export default async function portal(root) {
  document.body.className = 'portal';
  const m = await db.one('members', { select: '*', profile_id: `eq.${state.profile.id}` });
  const header = `<header class="portal-head"><div class="brand"><img class="wordmark" src="/brand/wordmark-dark.png" alt="CoLab Point" style="height:30px"></div><button class="btn ghost sm" id="logout">Sign out</button></header>`;
  if (!m) {
    root.innerHTML = `${header}<main class="portal-main"><div class="card"><h2>Welcome, ${esc(state.profile.full_name || '')}</h2>
      <p>Your account isn't linked to a membership yet. Please ask the CoLab Point front desk to link it.</p></div></main>`;
  } else {
    const [ms, sessions, invoices, usage] = await Promise.all([
      db.select('memberships', { select: '*,plans(name,daily_hour_limit)', member_id: `eq.${m.id}`, order: 'end_date.desc', limit: 5 }),
      db.select('attendance_sessions', { select: '*', member_id: `eq.${m.id}`, order: 'check_in.desc', limit: 15 }),
      db.select('invoices', { select: '*', member_id: `eq.${m.id}`, order: 'issue_date.desc', limit: 10 }),
      db.select('v_member_monthly_usage', { select: '*', member_id: `eq.${m.id}`, order: 'month.desc', limit: 1 }),
    ]);
    const cur = ms.find((x) => x.status === 'active');
    const due = invoices.filter((i) => ['unpaid', 'partial', 'overdue'].includes(i.status));
    root.innerHTML = `${header}<main class="portal-main">
      <h2>Hi ${esc(m.full_name.split(' ')[0])} 👋</h2>
      <div class="stats">
        <div class="stat accent"><small>Your plan</small><strong>${esc(cur?.plans?.name || '—')}</strong><span>${cur ? `valid until ${fmtDate(cur.end_date)}` : 'No active plan'}</span></div>
        <div class="stat"><small>Hours this month</small><strong>${num(usage[0]?.total_hours ?? 0)}</strong><span>${usage[0]?.days_visited ?? 0} days</span></div>
        <div class="stat ${due.length ? 'danger' : ''}"><small>Amount due</small><strong>${money(due.reduce((a, i) => a + (i.total - i.amount_paid), 0))}</strong><span>${due.length ? `due ${fmtDate(due[0].due_date)}` : 'All paid ✓'}</span></div>
      </div>
      <div class="card"><div class="card-head"><h2>Member ID</h2><button class="btn sm" id="issue">Report an issue</button></div><p class="member-code">#${m.member_no}</p><p class="muted small">Show this at the front desk to check in.</p></div>
      <div class="card flush"><div class="card-head pad"><h2>Recent visits</h2></div>
        ${sessions.length ? table([
          { label: 'Date', render: (r) => fmtDate(r.check_in) },
          { label: 'In', render: (r) => fmtTime(r.check_in) },
          { label: 'Out', render: (r) => r.check_out ? fmtTime(r.check_out) : 'inside' },
          { label: 'Time', render: (r) => dur(r.duration_minutes) },
        ], sessions) : empty('No visits yet.')}</div>
      <div class="card flush"><div class="card-head pad"><h2>Invoices</h2></div>
        ${invoices.length ? table([
          { label: 'Invoice', key: 'invoice_no' },
          { label: 'Due', render: (r) => fmtDate(r.due_date) },
          { label: 'Amount', cls: 'num', render: (r) => money(r.total) },
          { label: '', render: (r) => badge(r.status) },
        ], invoices) : empty('No invoices yet.')}</div>
    </main>`;
  }
  const iss = root.querySelector('#issue');
  if (iss) iss.onclick = () => {
    const md = modal('Report an issue or idea', `<form class="form">${field('subject', 'What is wrong?', { required: true, placeholder: 'WiFi slow, AC not cooling…' })}
      ${field('category', 'Type', { options: [['internet', 'Internet / WiFi'], ['power', 'Power'], ['ac', 'AC / fans'], ['cleaning', 'Cleaning'], ['furniture', 'Furniture'], ['billing', 'Billing'], ['general', 'Idea / other']] })}
      ${field('description', 'Details', { type: 'textarea' })}<div class="form-actions"><button class="btn dark" type="submit">Send</button></div></form>`);
    md.querySelector('form').onsubmit = (e) => { e.preventDefault(); const d = formData(e.target); d.member_id = m.id;
      guard(e.submitter, async () => { await db.insertQuiet('tickets', d); closeModal(); toast('Sent to the front desk. Thank you!'); }).catch(() => {}); };
  };
  root.querySelector('#logout').onclick = async () => { await auth.signOut(); location.reload(); };
}
