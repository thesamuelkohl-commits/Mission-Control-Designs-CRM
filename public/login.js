const form = document.getElementById('login-form');
const usernameInput = document.getElementById('login-username');
const passwordInput = document.getElementById('login-password');
const errorEl = document.getElementById('login-error');

// If already logged in, skip straight to the app.
fetch('/api/session')
  .then((res) => res.json())
  .then((data) => {
    if (data.authenticated) window.location.href = '/';
  })
  .catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value }),
  });

  if (res.ok) {
    window.location.href = '/';
    return;
  }

  const data = await res.json().catch(() => ({}));
  errorEl.textContent = data.error || 'Something went wrong';
  errorEl.hidden = false;
  passwordInput.value = '';
  passwordInput.focus();
});
