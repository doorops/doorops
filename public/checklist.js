// ============================================================
// DoorOps — Checklist Module (AccessGuard-style)
// Shared state: _currentInspection (set by inspections.js)
// ============================================================

let _currentDoorId = null;
let _findingsFilter = 'all'; // 'all' | 'issues'
let _syncTimers = {};        // findingId → setTimeout handle

// ─── Door-type helpers ────────────────────────────────────────────────────────

function getDoorTypeLabel(dt) {
  const map = {
    sectional:    'Sectional Door',
    rolling_steel:'Rolling Steel',
    high_speed:   'High Speed Door',
    fire_door:    'Fire Door',
    dock_leveler: 'Dock Leveler',
    other:        'Other'
  };
  return map[dt] || (dt || '').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}

function isCommercialDoorType(dt) {
  return ['rolling_steel','high_speed','fire_door','dock_leveler'].includes(dt);
}

function getRatingButtons(doorType) {
  if (isCommercialDoorType(doorType)) {
    return [
      { key: 'pass',            label: 'Pass' },
      { key: 'needs_attention', label: 'Needs Attn' },
      { key: 'fail',            label: 'Fail' }
    ];
  }
  return [
    { key: 'good', label: 'Good' },
    { key: 'fair', label: 'Fair' },
    { key: 'poor', label: 'Poor' }
  ];
}

function isIssueRating(rating) {
  return ['fair','poor','needs_attention','fail'].includes(rating);
}

function getRatingClass(rating) {
  if (!rating || rating === 'na') return '';
  return 'rating-' + rating;
}

function calcDoorProgress(door) {
  const findings = door.findings || [];
  let total = 0, done = 0, issues = 0, worstRating = null;
  const ratingOrder = ['good','pass','fair','needs_attention','poor','fail'];

  findings.forEach(f => {
    if (f.rating !== 'na') total++;
    if (f.rating && f.rating !== 'na') {
      done++;
      const idx = ratingOrder.indexOf(f.rating);
      const wi  = worstRating ? ratingOrder.indexOf(worstRating) : -1;
      if (idx > wi) worstRating = f.rating;
    }
    if (isIssueRating(f.rating)) issues++;
  });

  let statusClass = 'door-status-not-started';
  let statusLabel = 'NOT STARTED';
  if (done > 0 && done < total)    { statusClass = 'door-status-in-progress'; statusLabel = 'IN PROGRESS'; }
  else if (done > 0 && done >= total && total > 0) { statusClass = 'door-status-complete';    statusLabel = 'COMPLETE'; }

  let colorClass = '';
  if (worstRating === 'poor' || worstRating === 'fail')             colorClass = 'worst-poor';
  else if (worstRating === 'fair' || worstRating === 'needs_attention') colorClass = 'worst-fair';
  else if (worstRating === 'good' || worstRating === 'pass')        colorClass = 'worst-good';

  return { total, done, issues, statusClass, statusLabel, colorClass };
}

function calcInspectionProgress(insp) {
  let total = 0, done = 0, issues = 0;
  (insp.doors || []).forEach(d => {
    (d.findings || []).forEach(f => {
      if (f.rating !== 'na') total++;
      if (f.rating && f.rating !== 'na') done++;
      if (isIssueRating(f.rating)) issues++;
    });
  });
  return { total, done, issues };
}

function getDoorConfigSummary(door) {
  const parts = [];
  if (door.door_width_ft && door.door_height_ft) parts.push(door.door_width_ft + "' × " + door.door_height_ft + "'");
  if (door.make)        parts.push(door.make);
  if (door.model)       parts.push(door.model);
  if (door.opener_make) parts.push(door.opener_make + (door.opener_hp ? ' ' + door.opener_hp + 'hp' : ''));
  return parts.join(' · ');
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function openDoor(doorId) {
  _currentDoorId = doorId;
  _findingsFilter = 'all';
  renderDoorChecklist();
}

// ─── Catalogue (simple hardcoded list for deficiency autocomplete) ─────────────

const CATALOGUE_ITEMS = [
  'Replace torsion spring','Replace extension spring','Replace spring',
  'Lubricate hinges and rollers','Replace bottom weather seal',
  'Replace side weather seal','Replace top weather seal',
  'Replace panel','Repair panel dent','Replace all panels',
  'Replace rollers','Replace hinges','Tighten loose hardware',
  'Align tracks','Straighten bent track','Replace track section',
  'Replace cables','Re-seat cables on drums','Replace cable drums',
  'Service/adjust opener','Replace opener','Replace safety reversal',
  'Adjust photo eye sensors','Replace photo eye sensors',
  'Replace belt/chain/screw drive','Replace opener motor',
  'Replace fusible link','Replace UL label','Test gravity close',
  'Replace dock leveler lip','Service dock leveler hydraulics',
  'Replace hydraulic fluid','Replace dock leveler seals',
  'Replace curtain slats','Replace bottom bar','Replace end locks',
  'Realign curtain guides','Replace curtain material',
  'Balance door (spring adjustment)','Add/replace safety label',
  'Replace emergency release cord'
];

function searchCatalogue(value, findingId) {
  const el = document.getElementById('cat-suggest-' + findingId);
  if (!el) return;
  if (!value || value.length < 2) { el.innerHTML = ''; return; }
  const q = value.toLowerCase();
  const matches = CATALOGUE_ITEMS.filter(i => i.toLowerCase().includes(q)).slice(0, 5);
  el.innerHTML = matches.map(m =>
    `<span class="catalogue-pill" onclick="applyCatSuggestion(${findingId},'${escHtml(m)}')">${m}</span>`
  ).join('');
}

function applyCatSuggestion(findingId, value) {
  const input = document.querySelector(`#finding-${findingId} .deficiency-title-input`);
  if (input) {
    input.value = value;
    document.getElementById('cat-suggest-' + findingId).innerHTML = '';
    saveDeficiencyTitle(findingId, value);
  }
}

// ─── Render Door Checklist ────────────────────────────────────────────────────

function renderDoorChecklist() {
  const page = document.getElementById('page-inspections');
  if (!page || !_currentInspection) return;

  const insp = _currentInspection;
  const door = (insp.doors || []).find(d => d.id === _currentDoorId);
  if (!door) { page.innerHTML = '<div class="insp-empty-state">Door not found</div>'; return; }

  const findings   = door.findings || [];
  const ratingBtns = getRatingButtons(door.door_type);
  const dp         = calcDoorProgress(door);
  const doors      = insp.doors || [];

  // Tab strip — shown when >1 door
  const tabStrip = doors.length > 1
    ? `<div class="door-tab-strip">
        ${doors.map(d => `<button class="door-tab${d.id === door.id ? ' active' : ''}" onclick="openDoor(${d.id})">${escHtml(d.location_label || d.location || 'Door ' + d.door_number)}</button>`).join('')}
       </div>`
    : '';

  // Group findings by category
  const categories = {};
  findings.forEach(f => {
    const cat = f.template_category || f.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(f);
  });

  const categoryBlocks = Object.entries(categories).map(([catName, catFindings]) => {
    const catDone   = catFindings.filter(f => f.rating && f.rating !== 'na').length;
    const catIssues = catFindings.filter(f => isIssueRating(f.rating)).length;
    const findingRows = catFindings.map(f => renderFindingRow(f, door.door_type, ratingBtns)).join('');
    return `
      <div class="checklist-category" data-category="${escHtml(catName)}">
        <div class="category-header" onclick="toggleCategory(this)">
          <span class="category-name">${escHtml(catName)}</span>
          <span class="category-progress">${catDone}/${catFindings.length}</span>
          ${catIssues > 0 ? `<span class="door-issue-badge" style="margin-left:6px;">${catIssues}</span>` : ''}
          <span class="chevron" style="margin-left:8px;color:var(--muted);">▼</span>
        </div>
        <div class="category-items">${findingRows}</div>
      </div>`;
  }).join('');

  const configSummary = getDoorConfigSummary(door);

  page.innerHTML = `
    <div class="insp-door-header">
      <button onclick="renderInspectionOverview()" class="back-btn">← Back</button>
      <div class="door-title" style="flex:1;min-width:0;">
        <span style="font-weight:700;">${escHtml(door.location_label || door.location || 'Door ' + door.door_number)}</span>
        <span class="door-type-label">${getDoorTypeLabel(door.door_type)}</span>
        ${configSummary ? `<div style="font-size:0.75rem;color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(configSummary)}</div>` : ''}
      </div>
      <div class="door-progress">${dp.done}/${dp.total}</div>
    </div>
    ${tabStrip}
    <div class="issues-toggle">
      <button id="toggle-all"    class="${_findingsFilter === 'all'    ? 'active' : ''}" onclick="setFindingsFilter('all')">All items</button>
      <button id="toggle-issues" class="${_findingsFilter === 'issues' ? 'active' : ''}" onclick="setFindingsFilter('issues')">Issues only</button>
    </div>
    <div id="checklist-body">
      ${categoryBlocks || '<div class="insp-empty-state">No checklist items for this door.</div>'}
    </div>
    <div class="door-complete-bar">
      <button class="btn-door-complete" onclick="completeDoor(${door.id})">✅ Complete</button>
    </div>`;

  // Auto-expand categories with issues
  document.querySelectorAll('.checklist-category').forEach(catEl => {
    if (catEl.querySelector('.door-issue-badge')) {
      const items   = catEl.querySelector('.category-items');
      const chevron = catEl.querySelector('.chevron');
      if (items)   items.classList.remove('collapsed');
      if (chevron) chevron.textContent = '▼';
    }
  });

  if (_findingsFilter === 'issues') setFindingsFilter('issues');
}

// ─── Render single finding row ────────────────────────────────────────────────

function renderFindingRow(f, doorType, ratingBtns) {
  const isIssue    = isIssueRating(f.rating);
  const hasIssue   = isIssue ? ' has-issue' : '';
  const ratedClass = (f.rating && f.rating !== '') ? ' finding-rated' : '';
  const ratingClass = getRatingClass(f.rating);
  const hasNotes   = (f.notes && f.notes.trim()) ? ' has-notes' : '';

  const ratingBtnsHtml = ratingBtns.map(rb =>
    `<button class="rating-btn ${rb.key}${f.rating === rb.key ? ' active' : ''}"
             onclick="setRating(${f.id},'${rb.key}')">${rb.label}</button>`
  ).join('');

  const naActive = f.rating === 'na' ? ' active' : '';

  const photoCount = (f.photos || []).length;
  const photosHtml = photoCount > 0
    ? `<img src="${f.photos[0].url}" style="width:22px;height:22px;object-fit:cover;border-radius:3px;" onerror="this.style.display='none'">${photoCount > 1 ? `<sup style="font-size:0.65rem;margin-left:1px;">+${photoCount-1}</sup>` : ''}`
    : '📷';

  const defBody = buildDeficiencyForm(f);

  return `
    <div class="finding-row${ratedClass}${hasIssue} ${ratingClass}"
         data-finding-id="${f.id}" id="finding-${f.id}" data-rating="${f.rating || ''}">
      <div class="finding-label">
        ${escHtml(f.template_label || f.item || f.label || 'Item')}
        ${f.critical ? '<span class="photo-required-badge" title="Safety critical">⚠</span>' : ''}
      </div>
      <div class="finding-controls">
        <div class="rating-buttons">${ratingBtnsHtml}</div>
        <button class="na-btn${naActive}" onclick="setRating(${f.id},'na')">N/A</button>
        <button class="notes-btn${hasNotes}" id="notes-btn-${f.id}" onclick="toggleNotes(${f.id})">📝</button>
        <button class="photo-btn" onclick="handlePhotoBtn(${f.id})">${photosHtml}</button>
      </div>
      <div class="finding-notes-area" id="notes-${f.id}" style="display:none;">
        <textarea placeholder="Add note…"
                  onblur="saveNote(${f.id},this.value)">${escHtml(f.notes || '')}</textarea>
      </div>
      <div class="finding-deficiency-area" id="deficiency-${f.id}" style="display:${isIssue ? '' : 'none'};">
        ${defBody}
      </div>
      <input type="file" id="photo-input-${f.id}" accept="image/*" multiple style="display:none;"
             onchange="handlePhotoUpload(${f.id},this)">
      <div class="finding-photo-strip" id="photo-strip-${f.id}">
        ${renderPhotoStrip(f.id, f.photos || [])}
      </div>
    </div>`;
}

function buildDeficiencyForm(f) {
  const def = f.deficiency;
  return `
    <div class="deficiency-capture">
      <div class="deficiency-header">⚠ Deficiency</div>
      <input type="text" placeholder="What needs to be done? (e.g. Replace torsion spring)"
             class="deficiency-title-input"
             value="${def ? escAttr(def.title || def.description || '') : ''}"
             oninput="searchCatalogue(this.value,${f.id})"
             onblur="saveDeficiencyTitle(${f.id},this.value)">
      <div class="catalogue-suggestions" id="cat-suggest-${f.id}"></div>
      <textarea placeholder="Notes / details (condition, measurements, urgency…)"
                class="deficiency-notes-input"
                onblur="saveDeficiencyDesc(${f.id},this.value)">${def ? escHtml(def.description || '') : ''}</textarea>
      <div class="deficiency-fields">
        <select class="severity-select" onchange="saveDeficiencySeverity(${f.id},this.value)">
          <option value="advisory"${(!def || def.severity==='advisory') ? ' selected' : ''}>Advisory</option>
          <option value="moderate"${def && def.severity==='moderate' ? ' selected' : ''}>Moderate</option>
          <option value="safety_critical"${def && def.severity==='safety_critical' ? ' selected' : ''}>⚠ Safety Critical</option>
        </select>
        <label style="font-size:0.85rem;display:flex;align-items:center;gap:6px;">
          <input type="checkbox" ${!def || def.include_in_quote !== false ? 'checked' : ''}
                 onchange="saveDeficiencyQuote(${f.id},this.checked)"> Include in quote
        </label>
      </div>
    </div>`;
}

function renderPhotoStrip(findingId, photos) {
  if (!photos || !photos.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px 0 2px;">
    ${photos.map(p => `
      <div style="position:relative;flex-shrink:0;">
        <img src="${p.url}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;"
             onclick="openPhotoLightbox('${p.url}')"
             onerror="this.parentElement.style.display='none'">
        <button onclick="deletePhoto(${p.id},${findingId})"
                style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);border:none;border-radius:50%;width:18px;height:18px;color:#fff;font-size:10px;cursor:pointer;line-height:18px;text-align:center;">×</button>
      </div>`).join('')}
  </div>`;
}

// ─── Optimistic Rating Update ─────────────────────────────────────────────────

function setRating(findingId, rating) {
  if (!_currentInspection) return;

  let targetFinding = null, targetDoor = null;
  for (const door of (_currentInspection.doors || [])) {
    const f = (door.findings || []).find(f => f.id === findingId);
    if (f) { targetFinding = f; targetDoor = door; break; }
  }
  if (!targetFinding) return;

  targetFinding.rating = rating;

  // localStorage for resilience
  try {
    localStorage.setItem('do_finding_' + findingId, JSON.stringify({ rating, notes: targetFinding.notes || '' }));
  } catch(e) {}

  // Queue background sync
  queueSync(findingId, { rating, note: targetFinding.notes || '' });

  // --- Optimistic DOM update ---
  const row = document.getElementById('finding-' + findingId);
  if (row) {
    // Clear rating classes
    row.classList.remove('finding-rated','has-issue',
      'rating-good','rating-fair','rating-poor',
      'rating-pass','rating-needs_attention','rating-fail','rating-na');
    row.dataset.rating = rating;

    if (rating)                   row.classList.add('finding-rated');
    if (isIssueRating(rating))    row.classList.add('has-issue', 'rating-' + rating);
    else if (rating && rating !== 'na') row.classList.add('rating-' + rating);

    // Update buttons
    row.querySelectorAll('.rating-btn').forEach(btn => {
      const btnKey = Array.from(btn.classList).find(c =>
        ['good','fair','poor','pass','needs_attention','fail'].includes(c)
      );
      if (btnKey) btn.classList.toggle('active', btnKey === rating);
    });
    const naBtn = row.querySelector('.na-btn');
    if (naBtn) naBtn.classList.toggle('active', rating === 'na');

    // Show/hide deficiency area
    const defArea = document.getElementById('deficiency-' + findingId);
    if (defArea) defArea.style.display = isIssueRating(rating) ? '' : 'none';
  }

  updateCategoryProgress(targetDoor);
  updateDoorHeaderProgress(targetDoor);

  if (_findingsFilter === 'issues') setFindingsFilter('issues');
}

function queueSync(findingId, data) {
  if (_syncTimers[findingId]) clearTimeout(_syncTimers[findingId]);
  _syncTimers[findingId] = setTimeout(() => {
    syncFinding(findingId, data);
    delete _syncTimers[findingId];
  }, 400);
}

async function syncFinding(findingId, data) {
  try {
    await fetch('/api/checklists/item/' + findingId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch(e) { /* offline — data is in localStorage */ }
}

// ─── Category Collapse ────────────────────────────────────────────────────────

function toggleCategory(header) {
  const items   = header.parentElement.querySelector('.category-items');
  const chevron = header.querySelector('.chevron');
  if (!items) return;
  const collapsed = items.classList.toggle('collapsed');
  if (chevron) chevron.textContent = collapsed ? '▶' : '▼';
}

function setFindingsFilter(mode) {
  _findingsFilter = mode;
  document.querySelectorAll('.issues-toggle button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('toggle-' + (mode === 'all' ? 'all' : 'issues'));
  if (btn) btn.classList.add('active');

  document.querySelectorAll('.finding-row').forEach(row => {
    if (mode === 'issues') {
      const r = row.dataset.rating || '';
      row.style.display = isIssueRating(r) ? '' : 'none';
    } else {
      row.style.display = '';
    }
  });
}

// ─── Notes ────────────────────────────────────────────────────────────────────

function toggleNotes(findingId) {
  const area = document.getElementById('notes-' + findingId);
  if (!area) return;
  const visible = area.style.display !== 'none';
  area.style.display = visible ? 'none' : '';
  if (!visible) area.querySelector('textarea')?.focus();
}

function saveNote(findingId, value) {
  if (!_currentInspection) return;
  for (const door of (_currentInspection.doors || [])) {
    const f = (door.findings || []).find(f => f.id === findingId);
    if (f) {
      f.notes = value;
      queueSync(findingId, { rating: f.rating || null, note: value });
      const notesBtn = document.getElementById('notes-btn-' + findingId);
      if (notesBtn) notesBtn.classList.toggle('has-notes', !!value.trim());
      break;
    }
  }
}

// ─── Inline Deficiency Capture ────────────────────────────────────────────────

function _getDeficiencyInfo(findingId) {
  if (!_currentInspection) return null;
  for (const door of (_currentInspection.doors || [])) {
    const f = (door.findings || []).find(f => f.id === findingId);
    if (f) return { finding: f, door };
  }
  return null;
}

async function saveDeficiencyTitle(findingId, value) {
  if (!value || !value.trim()) return;
  const info = _getDeficiencyInfo(findingId);
  if (!info) return;
  const { finding, door } = info;

  if (finding.deficiency && finding.deficiency.id) {
    // Update existing
    await fetch('/api/inspections/' + _currentInspection.id + '/deficiencies/' + finding.deficiency.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: value })
    }).catch(() => {});
    finding.deficiency.title = value;
  } else {
    // Create new
    try {
      const resp = await fetch('/api/inspections/' + _currentInspection.id + '/deficiencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          door_id: door.id,
          checklist_item_id: findingId,
          title: value,
          description: value,
          severity: 'advisory',
          include_in_quote: true
        })
      });
      if (resp.ok) {
        const def = await resp.json();
        finding.deficiency = {
          id: def.id, title: def.title || def.description,
          description: def.description, severity: def.severity,
          include_in_quote: def.include_in_quote
        };
      }
    } catch(e) {}
  }
}

async function saveDeficiencyDesc(findingId, value) {
  const info = _getDeficiencyInfo(findingId);
  if (!info || !info.finding.deficiency?.id) return;
  await fetch('/api/inspections/' + _currentInspection.id + '/deficiencies/' + info.finding.deficiency.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: value })
  }).catch(() => {});
  if (info.finding.deficiency) info.finding.deficiency.description = value;
}

async function saveDeficiencySeverity(findingId, value) {
  const info = _getDeficiencyInfo(findingId);
  if (!info || !info.finding.deficiency?.id) return;
  await fetch('/api/inspections/' + _currentInspection.id + '/deficiencies/' + info.finding.deficiency.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ severity: value })
  }).catch(() => {});
  if (info.finding.deficiency) info.finding.deficiency.severity = value;
}

async function saveDeficiencyQuote(findingId, checked) {
  const info = _getDeficiencyInfo(findingId);
  if (!info || !info.finding.deficiency?.id) return;
  await fetch('/api/inspections/' + _currentInspection.id + '/deficiencies/' + info.finding.deficiency.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ include_in_quote: checked })
  }).catch(() => {});
  if (info.finding.deficiency) info.finding.deficiency.include_in_quote = checked;
}

// ─── Progress update helpers ──────────────────────────────────────────────────

function updateCategoryProgress(door) {
  const byCategory = {};
  (door.findings || []).forEach(f => {
    const cat = f.template_category || f.category || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  });

  document.querySelectorAll('.checklist-category').forEach(catEl => {
    const catName   = catEl.dataset.category;
    const catItems  = byCategory[catName] || [];
    const done      = catItems.filter(f => f.rating && f.rating !== 'na').length;
    const issues    = catItems.filter(f => isIssueRating(f.rating)).length;

    const progEl = catEl.querySelector('.category-progress');
    if (progEl) progEl.textContent = done + '/' + catItems.length;

    const header = catEl.querySelector('.category-header');
    let badge    = catEl.querySelector('.door-issue-badge');
    if (issues > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'door-issue-badge';
        badge.style.marginLeft = '6px';
        const chevron = header.querySelector('.chevron');
        if (chevron) header.insertBefore(badge, chevron);
        else header.appendChild(badge);
      }
      badge.textContent = issues;
    } else if (badge) {
      badge.remove();
    }
  });
}

function updateDoorHeaderProgress(door) {
  const dp     = calcDoorProgress(door);
  const progEl = document.querySelector('.door-progress');
  if (progEl) progEl.textContent = dp.done + '/' + dp.total;
}

// ─── Door Complete ────────────────────────────────────────────────────────────

function completeDoor(doorId) {
  // Mark all unrated items as n/a then return to overview
  const door = (_currentInspection?.doors || []).find(d => d.id === doorId);
  if (!door) return;

  // Rate any still-unrated items as 'na' so progress = 100%
  (door.findings || []).forEach(f => {
    if (!f.rating) {
      f.rating = 'na';
      queueSync(f.id, { rating: 'na', note: f.notes || '' });
    }
  });

  renderInspectionOverview();
}

// ─── Photos ───────────────────────────────────────────────────────────────────

function handlePhotoBtn(findingId) {
  const input = document.getElementById('photo-input-' + findingId);
  if (input) input.click();
}

async function handlePhotoUpload(findingId, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  if (!_currentInspection) return;

  let door = null;
  for (const d of (_currentInspection.doors || [])) {
    if ((d.findings || []).find(f => f.id === findingId)) { door = d; break; }
  }
  if (!door) return;

  for (const file of files) {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('inspection_id', _currentInspection.id);
    fd.append('door_id', door.id);
    fd.append('checklist_item_id', findingId);

    try {
      const resp = await fetch('/api/photos', { method: 'POST', body: fd });
      if (resp.ok) {
        const photo = await resp.json();
        const f = (door.findings || []).find(f => f.id === findingId);
        if (f) {
          if (!f.photos) f.photos = [];
          f.photos.push(photo);
          const strip = document.getElementById('photo-strip-' + findingId);
          if (strip) strip.innerHTML = renderPhotoStrip(findingId, f.photos);

          // Update photo button
          const btn = document.querySelector(`#finding-${findingId} .photo-btn`);
          if (btn) {
            const count = f.photos.length;
            btn.innerHTML = `<img src="${f.photos[0].url}" style="width:22px;height:22px;object-fit:cover;border-radius:3px;" onerror="this.style.display='none'">${count > 1 ? `<sup style="font-size:0.65rem;margin-left:1px;">+${count-1}</sup>` : ''}`;
          }
        }
      }
    } catch(e) { showToast('Photo upload failed', 'error'); }
  }

  input.value = ''; // reset so same file can be re-selected
}

async function deletePhoto(photoId, findingId) {
  if (!confirm('Delete this photo?')) return;
  await fetch('/api/photos/' + photoId, { method: 'DELETE' }).catch(() => {});

  if (_currentInspection) {
    for (const door of (_currentInspection.doors || [])) {
      const f = (door.findings || []).find(f => f.id === findingId);
      if (f && f.photos) {
        f.photos = f.photos.filter(p => p.id !== photoId);
        const strip = document.getElementById('photo-strip-' + findingId);
        if (strip) strip.innerHTML = renderPhotoStrip(findingId, f.photos);
        const btn = document.querySelector(`#finding-${findingId} .photo-btn`);
        if (btn) {
          if (f.photos.length === 0) {
            btn.innerHTML = '📷';
          } else {
            btn.innerHTML = `<img src="${f.photos[0].url}" style="width:22px;height:22px;object-fit:cover;border-radius:3px;" onerror="this.style.display='none'">${f.photos.length > 1 ? `<sup style="font-size:0.65rem;">+${f.photos.length-1}</sup>` : ''}`;
          }
        }
        break;
      }
    }
  }
}

function openPhotoLightbox(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  overlay.innerHTML = `<img src="${url}" style="max-width:95vw;max-height:95vh;border-radius:8px;object-fit:contain;">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escAttr(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
