// ============================================================
// DoorOps — Inspections Module
// ============================================================

let _inspections = [];
let _currentInspection = null;
let _currentDoor = null;
let _inspState = 'list'; // list | new | detail | add-door | door-detail

// ─── API Helper ───────────────────────────────────────────────────────────────
async function apiInsp(path, method, body) {
  const opts = { method: method || 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch('/api/inspections' + path, opts);
}

// ─── LOAD INSPECTIONS LIST ────────────────────────────────────────────────────
async function loadInspections() {
  const page = document.getElementById('page-inspections');
  if (!page) return;

  page.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
      <h1 style="margin:0;">Inspections</h1>
      <button class="btn-primary-do" onclick="showNewInspectionForm()">+ New Inspection</button>
    </div>
    <div style="margin-bottom:16px;">
      <input type="text" id="insp-search" placeholder="Search by property, address, contact…"
        oninput="filterInspections(this.value)"
        style="width:100%;max-width:400px;padding:9px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;">
    </div>
    <div id="insp-list-content">
      <div style="color:var(--muted);font-size:14px;">Loading…</div>
    </div>
  `;

  const resp = await apiInsp('', 'GET');
  if (!resp.ok) { document.getElementById('insp-list-content').innerHTML = '<p style="color:var(--danger);">Failed to load inspections.</p>'; return; }
  _inspections = await resp.json();
  renderInspectionList(_inspections);
}

function renderInspectionList(list) {
  const el = document.getElementById('insp-list-content');
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--muted);">
      <div style="font-size:48px;margin-bottom:12px;">🔍</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:6px;">No inspections yet</div>
      <div style="font-size:13px;">Create your first inspection report to get started.</div>
    </div>`;
    return;
  }

  el.innerHTML = list.map(i => {
    const statusColor = { draft: '#94a3b8', in_progress: '#3b82f6', complete: '#22c55e', sent: '#a855f7' }[i.status] || '#94a3b8';
    const statusLabel = { draft: 'Draft', in_progress: 'In Progress', complete: 'Complete', sent: 'Sent' }[i.status] || i.status;
    const date = i.inspection_date ? new Date(i.inspection_date).toLocaleDateString('en-CA') : 'No date';
    return `
      <div onclick="openInspection(${i.id})" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:10px;cursor:pointer;transition:border-color 0.15s;" onmouseover="this.style.borderColor='var(--orange)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;font-size:15px;margin-bottom:3px;">${escDO(i.property_name || i.property_address)}</div>
            <div style="font-size:12px;color:var(--muted);">${i.property_name ? escDO(i.property_address) : ''}</div>
          </div>
          <span style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap;">${statusLabel}</span>
        </div>
        <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:var(--muted);">
          <span>📅 ${date}</span>
          <span>🚪 ${i.door_count || 0} door${i.door_count != 1 ? 's' : ''}</span>
          <span>⚠️ ${i.deficiency_count || 0} deficiencie${i.deficiency_count != 1 ? 's' : 'y'}</span>
          ${i.inspector_name ? `<span>👤 ${escDO(i.inspector_name)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function filterInspections(q) {
  if (!q.trim()) { renderInspectionList(_inspections); return; }
  const lq = q.toLowerCase();
  renderInspectionList(_inspections.filter(i =>
    (i.property_name || '').toLowerCase().includes(lq) ||
    (i.property_address || '').toLowerCase().includes(lq) ||
    (i.contact_name || '').toLowerCase().includes(lq)
  ));
}

// ─── NEW INSPECTION FORM ──────────────────────────────────────────────────────
function showNewInspectionForm() {
  const page = document.getElementById('page-inspections');
  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <button onclick="loadInspections()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">←</button>
      <h1 style="margin:0;">New Inspection</h1>
    </div>`;
  // Load Jobber suggestions in background
  loadJobberJobSuggestions();
  page.innerHTML += `
    <div style="max-width:560px;">

      <!-- Jobber job picker -->
      <div id="jobber-jobs-section" style="margin-bottom:20px;display:none;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:8px;">📅 Today's Jobber Jobs</div>
        <div id="jobber-jobs-list" style="display:flex;flex-direction:column;gap:6px;"></div>
      </div>

      <div class="do-form-group">
        <label>Property Name</label>
        <input type="text" id="ni-prop-name" placeholder="e.g. Milton Logistics Centre" style="width:100%;">
      </div>
      <div class="do-form-group">
        <label>Property Address <span style="color:var(--danger);">*</span></label>
        <input type="text" id="ni-prop-addr" placeholder="123 Main St, Milton, ON" style="width:100%;" required>
      </div>
      <div class="do-form-group">
        <label>Site Contact Name</label>
        <input type="text" id="ni-contact-name" placeholder="John Smith" style="width:100%;">
      </div>
      <div class="do-form-group">
        <label>Site Contact Email</label>
        <input type="email" id="ni-contact-email" placeholder="contact@property.com" style="width:100%;">
      </div>
      <div class="do-form-group">
        <label>Inspection Date</label>
        <input type="date" id="ni-date" value="${new Date().toISOString().slice(0,10)}" style="width:100%;">
      </div>
      <div class="do-form-group">
        <label>Notes</label>
        <textarea id="ni-notes" placeholder="Optional notes…" style="width:100%;min-height:80px;"></textarea>
      </div>
      <div id="ni-error" style="display:none;background:rgba(239,68,68,0.15);border:1px solid var(--danger);border-radius:6px;padding:10px 14px;font-size:13px;color:var(--danger);margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;padding-bottom:80px;">
        <button class="btn-primary-do" onclick="submitNewInspection()" style="flex:1;">Create Inspection</button>
        <button onclick="loadInspections()" style="flex:1;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
}

// Load Jobber jobs when new inspection form opens
async function loadJobberJobSuggestions() {
  try {
    const resp = await fetch('/api/jobber/jobs/today', { credentials: 'include' });
    if (!resp.ok) return;
    const jobs = await resp.json();
    if (!jobs.length) return;

    const section = document.getElementById('jobber-jobs-section');
    const list = document.getElementById('jobber-jobs-list');
    if (!section || !list) return;

    section.style.display = 'block';
    // Store jobs on window to avoid inline JSON escaping issues
    window._jobberJobs = jobs;
    list.innerHTML = jobs.map((j, idx) => `
      <div onclick="fillFromJobber(window._jobberJobs[${idx}])" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;cursor:pointer;transition:border-color 0.15s;" onmouseover="this.style.borderColor='var(--green)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-weight:600;font-size:13px;">#${j.job_number} — ${escDO(j.client_name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${escDO(j.property_address)}</div>
      </div>
    `).join('');
  } catch(e) { /* Jobber not connected, no-op */ }
}

function fillFromJobber(job) {
  const nameEl = document.getElementById('ni-prop-name');
  const addrEl = document.getElementById('ni-prop-addr');
  const contactEl = document.getElementById('ni-contact-name');
  const emailEl = document.getElementById('ni-contact-email');
  if (nameEl) nameEl.value = job.client_name || '';
  if (addrEl) addrEl.value = job.property_address || '';
  if (contactEl) contactEl.value = job.client_name || '';
  if (emailEl) emailEl.value = job.client_email || '';
  showToast('Filled from Jobber job #' + job.job_number);
  // Highlight the filled fields briefly
  [nameEl, addrEl, contactEl, emailEl].forEach(el => {
    if (!el) return;
    el.style.borderColor = 'var(--green)';
    setTimeout(() => { el.style.borderColor = ''; }, 2000);
  });
}

async function submitNewInspection() {
  const addr = document.getElementById('ni-prop-addr').value.trim();
  const errEl = document.getElementById('ni-error');
  errEl.style.display = 'none';

  if (!addr) { errEl.textContent = 'Property address is required.'; errEl.style.display = 'block'; return; }

  const body = {
    property_name: document.getElementById('ni-prop-name').value.trim() || null,
    property_address: addr,
    contact_name: document.getElementById('ni-contact-name').value.trim() || null,
    contact_email: document.getElementById('ni-contact-email').value.trim() || null,
    inspection_date: document.getElementById('ni-date').value || null,
    notes: document.getElementById('ni-notes').value.trim() || null
  };

  const resp = await apiInsp('', 'POST', body);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    errEl.textContent = err.error || 'Failed to create inspection.';
    errEl.style.display = 'block';
    return;
  }
  const insp = await resp.json();
  openInspection(insp.id);
}

// ─── OPEN INSPECTION ──────────────────────────────────────────────────────────
async function openInspection(id) {
  const page = document.getElementById('page-inspections');
  page.innerHTML = '<div style="color:var(--muted);padding:32px;">Loading…</div>';

  const resp = await apiInsp('/' + id, 'GET');
  if (!resp.ok) { page.innerHTML = '<p style="color:var(--danger);padding:32px;">Failed to load inspection.</p>'; return; }
  _currentInspection = await resp.json();
  renderInspectionDetail();
}

function renderInspectionDetail() {
  const i = _currentInspection;
  const page = document.getElementById('page-inspections');
  const statusColors = { draft: '#94a3b8', in_progress: '#3b82f6', complete: '#22c55e', sent: '#a855f7' };
  const statusColor = statusColors[i.status] || '#94a3b8';
  const statusLabels = { draft: 'Draft', in_progress: 'In Progress', complete: 'Complete', sent: 'Sent' };
  const statusLabel = statusLabels[i.status] || i.status;

  const doorsHtml = (i.doors || []).map(d => `
    <div onclick="openDoorDetail(${d.id})" style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onmouseover="this.style.borderColor='var(--orange)'" onmouseout="this.style.borderColor='var(--border)'">
      <div>
        <div style="font-weight:600;font-size:14px;">Door ${d.door_number}${d.location ? ' — ' + escDO(d.location) : ''}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">${escDO(d.door_type || '')} ${d.door_size ? '· ' + escDO(d.door_size) : ''}</div>
        ${d.overall_condition ? `<div style="font-size:12px;color:var(--muted);">Condition: ${escDO(d.overall_condition)}</div>` : ''}
      </div>
      <div style="font-size:20px;color:var(--muted);">›</div>
    </div>
  `).join('');

  const defsHtml = (i.deficiencies || []).map(d => {
    const sevColor = { advisory: 'var(--green-light)', moderate: '#d4a017', safety_critical: '#d63c3c' }[d.severity] || '#94a3b8';
    const sevLabel = { advisory: 'Advisory', moderate: 'Moderate', safety_critical: 'Safety Critical' }[d.severity] || d.severity;
    return `
      <div style="background:var(--bg);border-left:3px solid ${sevColor};border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:11px;font-weight:700;color:${sevColor};text-transform:uppercase;">${sevLabel}</span>
          ${d.include_in_quote ? '<span style="font-size:11px;color:var(--orange);">📋 In Quote</span>' : ''}
        </div>
        <div style="font-size:13px;">${escDO(d.description)}</div>
        ${d.recommendation ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">→ ${escDO(d.recommendation)}</div>` : ''}
        ${d.estimated_cost ? `<div style="font-size:12px;color:var(--orange);margin-top:4px;">Est. $${parseFloat(d.estimated_cost).toFixed(2)}</div>` : ''}
      </div>
    `;
  }).join('');

  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <button onclick="loadInspections()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">←</button>
      <div style="flex:1;">
        <h1 style="margin:0;font-size:20px;">${escDO(i.property_name || i.property_address)}</h1>
        ${i.property_name ? `<div style="font-size:13px;color:var(--muted);">${escDO(i.property_address)}</div>` : ''}
      </div>
      <span style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;border-radius:20px;padding:4px 12px;font-size:13px;font-weight:700;">${statusLabel}</span>
    </div>

    <div style="display:flex;gap:16px;margin-bottom:20px;font-size:12px;color:var(--muted);flex-wrap:wrap;">
      ${i.inspection_date ? `<span>📅 ${new Date(i.inspection_date).toLocaleDateString('en-CA')}</span>` : ''}
      ${i.contact_name ? `<span>👤 ${escDO(i.contact_name)}</span>` : ''}
      ${i.contact_email ? `<span>✉️ ${escDO(i.contact_email)}</span>` : ''}
      ${i.inspector_name ? `<span>🔍 ${escDO(i.inspector_name)}</span>` : ''}
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;">
      <button class="btn-primary-do" onclick="showAddDoorForm()">+ Add Door</button>
      <button onclick="addDeficiencyQuick()" style="padding:8px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">⚠️ Add Deficiency</button>
      ${i.status === 'draft' ? `<button onclick="startInspection(${i.id})" style="padding:8px 14px;background:#3b82f622;border:1px solid #3b82f644;border-radius:8px;color:#3b82f6;font-size:13px;font-weight:700;cursor:pointer;">▶ Start Inspection</button>` : ''}
      ${i.status === 'in_progress' ? `<button onclick="markComplete(${i.id})" style="padding:8px 14px;background:#22c55e22;border:1px solid #22c55e44;border-radius:8px;color:#22c55e;font-size:13px;font-weight:700;cursor:pointer;">✓ Mark Complete</button>` : ''}
      ${(i.status === 'complete') ? `<button onclick="showSendReportModal(${i.id})" style="padding:8px 14px;background:#a855f722;border:1px solid #a855f744;border-radius:8px;color:#a855f7;font-size:13px;font-weight:700;cursor:pointer;">📧 Send Report</button>` : ''}
      ${(i.status === 'sent') ? `<button onclick="showSendReportModal(${i.id})" style="padding:8px 14px;background:#a855f722;border:1px solid #a855f744;border-radius:8px;color:#a855f7;font-size:13px;cursor:pointer;">🔄 Resend Report</button>` : ''}
      <button onclick="openInspectionPdf(${i.id})" style="padding:8px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📄 PDF Report</button>
      <button onclick="createJobberQuote(${i.id})" style="padding:8px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">💼 Create Quote in Jobber</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:800px;">
      <div>
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:10px;">Doors (${(i.doors||[]).length})</div>
        ${doorsHtml || '<div style="color:var(--muted);font-size:13px;">No doors added yet.</div>'}
      </div>
      <div>
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:10px;">Deficiencies (${(i.deficiencies||[]).length})</div>
        ${defsHtml || '<div style="color:var(--muted);font-size:13px;">No deficiencies recorded.</div>'}
      </div>
    </div>
    ${i.signature_data ? `
    <div style="margin-top:20px;max-width:400px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px;">✍️ Signature</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;">
        <img src="${i.signature_data}" alt="Signature" style="max-width:100%;border-radius:4px;">
      </div>
    </div>` : ''}
  `;
}

// ─── ADD DOOR FORM ────────────────────────────────────────────────────────────
function showAddDoorForm(prefill) {
  const i = _currentInspection;
  const nextDoorNum = (i.doors || []).length + 1;
  const page = document.getElementById('page-inspections');

  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <button onclick="renderInspectionDetail()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">←</button>
      <h1 style="margin:0;">Add Door</h1>
    </div>
    <div style="max-width:560px;">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="do-form-group">
          <label>Door #</label>
          <input type="number" id="ad-num" value="${nextDoorNum}" min="1" style="width:100%;">
        </div>
        <div class="do-form-group">
          <label>Door Type</label>
          <select id="ad-type" style="width:100%;">
            <option value="sectional">Sectional</option>
            <option value="rolling_steel">Rolling Steel</option>
            <option value="high_speed">High Speed</option>
            <option value="fire_door">Fire Door</option>
            <option value="dock_leveler">Dock Leveler</option>
            <option value="dock_shelter">Dock Shelter</option>
            <option value="strip_curtain">Strip Curtain</option>
            <option value="swing_door">Swing Door</option>
            <option value="sliding_door">Sliding Door</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div class="do-form-group">
        <label>Location / Label</label>
        <input type="text" id="ad-location" placeholder="e.g. Bay 3, North Loading Dock" style="width:100%;">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="do-form-group">
          <label>Width (ft)</label>
          <input type="number" id="ad-width" placeholder="10" step="0.5" style="width:100%;">
        </div>
        <div class="do-form-group">
          <label>Height (ft)</label>
          <input type="number" id="ad-height" placeholder="10" step="0.5" style="width:100%;">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="do-form-group">
          <label>Make</label>
          <input type="text" id="ad-make" placeholder="e.g. Clopay" style="width:100%;">
        </div>
        <div class="do-form-group">
          <label>Model</label>
          <input type="text" id="ad-model" placeholder="Model number" style="width:100%;">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="do-form-group">
          <label>Serial Number</label>
          <input type="text" id="ad-serial" placeholder="Optional" style="width:100%;">
        </div>
        <div class="do-form-group">
          <label>Install Year</label>
          <input type="number" id="ad-year" placeholder="2018" min="1950" max="2030" style="width:100%;">
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:12px;">Opener</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="do-form-group">
            <label>Make</label>
            <input type="text" id="ad-op-make" placeholder="LiftMaster" style="width:100%;">
          </div>
          <div class="do-form-group">
            <label>Model</label>
            <input type="text" id="ad-op-model" placeholder="Model" style="width:100%;">
          </div>
          <div class="do-form-group">
            <label>HP</label>
            <input type="text" id="ad-op-hp" placeholder="1/2" style="width:100%;">
          </div>
        </div>
      </div>

      <div class="do-form-group">
        <label>Overall Condition</label>
        <select id="ad-condition" style="width:100%;">
          <option value="">— select —</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      <div class="do-form-group">
        <label>Notes</label>
        <textarea id="ad-notes" placeholder="Observations, notes…" style="width:100%;min-height:72px;"></textarea>
      </div>

      <div style="display:flex;gap:8px;padding-bottom:80px;">
        <button class="btn-primary-do" onclick="submitAddDoor()" style="flex:1;">Save Door</button>
        <button onclick="renderInspectionDetail()" style="flex:1;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
}

async function submitAddDoor() {
  const body = {
    door_number: parseInt(document.getElementById('ad-num').value) || 1,
    door_type: document.getElementById('ad-type').value,
    location: document.getElementById('ad-location').value.trim() || null,
    door_width_ft: parseFloat(document.getElementById('ad-width').value) || null,
    door_height_ft: parseFloat(document.getElementById('ad-height').value) || null,
    make: document.getElementById('ad-make').value.trim() || null,
    model: document.getElementById('ad-model').value.trim() || null,
    serial_number: document.getElementById('ad-serial').value.trim() || null,
    install_year: parseInt(document.getElementById('ad-year').value) || null,
    opener_make: document.getElementById('ad-op-make').value.trim() || null,
    opener_model: document.getElementById('ad-op-model').value.trim() || null,
    opener_hp: document.getElementById('ad-op-hp').value.trim() || null,
    overall_condition: document.getElementById('ad-condition').value || null,
    notes: document.getElementById('ad-notes').value.trim() || null
  };

  const resp = await apiInsp('/' + _currentInspection.id + '/doors', 'POST', body);
  if (!resp.ok) { alert('Failed to save door. Please try again.'); return; }

  // Reload inspection and go back to detail
  const updated = await apiInsp('/' + _currentInspection.id, 'GET');
  _currentInspection = await updated.json();
  renderInspectionDetail();
}

// ─── DOOR DETAIL ──────────────────────────────────────────────────────────────
async function openDoorDetail(doorId) {
  _currentDoor = (_currentInspection.doors || []).find(d => d.id === doorId);
  if (!_currentDoor) return;
  // Use enhanced version if checklist.js is loaded
  if (typeof renderDoorDetailWithPhotos === 'function') {
    await renderDoorDetailWithPhotos(doorId);
  } else {
    renderDoorDetail();
  }
}

function renderDoorDetail() {
  const d = _currentDoor;
  const i = _currentInspection;
  const page = document.getElementById('page-inspections');

  const doorDefs = (i.deficiencies || []).filter(def => def.door_id === d.id);

  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <button onclick="renderInspectionDetail()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">←</button>
      <h1 style="margin:0;">Door ${d.door_number}${d.location ? ' — ' + escDO(d.location) : ''}</h1>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:20px;max-width:700px;">
      ${infoChip('Type', d.door_type)}
      ${infoChip('Size', d.door_width_ft && d.door_height_ft ? d.door_width_ft + '" × ' + d.door_height_ft + '"' : d.door_size)}
      ${infoChip('Condition', d.overall_condition)}
      ${infoChip('Make', d.make)}
      ${infoChip('Model', d.model)}
      ${infoChip('Serial', d.serial_number)}
      ${infoChip('Install Year', d.install_year)}
      ${infoChip('Opener', [d.opener_make, d.opener_model, d.opener_hp ? d.opener_hp + 'hp' : null].filter(Boolean).join(' '))}
    </div>

    ${d.notes ? `<div style="background:var(--surface);border-radius:8px;padding:12px 14px;margin-bottom:20px;font-size:13px;color:var(--muted);">${escDO(d.notes)}</div>` : ''}

    <div style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);">Deficiencies (${doorDefs.length})</div>
        <button onclick="addDeficiencyForDoor(${d.id})" style="padding:6px 12px;background:var(--orange);border:none;border-radius:6px;color:#000;font-size:12px;font-weight:700;cursor:pointer;">+ Add</button>
      </div>
      ${doorDefs.length ? doorDefs.map(def => deficiencyCard(def)).join('') : '<div style="color:var(--muted);font-size:13px;">No deficiencies for this door.</div>'}
    </div>

    <div style="display:flex;gap:8px;">
      <button onclick="deleteDoor(${d.id})" style="padding:8px 14px;background:rgba(239,68,68,0.15);border:1px solid #ef444444;border-radius:8px;color:#ef4444;font-size:13px;cursor:pointer;">🗑️ Delete Door</button>
    </div>
  `;
}

function infoChip(label, value) {
  if (!value) return '';
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:3px;">${label}</div>
    <div style="font-size:13px;font-weight:600;">${escDO(String(value))}</div>
  </div>`;
}

function deficiencyCard(def) {
  const sevColor = { advisory: 'var(--green-light)', moderate: '#d4a017', safety_critical: '#d63c3c' }[def.severity] || '#94a3b8';
  const sevLabel = { advisory: 'Advisory', moderate: 'Moderate', safety_critical: 'Safety Critical' }[def.severity] || def.severity;
  return `<div style="background:var(--surface);border-left:3px solid ${sevColor};border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span style="font-size:11px;font-weight:700;color:${sevColor};text-transform:uppercase;">${sevLabel}</span>
      <button onclick="deleteDeficiency(${def.id})" style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:13px;">${escDO(def.description)}</div>
    ${def.recommendation ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">→ ${escDO(def.recommendation)}</div>` : ''}
    ${def.estimated_cost ? `<div style="font-size:12px;color:var(--orange);margin-top:4px;">Est. $${parseFloat(def.estimated_cost).toFixed(2)}</div>` : ''}
  </div>`;
}

async function deleteDoor(doorId) {
  if (!confirm('Delete this door and all its data?')) return;
  await apiInsp('/' + _currentInspection.id + '/doors/' + doorId, 'DELETE');
  const updated = await apiInsp('/' + _currentInspection.id, 'GET');
  _currentInspection = await updated.json();
  renderInspectionDetail();
}

// ─── DEFICIENCIES ─────────────────────────────────────────────────────────────
function addDeficiencyForDoor(doorId) { showAddDeficiencyForm(doorId); }
function addDeficiencyQuick() { showAddDeficiencyForm(null); }

function showAddDeficiencyForm(doorId) {
  const page = document.getElementById('page-inspections');
  const doorOptions = (_currentInspection.doors || []).map(d =>
    `<option value="${d.id}" ${d.id === doorId ? 'selected' : ''}>Door ${d.door_number}${d.location ? ' — ' + escDO(d.location) : ''}</option>`
  ).join('');

  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <button onclick="${doorId ? 'openDoorDetail(' + doorId + ')' : 'renderInspectionDetail()'}" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">←</button>
      <h1 style="margin:0;">Add Deficiency</h1>
    </div>
    <div style="max-width:480px;">
      <div class="do-form-group">
        <label>Door</label>
        <select id="def-door" style="width:100%;">
          <option value="">— Not door-specific —</option>
          ${doorOptions}
        </select>
      </div>
      <div class="do-form-group">
        <label>Severity</label>
        <div style="display:flex;gap:8px;">
          <button type="button" id="sev-advisory" onclick="setSeverity('advisory')" style="flex:1;padding:8px;border-radius:6px;border:2px solid #f59e0b;background:#f59e0b22;color:#f59e0b;font-weight:700;font-size:12px;cursor:pointer;">Advisory</button>
          <button type="button" id="sev-moderate" onclick="setSeverity('moderate')" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;cursor:pointer;">Moderate</button>
          <button type="button" id="sev-safety_critical" onclick="setSeverity('safety_critical')" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;cursor:pointer;">Safety Critical</button>
        </div>
      </div>
      <div class="do-form-group">
        <label>Description <span style="color:var(--danger);">*</span></label>
        <textarea id="def-desc" placeholder="Describe the deficiency…" style="width:100%;min-height:80px;" required></textarea>
      </div>
      <div class="do-form-group">
        <label>Recommendation</label>
        <textarea id="def-rec" placeholder="Recommended action…" style="width:100%;min-height:60px;"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="do-form-group">
          <label>Estimated Cost ($)</label>
          <input type="number" id="def-cost" placeholder="0.00" min="0" step="0.01" style="width:100%;">
        </div>
        <div class="do-form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="def-quote" style="width:16px;height:16px;"> Include in Quote
          </label>
        </div>
      </div>
      <div style="display:flex;gap:8px;padding-bottom:80px;">
        <button class="btn-primary-do" onclick="submitAddDeficiency(${doorId || 'null'})" style="flex:1;">Save Deficiency</button>
        <button onclick="${doorId ? 'openDoorDetail(' + doorId + ')' : 'renderInspectionDetail()'}" style="flex:1;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
  setSeverity('advisory');
}

let _selectedSeverity = 'advisory';
function setSeverity(sev) {
  _selectedSeverity = sev;
  const colors = { advisory: 'var(--green-light)', moderate: '#d4a017', safety_critical: '#d63c3c' };
  ['advisory', 'moderate', 'safety_critical'].forEach(s => {
    const btn = document.getElementById('sev-' + s);
    if (!btn) return;
    if (s === sev) {
      btn.style.border = '2px solid ' + colors[s];
      btn.style.background = colors[s] + '22';
      btn.style.color = colors[s];
    } else {
      btn.style.border = '1px solid var(--border)';
      btn.style.background = 'transparent';
      btn.style.color = 'var(--muted)';
    }
  });
}

async function submitAddDeficiency(fallbackDoorId) {
  const desc = document.getElementById('def-desc').value.trim();
  if (!desc) { alert('Description is required.'); return; }

  const doorVal = document.getElementById('def-door').value;
  const body = {
    door_id: doorVal ? parseInt(doorVal) : (fallbackDoorId || null),
    severity: _selectedSeverity,
    description: desc,
    recommendation: document.getElementById('def-rec').value.trim() || null,
    estimated_cost: parseFloat(document.getElementById('def-cost').value) || null,
    include_in_quote: document.getElementById('def-quote').checked
  };

  const resp = await apiInsp('/' + _currentInspection.id + '/deficiencies', 'POST', body);
  if (!resp.ok) { alert('Failed to save deficiency.'); return; }

  const updated = await apiInsp('/' + _currentInspection.id, 'GET');
  _currentInspection = await updated.json();

  if (fallbackDoorId) openDoorDetail(fallbackDoorId);
  else renderInspectionDetail();
}

async function deleteDeficiency(defId) {
  if (!confirm('Delete this deficiency?')) return;
  await apiInsp('/' + _currentInspection.id + '/deficiencies/' + defId, 'DELETE');
  const updated = await apiInsp('/' + _currentInspection.id, 'GET');
  _currentInspection = await updated.json();
  if (_currentDoor) renderDoorDetail();
  else renderInspectionDetail();
}

// ─── STATUS WORKFLOW ─────────────────────────────────────────────────────────
async function startInspection(id) {
  const resp = await fetch('/api/inspections/' + id + '/status', {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress' })
  });
  if (!resp.ok) { showToast('Failed to update status'); return; }
  const updated = await apiInsp('/' + id, 'GET');
  _currentInspection = await updated.json();
  renderInspectionDetail();
  showToast('Inspection started!');
}

async function markComplete(id) {
  showSignatureModal(id);
}

function showSignatureModal(inspId) {
  const existing = document.getElementById('sig-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'sig-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:480px;width:100%;">
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Sign to Complete</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px;">Draw your signature below to mark this inspection complete.</div>
      <div style="border:2px dashed var(--border);border-radius:8px;background:var(--bg);margin-bottom:12px;overflow:hidden;">
        <canvas id="sig-canvas" width="432" height="180" style="display:block;touch-action:none;width:100%;cursor:crosshair;"></canvas>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:14px;text-align:center;">Sign here</div>
      <div style="display:flex;gap:8px;">
        <button onclick="clearSignature()" style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:13px;cursor:pointer;">Clear</button>
        <button onclick="confirmComplete(${inspId})" style="flex:2;padding:10px;background:var(--green);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Confirm Complete</button>
        <button onclick="document.getElementById('sig-modal').remove()" style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:13px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const canvas = document.getElementById('sig-canvas');
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let drawing = false;

  function getPos(e, isTouch) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    const src = isTouch ? e.touches[0] : e;
    return [(src.clientX - r.left) * scaleX, (src.clientY - r.top) * scaleY];
  }
  canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const [x,y] = getPos(e, true); ctx.beginPath(); ctx.moveTo(x, y); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const [x,y] = getPos(e, true); ctx.lineTo(x, y); ctx.stroke(); });
  canvas.addEventListener('touchend', () => drawing = false);
  canvas.addEventListener('mousedown', e => { drawing = true; const [x,y] = getPos(e, false); ctx.beginPath(); ctx.moveTo(x, y); });
  canvas.addEventListener('mousemove', e => { if (!drawing) return; const [x,y] = getPos(e, false); ctx.lineTo(x, y); ctx.stroke(); });
  canvas.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('mouseleave', () => drawing = false);
}

function clearSignature() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

async function confirmComplete(id) {
  const canvas = document.getElementById('sig-canvas');
  let signatureData = null;
  if (canvas) {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const hasContent = Array.from(data).some(v => v !== 0);
    if (hasContent) signatureData = canvas.toDataURL('image/png');
  }

  const body = { status: 'complete' };
  if (signatureData) body.signature_data = signatureData;

  const resp = await fetch('/api/inspections/' + id + '/status', {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const modal = document.getElementById('sig-modal');
  if (modal) modal.remove();

  if (!resp.ok) { showToast('Failed to mark complete'); return; }
  const updated = await apiInsp('/' + id, 'GET');
  _currentInspection = await updated.json();
  renderInspectionDetail();
  showToast('\u2713 Inspection marked complete!');
}

function showSendReportModal(id) {
  const i = _currentInspection;
  const existing = document.getElementById('send-report-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'send-report-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:440px;width:100%;">
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">\ud83d\udce7 Send Report</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px;">Send the PDF inspection report to the site contact.</div>
      <div class="do-form-group">
        <label>Send to:</label>
        <input type="email" id="send-email-input" value="${escDO(i.contact_email || '')}" placeholder="contact@email.com" style="width:100%;">
      </div>
      <div id="send-report-msg" style="display:none;font-size:13px;margin-bottom:10px;"></div>
      <div style="display:flex;gap:8px;">
        <button onclick="submitSendReport(${id})" style="flex:2;padding:10px;background:var(--green);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;" id="send-report-btn">\ud83d\udce8 Send</button>
        <button onclick="document.getElementById('send-report-modal').remove()" style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:13px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function submitSendReport(id) {
  const email = document.getElementById('send-email-input')?.value.trim();
  const msgEl = document.getElementById('send-report-msg');
  const btn = document.getElementById('send-report-btn');
  if (!email) { if (msgEl) { msgEl.textContent = 'Email address required.'; msgEl.style.color = 'var(--danger)'; msgEl.style.display = 'block'; } return; }

  if (btn) { btn.textContent = 'Sending\u2026'; btn.disabled = true; }

  const resp = await fetch('/api/inspections/' + id + '/send-report', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await resp.json();

  if (!resp.ok) {
    if (msgEl) { msgEl.textContent = data.error || 'Failed to send.'; msgEl.style.color = 'var(--danger)'; msgEl.style.display = 'block'; }
    if (btn) { btn.textContent = '\ud83d\udce8 Send'; btn.disabled = false; }
    return;
  }

  const modal = document.getElementById('send-report-modal');
  if (modal) modal.remove();

  if (data.simulated) {
    showToast('\ud83d\udce7 Report simulated (SMTP not configured)');
  } else {
    showToast('\u2713 Report sent to ' + (data.to || email) + '!');
    const updated = await apiInsp('/' + id, 'GET');
    _currentInspection = await updated.json();
    renderInspectionDetail();
  }
}

// ─── PDF REPORT ──────────────────────────────────────────────────────────────
function openInspectionPdf(id) {
  window.open('/api/pdf/inspection/' + id, '_blank');
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function escDO(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── CREATE JOBBER QUOTE ──────────────────────────────────────────────────────
async function createJobberQuote(inspectionId) {
  const defs = (_currentInspection?.deficiencies || []).filter(d => d.include_in_quote);
  if (!defs.length) {
    alert('No deficiencies marked "Include in Quote". Edit deficiencies and check the box first.');
    return;
  }
  if (!confirm(`Create a Jobber quote with ${defs.length} line item${defs.length !== 1 ? 's' : ''}?`)) return;

  showToast('Creating quote in Jobber…');
  const resp = await fetch('/api/jobber/quote', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspection_id: inspectionId })
  });
  const data = await resp.json();

  if (!resp.ok) {
    if (data.error && data.error.includes('Not connected')) {
      alert('Jobber is not connected. Go to Settings → Integrations → Connect Jobber first.');
    } else {
      alert('Failed to create quote: ' + (data.error || 'Unknown error'));
    }
    return;
  }

  showToast('✓ Quote #' + data.quote_number + ' created in Jobber!');
  if (data.url) {
    setTimeout(() => {
      if (confirm('Quote created! Open it in Jobber?')) window.open(data.url, '_blank');
    }, 500);
  }
}
