// DoorOps — Frontend App v4
let _currentUser = null;
let _currentCompany = null;

// ---- TOKEN STORAGE — belt + suspenders ----
function getToken() {
  return localStorage.getItem('do_token')
    || sessionStorage.getItem('do_token')
    || _getCookieToken()
    || '';
}
function setToken(t) {
  if (!t) return;
  try { localStorage.setItem('do_token', t); } catch(e) {}
  try { sessionStorage.setItem('do_token', t); } catch(e) {}
  // JS-accessible cookie for PWA pull-to-refresh survival
  const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = 'do_tok=' + encodeURIComponent(t) + ';expires=' + exp + ';path=/;SameSite=Lax';
}
function clearToken() {
  try { localStorage.removeItem('do_token'); } catch(e) {}
  try { sessionStorage.removeItem('do_token'); } catch(e) {}
  document.cookie = 'do_tok=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
}
function _getCookieToken() {
  const m = document.cookie.match(/(?:^|;\s*)do_tok=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// ---- FETCH OVERRIDE — inject auth header on all API calls ----
// MUST be defined before DOMContentLoaded fires
const _origFetch = window.fetch.bind(window);
window.fetch = function(url, opts) {
  // Deep copy opts to avoid mutating caller's object
  var options = { credentials: 'include' };
  if (opts) {
    if (opts.method) options.method = opts.method;
    if (opts.body !== undefined) options.body = opts.body;
    if (opts.mode) options.mode = opts.mode;
    if (opts.cache) options.cache = opts.cache;
  }
  // Copy and extend headers
  var headers = {};
  if (opts && opts.headers) {
    var h = opts.headers;
    if (typeof h.forEach === 'function') {
      h.forEach(function(v, k) { headers[k] = v; });
    } else {
      Object.keys(h).forEach(function(k) { headers[k] = h[k]; });
    }
  }
  // Inject token for same-origin requests
  var token = getToken();
  if (token) {
    var urlStr = String(url);
    if (urlStr.startsWith('/') || urlStr.startsWith(window.location.origin)) {
      headers['x-auth-token'] = token;
    }
  }
  options.headers = headers;
  return _origFetch(url, options);
};

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(function(r) { r.update(); }).catch(function() {});
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
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
    const resp = await fetch('/api/auth/me');
    if (resp.ok) {
      const data = await resp.json();
      _currentUser = data;
      _currentCompany = { id: data.company_id, name: data.company_name, slug: data.slug, plan: data.plan };
      showApp();
    } else {
      clearToken();
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
    const resp = await _origFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json();
    if (!resp.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    if (data.token) setToken(data.token);
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
    const resp = await _origFetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ company_name, name, email, password })
    });
    const data = await resp.json();
    if (!resp.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    if (data.token) setToken(data.token);
    _currentUser = data.user;
    _currentCompany = data.company;
    showApp();
  } catch {
    errEl.textContent = 'Connection error. Try again.';
    errEl.style.display = 'block';
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  clearToken();
  _currentUser = null;
  _currentCompany = null;
  showAuth();
}

// ---- NAVIGATION ----
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.style.display = 'block';

  if (page === 'dashboard' && typeof loadDashboard === 'function') loadDashboard();
  if (page === 'inspections' && typeof loadInspections === 'function') loadInspections();
  if (page === 'team' && typeof loadTeam === 'function') loadTeam();
  if (page === 'settings' && typeof loadSettings === 'function') loadSettings();

  document.querySelectorAll('.sidebar-item').forEach(b => {
    if (b.dataset.page === page) b.classList.add('active');
  });
  document.querySelectorAll('.bottom-nav-btn').forEach(b => {
    if (b.dataset.page === page) b.classList.add('active');
  });

  document.getElementById('sidebar').classList.remove('open');
}

function toggleMenu() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ---- TOAST ----
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}
