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
    const statusColor = { draft: '#94a3b8', complete: '#22c55e', sent: '#f59e0b' }[i.status] || '#94a3b8';
    const statusLabel = { draft: 'Draft', complete: 'Complete', sent: 'Sent' }[i.status] || i.status;
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
    </div>
    <div style="max-width:560px;">
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
      <div style="display:flex;gap:8px;">
        <button class="btn-primary-do" onclick="submitNewInspection()" style="flex:1;">Create Inspection</button>
        <button onclick="loadInspections()" style="flex:1;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
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
  const statusColor = { draft: '#94a3b8', complete: '#22c55e', sent: '#f59e0b' }[i.status] || '#94a3b8';

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
    const sevColor = { advisory: '#f59e0b', moderate: '#f97316', safety_critical: '#ef4444' }[d.severity] || '#94a3b8';
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
      <span style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;">${i.status}</span>
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
      ${i.status === 'draft' ? `<button onclick="markComplete(${i.id})" style="padding:8px 14px;background:#22c55e22;border:1px solid #22c55e44;border-radius:8px;color:#22c55e;font-size:13px;cursor:pointer;">✓ Mark Complete</button>` : ''}
      <button onclick="openInspectionPdf(${i.id})" style="padding:8px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📄 PDF Report</button>
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

      <div style="display:flex;gap:8px;">
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
  const sevColor = { advisory: '#f59e0b', moderate: '#f97316', safety_critical: '#ef4444' }[def.severity] || '#94a3b8';
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
      <div style="display:flex;gap:8px;">
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
  const colors = { advisory: '#f59e0b', moderate: '#f97316', safety_critical: '#ef4444' };
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

// ─── MARK COMPLETE ────────────────────────────────────────────────────────────
async function markComplete(id) {
  if (!confirm('Mark this inspection as complete?')) return;
  await apiInsp('/' + id, 'PATCH', { status: 'complete' });
  const updated = await apiInsp('/' + id, 'GET');
  _currentInspection = await updated.json();
  renderInspectionDetail();
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
