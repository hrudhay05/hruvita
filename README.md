# HRUVITA — Fresh Choices. Healthier You.

Complete healthy-food ordering, custom fruit bowl builder, daily breakfast subscriptions, Telugu & English voice assistant, and full-stack admin platform built on a 100% free-tier MERN architecture.

---

## Brand & Design System

- **Typography**: `Playfair Display` (headings) + `DM Sans` (body)
- **Color Palette** (`frontend/src/styles/theme.css`):
  - Primary: Deep Forest Green (`#245C45`)
  - Secondary: Fresh Green (`#70A86B`)
  - Background: Warm Cream (`#FFF9EF`)
  - Surface / Cards: Pure White (`#FFFFFF`)
  - Accent: Soft Peach (`#F4B59A`)
  - Text: Dark Charcoal (`#292D29`), Muted (`#777C75`), Borders (`#EAE7DE`)
- **CSS Architecture**: Plain `.css` stylesheets per component/page (no CSS Modules or Tailwind).

---

## All 8 Phases Completed

### Phase 1 — Customer Storefront & Installable PWA (`frontend/`)
- **Homepage (`/`)**: Editorial hero section, 4 Featured Category image cards, Best Sellers, interactive **Build Your Own Fruit Bowl**, Daily Subscriptions (7 / 15 / 30 days), Why Choose HRUVITA, genuine database-backed Customer Reviews, and full Footer.
- **Explore Menu (`/menu`)** & **Product Detail (`/product/:id`)**: Search, category chips, vegetarian/availability filters, price sort, size selector, quantity stepper, ingredients, allergen tags, favorites, and loading skeletons.
- **Brand & Legal Pages**: `/about`, `/contact`, `/privacy`, `/terms`, `/refund-policy`.

### Phase 2 — Secure Authentication, 2-Step Email OTP & Multiple Addresses
- **Signup (`/signup`)**: Full name, email validation, duplicate email protection, strong password policy (8+ chars, uppercase, lowercase, number, special character), confirm password, Terms acceptance, and **bcrypt (cost 12)** password hashing (`select: false`).
- **Email OTP Verification (`/verify-email`)**: 6-digit plain OTP in MongoDB `emailverifications` (10-minute TTL), locked read-only email field, attempt & resend limits, Nodemailer Gmail SMTP delivery, and celebratory welcome email.
- **2-Step Login (`/login`)**: Email or Username + Password + 6-digit Login OTP verification, Remember Me, HTTP-only access & refresh cookies, refresh-token rotation (`refreshsessions`), brute-force lockout, and logout session invalidation.
- **Forgot & Reset Password (`/forgot-password`, `/reset-password`)**: Cryptographically secure single-use reset token (stored as SHA-256 hash only) and automatic revocation of all active sessions upon reset.
- **Profile Completion (`/complete-profile`)** & **Multiple Delivery Addresses (`/addresses`, `/addresses/new`, `/addresses/:id/edit`)**: Separate MongoDB `addresses` collection (`Home`, `Office`, `Hostel`, `Other`), strict cross-user ownership checks, single default address, and **`📍 USE MY CURRENT LOCATION`** GPS + OpenStreetMap Nominatim reverse-geocoding.

### Phase 3 & 4 — Cart, Checkout, Custom Fruit Bowls & Subscriptions
- **Build Your Own Bowl (`/build-bowl`)**: Interactive 4-step bowl customizer connected to server-authoritative pricing (`GET /api/bowl-options`).
- **Daily Breakfast Subscriptions (`/subscriptions`)**: 7, 15, and 30-day plans with preferred meal & slot selection, plus Pause/Resume in Customer Dashboard (`/dashboard`).
- **Cart & Checkout (`/cart`)**: Supports both catalog items and custom bowls, server-side bill calculation (`POST /api/checkout/quote`), coupons (`WELCOME20`, `FRESH50`, `COMBO15`), reward points redemption, delivery slots, Cash on Delivery, and Razorpay signature/webhook verification.

### Phase 5 — Full Dedicated Admin Portal (`/admin`)
- Separated sidebar workspace (no customer cart, navbar, or footer):
  - **Overview** & **Orders Management** (all 11 statuses, Call/WhatsApp customer links, printable Kitchen Slip, Refunds).
  - **Kitchen Prep View**: Tomorrow's pre-orders & active subscriptions grouped by delivery slot with total quantities to prepare.
  - **Products & Categories Manager** + **Coupons Manager**.
  - **Reports & Free CSV Export** (Orders, Inventory, Customers).
  - **Store Settings & Delivery Slots Capacity** + **Customers** + **Audit Logs**.

### Phase 6 — Free Telugu & English Voice Assistant
- **Floating Voice & Chat Drawer (`VoiceButton.jsx`)**: Browser Web Speech API (`te-IN` Telugu & `en-IN` Indian English), speech synthesis with interruption & mute toggle, typed chat fallback, and quick chips.
- **Safe Fixed-Tool Backend (`POST /api/assistant/chat`)**: Supports Groq (`GROQ_API_KEY`) or Gemini (`GEMINI_API_KEY`) free tier + built-in Telugu/English fallback, voice-to-cart ordering, and MongoDB `conversations` history with Admin On/Off & instruction controls.

### Phase 7 & 8 — Automation Cron Jobs, Free Backups & Deployment
- **Backend Cron Jobs (`backend/src/jobs/scheduler.js`)**: Daily 10 PM subscription order generator + renewal reminders, 8 AM low-stock admin email alerts, and 15-minute abandoned unpaid order cleanup (`automationlogs`).
- **n8n Blueprint**: Ready-to-import `automation/n8n-daily-sales-report.json`.
- **Weekly GitHub Actions Backup**: `.github/workflows/weekly-backup.yml` + `backend/src/scripts/backupDb.js` (runs every Sunday at 02:00 UTC using `MONGODB_URI` GitHub Secret).
- **Free Hosting & Android APK Ready**: `render.yaml` (Render free tier), `frontend/vercel.json` (Vercel / Cloudflare Pages), and `frontend/capacitor.config.json` (Capacitor Android APK wrapper).

---

## Run Locally

```bash
# 1. Backend API (http://localhost:5000)
cd backend
npm install
npm run dev

# 2. Frontend App (http://localhost:5174)
cd frontend
npm install
npm run dev
```

### Build Android APK (Capacitor — Free)
```bash
cd frontend
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```

### Automated Tests & Database Backup
```bash
# 17-step Auth, OTP & Multi-Address MongoDB Atlas integration test
cd backend && node src/scripts/testAuthAndAddresses.js

# Manual MongoDB JSON backup
cd backend && node src/scripts/backupDb.js
```
