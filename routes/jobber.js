const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/tenant');
const axios = require('axios');

const JOBBER_CLIENT_ID = process.env.JOBBER_CLIENT_ID;
const JOBBER_CLIENT_SECRET = process.env.JOBBER_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;
const REDIRECT_URI = `${APP_URL}/api/jobber/callback`;
const JOBBER_API = 'https://api.getjobber.com/api/graphql';

// ─── Helper: get tokens for this company ──────────────────────────────────────
async function getTokens(companyId) {
  const result = await db.query(
    'SELECT jobber_access_token, jobber_refresh_token, jobber_token_expires_at FROM companies WHERE id = $1',
    [companyId]
  );
  return result.rows[0] || null;
}

// ─── Helper: refresh access token ────────────────────────────────────────────
async function refreshToken(companyId, refreshToken) {
  try {
    const resp = await axios.post('https://api.getjobber.com/api/oauth/token', {
      client_id: JOBBER_CLIENT_ID,
      client_secret: JOBBER_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });
    const { access_token, refresh_token, expires_in } = resp.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    await db.query(
      'UPDATE companies SET jobber_access_token=$1, jobber_refresh_token=$2, jobber_token_expires_at=$3 WHERE id=$4',
      [access_token, refresh_token || refreshToken, expiresAt, companyId]
    );
    return access_token;
  } catch (err) {
    console.error('[jobber/refresh]', err.response?.data || err.message);
    return null;
  }
}

// ─── Helper: GraphQL query ────────────────────────────────────────────────────
async function jobberQuery(companyId, query, variables = {}) {
  let tokens = await getTokens(companyId);
  if (!tokens?.jobber_access_token) throw new Error('Not connected to Jobber');

  // Refresh if expired or expiring soon
  const expiresAt = new Date(tokens.jobber_token_expires_at);
  const needsRefresh = !tokens.jobber_token_expires_at || expiresAt < new Date(Date.now() + 5 * 60 * 1000);
  let accessToken = tokens.jobber_access_token;

  if (needsRefresh && tokens.jobber_refresh_token) {
    accessToken = await refreshToken(companyId, tokens.jobber_refresh_token);
    if (!accessToken) throw new Error('Token refresh failed — reconnect Jobber');
  }

  const resp = await axios.post(JOBBER_API, { query, variables }, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-JOBBER-GRAPHQL-VERSION': '2024-11-15'
    }
  });

  if (resp.data.errors) {
    console.error('[jobber/query errors]', resp.data.errors);
    throw new Error(resp.data.errors[0]?.message || 'Jobber API error');
  }

  return resp.data.data;
}

// ─── OAuth: Start ─────────────────────────────────────────────────────────────
router.get('/connect', requireAuth, (req, res) => {
  const state = Buffer.from(JSON.stringify({ companyId: req.companyId, userId: req.user.id })).toString('base64');
  const url = `https://api.getjobber.com/api/oauth/authorize?` +
    `client_id=${JOBBER_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=code&` +
    `state=${state}`;
  res.redirect(url);
});

// ─── OAuth: Callback ──────────────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.send(`<!DOCTYPE html><html><body><script>if(window.opener){window.opener.postMessage({jobber:'error'},'${APP_URL}');window.close();}else{window.location='/#settings';}<\/script></body></html>`);

  try {
    const { companyId } = JSON.parse(Buffer.from(state, 'base64').toString());

    const tokenResp = await axios.post('https://api.getjobber.com/api/oauth/token', {
      client_id: JOBBER_CLIENT_ID,
      client_secret: JOBBER_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI
    });

    const { access_token, refresh_token, expires_in } = tokenResp.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    await db.query(
      'UPDATE companies SET jobber_access_token=$1, jobber_refresh_token=$2, jobber_token_expires_at=$3 WHERE id=$4',
      [access_token, refresh_token, expiresAt, companyId]
    );

    // Close popup and notify parent window
    res.send(`<!DOCTYPE html><html><body><script>
      if (window.opener) {
        window.opener.postMessage({ jobber: 'connected' }, '${APP_URL}');
        window.close();
      } else {
        window.location = '/#settings';
      }
    <\/script><p>Jobber connected! You can close this window.</p></body></html>`);
  } catch (err) {
    console.error('[jobber/callback]', err.response?.data || err.message);
    res.send(`<!DOCTYPE html><html><body><script>if(window.opener){window.opener.postMessage({jobber:'error'},'${APP_URL}');window.close();}else{window.location='/#settings';}<\/script><p>Connection failed. Close this window and try again.</p></body></html>`);
  }
});

// ─── OAuth: Disconnect ────────────────────────────────────────────────────────
router.post('/disconnect', requireAuth, async (req, res) => {
  await db.query(
    'UPDATE companies SET jobber_access_token=NULL, jobber_refresh_token=NULL, jobber_token_expires_at=NULL WHERE id=$1',
    [req.companyId]
  );
  res.json({ ok: true });
});

// ─── Status: is connected? ────────────────────────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  const tokens = await getTokens(req.companyId);
  res.json({ connected: !!tokens?.jobber_access_token });
});

// ─── GET today's jobs ─────────────────────────────────────────────────────────
router.get('/jobs/today', requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const data = await jobberQuery(req.companyId, `
      query TodayJobs($start: ISO8601DateTime!, $end: ISO8601DateTime!) {
        jobs(filter: { startAt: { gte: $start, lte: $end } }, first: 50) {
          nodes {
            id
            jobNumber
            title
            jobStatus
            startAt
            endAt
            client {
              id
              name
              emails { address }
              phones { number }
            }
            property {
              id
              address {
                street
                city
                province
                postalCode
              }
            }
          }
        }
      }
    `, { start: `${today}T00:00:00Z`, end: `${today}T23:59:59Z` });

    const jobs = (data?.jobs?.nodes || []).map(j => ({
      id: j.id,
      job_number: j.jobNumber,
      title: j.title,
      status: j.jobStatus,
      client_name: j.client?.name || '',
      client_email: j.client?.emails?.[0]?.address || '',
      client_phone: j.client?.phones?.[0]?.number || '',
      property_address: j.property?.address
        ? [j.property.address.street, j.property.address.city, j.property.address.province, j.property.address.postalCode].filter(Boolean).join(', ')
        : '',
      start_at: j.startAt,
      end_at: j.endAt
    }));

    res.json(jobs);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Search clients ───────────────────────────────────────────────────────────
router.get('/clients/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);

  try {
    const data = await jobberQuery(req.companyId, `
      query SearchClients($q: String!) {
        clients(filter: { name: { like: $q } }, first: 10) {
          nodes {
            id
            name
            emails { address }
            phones { number }
            properties {
              id
              address {
                street
                city
                province
                postalCode
              }
            }
          }
        }
      }
    `, { q: `%${q}%` });

    const clients = (data?.clients?.nodes || []).map(c => ({
      id: c.id,
      name: c.name,
      email: c.emails?.[0]?.address || '',
      phone: c.phones?.[0]?.number || '',
      properties: (c.properties || []).map(p => ({
        id: p.id,
        address: p.address ? [p.address.street, p.address.city, p.address.province, p.address.postalCode].filter(Boolean).join(', ') : ''
      }))
    }));

    res.json(clients);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Create quote from deficiencies ──────────────────────────────────────────
router.post('/quote', requireAuth, async (req, res) => {
  const { inspection_id } = req.body;
  if (!inspection_id) return res.status(400).json({ error: 'inspection_id required' });

  try {
    // Load inspection + deficiencies
    const insp = await db.query(
      'SELECT * FROM inspections WHERE id = $1 AND company_id = $2',
      [inspection_id, req.companyId]
    );
    if (!insp.rows.length) return res.status(404).json({ error: 'Inspection not found' });
    const i = insp.rows[0];

    const defs = await db.query(
      'SELECT * FROM inspection_deficiencies WHERE inspection_id = $1 AND include_in_quote = true',
      [inspection_id]
    );

    if (!defs.rows.length) return res.status(400).json({ error: 'No deficiencies marked for quote' });

    // Build line items
    const lineItems = defs.rows.map(d => ({
      name: d.description.slice(0, 100),
      description: d.recommendation || '',
      unitPrice: parseFloat(d.estimated_cost) || 0,
      quantity: 1
    }));

    const data = await jobberQuery(req.companyId, `
      mutation CreateQuote($input: QuoteCreateInput!) {
        quoteCreate(input: $input) {
          quote {
            id
            quoteNumber
            webUri
          }
          userErrors { message field }
        }
      }
    `, {
      input: {
        title: `DoorOps Inspection — ${i.property_name || i.property_address}`,
        message: `Inspection report for ${i.property_address}. The following items require attention based on the DoorOps inspection report.`,
        lineItems: lineItems.map(li => ({
          name: li.name,
          description: li.description,
          unitPrice: li.unitPrice,
          quantity: li.quantity
        }))
      }
    });

    const quote = data?.quoteCreate?.quote;
    const errors = data?.quoteCreate?.userErrors;

    if (errors?.length) return res.status(400).json({ error: errors[0].message });
    if (!quote) return res.status(500).json({ error: 'Quote creation failed' });

    // Save quote reference on inspection
    await db.query(
      'UPDATE inspections SET jobber_quote_id=$1, jobber_quote_url=$2 WHERE id=$3',
      [quote.id, quote.webUri, inspection_id]
    );

    res.json({ quote_id: quote.id, quote_number: quote.quoteNumber, url: quote.webUri });
  } catch (err) {
    console.error('[jobber/quote]', err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
