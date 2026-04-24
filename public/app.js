// DoorOps — Frontend App
let _currentUser = null;
let _currentCompany = null;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();

  // Listen for Jobber OAuth popup messages
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.jobber === 'connected') {
      showToast('✓ Jobber connected!');
      if (typeof loadJobberStatus === 'function') loadJobberStatus();
    } else if (e.data?.jobber === 'error') {
      showToast('Jobber connection failed — try again');
    }
  });
});

async function checkAuth() {
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' });
    if (resp.ok) {
      const data = await resp.json();
      _currentUser = data;
      _currentCompany = { id: data.company_id, name: data.company_name, slug: data.slug, plan: data.plan };
      showApp();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  document.getElementById('nav-company-name').textContent = _currentCompany?.name || '';
  document.getElementById('settings-info').textContent =
    `Signed in as ${_currentUser.name} (${_currentUser.role}) · Plan: ${_currentCompany.plan}`;
  navigate('dashboard');
}

// ---- AUTH FORMS ----
function showTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
  });
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json();
    if (!resp.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    _currentUser = data.user;
    _currentCompany = data.company;
    showApp();
  } catch {
    errEl.textContent = 'Connection error. Try again.';
    errEl.style.display = 'block';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const company_name = document.getElementById('signup-company').value;
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  errEl.style.display = 'none';

  try {
    const resp = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ company_name, name, email, password })
    });
    const data = await resp.json();
    if (!resp.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    _currentUser = data.user;
    _currentCompany = data.company;
    showApp();
  } catch {
    errEl.textContent = 'Connection error. Try again.';
    errEl.style.display = 'block';
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  _currentUser = null;
  _currentCompany = null;
  showAuth();
}

// ---- NAVIGATION ----
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.style.display = 'block';

  // Load page data
  if (page === 'dashboard' && typeof loadDashboard === 'function') loadDashboard();
  if (page === 'inspections' && typeof loadInspections === 'function') loadInspections();
  if (page === 'team' && typeof loadTeam === 'function') loadTeam();
  if (page === 'settings' && typeof loadSettings === 'function') loadSettings();

  const sidebarBtns = document.querySelectorAll('.sidebar-item');
  sidebarBtns.forEach(b => {
    if (b.textContent.toLowerCase().includes(page)) b.classList.add('active');
  });

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

function toggleMenu() {
  document.getElementById('sidebar').classList.toggle('open');
}
