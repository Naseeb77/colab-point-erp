// Public joining form — no login needed. Share the link or QR at reception.
import { db } from '../api.js';
import { esc, money, field, formData, guard, toast, waLink } from '../ui.js';

export default async function join(root) {
  document.body.className = 'public';
  let plans = [], org = {};
  try { [plans, org] = await Promise.all([db.select('plans', { select: 'id,name,price,billing_period', order: 'sort_order.asc' }), db.one('org_settings', { select: 'name,phone,address' })]); } catch { /* offline */ }
  org ||= {};
  root.innerHTML = `<div class="join-card">
    <div class="brand big"><span class="logo-mark">C</span><div><strong>${esc(org.name || 'CoLab Point')}</strong><small>Membership joining form</small></div></div>
    <form class="form grid" id="join-form">
      ${field('full_name', 'Full name', { required: true, span: 2 })}
      ${field('phone', 'Mobile number', { required: true, placeholder: '03xx xxxxxxx' })}${field('whatsapp', 'WhatsApp (if different)')}
      ${field('email', 'Email', { type: 'email' })}${field('cnic', 'CNIC', { placeholder: '34201-xxxxxxx-x' })}
      ${field('profession', 'Profession', { placeholder: 'Freelancer, developer, designer, student…' })}${field('company', 'Company (optional)')}
      ${field('date_of_birth', 'Date of birth', { type: 'date' })}${field('shift_pref', 'Preferred shift', { options: [['day', 'Day'], ['night', 'Night'], ['full', 'Full day']] })}
      ${field('interested_plan_id', 'Package', { options: [['', 'Not sure yet'], ...plans.map((p) => [p.id, `${p.name}${p.price ? ` — ${money(p.price)} / ${p.billing_period}` : ''}`])], span: 2 })}
      ${field('address', 'Address', { span: 2 })}
      ${field('emergency_contact_name', 'Emergency contact name')}${field('emergency_contact_phone', 'Emergency contact phone')}
      ${field('how_heard', 'How did you hear about us?', { options: ['', 'Facebook', 'Instagram', 'Google', 'Friend / referral', 'Walk-in', 'YouTube', 'LinkedIn', 'Other'], span: 2 })}
      ${field('tracking_consent', 'I agree that my check-in / check-out times may be recorded (fingerprint, camera or WiFi) to track my usage.', { type: 'checkbox', span: 2 })}
      ${field('terms_accepted', 'I agree to follow CoLab Point’s rules and pay my dues on time.', { type: 'checkbox', span: 2 })}
      <div class="span-2"><button class="btn dark block" type="submit">Submit</button></div>
    </form></div>`;
  const f = root.querySelector('#join-form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = formData(f);
    if (!d.terms_accepted) return toast('Please accept the rules to continue', 'err');
    d.source = 'online'; d.status = 'pending';
    guard(e.submitter, async () => {
      await db.insertQuiet('registrations', d);
      root.querySelector('.join-card').innerHTML = `<div class="brand big"><span class="logo-mark">C</span><div><strong>${esc(org.name || 'CoLab Point')}</strong><small>Thank you!</small></div></div>
        <h2 style="font-size:22px">Shukriya, ${esc(d.full_name.split(' ')[0])}! 🎉</h2>
        <p class="muted">Your details have reached our front desk. We will confirm your seat and share the payment details shortly.</p>
        ${org.phone ? `<a class="btn dark" target="_blank" rel="noopener" href="${waLink(org.phone, `Assalam-o-Alaikum, I just filled the joining form. My name is ${d.full_name}.`)}">Message us on WhatsApp</a>` : ''}
        ${org.address ? `<p class="small muted">${esc(org.address)}</p>` : ''}`;
    }).catch(() => {});
  };
}
