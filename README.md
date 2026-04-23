# DoorOps 🚪

**Field service & operations platform for overhead door companies.**

Inspections · Deficiency tracking · Purchase orders · Jobber integration · PDF reports

---

## Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (multi-tenant)
- **Auth**: Clerk
- **Billing**: Stripe
- **Hosting**: Railway
- **Mobile**: PWA (iOS + Android installable)

## Getting Started

```bash
cp .env.example .env
# Fill in your credentials

npm install
npm run dev
```

## Structure

```
doorops/
├── server.js          # Entry point
├── db.js              # PostgreSQL connection
├── routes/
│   ├── auth.js        # Login/session
│   ├── companies.js   # Multi-tenant company management
│   ├── inspections.js # Commercial door inspections
│   ├── po.js          # Purchase orders
│   ├── jobber.js      # Jobber integration
│   └── billing.js     # Stripe subscription management
├── middleware/
│   └── tenant.js      # Multi-tenant middleware
├── public/            # Frontend (PWA)
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── manifest.json
└── scripts/
    └── migrate.js     # DB migrations
```
