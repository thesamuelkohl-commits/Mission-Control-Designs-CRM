function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDateTime(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatDay(dayStr) {
  const d = new Date(dayStr + 'T00:00:00');
  if (isNaN(d)) return dayStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  return res;
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login.html';
});

function renderStatGrid(data) {
  const tiles = [
    { label: 'Total Leads', value: data.totalContacts },
    { label: 'Total Activities', value: data.totalActivities },
    { label: 'Never Contacted', value: data.neverContacted },
    { label: 'Contacted Leads', value: data.totalContacts - data.neverContacted },
  ];
  document.getElementById('stat-grid').innerHTML = tiles.map((t) => `
    <div class="stat-tile">
      <div class="stat-value">${t.value}</div>
      <div class="stat-label">${t.label}</div>
    </div>
  `).join('');
}

function renderBarList(elId, rows, labelKey, countKey, colorFn, labelFn) {
  const el = document.getElementById(elId);
  if (!rows.length) {
    el.innerHTML = '<p class="detail-empty">No data yet</p>';
    return;
  }
  const max = Math.max(...rows.map((r) => r[countKey]), 1);
  el.innerHTML = rows.map((r) => `
    <div class="bar-row">
      <span class="bar-label">${escapeHTML(labelFn ? labelFn(r) : String(r[labelKey] ?? 'Unassigned'))}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(r[countKey] / max) * 100}%; background:${colorFn ? colorFn(r) : 'var(--orange)'}"></div>
      </div>
      <span class="bar-count">${r[countKey]}</span>
    </div>
  `).join('');
}

function renderTrend(rows) {
  const el = document.getElementById('activity-trend');
  if (!rows.length || !rows.some((r) => r.count > 0)) {
    el.innerHTML = '<p class="detail-empty">No activity yet</p>';
    return;
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  el.innerHTML = rows.map((r) => `
    <div class="trend-col">
      <div class="trend-bar" style="height:${Math.max((r.count / max) * 100, 2)}%" title="${r.count} on ${formatDay(r.day)}"></div>
      <span class="trend-day">${formatDay(r.day)}</span>
    </div>
  `).join('');
}

function renderTopContacts(rows) {
  const el = document.getElementById('top-contacts');
  if (!rows.length) {
    el.innerHTML = '<li class="detail-empty">No leads yet</li>';
    return;
  }
  el.innerHTML = rows.map((r) => `
    <li>
      <span class="ranked-name">${escapeHTML(r.name)}${r.company ? ` <span class="ranked-company">· ${escapeHTML(r.company)}</span>` : ''}</span>
      <span class="ranked-count">${r.count}</span>
    </li>
  `).join('');
}

function renderRecentActivity(rows) {
  const el = document.getElementById('recent-activity');
  if (!rows.length) {
    el.innerHTML = '<li class="detail-empty">No activity logged yet</li>';
    return;
  }
  el.innerHTML = rows.map((r) => `
    <li class="feed-item">
      <div class="feed-line">
        <span class="feed-name">${escapeHTML(r.contact_name)}</span>
        <span class="feed-meta">${formatDateTime(r.created_at)}${r.username ? ` · ${escapeHTML(r.username)}` : ''}</span>
      </div>
      ${r.message ? `<div class="feed-message">${escapeHTML(r.message)}</div>` : ''}
    </li>
  `).join('');
}

const TAG_LABELS = {
  cold: 'Cold', warm: 'Warm', hot: 'Hot',
  customer: 'Customer', lost: 'Lost', non_responsive: 'Non-Responsive',
};

(async function init() {
  let sessionUsername = null;
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/login.html';
      return;
    }
    sessionUsername = data.username;
    if (sessionUsername) {
      document.getElementById('current-username').textContent = sessionUsername;
    }
  } catch {
    window.location.href = '/login.html';
    return;
  }

  if (sessionUsername !== 'sam') {
    window.location.href = '/index.html';
    return;
  }

  const res = await apiFetch('/api/reports');
  if (!res.ok) {
    document.getElementById('reports-content').innerHTML = '<p class="detail-empty">Unable to load reports.</p>';
    return;
  }
  const data = await res.json();

  renderStatGrid(data);
  renderBarList('activity-by-person', data.activitiesByUser, 'username', 'count');
  renderBarList('leads-by-owner', data.contactsByOwner, 'owner', 'count');
  renderBarList('leads-by-tag', data.contactsByTag, 'tag', 'count', (r) => `var(--${r.tag})`, (r) => TAG_LABELS[r.tag] || r.tag);
  renderTrend(data.activityByDay);
  renderTopContacts(data.topContacts);
  renderRecentActivity(data.recentActivity);
})();
