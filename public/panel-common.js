// =====================================================================
//  public/panel-common.js
//
//  Loaded by every panel page with a plain <script src="..."> tag.
//  Everything in here was previously copy-pasted into each HTML file.
//  One copy means one place to fix a bug.
// =====================================================================

const token = localStorage.getItem('token');
if (!token) window.location.href = '/login.html';

// ---------------------------------------------------------------------
//  authFetch
//
//  Ordinary fetch(), except it always attaches the Authorization
//  header and always kicks you back to the login page on a 401.
//  Every request in every page goes through this.
// ---------------------------------------------------------------------
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Authorization'] = 'Bearer ' + token;

  // A FormData body (the one carrying files) must be left completely
  // alone. Do NOT stringify it, and do NOT set Content-Type - the
  // browser has to set that itself, because it needs to append a
  // random "boundary" marker that separates one file from the next.
  // Setting it by hand is the classic way to break file uploads:
  // multer sees a boundary it cannot find and req.body comes back empty.
  if (options.body && !(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, options);

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  }
  return res;
}

// ---------------------------------------------------------------------
//  SIDEBAR OPEN / CLOSE
//
//  Collapsed does not mean hidden. The sidebar shrinks to a narrow
//  rail that still shows the toggle button, so there is always
//  something to click to bring it back - like Claude or ChatGPT.
//  Adding one CSS class does all of it.
// ---------------------------------------------------------------------
function setupSidebar() {
  const layout = document.getElementById('layout');
  const btn = document.getElementById('toggleBtn');
  if (!layout || !btn) return;

  if (localStorage.getItem('sidebarClosed') === 'yes') {
    layout.classList.add('closed');
  }

  btn.addEventListener('click', () => {
    layout.classList.toggle('closed');
    localStorage.setItem(
      'sidebarClosed',
      layout.classList.contains('closed') ? 'yes' : 'no'
    );
  });

  const logout = document.getElementById('logoutBtn');
  if (logout) {
    logout.addEventListener('click', () => {
      localStorage.removeItem('token');
      window.location.href = '/login.html';
    });
  }
}

// ---------------------------------------------------------------------
//  the identity box at the top of the sidebar
// ---------------------------------------------------------------------
async function loadSellerBox() {
  const box = document.getElementById('sellerBox');
  if (!box) return;

  const res = await authFetch('/api/seller/me');
  if (!res.ok) { window.location.href = '/login.html'; return; }

  const s = (await res.json()).seller;
  box.innerHTML = `
    <div class="avatar">${initials(s.FullName)}</div>
    <div class="who hide-when-closed">
      <div class="name">${s.FullName}</div>
      <div class="muted">${s.StoreName}</div>
      <div class="muted">Seller ID: ${s.UserID}</div>
      <div class="muted">${s.VerificationStatus}</div>
    </div>`;
}

async function loadAdminBox() {
  const box = document.getElementById('sellerBox');
  if (!box) return;

  const res = await authFetch('/api/admin/me');
  if (!res.ok) { window.location.href = '/login.html'; return; }

  const a = (await res.json()).admin;
  box.innerHTML = `
    <div class="avatar">${initials(a.FullName)}</div>
    <div class="who hide-when-closed">
      <div class="name">${a.FullName}</div>
      <div class="muted">Admin ID: ${a.UserID}</div>
      <div class="muted">${a.AccessLevel}</div>
    </div>`;
}

// ---------------------------------------------------------------------
//  small formatting helpers
// ---------------------------------------------------------------------
function initials(name) {
  return String(name || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function money(n) {
  return '\u09F3' + Number(n || 0).toLocaleString();
}

function shortDate(d) {
  if (!d) return '-';
  return new Date(d).toDateString().slice(4, 10);
}

// a small message strip at the top of the page
function toast(text, isError) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.className = 'toast ' + (isError ? 'bad' : 'good');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ---------------------------------------------------------------------
//  KEEPING THE PAGE FRESH
//
//  Two different problems, two different answers:
//
//  1. YOUR OWN clicks. After you delete a product or ship an order the
//     page simply calls its load function again. The screen updates
//     with no refresh because the data is fetched a second time.
//
//  2. SOMEONE ELSE'S clicks, e.g. the admin approving a product in
//     another window. Your browser has no way of knowing that happened
//     - nobody told it. So we ask again every few seconds.
//
//  This is called polling. The proper answer is a WebSocket, where the
//  server pushes the news to you, but that is a whole new technology.
//  Polling gets the same visible result using only fetch and a timer,
//  which you already know.
// ---------------------------------------------------------------------
function autoRefresh(loadFunction, seconds = 5) {
  setInterval(() => {
    // document.hidden is true when the tab is in the background.
    // No point hammering the server for a page nobody is looking at.
    if (!document.hidden) loadFunction();
  }, seconds * 1000);

  // when you come back to the tab, update immediately
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadFunction();
  });
}

async function loadCustomerBox() {
  const box = document.getElementById('sellerBox');
  if (!box) return;

  const res = await authFetch('/api/customer/me');
  if (!res.ok) { window.location.href = '/login.html'; return; }

  const c = (await res.json()).customer;
  box.innerHTML = `
    <div class="avatar">${initials(c.FullName)}</div>
    <div class="who hide-when-closed">
      <div class="name">${c.FullName}</div>
      <div class="muted">Customer ID: ${c.UserID}</div>
      <div class="muted">${c.Email}</div>
    </div>`;
}
