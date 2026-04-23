require('dotenv').config();
const db = require('../db');

async function migrate() {
  console.log('Running migrations...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      logo_url TEXT,
      jobber_token TEXT,
      jobber_refresh_token TEXT,
      jobber_token_expiry TIMESTAMPTZ,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT DEFAULT 'trial',
      trial_ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'staff',  -- 'owner', 'admin', 'staff'
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, email)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      jobber_job_id TEXT,
      jobber_quote_id TEXT,
      property_name TEXT,
      property_address TEXT,
      contact_name TEXT,
      contact_email TEXT,
      inspector_id INTEGER REFERENCES users(id),
      inspection_date DATE,
      status TEXT DEFAULT 'draft',  -- 'draft', 'complete', 'sent'
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inspection_doors (
      id SERIAL PRIMARY KEY,
      inspection_id INTEGER REFERENCES inspections(id) ON DELETE CASCADE,
      door_number INTEGER,
      door_type TEXT,
      door_size TEXT,
      location TEXT,
      overall_condition TEXT,
      findings JSONB DEFAULT '{}',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inspection_deficiencies (
      id SERIAL PRIMARY KEY,
      inspection_id INTEGER REFERENCES inspections(id) ON DELETE CASCADE,
      door_id INTEGER REFERENCES inspection_doors(id) ON DELETE CASCADE,
      severity TEXT DEFAULT 'advisory',  -- 'advisory', 'moderate', 'safety_critical'
      description TEXT NOT NULL,
      recommendation TEXT,
      include_in_quote BOOLEAN DEFAULT false,
      estimated_cost NUMERIC(10,2),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      po_number TEXT NOT NULL,
      vendor_name TEXT NOT NULL,
      po_type TEXT DEFAULT 'supplier',
      status TEXT DEFAULT 'draft',
      delivery_status TEXT DEFAULT 'pending',
      total NUMERIC(10,2) DEFAULT 0,
      project_name TEXT,
      address TEXT,
      customer_po TEXT,
      delivery_date DATE,
      issued_by_id INTEGER REFERENCES users(id),
      approved_by TEXT,
      notes TEXT,
      jobber_job_id TEXT,
      jobber_quote_id TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS po_line_items (
      id SERIAL PRIMARY KEY,
      po_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price NUMERIC(10,2) DEFAULT 0,
      total NUMERIC(10,2) DEFAULT 0,
      hst_mode TEXT DEFAULT 'plus',
      received_quantity INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity TEXT,
      entity_id INTEGER,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('✓ Migrations complete');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
