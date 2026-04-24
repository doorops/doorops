// ============================================================
// DoorOps — Checklist & Photo Module
// ============================================================

let _checklistItems = [];   // current door's checklist items
let _checklistDoor = null;  // door object we're checking

// ─── Open Checklist for a door ────────────────────────────────────────────────
async function openChecklist(doorId) {
  const door = (_currentInspection.doors || []).find(d => d.id === doorId);
  if (!door) return;
  _checklistDoor = door;

  const page = document.getElementById('page-inspections');
  page.innerHTML = '<div style="color:var(--muted);padding:32px;">Loading checklist…</div>';

  // Load existing responses
  const saved = await fetch('/api/checklists/door/' + doorId, { credentials: 'include' }).then(r => r.json()).catch(() => []);
  // Load template for this door type
  const template = await fetch('/api/checklists/template/' + (door.door_type || 'other'), { credentials: 'include' }).then(r => r.json()).catch(() => []);

  // Merge: use saved items if exist, otherwise use template
  if (saved.length > 0) {
    _checklistItems = saved;
  } else {
    _checklistItems = template.map((t, idx) => ({ ...t, result: null, note: '', sort_order: idx }));
  }

  renderChecklist();
}

function renderChecklist() {
  const door = _checklistDoor;
  const page = document.getElementById('page-inspections');

  const passCount = _checklistItems.filter(i => i.result === 'pass').length;
  const failCount = _checklistItems.filter(i => i.result === 'fail').length;
  const naCount = _checklistItems.filter(i => i.result === 'na').length;
  const total = _checklistItems.length;
  const done = passCount + failCount + naCount;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Group by category
  const categories = {};
  _checklistItems.forEach((item, idx) => {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push({ ...item, _idx: idx });
  });

  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <button onclick="openDoorDetail(${door.id})" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">←</button>
      <div style="flex:1;">
        <h1 style="margin:0;font-size:18px;">Checklist — Door ${door.door_number}${door.location ? ' · ' + escDO(door.location) : ''}</h1>
        <div style="font-size:12px;color:var(--muted);">${(door.door_type||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</div>
      </div>
      <button class="btn-primary-do" onclick="saveChecklist(${door.id})" style="padding:8px 14px;font-size:13px;">Save</button>
    </div>

    <!-- Progress bar -->
    <div style="background:var(--surface);border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:16px;">
      <div style="flex:1;">
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:var(--orange);border-radius:3px;transition:width 0.3s;"></div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);white-space:nowrap;">${done}/${total} · ${pct}%</div>
      <div style="display:flex;gap:8px;font-size:11px;">
        <span style="color:#22c55e;">✓ ${passCount}</span>
        <span style="color:#ef4444;">✗ ${failCount}</span>
        <span style="color:#6b7280;">— ${naCount}</span>
      </div>
    </div>

    <div id="checklist-body">
      ${Object.entries(categories).map(([cat, items]) => `
        <div style="margin-bottom:16px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--orange);margin-bottom:8px;padding-left:4px;">${escDO(cat)}</div>
          ${items.map(item => renderChecklistItem(item)).join('')}
        </div>
      `).join('')}
    </div>

    <div style="margin-top:20px;display:flex;gap:8px;">
      <button class="btn-primary-do" onclick="saveChecklist(${door.id})" style="flex:1;">Save Checklist</button>
      <button onclick="saveAndGenerateDeficiencies(${door.id})" style="flex:1;padding:10px;background:#ef444422;border:1px solid #ef444444;border-radius:8px;color:#ef4444;font-size:13px;font-weight:600;cursor:pointer;">⚠️ Save & Flag Failures</button>
    </div>
  `;
}

function renderChecklistItem(item) {
  const idx = item._idx;
  const res = item.result;
  const critTag = item.critical ? '<span style="font-size:9px;color:#ef4444;font-weight:700;margin-left:4px;">CRITICAL</span>' : '';

  const btnStyle = (val, activeColor, activeBg) => res === val
    ? `background:${activeBg};border:2px solid ${activeColor};color:${activeColor};font-weight:700;`
    : `background:transparent;border:1px solid var(--border);color:var(--muted);`;

  return `
    <div style="background:var(--surface);border-radius:8px;padding:12px 14px;margin-bottom:6px;${item.critical && res === 'fail' ? 'border:1px solid #ef4444;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
        <div style="font-size:13px;flex:1;">${escDO(item.item)}${critTag}</div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button onclick="setChecklistResult(${idx},'pass')" style="padding:4px 10px;border-radius:5px;font-size:11px;cursor:pointer;${btnStyle('pass','#22c55e','#22c55e22')}">✓ Pass</button>
          <button onclick="setChecklistResult(${idx},'fail')" style="padding:4px 10px;border-radius:5px;font-size:11px;cursor:pointer;${btnStyle('fail','#ef4444','#ef444422')}">✗ Fail</button>
          <button onclick="setChecklistResult(${idx},'na')" style="padding:4px 8px;border-radius:5px;font-size:11px;cursor:pointer;${btnStyle('na','#6b7280','#6b728022')}">N/A</button>
        </div>
      </div>
      ${(res === 'fail' || item.note) ? `
        <input type="text" placeholder="Note (required for failures)…" value="${escDO(item.note || '')}"
          oninput="setChecklistNote(${idx}, this.value)"
          style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;">
      ` : ''}
    </div>
  `;
}

function setChecklistResult(idx, val) {
  _checklistItems[idx].result = val;
  renderChecklist();
}

function setChecklistNote(idx, val) {
  _checklistItems[idx].note = val;
}

async function saveChecklist(doorId) {
  const resp = await fetch('/api/checklists/door/' + doorId, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: _checklistItems })
  });
  if (!resp.ok) { alert('Failed to save checklist.'); return; }
  _checklistItems = await resp.json();
  renderChecklist();
  showToast('Checklist saved ✓');
}

async function saveAndGenerateDeficiencies(doorId) {
  await saveChecklist(doorId);

  const failures = _checklistItems.filter(i => i.result === 'fail');
  if (!failures.length) { alert('No failures to flag.'); return; }

  let added = 0;
  for (const item of failures) {
    const resp = await fetch('/api/inspections/' + _currentInspection.id + '/deficiencies', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        door_id: doorId,
        severity: item.critical ? 'safety_critical' : 'advisory',
        description: item.item + (item.note ? ' — ' + item.note : ''),
        include_in_quote: item.critical
      })
    });
    if (resp.ok) added++;
  }

  // Reload inspection
  const updated = await fetch('/api/inspections/' + _currentInspection.id, { credentials: 'include' });
  _currentInspection = await updated.json();

  showToast(`${added} deficiencie${added !== 1 ? 's' : 'y'} added ✓`);
  openDoorDetail(doorId);
}

// ─── PHOTOS ───────────────────────────────────────────────────────────────────
let _doorPhotos = [];

async function loadDoorPhotos(doorId) {
  const resp = await fetch('/api/photos/door/' + doorId, { credentials: 'include' });
  _doorPhotos = resp.ok ? await resp.json() : [];
  return _doorPhotos;
}

function renderPhotoSection(doorId) {
  const photos = _doorPhotos;
  return `
    <div style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);">Photos (${photos.length})</div>
        <label style="padding:6px 12px;background:var(--orange);border-radius:6px;color:#000;font-size:12px;font-weight:700;cursor:pointer;">
          📷 Add Photo
          <input type="file" accept="image/*" capture="environment" style="display:none;" onchange="uploadDoorPhoto(event, ${doorId})">
        </label>
      </div>
      ${photos.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">
          ${photos.map(p => `
            <div style="position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--surface);">
              <img src="${p.url}" style="width:100%;height:100%;object-fit:cover;" onclick="viewPhoto('${p.url}')">
              <button onclick="deletePhoto(${p.id}, ${doorId})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);border:none;border-radius:50%;width:22px;height:22px;color:#fff;font-size:13px;cursor:pointer;line-height:22px;text-align:center;">×</button>
              ${p.caption ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);padding:3px 6px;font-size:10px;color:#fff;">${escDO(p.caption)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : '<div style="color:var(--muted);font-size:13px;">No photos yet. Tap "Add Photo" to capture.</div>'}
    </div>
  `;
}

async function uploadDoorPhoto(event, doorId) {
  const file = event.target.files[0];
  if (!file) return;

  const caption = prompt('Caption (optional):') || '';
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('inspection_id', _currentInspection.id);
  formData.append('door_id', doorId);
  if (caption) formData.append('caption', caption);

  showToast('Uploading…');

  const resp = await fetch('/api/photos', {
    method: 'POST',
    credentials: 'include',
    body: formData
  });

  if (!resp.ok) { alert('Upload failed.'); return; }

  await loadDoorPhotos(doorId);
  // Re-render door detail to show new photo
  const updated = await fetch('/api/inspections/' + _currentInspection.id, { credentials: 'include' });
  _currentInspection = await updated.json();
  renderDoorDetailWithPhotos(doorId);
  showToast('Photo uploaded ✓');
}

async function deletePhoto(photoId, doorId) {
  if (!confirm('Delete this photo?')) return;
  await fetch('/api/photos/' + photoId, { method: 'DELETE', credentials: 'include' });
  await loadDoorPhotos(doorId);
  renderDoorDetailWithPhotos(doorId);
}

function viewPhoto(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  overlay.innerHTML = `<img src="${url}" style="max-width:95vw;max-height:95vh;border-radius:8px;object-fit:contain;">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// Enhanced door detail that includes photos and checklist button
async function renderDoorDetailWithPhotos(doorId) {
  _currentDoor = (_currentInspection.doors || []).find(d => d.id === doorId);
  if (!_currentDoor) return;
  await loadDoorPhotos(doorId);
  renderDoorDetailFull();
}

function renderDoorDetailFull() {
  const d = _currentDoor;
  const i = _currentInspection;
  const page = document.getElementById('page-inspections');
  const doorDefs = (i.deficiencies || []).filter(def => def.door_id === d.id);

  // Checklist completion
  const clPass = _doorPhotos.length; // reuse slot - will be recalculated below

  page.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <button onclick="renderInspectionDetail()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;">←</button>
      <h1 style="margin:0;">Door ${d.door_number}${d.location ? ' — ' + escDO(d.location) : ''}</h1>
    </div>

    <!-- Quick info chips -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:20px;max-width:700px;">
      ${infoChip('Type', (d.door_type||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))}
      ${infoChip('Size', d.door_width_ft && d.door_height_ft ? d.door_width_ft + "' × " + d.door_height_ft + "'" : d.door_size)}
      ${infoChip('Condition', d.overall_condition)}
      ${infoChip('Make', d.make)}
      ${infoChip('Model', d.model)}
      ${infoChip('Serial', d.serial_number)}
      ${infoChip('Install Year', d.install_year)}
      ${infoChip('Opener', [d.opener_make,d.opener_model,d.opener_hp?d.opener_hp+'hp':null].filter(Boolean).join(' '))}
    </div>

    ${d.notes ? `<div style="background:var(--surface);border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:var(--muted);">${escDO(d.notes)}</div>` : ''}

    <!-- Action buttons -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;">
      <button onclick="openChecklist(${d.id})" style="padding:9px 16px;background:var(--orange);border:none;border-radius:8px;color:#000;font-size:13px;font-weight:700;cursor:pointer;">📋 Checklist</button>
      <button onclick="addDeficiencyForDoor(${d.id})" style="padding:9px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">⚠️ Add Deficiency</button>
      <button onclick="deleteDoor(${d.id})" style="padding:9px 16px;background:#ef444422;border:1px solid #ef444444;border-radius:8px;color:#ef4444;font-size:13px;cursor:pointer;">🗑 Delete</button>
    </div>

    <!-- Photos -->
    ${renderPhotoSection(d.id)}

    <!-- Deficiencies -->
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);">Deficiencies (${doorDefs.length})</div>
        <button onclick="addDeficiencyForDoor(${d.id})" style="padding:5px 10px;background:var(--orange);border:none;border-radius:6px;color:#000;font-size:11px;font-weight:700;cursor:pointer;">+ Add</button>
      </div>
      ${doorDefs.length ? doorDefs.map(def => deficiencyCard(def)).join('') : '<div style="color:var(--muted);font-size:13px;">No deficiencies recorded.</div>'}
    </div>
  `;
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById('do-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'do-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1f2937;color:#f9fafb;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:600;z-index:9998;transition:opacity 0.3s;border:1px solid #374151;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}
