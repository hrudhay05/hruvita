# HRUVITA — Fresh Choices. Healthier You.

Modern healthy-food ordering, custom fruit bowl builder, daily breakfast subscriptions, and full-stack management platform built on free-tier MERN infrastructure.

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

## Completed Features

### 1. Customer Storefront & Installable PWA (`frontend/`)
- **Homepage (`/`)**: Editorial hero section, 4 Featured Category image cards, Best Sellers, interactive **Build Your Own Fruit Bowl**, Daily Subscriptions (7 / 15 / 30 days), Why Choose HRUVITA, genuine database-backed Customer Reviews, and full Footer.
- **Explore Menu (`/menu`)**: Real-time search, category chips, vegetarian & availability filters, max price filter, price sorting, and loading skeletons.
- **Product Detail (`/product/:id`)**: High-resolution food photography with fallback, size selector, quantity stepper, ingredients, dietary & allergen tags, favorites toggle, and related items.
- **Build Your Own Bowl (`/build-bowl`)**: Interactive 4-step bowl customizer (size, fruits, superfood toppings, natural dressings) with live server-authoritative pricing (`GET /api/bowl-options`).
- **Daily Subscriptions (`/subscriptions`)**: 7, 15, and 30-day breakfast plans with preferred meal & delivery slot selection, plus Pause/Resume in the Customer Dashboard.
- **Cart & Checkout (`/cart`)**: Supports both catalog items and custom bowls, server-side bill calculation (`POST /api/checkout/quote`), coupon codes (`WELCOME20`, `FRESH50`, `COMBO15`), reward points redemption, saved delivery address picker, delivery date/slot selection, Cash on Delivery, and Razorpay signature/webhook verification.
- **Brand & Legal Pages**: `/about`, `/contact`, `/privacy`, `/terms`, `/refund-policy`.
- **Toast Notifications & Notification Bell**: Clean auto-dismissing toast messages and email/in-app alert center.

### 2. Secure Authentication, Email OTP & Multiple Addresses (`backend/` + `frontend/`)
- **Signup (`/signup`)**: Full name, email validation, duplicate email protection, strong password policy (8+ chars, uppercase, lowercase, number, special character), confirm password, Terms acceptance, and **bcrypt (cost factor 12)** password hashing (`select: false`).
- **Email OTP Verification (`/verify-email`)**: 6-digit plain OTP stored in MongoDB `emailverifications` with 10-minute TTL, locked read-only email field, attempt limits, resend cooldown, Nodemailer SMTP delivery, and celebratory welcome email on verification.
- **2-Step Login (`/login`)**: Email or Username + Password + 6-digit Login OTP verification, Remember Me, HTTP-only access & refresh cookies, refresh-token rotation (`refreshsessions`), brute-force lockout, and logout session invalidation.
- **Forgot & Reset Password (`/forgot-password`, `/reset-password`)**: Cryptographically secure single-use reset token (stored as SHA-256 hash only), 15-minute expiry, and automatic revocation of all active sessions upon reset.
- **Profile Completion (`/complete-profile`)**: Unique username, 10-digit Indian mobile number, gender, and date of birth.
- **Multiple Delivery Addresses (`/addresses`, `/addresses/new`, `/addresses/:id/edit`)**: Separate MongoDB `addresses` collection supporting unlimited addresses per user (`Home`, `Office`, `Hostel`, `Other`), strict cross-user ownership protection, single default address constraint, and **`📍 USE MY CURRENT LOCATION`** GPS + OpenStreetMap Nominatim reverse-geocoding.
- **Customer Dashboard (`/dashboard`, `/account`)**: Welcome header, Order History & Repeat Order, Active Subscriptions (Pause/Resume), Saved Addresses, Favorites, and Account Settings.

### 3. Dedicated Admin Portal (`/admin`)
- Completely separated workspace layout (no customer cart, navbar, or footer) with sidebar navigation:
  - **Overview**: Revenue, active/total orders, catalog count, out-of-stock alerts, customer count.
  - **Orders Management**: Filter and update orders across all **11 statuses**, Call/WhatsApp customer links, printable **Kitchen Slip**, and **Refund** processing.
  - **Products & Categories**: Add/Edit/Delete modal with photo URL support and quick `+5` stock adjustments.
  - **Customers & Audit Logs**: Block/unblock accounts and full admin action trail.

---

## MongoDB Atlas Collections

`users` · `addresses` · `emailverifications` · `refreshsessions` · `products` · `categories` · `subscriptionplans` · `subscriptions` · `deliveryslots` · `coupons` · `orders` · `payments` · `reviews` · `notifications` · `businesssettings` · `auditlogs`

---

## Project Structure

```text
hruvita/
  backend/
    .env.example         Environment variables template
    src/
      server.js          Express app, Helmet, CORS, rate limiting, cookies
      middleware/        JWT + HTTP-only cookie auth, RBAC, NoSQL sanitizer
      models/            Mongoose schemas (User, Address, Order, Product, ...)
      routes/            auth, profile, addresses, catalog, orders, extras, admin
      store/             MongoDB Atlas repository + dev fallback
      utils/             Nodemailer email service (OTP, Welcome, Reset, Alerts)
      scripts/           seedDb.js, testAuthAndAddresses.js
  frontend/
    index.html           Playfair Display + DM Sans fonts, PWA metadata
    src/
      styles/            theme.css, global.css
      context/           ToastContext, AuthContext, CatalogContext, CartContext
      components/        Navbar, Footer, BottomNav, ProductCard, PlanCard, BowlBuilderSection
      pages/             Home, Menu, BuildBowl, ProductDetail, Subscriptions, Cart,
                         Signup, VerifyEmail, Login, ForgotPassword, ResetPassword,
                         CompleteProfile, SavedAddresses, AddressFormPage, Account,
                         Admin, About, Contact, LegalPage
```

---

## Environment Variables (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in your credentials (never commit `.env` to GitHub):

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5174
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/hruvita?retryWrites=true&w=majority
JWT_SECRET=your-strong-access-secret
JWT_REFRESH_SECRET=your-strong-refresh-secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-google-app-password
EMAIL_FROM="HRUVITA <your-email@gmail.com>"
ADMIN_EMAIL=admin@hruvita.com
ADMIN_PASSWORD=Admin@123
```

---

## Run Locally

### 1. Backend API (`http://localhost:5000`)
```bash
cd backend
npm install
npm run dev
```

### 2. Frontend App (`http://localhost:5174`)
```bash
cd frontend
npm install
npm run dev
```

### 3. Production Build & Automated Tests
```bash
# Frontend production + PWA build
cd frontend && npm run build

# 17-step Auth, OTP & Multi-Address MongoDB Atlas test suite
cd backend && node src/scripts/testAuthAndAddresses.js
```
