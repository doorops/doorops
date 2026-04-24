// ============================================================
// DoorOps — Inspections Module (AccessGuard-style overview)
// ============================================================

let _inspections      = [];
let _currentInspection = null;
let _currentDoor       = null;
let _selectedSeverity  = 'advisory';

// ─── API Helper ───────────────────────────────────────────────────────────────
async function apiInsp(path, method, body) {
  const opts = { method: method || 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch('/api/inspections' + path, opts);
}

// ─── STATUS HELPERS ───────────────────────────────────────────────────────────
const STATUS_LABELS = { draft: 'Draft', in_progress: 'In Progress', complete: 'Complete', published: 'Published', sent: 'Sent' };
const STATUS_COLORS = { draft: '#94a3b8', in_progress: '#3b82f6', complete: '#22c55e', published: '#8b5cf6', sent: '#8b5cf6' };

function getStatusLabel(s) { return STATUS_LABELS[s] || s; }

// ─── LOAD INSPECTIONS LIST ────────────────────────────────────────────────────
let _searchDebounce = null;
let _activeStatusFilter = 'all';

async function loadInspections() {
  const page = document.getElementById('page-inspections');
  if (!page) return;

  page.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
      <h1 style="margin:0;font-size:1.3rem;">Inspections</h1>
      <button class="btn-primary-do" onclick="showNewInspectionForm()">+ New</button>
    </div>
    <div style="margin-bottom:12px;">
      <input type="search" id="insp-search" placeholder="🔍  Search by property, address, contact…"
        oninput="debounceInspSearch(this.value)"
        style="width:100%;max-width:460px;padding:9px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;">
    </div>
    <div id="insp-status-filters" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
      ${['all','draft','in_progress','complete','published','sent'].map(s =>
        `<button class="status-filter-btn${_activeStatusFilter===s?' active':''}" onclick="setInspStatusFilter('${s}')" data-status="${s}">
          ${s==='all' ? 'All' : getStatusLabel(s)}
        </button>`
      ).join('')}
    </div>
    <div id="insp-list-content">
      <div style="color:var(--muted);font-size:14px;padding:16px;">Loading…</div>
    </div>`;

  await refreshInspectionList();
}

async function refreshInspectionList(q) {
  const el = document.getElementById('insp-list-content');
  if (!el) return;

  try {
    let url = '/api/inspections?limit=60';
    if (q && q.trim()) url += '&q=' + encodeURIComponent(q.trim());
    if (_activeStatusFilter && _activeStatusFilter !== 'all') url += '&status=' + _activeStatusFilter;

    const resp = await fetch(url);
    if (!resp.ok) { el.innerHTML = '<p style="color:var(--danger);padding:16px;">Failed to load.</p>'; return; }
    _inspections = await resp.json();
    renderInspectionList(_inspections);
  } catch(e) {
    el.innerHTML = '<p style="color:var(--danger);padding:16px;">Network error.</p>';
  }
}

function debounceInspSearch(val) {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => refreshInspectionList(val), 300);
}

function setInspStatusFilter(status) {
  _activeStatusFilter = status;
  document.querySelectorAll('.status-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.status === status);
  });
  const q = document.getElementById('insp-search')?.value || '';
  refreshInspectionList(q);
}

function renderInspectionList(list) {
  const el = document.getElementById('insp-list-content');
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--muted);">
      <div style="font-size:48px;margin-bottom:12px;">🔍</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:6px;">No inspections found</div>
      <div style="font-size:13px;">Try a different search or create a new inspection.</div>
    </div>`;
    return;
  }

  el.innerHTML = list.map(i => {
    const color = STATUS_COLORS[i.status] || '#94a3b8';
    const label = getStatusLabel(i.status);
    const date  = i.inspection_date ? new Date(i.inspection_date).toLocaleDateString('en-CA') : '—';
    const done  = parseInt(i.finding_done) || 0;
    const total = parseInt(i.finding_total) || 0;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    return `
      <div onclick="openInspection(${i.id})"
           style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer;transition:border-color 0.15s;"
           onmouseover="this.style.borderColor='var(--green)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:15px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escDO(i.property_name || i.property_address)}</div>
            ${i.property_name ? `<div style="font-size:12px;color:var(--muted);">${escDO(i.property_address)}</div>` : ''}
          </div>
          <span style="background:${color}22;color:${color};border:1px solid ${color}44;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;">${label}</span>
        </div>
        ${total > 0 ? `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:var(--green);border-radius:3px;transition:width 0.3s;"></div>
            </div>
            <span style="font-size:11px;color:var(--muted);white-space:nowrap;">${done}/${total}</span>
          </div>` : ''}
        <div style="display:flex;gap:12px;font-size:12px;color:var(--muted);flex-wrap:wrap;">
          <span>📅 ${date}</span>
          <span>🚪 ${i.door_count || 0} door${i.door_count != 1 ? 's' : ''}</span>
          ${i.deficiency_count > 0 ? `<span style="color:var(--warn);">⚠ ${i.deficiency_count} issue${i.deficiency_count != 1 ? 's' : ''}</span>` : ''}
          ${i.next_inspection_date ? `<span>📆 Next: ${new Date(i.next_inspection_date).toLocaleDateString('en-CA')}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ─── NEW INSPECTION FORM ──────────────────────────────────────────────────────
function showNewInspectionForm() {
  const page = document.getElementById('page-inspections');
  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <button onclick="loadInspections()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">←</button>
      <h1 style="margin:0;">New Inspection</h1>
    </div>
    <div id="jobber-jobs-section" style="margin-bottom:20px;display:none;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:8px;">📅 Today's Jobber Jobs</div>
      <div id="jobber-jobs-list" style="display:flex;flex-direction:column;gap:6px;"></div>
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
      <div style="display:flex;gap:8px;padding-bottom:80px;">
        <button class="btn-primary-do" onclick="submitNewInspection()" style="flex:1;">Create Inspection</button>
        <button onclick="loadInspections()" style="flex:1;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;cursor:pointer;">Cancel</button>
      </div>
    </div>`;
  loadJobberJobSuggestions();
}

async function loadJobberJobSuggestions() {
  try {
    const resp = await fetch('/api/jobber/jobs/today', { credentials: 'include' });
    if (!resp.ok) return;
    const jobs = await resp.json();
    if (!jobs.length) return;
    const section = document.getElementById('jobber-jobs-section');
    const list    = document.getElementById('jobber-jobs-list');
    if (!section || !list) return;
    section.style.display = 'block';
    window._jobberJobs = jobs;
    list.innerHTML = jobs.map((j, idx) => `
      <div onclick="fillFromJobber(window._jobberJobs[${idx}])"
           style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;cursor:pointer;"
           onmouseover="this.style.borderColor='var(--green)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-weight:600;font-size:13px;">#${j.job_number} — ${escDO(j.client_name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${escDO(j.property_address)}</div>
      </div>`).join('');
  } catch(e) {}
}

function fillFromJobber(job) {
  const fields = {
    'ni-prop-name': job.client_name, 'ni-prop-addr': job.property_address,
    'ni-contact-name': job.client_name, 'ni-contact-email': job.client_email
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val) { el.value = val; el.style.borderColor = 'var(--green)'; setTimeout(() => el.style.borderColor = '', 2000); }
  });
  showToast('Filled from Jobber job #' + job.job_number);
}

async function submitNewInspection() {
  const addr  = document.getElementById('ni-prop-addr').value.trim();
  const errEl = document.getElementById('ni-error');
  errEl.style.display = 'none';
  if (!addr) { errEl.textContent = 'Property address is required.'; errEl.style.display = 'block'; return; }

  const resp = await apiInsp('', 'POST', {
    property_name:  document.getElementById('ni-prop-name').value.trim() || null,
    property_address: addr,
    contact_name:   document.getElementById('ni-contact-name').value.trim() || null,
    contact_email:  document.getElementById('ni-contact-email').value.trim() || null,
    inspection_date: document.getElementById('ni-date').value || null,
    notes:          document.getElementById('ni-notes').value.trim() || null
  });
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
  page.innerHTML = '<div style="color:var(--muted);padding:32px;text-align:center;">Loading…</div>';

  const resp = await apiInsp('/' + id, 'GET');
  if (!resp.ok) { page.innerHTML = '<p style="color:var(--danger);padding:32px;">Failed to load inspection.</p>'; return; }
  _currentInspection = await resp.json();
  renderInspectionOverview();
}

// ─── INSPECTION OVERVIEW (AccessGuard-style door cards) ──────────────────────
function renderInspectionOverview() {
  const page = document.getElementById('page-inspections');
  const insp = _currentInspection;
  if (!page || !insp) return;

  const doors  = insp.doors || [];
  const prog   = calcInspectionProgress(insp);
  const pct    = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;

  const allComplete = doors.length > 0 && doors.every(d => {
    const dp = calcDoorProgress(d);
    return dp.statusClass === 'door-status-complete';
  });

  const statusColor = STATUS_COLORS[insp.status] || '#94a3b8';
  const statusLabel = getStatusLabel(insp.status);

  // Door cards
  const doorCards = doors.map(door => {
    const dp = calcDoorProgress(door);
    const barColor = dp.colorClass === 'worst-poor' ? 'var(--insp-poor)'
      : dp.colorClass === 'worst-fair' ? 'var(--insp-fair)'
      : dp.colorClass === 'worst-good' ? 'var(--insp-good)'
      : 'var(--muted)';
    const locLabel = escDO(door.location_label || door.location || 'Door ' + door.door_number);
    const cfgSummary = getDoorConfigSummary(door);
    return `
      <div class="door-overview-card" onclick="openDoor(${door.id})">
        <div style="width:12px;height:44px;border-radius:4px;background:${barColor};flex-shrink:0;"></div>
        <div class="door-card-info">
          <div class="door-card-label">${locLabel}</div>
          <div class="door-card-type">${getDoorTypeLabel(door.door_type)}</div>
          ${cfgSummary
            ? `<div class="door-card-config">${escDO(cfgSummary)}</div>`
            : `<div class="door-card-config" style="color:var(--insp-fair);">⚠ No config — tap ✏️ to add</div>`}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
          <div style="display:flex;gap:4px;">
            <button class="icon-btn" style="font-size:0.9rem;padding:4px 8px;"
                    onclick="event.stopPropagation();showEditDoorConfig(${door.id})" title="Edit config">✏️</button>
            <button class="icon-btn" style="font-size:0.9rem;padding:4px 8px;color:#ef4444;"
                    onclick="event.stopPropagation();deleteDoorFromInspection(${door.id},'${locLabel}')" title="Delete">🗑️</button>
          </div>
          <div class="door-card-progress">${dp.done}/${dp.total}</div>
          ${dp.issues > 0 ? `<span class="door-issue-badge">${dp.issues}</span>` : ''}
          <span class="door-status-chip ${dp.statusClass}">${dp.statusLabel}</span>
        </div>
      </div>`;
  }).join('');

  // Action buttons based on status
  let actionBtns = '';
  if (insp.status === 'draft' || insp.status === 'in_progress') {
    actionBtns = `<button onclick="openInspectionPdf(${insp.id})" style="padding:9px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📄 PDF</button>`;
  }
  if (insp.status === 'complete') {
    actionBtns += `
      <button onclick="publishInspection(${insp.id})" style="padding:9px 16px;background:#8b5cf622;border:1px solid #8b5cf6;border-radius:8px;color:#8b5cf6;font-size:13px;font-weight:700;cursor:pointer;">🌐 Publish to Portal</button>
      <button onclick="showSendReportModal(${insp.id})" style="padding:9px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📧 Send</button>
      <button onclick="openInspectionPdf(${insp.id})" style="padding:9px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📄 PDF</button>`;
  }
  if (insp.status === 'published' || insp.status === 'sent') {
    const portalUrl = `${window.location.origin}/portal/${insp.portal_token}`;
    actionBtns += `
      <button onclick="copyPortalLink('${insp.portal_token}')" style="padding:9px 16px;background:#8b5cf622;border:1px solid #8b5cf6;border-radius:8px;color:#8b5cf6;font-size:13px;cursor:pointer;">🔗 Copy Portal Link</button>
      <button onclick="showSendReportModal(${insp.id})" style="padding:9px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📧 Send</button>
      <button onclick="openInspectionPdf(${insp.id})" style="padding:9px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📄 PDF</button>`;
    if (insp.next_inspection_date) {
      actionBtns += `<button onclick="showScheduleModal(${insp.id})" style="padding:9px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📅 ${new Date(insp.next_inspection_date).toLocaleDateString('en-CA')}</button>`;
    } else {
      actionBtns += `<button onclick="showScheduleModal(${insp.id})" style="padding:9px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📅 Schedule Next</button>`;
    }
  }
  if (insp._perms?.manage_inspections || _currentUser?.role === 'owner' || _currentUser?.role === 'admin') {
    actionBtns += `<button onclick="createJobberQuote(${insp.id})" style="padding:9px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">🔧 Jobber Quote</button>`;
  }

  // Deficiency summary (compact)
  const defs = insp.deficiencies || [];
  const defSummary = defs.length > 0 ? `
    <div style="padding:12px 16px;border-top:1px solid var(--border);">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px;">Deficiencies (${defs.length})</div>
      ${defs.slice(0, 3).map(def => {
        const sevColor = { advisory: '#22c55e', moderate: '#f59e0b', safety_critical: '#ef4444' }[def.severity] || '#94a3b8';
        return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${sevColor};flex-shrink:0;margin-top:4px;"></span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escDO(def.title || def.description || '')}</span>
        </div>`;
      }).join('')}
      ${defs.length > 3 ? `<div style="font-size:12px;color:var(--muted);padding-top:4px;">+ ${defs.length - 3} more</div>` : ''}
    </div>` : '';

  page.innerHTML = `
    <div class="insp-door-header">
      <button onclick="loadInspections()" class="back-btn">← Back</button>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escDO(insp.property_name || insp.property_address)}</div>
        <div style="font-size:0.78rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${insp.property_name ? escDO(insp.property_address) : ''}</div>
      </div>
      <span style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;">${statusLabel}</span>
    </div>

    ${prog.total > 0 ? `
    <div style="padding:10px 16px;background:#f9fafb;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--muted);margin-bottom:5px;">
        <span>Overall Progress</span>
        <span>${prog.done}/${prog.total} items${prog.issues > 0 ? ` · ⚠ ${prog.issues} issue${prog.issues !== 1 ? 's' : ''}` : ''}</span>
      </div>
      <div class="insp-progress-bar-wrap">
        <div class="insp-progress-bar" style="width:${pct}%;"></div>
      </div>
    </div>` : ''}

    <div id="overview-door-list">
      ${doorCards || '<div class="insp-empty-state">No doors yet — add one below to start your inspection</div>'}
    </div>

    ${defSummary}

    <div style="padding:12px 16px;border-top:1px solid var(--border);">
      <button onclick="showAddDoorToInspection()" class="btn-primary-do" style="width:100%;">+ Add Door</button>
    </div>

    ${actionBtns ? `
    <div style="padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);">
      ${actionBtns}
    </div>` : ''}

    <div class="insp-complete-bar">
      <button class="btn-complete${allComplete || insp.status === 'complete' || insp.status === 'published' || insp.status === 'sent' ? ' btn-complete-ready' : ''}"
              ${!allComplete && insp.status !== 'complete' && insp.status !== 'published' && insp.status !== 'sent' ? 'disabled' : ''}
              onclick="${insp.status === 'complete' || insp.status === 'published' || insp.status === 'sent' ? 'renderInspectionComplete()' : 'completeInspection()'}">
        ${allComplete && (insp.status === 'draft' || insp.status === 'in_progress')
          ? '✅ Complete Report'
          : insp.status === 'complete' || insp.status === 'published' || insp.status === 'sent'
            ? '✅ View Report Summary'
            : 'Complete all doors to finish'}
      </button>
    </div>`;
}

// Alias for backward compat
function renderInspectionDetail() { renderInspectionOverview(); }

// ─── COMPLETE INSPECTION ──────────────────────────────────────────────────────
async function completeInspection() {
  const insp = _currentInspection;
  if (!insp) return;
  showSignatureModal(insp.id);
}

// ─── ADD DOOR ─────────────────────────────────────────────────────────────────
function showAddDoorToInspection() {
  showAddDoorForm();
}

function showAddDoorForm() {
  const page = document.getElementById('page-inspections');
  const doors = _currentInspection?.doors || [];
  const nextNum = doors.length + 1;

  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <button onclick="renderInspectionOverview()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">←</button>
      <h1 style="margin:0;">Add Door</h1>
    </div>
    <div style="max-width:560px;">
      <div class="do-form-group">
        <label>Location Label <span style="color:var(--danger);">*</span></label>
        <input type="text" id="ad-location" placeholder="e.g. Front Entrance, Bay 1, North Dock…" style="width:100%;" required>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="do-form-group">
          <label>Door Type <span style="color:var(--danger);">*</span></label>
          <select id="ad-type" style="width:100%;">
            <option value="sectional">Sectional Door</option>
            <option value="rolling_steel">Rolling Steel</option>
            <option value="high_speed">High Speed Door</option>
            <option value="fire_door">Fire Door</option>
            <option value="dock_leveler">Dock Leveler</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="do-form-group">
          <label>Door #</label>
          <input type="number" id="ad-num" value="${nextNum}" min="1" style="width:100%;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="do-form-group">
          <label>Width (ft)</label>
          <input type="number" id="ad-width" placeholder="16" step="0.5" style="width:100%;">
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
      <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:12px;">Opener</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="do-form-group"><label>Make</label><input type="text" id="ad-op-make" placeholder="LiftMaster" style="width:100%;"></div>
          <div class="do-form-group"><label>Model</label><input type="text" id="ad-op-model" placeholder="Model" style="width:100%;"></div>
          <div class="do-form-group"><label>HP</label><input type="text" id="ad-op-hp" placeholder="1/2" style="width:100%;"></div>
        </div>
      </div>
      <div class="do-form-group" style="margin-top:4px;">
        <label>Notes</label>
        <textarea id="ad-notes" placeholder="Observations, notes…" style="width:100%;min-height:60px;"></textarea>
      </div>
      <div id="ad-error" style="display:none;background:rgba(239,68,68,0.15);border:1px solid var(--danger);border-radius:6px;padding:10px;font-size:13px;color:var(--danger);margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;padding-bottom:80px;margin-top:16px;">
        <button class="btn-primary-do" onclick="submitAddDoor()" style="flex:1;">Save & Start Checklist</button>
        <button onclick="renderInspectionOverview()" style="flex:1;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;cursor:pointer;">Cancel</button>
      </div>
    </div>`;

  document.getElementById('ad-location')?.focus();
}

async function submitAddDoor() {
  const location = document.getElementById('ad-location')?.value.trim();
  const errEl    = document.getElementById('ad-error');
  if (errEl) errEl.style.display = 'none';
  if (!location) {
    if (errEl) { errEl.textContent = 'Location label is required.'; errEl.style.display = 'block'; }
    document.getElementById('ad-location')?.focus();
    return;
  }

  const body = {
    door_number:   parseInt(document.getElementById('ad-num')?.value) || null,
    door_type:     document.getElementById('ad-type')?.value || 'sectional',
    location:      location,
    location_label: location,
    door_width_ft:  parseFloat(document.getElementById('ad-width')?.value) || null,
    door_height_ft: parseFloat(document.getElementById('ad-height')?.value) || null,
    make:          document.getElementById('ad-make')?.value.trim() || null,
    model:         document.getElementById('ad-model')?.value.trim() || null,
    serial_number: document.getElementById('ad-serial')?.value.trim() || null,
    install_year:  parseInt(document.getElementById('ad-year')?.value) || null,
    opener_make:   document.getElementById('ad-op-make')?.value.trim() || null,
    opener_model:  document.getElementById('ad-op-model')?.value.trim() || null,
    opener_hp:     document.getElementById('ad-op-hp')?.value.trim() || null,
    notes:         document.getElementById('ad-notes')?.value.trim() || null
  };

  const resp = await apiInsp('/' + _currentInspection.id + '/doors', 'POST', body);
  if (!resp.ok) {
    if (errEl) { errEl.textContent = 'Failed to save door. Please try again.'; errEl.style.display = 'block'; }
    return;
  }
  const newDoor = await resp.json();

  // Reload inspection with embedded findings
  const updated = await apiInsp('/' + _currentInspection.id, 'GET');
  _currentInspection = await updated.json();

  showToast('Door saved — starting checklist ✓');
  // Go straight to checklist
  openDoor(newDoor.id);
}

// ─── EDIT DOOR CONFIG ─────────────────────────────────────────────────────────
function showEditDoorConfig(doorId) {
  const door = (_currentInspection?.doors || []).find(d => d.id === doorId);
  if (!door) return;

  const modal = document.createElement('div');
  modal.id = 'edit-door-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:flex-end;justify-content:center;';
  const loc = escDO(door.location_label || door.location || '');
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px 16px 0 0;padding:20px 20px 32px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-size:16px;font-weight:700;">Edit Door Config</div>
        <button onclick="document.getElementById('edit-door-modal').remove()" style="background:none;border:none;font-size:20px;color:var(--muted);cursor:pointer;">✕</button>
      </div>
      <div class="do-form-group">
        <label>Location Label</label>
        <input type="text" id="ed-location" value="${loc}" style="width:100%;">
      </div>
      <div class="do-form-group">
        <label>Door Type</label>
        <select id="ed-type" style="width:100%;">
          <option value="sectional"${door.door_type==='sectional'?' selected':''}>Sectional Door</option>
          <option value="rolling_steel"${door.door_type==='rolling_steel'?' selected':''}>Rolling Steel</option>
          <option value="high_speed"${door.door_type==='high_speed'?' selected':''}>High Speed Door</option>
          <option value="fire_door"${door.door_type==='fire_door'?' selected':''}>Fire Door</option>
          <option value="dock_leveler"${door.door_type==='dock_leveler'?' selected':''}>Dock Leveler</option>
          <option value="other"${door.door_type==='other'?' selected':''}>Other</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="do-form-group"><label>Width (ft)</label><input type="number" id="ed-width" value="${door.door_width_ft||''}" step="0.5" style="width:100%;"></div>
        <div class="do-form-group"><label>Height (ft)</label><input type="number" id="ed-height" value="${door.door_height_ft||''}" step="0.5" style="width:100%;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="do-form-group"><label>Make</label><input type="text" id="ed-make" value="${escDO(door.make||'')}" style="width:100%;"></div>
        <div class="do-form-group"><label>Model</label><input type="text" id="ed-model" value="${escDO(door.model||'')}" style="width:100%;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div class="do-form-group"><label>Opener Make</label><input type="text" id="ed-op-make" value="${escDO(door.opener_make||'')}" style="width:100%;"></div>
        <div class="do-form-group"><label>Opener Model</label><input type="text" id="ed-op-model" value="${escDO(door.opener_model||'')}" style="width:100%;"></div>
        <div class="do-form-group"><label>HP</label><input type="text" id="ed-op-hp" value="${escDO(door.opener_hp||'')}" style="width:100%;"></div>
      </div>
      <button onclick="submitEditDoorConfig(${doorId})" class="btn-primary-do" style="width:100%;margin-top:8px;">Save Changes</button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitEditDoorConfig(doorId) {
  const body = {
    location:      document.getElementById('ed-location')?.value.trim(),
    location_label: document.getElementById('ed-location')?.value.trim(),
    door_type:     document.getElementById('ed-type')?.value,
    door_width_ft:  parseFloat(document.getElementById('ed-width')?.value) || null,
    door_height_ft: parseFloat(document.getElementById('ed-height')?.value) || null,
    make:          document.getElementById('ed-make')?.value.trim() || null,
    model:         document.getElementById('ed-model')?.value.trim() || null,
    opener_make:   document.getElementById('ed-op-make')?.value.trim() || null,
    opener_model:  document.getElementById('ed-op-model')?.value.trim() || null,
    opener_hp:     document.getElementById('ed-op-hp')?.value.trim() || null
  };

  const resp = await apiInsp('/' + _currentInspection.id + '/doors/' + doorId, 'PATCH', body);
  if (!resp.ok) { showToast('Failed to save', 'error'); return; }

  document.getElementById('edit-door-modal')?.remove();

  // Update in-memory door state
  const door = (_currentInspection?.doors || []).find(d => d.id === doorId);
  if (door) Object.assign(door, body);

  renderInspectionOverview();
  showToast('Door config saved ✓');
}

async function deleteDoorFromInspection(doorId, label) {
  if (!confirm(`Delete door "${label}" and all its checklist data?`)) return;
  const resp = await apiInsp('/' + _currentInspection.id + '/doors/' + doorId, 'DELETE');
  if (!resp.ok) { showToast('Failed to delete door', 'error'); return; }

  // Update in-memory state
  if (_currentInspection) {
    _currentInspection.doors = (_currentInspection.doors || []).filter(d => d.id !== doorId);
  }
  renderInspectionOverview();
  showToast('Door deleted');
}

// ─── PUBLISH TO PORTAL ────────────────────────────────────────────────────────
async function publishInspection(id) {
  if (!confirm('Publish this inspection to the client portal? The client will be able to view and download their report.')) return;

  const resp = await fetch('/api/inspections/' + id + '/publish', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }
  });
  if (!resp.ok) { showToast('Failed to publish', 'error'); return; }
  const data = await resp.json();

  _currentInspection = data;
  renderInspectionOverview();

  // Show portal link + schedule prompt
  showPortalPublishedModal(data.portal_token, id);
}

function showPortalPublishedModal(token, inspId) {
  const existing = document.getElementById('portal-published-modal');
  if (existing) existing.remove();

  const url = `${window.location.origin}/portal/${token}`;
  const modal = document.createElement('div');
  modal.id = 'portal-published-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:480px;width:100%;text-align:center;">
      <div style="font-size:2.5rem;margin-bottom:8px;">🌐</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:6px;">Published!</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px;">Share this link with your client. They can view and download the report any time.</div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;word-break:break-all;margin-bottom:14px;color:var(--text);">${url}</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;">
        <button onclick="copyPortalLink('${token}')" style="padding:9px 16px;background:#8b5cf6;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">📋 Copy Link</button>
        <a href="${url}" target="_blank" style="padding:9px 16px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;text-decoration:none;">Open Portal ↗</a>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:14px;">
        <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">Schedule the next inspection?</div>
        <button onclick="document.getElementById('portal-published-modal').remove();showScheduleModal(${inspId})" style="padding:9px 20px;background:var(--green);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">📅 Schedule Next</button>
        <button onclick="document.getElementById('portal-published-modal').remove()" style="padding:9px 16px;background:none;border:none;color:var(--muted);font-size:13px;cursor:pointer;">Skip</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function copyPortalLink(token) {
  const url = `${window.location.origin}/portal/${token}`;
  navigator.clipboard.writeText(url).then(() => showToast('Portal link copied ✓')).catch(() => {
    prompt('Copy this link:', url);
  });
}

// ─── SCHEDULE NEXT ────────────────────────────────────────────────────────────
function showScheduleModal(inspId) {
  const existing = document.getElementById('schedule-modal');
  if (existing) existing.remove();

  const insp = _currentInspection;
  const existingDate = insp?.next_inspection_date ? insp.next_inspection_date.slice(0, 10) : '';
  const existingFreq = insp?.inspection_frequency || '';

  const modal = document.createElement('div');
  modal.id = 'schedule-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1001;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:420px;width:100%;">
      <div style="font-size:16px;font-weight:700;margin-bottom:16px;">📅 Schedule Next Inspection</div>
      <div class="do-form-group">
        <label>Next Inspection Date</label>
        <input type="date" id="sched-date" value="${existingDate}" style="width:100%;" min="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="do-form-group">
        <label>Frequency</label>
        <select id="sched-freq" style="width:100%;">
          <option value=""${!existingFreq ? ' selected' : ''}>— Select frequency —</option>
          <option value="monthly"${existingFreq==='monthly'?' selected':''}>Monthly</option>
          <option value="quarterly"${existingFreq==='quarterly'?' selected':''}>Quarterly</option>
          <option value="semi-annual"${existingFreq==='semi-annual'?' selected':''}>Semi-Annual</option>
          <option value="annual"${existingFreq==='annual'?' selected':''}>Annual</option>
          <option value="2-year"${existingFreq==='2-year'?' selected':''}>Every 2 Years</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button onclick="submitSchedule(${inspId})" class="btn-primary-do" style="flex:2;">Save Schedule</button>
        <button onclick="document.getElementById('schedule-modal').remove()" style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:13px;cursor:pointer;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function submitSchedule(inspId) {
  const date = document.getElementById('sched-date')?.value;
  const freq = document.getElementById('sched-freq')?.value;

  const resp = await fetch('/api/inspections/' + inspId + '/schedule', {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ next_inspection_date: date || null, inspection_frequency: freq || null })
  });

  if (!resp.ok) { showToast('Failed to save schedule', 'error'); return; }
  const updated = await resp.json();
  if (_currentInspection) {
    _currentInspection.next_inspection_date = updated.next_inspection_date;
    _currentInspection.inspection_frequency = updated.inspection_frequency;
  }

  document.getElementById('schedule-modal')?.remove();
  showToast('Next inspection scheduled ✓');
  renderInspectionOverview();
}

// ─── SIGNATURE / COMPLETE ─────────────────────────────────────────────────────
function showSignatureModal(inspId) {
  const existing = document.getElementById('sig-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'sig-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:480px;width:100%;">
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Sign to Complete</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px;">Draw your signature to mark this inspection complete.</div>
      <div style="border:2px dashed var(--border);border-radius:8px;background:var(--bg);margin-bottom:12px;overflow:hidden;">
        <canvas id="sig-canvas" width="432" height="180" style="display:block;touch-action:none;width:100%;cursor:crosshair;"></canvas>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:14px;text-align:center;">Sign above</div>
      <div style="display:flex;gap:8px;">
        <button onclick="clearSignature()" style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:13px;cursor:pointer;">Clear</button>
        <button onclick="confirmComplete(${inspId})" style="flex:2;padding:10px;background:var(--green);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">✅ Confirm Complete</button>
        <button onclick="document.getElementById('sig-modal').remove()" style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:13px;cursor:pointer;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const canvas = document.getElementById('sig-canvas');
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#f9fafb'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false;
  const pos = (e, t) => { const r = canvas.getBoundingClientRect(); const sx = canvas.width / r.width; const sy = canvas.height / r.height; const s = t ? e.touches[0] : e; return [(s.clientX - r.left) * sx, (s.clientY - r.top) * sy]; };
  canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const [x,y] = pos(e,true); ctx.beginPath(); ctx.moveTo(x,y); }, {passive:false});
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!drawing) return; const [x,y] = pos(e,true); ctx.lineTo(x,y); ctx.stroke(); }, {passive:false});
  canvas.addEventListener('touchend',   () => drawing = false);
  canvas.addEventListener('mousedown',  e => { drawing = true; const [x,y] = pos(e,false); ctx.beginPath(); ctx.moveTo(x,y); });
  canvas.addEventListener('mousemove',  e => { if (!drawing) return; const [x,y] = pos(e,false); ctx.lineTo(x,y); ctx.stroke(); });
  canvas.addEventListener('mouseup',    () => drawing = false);
  canvas.addEventListener('mouseleave', () => drawing = false);
}

function clearSignature() {
  const c = document.getElementById('sig-canvas');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

async function confirmComplete(id) {
  const canvas = document.getElementById('sig-canvas');
  let sig = null;
  if (canvas) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    if (Array.from(d).some(v => v !== 0)) sig = canvas.toDataURL('image/png');
  }

  const resp = await fetch('/api/inspections/' + id + '/status', {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'complete', ...(sig ? { signature_data: sig } : {}) })
  });

  document.getElementById('sig-modal')?.remove();
  if (!resp.ok) { showToast('Failed to mark complete', 'error'); return; }

  const updated = await apiInsp('/' + id, 'GET');
  _currentInspection = await updated.json();
  showToast('✅ Inspection marked complete!');
  renderInspectionComplete();
}

// ─── SEND REPORT ─────────────────────────────────────────────────────────────
function showSendReportModal(id) {
  const i = _currentInspection;
  const existing = document.getElementById('send-report-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'send-report-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:24px;max-width:440px;width:100%;">
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">📧 Send Report</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px;">Send the PDF inspection report to the site contact.</div>
      <div class="do-form-group">
        <label>Send to:</label>
        <input type="email" id="send-email-input" value="${escDO(i?.contact_email || '')}" placeholder="contact@email.com" style="width:100%;">
      </div>
      <div id="send-report-msg" style="display:none;font-size:13px;margin-bottom:10px;"></div>
      <div style="display:flex;gap:8px;">
        <button onclick="submitSendReport(${id})" id="send-report-btn" style="flex:2;padding:10px;background:var(--green);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">📨 Send</button>
        <button onclick="document.getElementById('send-report-modal').remove()" style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:13px;cursor:pointer;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function submitSendReport(id) {
  const email = document.getElementById('send-email-input')?.value.trim();
  const msgEl = document.getElementById('send-report-msg');
  const btn   = document.getElementById('send-report-btn');
  if (!email) { if (msgEl) { msgEl.textContent = 'Email required.'; msgEl.style.color = 'var(--danger)'; msgEl.style.display = 'block'; } return; }

  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }
  const resp = await fetch('/api/inspections/' + id + '/send-report', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await resp.json();

  if (!resp.ok) {
    if (msgEl) { msgEl.textContent = data.error || 'Failed to send.'; msgEl.style.color = 'var(--danger)'; msgEl.style.display = 'block'; }
    if (btn) { btn.textContent = '📨 Send'; btn.disabled = false; }
    return;
  }

  document.getElementById('send-report-modal')?.remove();
  showToast(data.simulated ? '📧 Report simulated (SMTP not configured)' : `✓ Report sent to ${data.to || email}!`);
  if (!data.simulated) {
    const updated = await apiInsp('/' + id, 'GET');
    _currentInspection = await updated.json();
    renderInspectionOverview();
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
function openInspectionPdf(id) {
  window.open('/api/pdf/inspection/' + id, '_blank');
}

// ─── DEFICIENCY HELPERS (standalone add) ──────────────────────────────────────
function infoChip(label, value) {
  if (!value) return '';
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:3px;">${label}</div>
    <div style="font-size:13px;font-weight:600;">${escDO(String(value))}</div>
  </div>`;
}

function deficiencyCard(def) {
  const sevColor = { advisory: 'var(--green-light)', moderate: '#f59e0b', safety_critical: '#ef4444' }[def.severity] || '#94a3b8';
  const sevLabel = { advisory: 'Advisory', moderate: 'Moderate', safety_critical: 'Safety Critical' }[def.severity] || def.severity;
  const title    = def.title || def.description || '';
  return `<div style="background:var(--surface);border-left:3px solid ${sevColor};border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
      <span style="font-size:11px;font-weight:700;color:${sevColor};text-transform:uppercase;">${sevLabel}</span>
      <button onclick="deleteDeficiency(${def.id})" style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:13px;">${escDO(title)}</div>
    ${def.description && def.title && def.description !== def.title ? `<div style="font-size:12px;color:var(--muted);margin-top:3px;">${escDO(def.description)}</div>` : ''}
  </div>`;
}

async function deleteDeficiency(defId) {
  if (!confirm('Delete this deficiency?')) return;
  await apiInsp('/' + _currentInspection.id + '/deficiencies/' + defId, 'DELETE');
  const updated = await apiInsp('/' + _currentInspection.id, 'GET');
  _currentInspection = await updated.json();
  renderInspectionOverview();
}

function setSeverity(sev) {
  _selectedSeverity = sev;
  const colors = { advisory: '#22c55e', moderate: '#f59e0b', safety_critical: '#ef4444' };
  ['advisory','moderate','safety_critical'].forEach(s => {
    const btn = document.getElementById('sev-' + s);
    if (!btn) return;
    const c = colors[s];
    if (s === sev) { btn.style.cssText = `flex:1;padding:8px;border-radius:6px;border:2px solid ${c};background:${c}22;color:${c};font-weight:700;font-size:12px;cursor:pointer;`; }
    else           { btn.style.cssText = `flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;cursor:pointer;`; }
  });
}

// ─── JOBBER QUOTE ─────────────────────────────────────────────────────────────
async function createJobberQuote(inspectionId) {
  const defs = (_currentInspection?.deficiencies || []).filter(d => d.include_in_quote);
  if (!defs.length) { alert('No deficiencies marked "Include in Quote".'); return; }
  if (!confirm(`Create a Jobber quote with ${defs.length} line item${defs.length !== 1 ? 's' : ''}?`)) return;

  showToast('Creating quote in Jobber…');
  const resp = await fetch('/api/jobber/quote', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspection_id: inspectionId })
  });
  const data = await resp.json();

  if (!resp.ok) {
    alert(data.error?.includes('Not connected') ? 'Jobber not connected. Go to Settings → Integrations.' : 'Failed: ' + (data.error || 'Unknown error'));
    return;
  }

  showToast('✓ Quote #' + data.quote_number + ' created in Jobber!');
  if (data.url && confirm('Open in Jobber?')) window.open(data.url, '_blank');
}


// ─── INSPECTION COMPLETE SCREEN ──────────────────────────────────────────────
function renderInspectionComplete() {
  const page = document.getElementById('page-inspections');
  if (!page || !_currentInspection) return;
  const insp = _currentInspection;
  const doors = insp.doors || [];
  const defs  = insp.deficiencies || [];

  // Count ratings
  let goodCount = 0, fairCount = 0, poorCount = 0, totalItems = 0;
  doors.forEach(door => {
    (door.findings || []).forEach(f => {
      if (f.rating === 'na' || !f.rating) return;
      totalItems++;
      if (f.rating === 'good' || f.rating === 'pass') goodCount++;
      else if (f.rating === 'fair' || f.rating === 'needs_attention') fairCount++;
      else if (f.rating === 'poor' || f.rating === 'fail') poorCount++;
    });
  });

  // Deficiency blocks grouped by door
  const defBlocks = doors.map(door => {
    const issues = (door.findings || []).filter(f =>
      f.rating === 'fair' || f.rating === 'needs_attention' ||
      f.rating === 'poor' || f.rating === 'fail');
    if (!issues.length) return '';
    const locLabel = door.location_label || door.location || ('Door ' + door.door_number);
    return '<div style="margin-bottom:12px;">' +
      '<div style="font-weight:700;font-size:0.88rem;margin-bottom:4px;">' +
      '\uD83D\uDEAA ' + escDO(locLabel) + '</div>' +
      issues.map(f => {
        const isBad = f.rating === 'poor' || f.rating === 'fail';
        const ratingLabels = { fair:'Fair', needs_attention:'Needs Attn', poor:'Poor', fail:'Fail' };
        return '<div style="padding:7px 10px;border-left:3px solid ' + (isBad ? '#ef4444' : '#f59e0b') +
          ';margin-bottom:4px;font-size:0.83rem;background:#fafafa;border-radius:0 6px 6px 0;">' +
          '<div style="font-weight:600;">' + escDO(f.item || f.template_label || 'Item') + '</div>' +
          '<div style="color:var(--muted);font-size:0.78rem;">' +
          (ratingLabels[f.rating] || f.rating) +
          (f.deficiency ? ' \u2014 ' + escDO(f.deficiency.title) : '') + '</div></div>';
      }).join('') + '</div>';
  }).join('');

  page.innerHTML = '<div style="padding:16px;">' +

    // Header
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
      '<button onclick="renderInspectionOverview()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:4px;">' +
        '\u2190</button>' +
      '<div>' +
        '<div style="font-weight:700;font-size:1rem;">\u2705 Report Complete</div>' +
        '<div style="font-size:0.8rem;color:var(--muted);">' + escDO(insp.property_name || insp.property_address) + '</div>' +
      '</div>' +
    '</div>' +

    // Stats card
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">' +
      '<div style="display:flex;gap:10px;margin-bottom:10px;">' +
        '<div style="flex:1;background:#e8f5e922;border:1px solid #2e7d3233;border-radius:8px;padding:12px 8px;text-align:center;">' +
          '<div style="font-size:1.8rem;font-weight:800;color:#2e7d32;">' + goodCount + '</div>' +
          '<div style="font-size:0.72rem;font-weight:700;color:#2e7d32;">Good / Pass</div>' +
        '</div>' +
        '<div style="flex:1;background:#fff3e022;border:1px solid #e6510033;border-radius:8px;padding:12px 8px;text-align:center;">' +
          '<div style="font-size:1.8rem;font-weight:800;color:#e65100;">' + fairCount + '</div>' +
          '<div style="font-size:0.72rem;font-weight:700;color:#e65100;">Fair / Attn</div>' +
        '</div>' +
        '<div style="flex:1;background:#ffebee22;border:1px solid #c6282833;border-radius:8px;padding:12px 8px;text-align:center;">' +
          '<div style="font-size:1.8rem;font-weight:800;color:#c62828;">' + poorCount + '</div>' +
          '<div style="font-size:0.72rem;font-weight:700;color:#c62828;">Poor / Fail</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:0.82rem;color:var(--muted);text-align:center;">' +
        doors.length + ' door' + (doors.length !== 1 ? 's' : '') + ' \u00b7 ' + totalItems + ' items inspected' +
      '</div>' +
    '</div>' +

    // Deficiency block
    (defs.length > 0
      ? '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:0.88rem;margin-bottom:10px;">' +
            '\u26a0\ufe0f Deficiencies (' + defs.length + ')</div>' +
          (defBlocks || defs.map(d =>
            '<div style="padding:7px 10px;border-left:3px solid ' +
              (d.severity === 'safety_critical' ? '#ef4444' : d.severity === 'moderate' ? '#f59e0b' : '#22c55e') +
              ';margin-bottom:4px;font-size:0.83rem;background:#fafafa;border-radius:0 6px 6px 0;">' +
              '<div style="font-weight:600;">' + escDO(d.title || d.description || 'Issue') + '</div>' +
              '<div style="font-size:0.75rem;color:var(--muted);text-transform:capitalize;">' +
                (d.severity || '').replace('_',' ') + '</div></div>'
          ).join('')) +
        '</div>'
      : '<div style="background:#e8f5e9;border:1px solid #2e7d3233;border-radius:12px;padding:14px;margin-bottom:12px;text-align:center;">' +
          '<div style="font-size:1.5rem;margin-bottom:4px;">\uD83C\uDF89</div>' +
          '<div style="font-weight:700;color:#2e7d32;">No deficiencies found!</div>' +
          '<div style="font-size:0.82rem;color:#2e7d32;margin-top:2px;">All items passed inspection.</div>' +
        '</div>') +

    // Share Report card
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;">' +
      '<div style="font-weight:600;font-size:0.9rem;margin-bottom:10px;">' +
        '\uD83D\uDD17 Share Report</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
        '<button class="btn-primary-do" style="flex:1;min-width:140px;font-size:0.85rem;padding:9px 12px;"' +
          ' onclick="getInspectionReportLink(' + insp.id + ')">' +
          '\uD83D\uDD17 Get Shareable Link</button>' +
        '<button style="flex:1;min-width:130px;font-size:0.85rem;padding:9px 12px;background:var(--surface);' +
          'border:1px solid var(--border);border-radius:8px;color:var(--text);cursor:pointer;"' +
          ' onclick="openInspectionReportPdf(' + insp.id + ')">' +
          '\uD83D\uDCC4 Download PDF</button>' +
      '</div>' +
      '<div id="report-link-result"></div>' +
    '</div>' +

    // Send to Customer card
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;">' +
      '<div style="font-weight:600;font-size:0.9rem;margin-bottom:10px;">\uD83D\uDCE7 Send Report to Customer</div>' +
      '<div class="do-form-group" style="margin-bottom:8px;">' +
        '<label style="font-size:0.8rem;">Customer Email</label>' +
        '<input type="email" id="complete-email" value="' + escDO(insp.contact_email || '') + '"' +
          ' placeholder="customer@example.com" style="width:100%;">' +
      '</div>' +
      '<button class="btn-primary-do" style="width:100%;font-size:0.85rem;"' +
        ' onclick="sendInspectionReportEmail(' + insp.id + ')">' +
        '\uD83D\uDCE7 Send Report</button>' +
      '<div id="send-report-result" style="margin-top:6px;font-size:0.82rem;"></div>' +
    '</div>' +

    // Link to Jobber Job card
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;">' +
      '<div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;">\uD83D\uDD17 Link to Jobber Job</div>' +
      '<div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;">Attach this report as a note on the Jobber job.</div>' +
      '<div style="display:flex;gap:8px;align-items:center;">' +
        '<input type="text" id="jobber-jobnumber" placeholder="Job #" value="' + escDO(insp.jobber_job_id || '') + '"' +
          ' style="flex:1;max-width:140px;">' +
        '<button style="padding:9px 14px;background:var(--surface);border:1px solid var(--border);' +
          'border-radius:8px;color:var(--text);font-size:0.85rem;cursor:pointer;"' +
          ' onclick="attachReportToJobberJob(' + insp.id + ')">' +
          '\uD83D\uDD17 Link Job</button>' +
      '</div>' +
      '<div id="jobber-link-result" style="margin-top:6px;font-size:0.82rem;"></div>' +
    '</div>' +

    // Draft Jobber Quote (only if deficiencies)
    (defs.length > 0
      ? '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;">' +
          '<div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;">\uD83D\uDCCB Draft Jobber Quote</div>' +
          '<div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;">Creates a Jobber quote with all deficiencies as a single line item.</div>' +
          '<button id="create-quote-btn" class="btn-primary-do" style="width:100%;font-size:0.85rem;"' +
            ' onclick="createJobberQuoteFromComplete(' + insp.id + ')">' +
            '\uD83D\uDCCB Draft Quote in Jobber</button>' +
          '<div id="create-quote-result" style="margin-top:6px;font-size:0.82rem;"></div>' +
        '</div>'
      : '') +

    // Back link
    '<div style="padding:8px 0 24px;text-align:center;">' +
      '<a href="#" onclick="renderInspectionOverview();return false;"' +
        ' style="color:var(--green);font-size:0.88rem;">\u2190 Back to Overview</a>' +
    '</div>' +

  '</div>';
}

// ─── REPORT LINK ──────────────────────────────────────────────────────────────
async function getInspectionReportLink(inspId) {
  const resultEl = document.getElementById('report-link-result');
  if (resultEl) resultEl.innerHTML = '<span style="color:var(--muted);font-size:0.82rem;">Generating link\u2026</span>';
  try {
    const resp = await fetch('/api/inspections/' + inspId + '/report-link', {
      method: 'POST', credentials: 'include'
    });
    if (!resp.ok) { showToast('Failed to generate link', 'error'); return; }
    const { url } = await resp.json();
    if (resultEl) {
      resultEl.innerHTML =
        '<div style="background:var(--bg,#f5f5f5);border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:4px;">' +
          '<div style="font-size:0.78rem;color:var(--muted);margin-bottom:6px;">Shareable link:</div>' +
          '<div style="word-break:break-all;font-size:0.8rem;margin-bottom:8px;">' + escDO(url) + '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button style="padding:6px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;cursor:pointer;"' +
              ' onclick="navigator.clipboard.writeText(\'' + url.replace(/'/g, "\\'") + '\').then(()=>showToast(\'Copied! \u2713\'))">Copy Link</button>' +
            '<a href="' + escDO(url) + '" target="_blank" rel="noopener"' +
              ' style="padding:6px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;text-decoration:none;color:var(--text);">View Report \u2197</a>' +
          '</div>' +
        '</div>';
    }
  } catch(e) { showToast('Network error', 'error'); }
}

// ─── PDF VIA REPORT LINK ──────────────────────────────────────────────────────
async function openInspectionReportPdf(inspId) {
  try {
    const resp = await fetch('/api/inspections/' + inspId + '/report-link', {
      method: 'POST', credentials: 'include'
    });
    if (!resp.ok) { showToast('Failed to generate PDF link', 'error'); return; }
    const { url } = await resp.json();
    window.open(url, '_blank', 'noopener');
    const resultEl = document.getElementById('report-link-result');
    if (resultEl && !resultEl.innerHTML.includes(url)) {
      resultEl.innerHTML =
        '<div style="background:var(--bg,#f5f5f5);border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:4px;">' +
          '<div style="font-size:0.78rem;color:var(--muted);margin-bottom:6px;">Shareable link:</div>' +
          '<div style="word-break:break-all;font-size:0.8rem;margin-bottom:8px;">' + escDO(url) + '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button style="padding:6px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;cursor:pointer;"' +
              ' onclick="navigator.clipboard.writeText(\'' + url.replace(/'/g, "\\'") + '\').then(()=>showToast(\'Copied! \u2713\'))">Copy Link</button>' +
            '<a href="' + escDO(url) + '" target="_blank" rel="noopener"' +
              ' style="padding:6px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;text-decoration:none;color:var(--text);">View Report \u2197</a>' +
          '</div>' +
        '</div>';
    }
  } catch(e) { showToast('Network error', 'error'); }
}

// ─── SEND REPORT EMAIL ────────────────────────────────────────────────────────
async function sendInspectionReportEmail(inspId) {
  const emailVal = document.getElementById('complete-email')?.value?.trim();
  const resultEl = document.getElementById('send-report-result');
  if (!emailVal) { showToast('Enter a customer email', 'error'); return; }
  if (resultEl) resultEl.innerHTML = '<span style="color:var(--muted);">Sending\u2026</span>';
  try {
    const resp = await fetch('/api/inspections/' + inspId + '/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: emailVal })
    });
    const data = await resp.json();
    if (resp.ok) {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--green);">\u2705 Report sent to ' + escDO(data.to || emailVal) + '</span>';
      showToast('Report sent \u2713');
    } else {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--danger);">\u274c ' + escDO(data.error || 'Send failed') + '</span>';
    }
  } catch(e) {
    if (resultEl) resultEl.innerHTML = '<span style="color:var(--danger);">Network error</span>';
  }
}

// ─── ATTACH REPORT TO JOBBER JOB ─────────────────────────────────────────────
async function attachReportToJobberJob(inspId) {
  const jobNumber = document.getElementById('jobber-jobnumber')?.value?.trim();
  const resultEl  = document.getElementById('jobber-link-result');
  if (!jobNumber) {
    if (resultEl) resultEl.innerHTML = '<span style="color:var(--danger);">Enter a job number first</span>';
    return;
  }
  if (resultEl) resultEl.innerHTML = '<span style="color:var(--muted);">Linking\u2026</span>';
  try {
    const linkResp = await fetch('/api/inspections/' + inspId + '/report-link', { method: 'POST', credentials: 'include' });
    if (!linkResp.ok) { if (resultEl) resultEl.innerHTML = '<span style="color:var(--danger);">Could not generate report link</span>'; return; }
    const { url: reportUrl } = await linkResp.json();

    const resp = await fetch('/api/jobber/job-attach-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ inspectionId: inspId, jobNumber, reportUrl })
    });
    const data = await resp.json();
    if (resp.ok && data.success) {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--green);">\u2705 Report linked to Job #' + escDO(String(jobNumber)) + ' in Jobber</span>';
      showToast('Linked to Jobber Job #' + jobNumber + ' \u2713');
    } else {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--danger);">\u274c ' + escDO(data.error || 'Unknown error') + '</span>';
    }
  } catch(e) {
    if (resultEl) resultEl.innerHTML = '<span style="color:var(--danger);">Network error</span>';
  }
}

// ─── CREATE JOBBER QUOTE (complete screen) ────────────────────────────────────
async function createJobberQuoteFromComplete(inspId) {
  const btn      = document.getElementById('create-quote-btn');
  const resultEl = document.getElementById('create-quote-result');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating quote\u2026'; }
  if (resultEl) resultEl.innerHTML = '<span style="color:var(--muted);">Creating quote in Jobber\u2026</span>';
  try {
    const resp = await fetch('/api/jobber/create-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ inspectionId: inspId })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed');
    if (resultEl) resultEl.innerHTML =
      '<span style="color:var(--green);">\u2705 Quote #' + data.quoteNumber + ' created! ' +
      '<a href="' + escDO(data.jobberWebUri) + '" target="_blank" style="color:var(--green);">' +
      'Open in Jobber \u2197</a></span>';
    if (btn) btn.textContent = '\u2705 Quote Created';
    showToast('Quote #' + data.quoteNumber + ' created in Jobber');
  } catch(err) {
    if (resultEl) resultEl.innerHTML = '<span style="color:var(--danger);">\u274c ' + escDO(err.message) + '</span>';
    if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCCB Draft Quote in Jobber'; }
  }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function escDO(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Backward compat aliases
function openDoorDetail(doorId) { openDoor(doorId); }
function renderDoorDetailWithPhotos(doorId) { openDoor(doorId); }
