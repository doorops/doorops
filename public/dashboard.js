// ============================================================
// DoorOps — Dashboard + Team + Settings
// ============================================================

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  const page = document.getElementById('page-dashboard');
  page.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="margin:0;">Dashboard</h1>
      <div style="color:var(--muted);font-size:14px;margin-top:4px;" id="dash-greeting"></div>
    </div>
    <div id="dash-stats" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:28px;">
      ${[1,2,3,4].map(() => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;"><div style="height:32px;background:var(--border);border-radius:4px;margin-bottom:8px;"></div><div style="height:14px;background:var(--border);border-radius:4px;width:60%;"></div></div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px;">
      <div id="dash-recent"></div>
      <div id="dash-actions"></div>
    </div>
  `;

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-greeting').textContent = `${greeting}, ${(_currentUser?.name || '').split(' ')[0]}`;

  try {
    const resp = await fetch('/api/team/stats/dashboard', { credentials: 'include' });
    if (!resp.ok) throw new Error();
    const s = await resp.json();

    // Severity alert bar
    const alertBar = (s.safety_critical_open > 0 || s.moderate_deficiencies > 0 || s.advisory_deficiencies > 0) ? `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;">
        <span style="font-size:13px;font-weight:700;color:var(--danger);">\ud83d\udd34 ${s.safety_critical_open || 0} Critical</span>
        <span style="font-size:13px;font-weight:700;color:#d4a017;">\ud83d\udfe1 ${s.moderate_deficiencies || 0} Moderate</span>
        <span style="font-size:13px;font-weight:700;color:var(--green-light);">\ud83d\udfe2 ${s.advisory_deficiencies || 0} Advisory</span>
      </div>` : '';

    document.getElementById('dash-stats').innerHTML = alertBar + `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;">
        ${statCard(s.total_inspections, 'Total', '\ud83d\udd0d', '')}
        ${statCard(s.this_week || 0, 'This Week', '\ud83d\udcc5', '')}
        ${statCard(s.open_deficiencies || 0, 'Open Deficiencies', '\u26a0\ufe0f', (s.open_deficiencies || 0) > 0 ? 'color:var(--warn)' : '')}
        ${statCard('$' + (s.revenue_opportunity || 0).toLocaleString('en-CA', {minimumFractionDigits:0, maximumFractionDigits:0}), 'Revenue Opp.', '\ud83d\udcb0', 'color:var(--green-light)')}
      </div>
    `;

    // Recent inspections
    const _statusColors = { draft: '#94a3b8', in_progress: '#3b82f6', complete: '#22c55e', sent: '#a855f7' };
    const _statusLabels = { draft: 'Draft', in_progress: 'In Progress', complete: 'Complete', sent: 'Sent' };
    document.getElementById('dash-recent').innerHTML = `
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:12px;">Recent Inspections</div>
      ${s.recent_inspections.length ? s.recent_inspections.map(i => {
        const sc = _statusColors[i.status] || '#94a3b8';
        const sl = _statusLabels[i.status] || i.status;
        return `<div onclick="navigate('inspections');setTimeout(()=>openInspection(${i.id}),300)" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:border-color 0.15s;" onmouseover="this.style.borderColor='var(--green)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:600;font-size:13px;">${escDO(i.property_name || i.property_address)}</div>
            <span style="background:${sc}22;color:${sc};border:1px solid ${sc}44;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;">${sl}</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;">${i.inspection_date ? new Date(i.inspection_date).toLocaleDateString('en-CA') : 'No date'} \u00b7 ${i.deficiency_count} deficiencies</div>
        </div>`;
      }).join('') : '<div style="color:var(--muted);font-size:13px;">No inspections yet.</div>'}
    `;

    // Quick actions
    document.getElementById('dash-actions').innerHTML = `
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:12px;">Quick Actions</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button onclick="navigate('inspections');setTimeout(showNewInspectionForm,300)" class="dash-action-btn">
          <span style="font-size:20px;">🔍</span>
          <div style="text-align:left;">
            <div style="font-weight:700;font-size:14px;">New Inspection</div>
            <div style="font-size:11px;color:var(--muted);">Start a commercial door report</div>
          </div>
        </button>
        <button onclick="navigate('team')" class="dash-action-btn">
          <span style="font-size:20px;">👥</span>
          <div style="text-align:left;">
            <div style="font-weight:700;font-size:14px;">Manage Team</div>
            <div style="font-size:11px;color:var(--muted);">${s.team_count} member${s.team_count !== 1 ? 's' : ''} on your account</div>
          </div>
        </button>
        <button onclick="navigate('settings')" class="dash-action-btn">
          <span style="font-size:20px;">⚙️</span>
          <div style="text-align:left;">
            <div style="font-weight:700;font-size:14px;">Settings</div>
            <div style="font-size:11px;color:var(--muted);">Company profile & integrations</div>
          </div>
        </button>
      </div>
    `;
    // Upcoming scheduled inspections
    loadUpcomingInspections();

  } catch {
    document.getElementById('dash-stats').innerHTML = '<p style="color:var(--muted);">Could not load stats.</p>';
  }
}

async function loadUpcomingInspections() {
  try {
    const resp = await fetch('/api/inspections/upcoming', { credentials: 'include' });
    if (!resp.ok) return;
    const upcoming = await resp.json();
    if (!upcoming.length) return;

    const today = new Date();
    today.setHours(0,0,0,0);
    const thisWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const el = document.createElement('div');
    el.style.cssText = 'margin-top:20px;max-width:900px;';
    el.innerHTML = `
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:12px;">📅 Upcoming Scheduled (${upcoming.length})</div>
      ${upcoming.map(i => {
        const next = new Date(i.next_inspection_date);
        const isOverdue = next < today;
        const isSoon   = next <= thisWeek;
        const color = isOverdue ? '#ef4444' : isSoon ? '#f59e0b' : '#22c55e';
        const daysLeft = Math.round((next - today) / (1000*60*60*24));
        const daysLabel = isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today' : `${daysLeft}d away`;
        return `<div onclick="navigate('inspections');setTimeout(()=>openInspection(${i.id}),300)"
             style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${color};border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;transition:border-color 0.15s;"
             onmouseover="this.style.borderColor='${color}'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="min-width:0;">
            <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escDO(i.property_name || i.property_address)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:1px;">${escDO(i.property_address)} · ${(i.inspection_frequency || '').replace(/-/g,' ')}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:12px;font-weight:700;color:${color};white-space:nowrap;">${daysLabel}</div>
            <div style="font-size:11px;color:var(--muted);">${new Date(i.next_inspection_date).toLocaleDateString('en-CA')}</div>
          </div>
        </div>`;
      }).join('')}
    `;

    const page = document.getElementById('page-dashboard');
    page.appendChild(el);
  } catch(e) { /* non-critical */ }
}

function statCard(val, label, icon, style) {
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;">
      <div style="font-size:28px;font-weight:800;${style}">${val}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">${icon} ${label}</div>
    </div>
  `;
}

// ─── TEAM ─────────────────────────────────────────────────────────────────────
async function loadTeam() {
  const page = document.getElementById('page-team');
  const isAdmin = _currentUser?.role === 'owner' || _currentUser?.role === 'admin';

  page.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
      <h1 style="margin:0;">Team</h1>
      ${isAdmin ? `<button class="btn-primary-do" onclick="showInviteForm()">+ Add Member</button>` : ''}
    </div>
    <div id="team-list"><div style="color:var(--muted);font-size:14px;">Loading…</div></div>
    <div id="invite-form" style="display:none;"></div>
  `;

  const resp = await fetch('/api/team', { credentials: 'include' });
  if (!resp.ok) { document.getElementById('team-list').innerHTML = '<p style="color:var(--danger);">Failed to load team.</p>'; return; }
  const members = await resp.json();

  const roleColor = { owner: 'var(--green)', admin: 'var(--warn)', tech: 'var(--muted)' };
  const roleBg = { owner: 'rgba(74,107,53,0.15)', admin: 'rgba(212,160,23,0.15)', tech: 'rgba(138,158,132,0.1)' };

  document.getElementById('team-list').innerHTML = members.length ? members.map(m => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:8px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;flex-shrink:0;">
        ${(m.name || '?')[0].toUpperCase()}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:14px;">${escDO(m.name)}</div>
        <div style="font-size:12px;color:var(--muted);">${escDO(m.email)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${m.inspection_count} inspection${m.inspection_count != 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="background:${roleBg[m.role]||'transparent'};color:${roleColor[m.role]||'var(--muted)'};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;text-transform:uppercase;">${m.role}</span>
        ${isAdmin && m.id !== _currentUser.id ? `<button onclick="removeMember(${m.id},'${escDO(m.name)}')" style="background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;padding:4px;" title="Remove">✕</button>` : ''}
      </div>
    </div>
  `).join('') : '<div style="color:var(--muted);">No team members yet.</div>';
}

function showInviteForm() {
  const el = document.getElementById('invite-form');
  el.style.display = 'block';
  el.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-top:16px;max-width:480px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:16px;">Add Team Member</div>
      <div class="do-form-group">
        <label>Name</label>
        <input type="text" id="inv-name" placeholder="John Smith" style="width:100%;">
      </div>
      <div class="do-form-group">
        <label>Email</label>
        <input type="email" id="inv-email" placeholder="john@yourcompany.com" style="width:100%;">
      </div>
      <div class="do-form-group">
        <label>Role</label>
        <select id="inv-role" style="width:100%;">
          <option value="tech">Tech — can create & complete inspections</option>
          <option value="admin">Admin — can manage team & settings</option>
        </select>
      </div>
      <div class="do-form-group">
        <label>Temporary Password</label>
        <input type="text" id="inv-password" placeholder="Leave blank to auto-generate" style="width:100%;">
      </div>
      <div id="inv-result" style="display:none;background:rgba(74,107,53,0.15);border:1px solid var(--green);border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;"></div>
      <div id="inv-error" style="display:none;" class="auth-error"></div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary-do" onclick="submitInvite()" style="flex:1;">Add Member</button>
        <button onclick="document.getElementById('invite-form').style.display='none'" style="flex:1;padding:10px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
}

async function submitInvite() {
  const name = document.getElementById('inv-name').value.trim();
  const email = document.getElementById('inv-email').value.trim();
  const role = document.getElementById('inv-role').value;
  const password = document.getElementById('inv-password').value.trim();
  const errEl = document.getElementById('inv-error');
  const resultEl = document.getElementById('inv-result');
  errEl.style.display = 'none';
  resultEl.style.display = 'none';

  if (!name || !email) { errEl.textContent = 'Name and email are required.'; errEl.style.display = 'block'; return; }

  const resp = await fetch('/api/team', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, role, password: password || undefined })
  });
  const data = await resp.json();

  if (!resp.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }

  resultEl.innerHTML = `✓ <strong>${escDO(data.name)}</strong> added!${data.temp_password ? `<br>Temporary password: <code style="background:var(--bg);padding:2px 6px;border-radius:4px;">${data.temp_password}</code><br><small style="color:var(--muted);">Share this with them — they can change it in Settings.</small>` : ''}`;
  resultEl.style.display = 'block';

  setTimeout(() => loadTeam(), 1500);
}

async function removeMember(id, name) {
  if (!confirm(`Remove ${name} from your team?`)) return;
  const resp = await fetch('/api/team/' + id, { method: 'DELETE', credentials: 'include' });
  if (!resp.ok) { alert('Failed to remove member.'); return; }
  showToast(`${name} removed`);
  loadTeam();
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function loadSettings() {
  setTimeout(loadJobberStatus, 400); // Load after DOM renders
  const page = document.getElementById('page-settings');
  const u = _currentUser;
  const c = _currentCompany;

  page.innerHTML = `
    <h1 style="margin-bottom:24px;">Settings</h1>

    <!-- Profile -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:16px;max-width:600px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--green-light);margin-bottom:14px;">Profile</div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <div style="width:52px;height:52px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;">${(u?.name||'?')[0].toUpperCase()}</div>
        <div>
          <div style="font-weight:700;font-size:16px;">${escDO(u?.name||'')}</div>
          <div style="font-size:13px;color:var(--muted);">${escDO(u?.email||'')} · <span style="text-transform:capitalize;">${u?.role||''}</span></div>
        </div>
      </div>
      <button onclick="showChangePassword()" style="padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">Change Password</button>
      <div id="change-pw-form" style="display:none;margin-top:14px;"></div>
    </div>

    <!-- Company -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:16px;max-width:600px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--green-light);margin-bottom:14px;">Company</div>
      <div style="margin-bottom:14px;">
        <label style="font-size:11px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:6px;">Company Name</label>
        <div style="display:flex;gap:8px;">
          <input type="text" id="company-name-input" value="${escDO(c?.name||'')}" placeholder="Your company name" style="flex:1;padding:9px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;">
          <button onclick="saveCompanyName()" style="padding:9px 16px;background:var(--green);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Save</button>
        </div>
        <div id="company-name-msg" style="display:none;font-size:12px;margin-top:6px;"></div>
      </div>
      <div><div style="color:var(--muted);font-size:11px;text-transform:uppercase;margin-bottom:3px;">Plan</div><div style="font-weight:600;text-transform:capitalize;font-size:13px;">${c?.plan||'trial'}</div></div>
    </div>

    <!-- Integrations -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:16px;max-width:600px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--green-light);margin-bottom:14px;">Integrations</div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:600;font-size:14px;">Jobber</div>
          <div style="font-size:12px;color:var(--muted);" id="jobber-status-text">Pull jobs & client info into inspections</div>
        </div>
        <div id="jobber-connect-btn"><div style="width:80px;height:28px;background:var(--border);border-radius:14px;"></div></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
        <div>
          <div style="font-weight:600;font-size:14px;">Email Reports</div>
          <div style="font-size:12px;color:var(--muted);">Send PDF reports directly to clients</div>
        </div>
        <span style="font-size:11px;font-weight:700;color:var(--muted);background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:3px 10px;">Coming Soon</span>
      </div>
    </div>

    <!-- Billing -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:16px;max-width:600px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--green-light);margin-bottom:14px;">Subscription</div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-weight:600;font-size:14px;text-transform:capitalize;">${c?.plan === 'trial' ? '14-Day Free Trial' : c?.plan || 'Trial'}</div>
          <div style="font-size:12px;color:var(--muted);">Full access to all features</div>
        </div>
        <span style="font-size:11px;font-weight:700;color:var(--warn);background:rgba(212,160,23,0.15);border:1px solid rgba(212,160,23,0.3);border-radius:20px;padding:3px 10px;">Active</span>
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--muted);">Billing & plan upgrades coming soon. You'll be notified before your trial ends.</div>
    </div>

    <button onclick="handleLogout()" style="padding:10px 20px;background:rgba(214,60,60,0.1);border:1px solid rgba(214,60,60,0.3);border-radius:8px;color:var(--danger);font-size:14px;cursor:pointer;">Sign Out</button>
  `;
}

// ─── JOBBER INTEGRATION UI ───────────────────────────────────────────────────
async function loadJobberStatus() {
  try {
    const resp = await fetch('/api/jobber/status', { credentials: 'include' });
    const data = await resp.json();
    const btnEl = document.getElementById('jobber-connect-btn');
    const textEl = document.getElementById('jobber-status-text');
    if (!btnEl) return;

    if (data.connected) {
      if (textEl) textEl.innerHTML = '<span style="color:var(--green-light);">✓ Connected</span>';
      btnEl.innerHTML = `<button onclick="disconnectJobber()" style="padding:5px 12px;background:rgba(214,60,60,0.1);border:1px solid rgba(214,60,60,0.3);border-radius:20px;color:var(--danger);font-size:11px;font-weight:700;cursor:pointer;">Disconnect</button>`;
    } else {
      if (textEl) textEl.textContent = 'Pull jobs & client info into inspections';
      btnEl.innerHTML = `<button onclick="openJobberConnect()" style="padding:5px 14px;background:var(--green);border:none;border-radius:20px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Connect</button>`;
    }
  } catch(e) {
    console.error('Jobber status error', e);
  }
}

async function saveCompanyName() {
  const input = document.getElementById('company-name-input');
  const msg = document.getElementById('company-name-msg');
  const name = input?.value.trim();
  if (!name) { if (msg) { msg.textContent = 'Name required.'; msg.style.color = 'var(--danger)'; msg.style.display = 'block'; } return; }

  const resp = await fetch('/api/settings/company', {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await resp.json();

  if (!resp.ok) {
    if (msg) { msg.textContent = data.error || 'Failed to save.'; msg.style.color = 'var(--danger)'; msg.style.display = 'block'; }
    return;
  }

  if (msg) { msg.textContent = '\u2713 Company name updated!'; msg.style.color = 'var(--green-light)'; msg.style.display = 'block'; }
  // Update cached company object
  if (window._currentCompany) window._currentCompany.name = data.name;
  showToast('Company name saved!');
}

function openJobberConnect() {
  // Open in popup so main app session/cookie is preserved
  const w = 600, h = 700;
  const left = (screen.width - w) / 2;
  const top = (screen.height - h) / 2;
  const popup = window.open('/api/jobber/connect', 'jobber_oauth',
    `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);

  // Poll for popup close and refresh status
  const timer = setInterval(() => {
    if (!popup || popup.closed) {
      clearInterval(timer);
      setTimeout(() => {
        loadJobberStatus();
        showToast('Checking Jobber connection…');
      }, 500);
    }
  }, 500);
}

async function disconnectJobber() {
  if (!confirm('Disconnect Jobber? Job suggestions will stop working.')) return;
  await fetch('/api/jobber/disconnect', { method: 'POST', credentials: 'include' });
  loadJobberStatus();
  showToast('Jobber disconnected');
}

function showChangePassword() {
  const el = document.getElementById('change-pw-form');
  el.style.display = 'block';
  el.innerHTML = `
    <div class="do-form-group">
      <label>Current Password</label>
      <input type="password" id="pw-current" style="width:100%;max-width:320px;">
    </div>
    <div class="do-form-group">
      <label>New Password</label>
      <input type="password" id="pw-new" style="width:100%;max-width:320px;">
    </div>
    <div id="pw-msg" style="display:none;font-size:13px;margin-bottom:8px;"></div>
    <button onclick="submitChangePassword()" class="btn-primary-do" style="padding:8px 16px;font-size:13px;">Update Password</button>
  `;
}

async function submitChangePassword() {
  const current = document.getElementById('pw-current').value;
  const newPw = document.getElementById('pw-new').value;
  const msg = document.getElementById('pw-msg');

  if (!current || !newPw || newPw.length < 8) {
    msg.textContent = 'New password must be at least 8 characters.';
    msg.style.color = 'var(--danger)'; msg.style.display = 'block'; return;
  }

  const resp = await fetch('/api/auth/change-password', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: current, new_password: newPw })
  });
  const data = await resp.json();

  msg.textContent = resp.ok ? '✓ Password updated!' : (data.error || 'Failed');
  msg.style.color = resp.ok ? 'var(--green-light)' : 'var(--danger)';
  msg.style.display = 'block';
}
