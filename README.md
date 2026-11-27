# CoLab Point ERP

Management system for CoLab Point (Gujrat): coworking space, digital marketing team and software house.

## What's here

- `web/`: the web app (plain HTML, CSS and JavaScript, no build step). It talks directly to Supabase.
- Database: Supabase project **CoLab Point** (`fwbzugaebdecuypoajvg`). Tables, security rules and scheduled jobs live there.

## Hosting

`web/` is a static site, so any host works:

- **cPanel / own hosting**: upload the *contents* of `web/` to a folder such as `public_html/app` or to a subdomain root (e.g. `app.colabpoint.com`). `.htaccess` adds security headers.
- **Cloudflare Pages**: connect this repo, leave the build command empty, set the output directory to `web`.

After the first deploy, set the app's URL in Supabase → Authentication → URL Configuration → **Site URL**, so that email confirmation and password reset links open the app.

## First login

Create an account in the app with **colabpoint@gmail.com**. That account automatically becomes the owner. Other staff create their own accounts, and the owner gives them a role in Settings → Staff.

## Pages (v2 — coworking only)

- **Overview**: Dashboard (day/night seat map, income chart, renewals, today, needs attention, busy hours), Tasks
- **Members & Space**: Members, Check-in desk, Seat availability (day/night), Meeting rooms, New sign-ups (online joining form + QR), Scan a paper form (photo → OCR → member), Leads, Complaints
- **Finance**: Payments (day-by-day, filters, receipts, CSV), Invoices & dues (WhatsApp reminders), Expenses, Reports
- **Operations**: Staff attendance (daily + monthly report), Employees (salary, advances), Vendors & work done, Stock & pantry, Settings
- **Public**: `/#/join` joining form · Member portal (plan, hours, invoices, report an issue)

## Apps (built automatically)

Every push to `main` that touches `web/`, `mobile/` or `desktop/` runs **Build apps** on GitHub Actions and publishes the downloads on the release **apps-latest**:

- `CoLabPoint-Android.apk` — Android app (Capacitor). Install by allowing "Install unknown apps".
- `CoLabPoint-Setup.exe` / `CoLabPoint-Portable.exe` — Windows desktop app (Electron).
- iPhone / iPad / Mac: open the web app in Safari → Share → *Add to Home Screen* (an App Store build needs an Apple Developer account, $99/year).
- Web app: any browser; Chrome/Edge can also *Install* it as a desktop app.

**Brand sync** (`tools/brand.py`) downloads the logo and colours from colabpoint.com and regenerates the icons in `web/icons` and `web/brand`.

## WordPress plugin

`wordpress/colabpoint-connect` — zip the folder and upload it in WordPress → Plugins → Add New → Upload. Settings → CoLab Point. Shortcodes: `[colabpoint_packages]`, `[colabpoint_enquiry]`, `[colabpoint_join_button]`, `[colabpoint_login_button]`, `[colabpoint_social]`, `[colabpoint_faq]`. Also adds LocalBusiness + Offer + FAQ structured data (JSON-LD) on every page and serves `/llms.txt` (re-save Settings → Permalinks once after activating).

## Configuration

`web/js/config.js` holds the Supabase URL and the publishable key. Both are public by design; data is protected by row-level security in the database.

Brand colours are CSS variables at the top of `web/styles.css`.
