import { db, storage } from '../api.js';
import { $, esc, fmtDate, fmtDateTime, empty, toast, guard, badge, waLink, pills } from '../ui.js';

export function joinUrl() { return `${location.origin}${location.pathname}#/join`; }

export default async function registrations({ view, setTitle, actions, rerender, refreshBadges }) {
  const st = new URLSearchParams(location.hash.split('?')[1] || '').get('s') || 'pending';
  setTitle('New sign-ups', 'Joining forms filled online or scanned at the desk');
  actions('<a class="btn" href="#/scan">Scan a paper form</a><button class="btn dark" id="share">Share joining form</button>');
  const [rows, scans] = await Promise.all([
    db.select('registrations', { select: '*,plans:interested_plan_id(name)', order: 'created_at.desc', limit: 200 }),
    db.select('form_scans', { select: 'id,image_path,created_at,member_id,members(full_name)', order: 'created_at.desc', limit: 12 }),
  ]);
  const list = rows.filter((r) => st === 'all' || r.status === st);
  view.innerHTML = `
  <div class="card soft"><div class="row wrap between"><div class="grow"><strong>Let new members fill the form themselves</strong>
    <p class="muted small">Share this link on WhatsApp or print the QR at reception. Entries appear here for you to approve.</p>
    <div class="row wrap" style="margin-top:8px"><input readonly value="${esc(joinUrl())}" style="max-width:380px" id="ju"><button class="btn sm" id="copy">Copy</button>
      <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Join CoLab Point — fill the form here: ' + joinUrl())}">Send on WhatsApp</a></div></div>
    <img class="qr" alt="QR code for the joining form" src="https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(joinUrl())}"></div></div>
  <div class="toolbar">${pills('s', [['pending', 'Pending', rows.filter((r) => r.status === 'pending').length], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All', rows.length]], st)}</div>
  <div class="grid-2">${list.map((r) => `<div class="card"><div class="row between"><div><h3>${esc(r.full_name)}</h3><span class="muted small">${fmtDateTime(r.created_at)} · ${esc(r.source)}</span></div>${badge(r.status)}</div>
    <dl class="details" style="margin-top:10px">
      <dt>Phone</dt><dd>${esc(r.phone)} ${r.phone ? `<a class="chip wa" target="_blank" rel="noopener" href="${waLink(r.whatsapp || r.phone, `Assalam-o-Alaikum ${r.full_name}, thank you for filling the CoLab Point joining form.`)}">WhatsApp</a>` : ''}</dd>
      ${r.email ? `<dt>Email</dt><dd>${esc(r.email)}</dd>` : ''}${r.cnic ? `<dt>CNIC</dt><dd>${esc(r.cnic)}</dd>` : ''}
      <dt>Profession</dt><dd>${esc([r.profession, r.company].filter(Boolean).join(' · ') || '—')}</dd>
      <dt>Wants</dt><dd>${esc(r.plans?.name || 'Not sure')} · ${esc(r.shift_pref || '—')} shift</dd>
      ${r.date_of_birth ? `<dt>Birthday</dt><dd>${fmtDate(r.date_of_birth)}</dd>` : ''}${r.how_heard ? `<dt>Heard via</dt><dd>${esc(r.how_heard)}</dd>` : ''}
      <dt>Tracking consent</dt><dd>${r.tracking_consent ? '✓ yes' : 'no'}</dd></dl>
    <div class="form-actions">${r.status === 'pending' ? `<button class="btn danger sm" data-rej="${r.id}">Reject</button><button class="btn dark sm" data-ok="${r.id}">Approve → create member</button>` : r.member_id ? `<a class="btn sm" href="#/members/${r.member_id}">Open member</a>` : ''}</div></div>`).join('') || `<div class="card span-2">${empty('No sign-ups here.')}</div>`}</div>
  ${scans.length ? `<div class="card flush"><div class="card-head"><h2>Scanned paper forms</h2></div><div class="list">${scans.map((s) => `<div class="li"><span class="avatar sm">📄</span><div class="grow"><strong>${esc(s.members?.full_name || 'Not linked')}</strong><div class="meta">${fmtDateTime(s.created_at)}</div></div><button class="btn xs" data-img="${esc(s.image_path)}">View form</button>${s.member_id ? `<a class="btn xs" href="#/members/${s.member_id}">Member</a>` : ''}</div>`).join('')}</div></div>` : ''}`;
  $('#copy').onclick = () => { navigator.clipboard?.writeText(joinUrl()).then(() => toast('Link copied')).catch(() => { $('#ju').select(); }); };
  $('#share').onclick = () => $('#ju').scrollIntoView({ behavior: 'smooth' });
  view.onclick = async (e) => {
    const pl = e.target.closest('[data-pills] .pill'); if (pl) { location.hash = `#/registrations?s=${pl.dataset.v}`; return; }
    const ok = e.target.closest('[data-ok]');
    if (ok) return guard(ok, async () => { const id = await db.rpc('approve_registration', { p_id: ok.dataset.ok }); toast('Member created — now assign a plan'); refreshBadges(); location.hash = `#/members/${id}`; });
    const rej = e.target.closest('[data-rej]');
    if (rej) { await guard(rej, () => db.update('registrations', { id: rej.dataset.rej }, { status: 'rejected' })); refreshBadges(); return rerender(); }
    const img = e.target.closest('[data-img]');
    if (img) guard(img, async () => window.open(await storage.signedUrl('form-scans', img.dataset.img), '_blank', 'noopener'));
  };
}
