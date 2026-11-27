// Scan a paper joining form: photo → stored → OCR (free, runs on the phone/PC) → pre-filled member form.
import { db, storage } from '../api.js';
import { $, esc, toast, guard, field, formData, empty } from '../ui.js';
import { state } from '../state.js';

const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
let tessLoading;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  tessLoading ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = TESS; s.onload = () => res(window.Tesseract); s.onerror = () => rej(new Error('Could not load the text reader. Check the internet connection.'));
    document.head.appendChild(s);
  });
  return tessLoading;
}

// Shrink + increase contrast for better OCR and smaller uploads
async function prepare(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  const color = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  const d = g.getImageData(0, 0, c.width, c.height); const p = d.data;
  for (let i = 0; i < p.length; i += 4) { const y = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; const v = y > 150 ? 255 : y < 90 ? 0 : (y - 90) * 4.25; p[i] = p[i + 1] = p[i + 2] = v; }
  g.putImageData(d, 0, 0);
  return { color, ocrCanvas: c };
}

// Pull fields out of the recognised text
export function parseForm(text) {
  const t = text.replace(/[|]/g, 'I');
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = {};
  const after = (re) => { for (const l of lines) { const m = l.match(re); if (m && m[1] && m[1].trim().length > 1) return m[1].trim().replace(/^[:\-–.\s]+/, ''); } return null; };
  out.cnic = (t.match(/\b(\d{5})[\s\-–]?(\d{7})[\s\-–]?(\d)\b/) || []).slice(1).join('-') || null;
  const phones = [...t.matchAll(/(?:\+?92|0)\s?3\d{2}[\s\-–]?\d{7}\b/g)].map((m) => m[0].replace(/[\s\-–]/g, '').replace(/^\+?92/, '0'));
  out.phone = phones[0] || null;
  out.email = (t.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [])[0]?.toLowerCase() || null;
  out.full_name = after(/(?:full\s*name|name)\s*[:\-–.]?\s*(.+)/i);
  out.profession = after(/(?:profession|occupation|designation)\s*[:\-–.]?\s*(.+)/i);
  out.company = after(/(?:company|organi[sz]ation|business)\s*[:\-–.]?\s*(.+)/i);
  out.address = after(/(?:address)\s*[:\-–.]?\s*(.+)/i);
  out.emergency_contact_name = after(/emergency\s*(?:contact)?\s*(?:name)?\s*[:\-–.]?\s*([A-Za-z][A-Za-z .]+)/i);
  out.emergency_contact_phone = phones.find((p) => p !== out.phone) || null;
  const dob = t.match(/(?:birth|d\.?o\.?b)[^\d]{0,15}(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})/i);
  if (dob) { const y = dob[3].length === 2 ? (Number(dob[3]) > 30 ? '19' : '20') + dob[3] : dob[3]; out.date_of_birth = `${y}-${dob[2].padStart(2, '0')}-${dob[1].padStart(2, '0')}`; }
  if (out.full_name) out.full_name = out.full_name.replace(/[^A-Za-z .'-]/g, '').replace(/\s+/g, ' ').trim();
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

export function printBlankForm() {
  const s = state.settings || {};
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print', 'err');
  const row = (l) => `<div class="r"><b>${l}:</b><span></span></div>`;
  w.document.write(`<!DOCTYPE html><html><head><title>Joining form</title><style>
    body{font-family:Arial,sans-serif;padding:28px;color:#111} h1{margin:0;font-size:22px} .m{color:#555;font-size:12px;margin-bottom:18px}
    .r{display:flex;gap:10px;align-items:flex-end;margin:16px 0;font-size:15px} .r b{white-space:nowrap} .r span{flex:1;border-bottom:1.5px solid #333;height:22px}
    .hint{background:#e9f4fb;padding:8px 10px;border-radius:6px;font-size:12px} .box{display:inline-block;width:14px;height:14px;border:1.5px solid #333;margin-right:6px;vertical-align:-2px}
  </style></head><body>
  <img src="${location.origin}/brand/wordmark-dark.png" alt="" style="height:44px"><h1 style="margin-top:10px">${(s.name || 'CoLab Point')} — Membership Form</h1><div class="m">${s.address || ''} · ${s.phone || ''}</div>
  <div class="hint">Please write in CAPITAL LETTERS and keep numbers clear — this form is read by a scanner.</div>
  ${['Full name', 'Phone', 'WhatsApp', 'Email', 'CNIC', 'Date of birth (DD/MM/YYYY)', 'Profession', 'Company', 'Address', 'Emergency contact name', 'Emergency phone'].map(row).join('')}
  <div class="r"><b>Package:</b> &nbsp;<span style="border:0"><i class="box"></i>Shared &nbsp; <i class="box"></i>Dedicated desk &nbsp; <i class="box"></i>Office &nbsp; <i class="box"></i>Day &nbsp; <i class="box"></i>Night</span></div>
  <p style="font-size:12px;margin-top:22px"><i class="box"></i>I agree that my check-in / check-out may be recorded. &nbsp; <i class="box"></i>I agree to the space rules.</p>
  <div class="r" style="margin-top:36px"><b>Signature:</b><span></span><b>Date:</b><span></span></div>
  <script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}

export default async function scan({ view, setTitle, actions }) {
  setTitle('Scan a joining form', 'Take a photo of the paper form — the details are read and filled in for you to check.');
  actions('<button class="btn" id="blank">Print blank form</button><a class="btn" href="#/registrations">Online form & QR</a>');
  $('#blank').onclick = printBlankForm;
  view.innerHTML = `
  <div class="grid-2">
    <div class="card">
      <label class="scan-drop" id="drop"><span class="big-ic">📷</span><strong>Take photo / choose image</strong><span class="muted small">Lay the form flat in good light. One page at a time.</span>
        <input type="file" id="file" accept="image/*" capture="environment" class="hide"></label>
      <div id="pv" style="margin-top:12px"></div>
    </div>
    <div class="card" id="result">${empty('The member details will appear here after the photo is read.')}</div>
  </div>
  <p class="muted small">Text reading runs on this device with free software (Tesseract). It reads printed and clear block-capital writing well; joined-up handwriting may need correcting — always check before saving. The photo is kept with the member's record.</p>`;

  $('#file').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const { color, ocrCanvas } = await prepare(file);
    const url = URL.createObjectURL(color);
    $('#pv').innerHTML = `<img class="scan-preview" src="${url}" alt="Form photo"><div style="margin-top:10px"><div class="progress"><i id="bar"></i></div><p class="muted small" id="stat">Reading the form…</p></div>`;
    let text = '';
    try {
      const T = await loadTesseract();
      const res = await T.recognize(ocrCanvas, 'eng', { logger: (m) => { if (m.status === 'recognizing text') { $('#bar').style.width = `${Math.round(m.progress * 100)}%`; } $('#stat').textContent = `${m.status}…`; } });
      text = res.data.text || '';
      $('#stat').textContent = 'Done — please check the details.';
      $('#bar').style.width = '100%';
    } catch (err) { $('#stat').textContent = err.message + ' You can still type the details.'; }
    const x = parseForm(text);
    $('#result').innerHTML = `<div class="card-head"><h2>Check & save</h2><span class="badge ${Object.keys(x).length > 3 ? 'green' : 'amber'}">${Object.keys(x).length} fields found</span></div>
      <form class="form grid" id="mf">
        ${field('full_name', 'Full name', { required: true, value: x.full_name, span: 2 })}
        ${field('phone', 'Phone', { required: true, value: x.phone })}${field('email', 'Email', { type: 'email', value: x.email })}
        ${field('cnic', 'CNIC', { value: x.cnic })}${field('date_of_birth', 'Date of birth', { type: 'date', value: x.date_of_birth })}
        ${field('profession', 'Profession', { value: x.profession })}${field('company', 'Company', { value: x.company })}
        ${field('address', 'Address', { value: x.address, span: 2 })}
        ${field('emergency_contact_name', 'Emergency contact', { value: x.emergency_contact_name })}${field('emergency_contact_phone', 'Emergency phone', { value: x.emergency_contact_phone })}
        ${field('tracking_consent', 'Consent box ticked on the form', { type: 'checkbox', span: 2 })}
        <div class="span-2 form-actions"><button class="btn dark" type="submit">Save member & attach form</button></div>
      </form>
      <details style="margin-top:12px"><summary class="small muted">Text read from the photo</summary><div class="ocr-text">${esc(text || '(nothing read)')}</div></details>`;
    $('#mf').onsubmit = (ev) => {
      ev.preventDefault();
      const d = formData(ev.target); d.lead_source = 'walk-in'; d.status = 'lead';
      if (d.tracking_consent) d.tracking_consent_at = new Date().toISOString();
      guard(ev.submitter, async () => {
        const [m] = await db.insert('members', d);
        const path = `${new Date().toISOString().slice(0, 7)}/${m.id}-${Date.now()}.jpg`;
        await storage.upload('form-scans', path, color);
        await db.insert('form_scans', { member_id: m.id, image_path: path, ocr_text: text, extracted: x });
        toast('Member saved with the scanned form');
        location.hash = `#/members/${m.id}`;
      }).catch(() => {});
    };
  };
}
