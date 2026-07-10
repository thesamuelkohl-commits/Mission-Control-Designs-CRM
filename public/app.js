const TAGS = [
  { value: 'cold', label: 'Cold' },
  { value: 'warm', label: 'Warm' },
  { value: 'hot', label: 'Hot' },
  { value: 'customer', label: 'Customer' },
  { value: 'lost', label: 'Lost' },
  { value: 'non_responsive', label: 'Non-Responsive' },
];

let activeTag = 'all';
let activeOwner = 'all';
let contacts = [];
let users = [];
let currentUsername = null;
let detailContactId = null;
let outreachHistory = [];
let dateFrom = '';
let dateTo = '';
let neverContacted = false;
let searchTerm = '';
let searchDebounceTimer = null;

const tagFiltersEl = document.getElementById('tag-filters');
const ownerFiltersEl = document.getElementById('owner-filters');
const contactsBody = document.getElementById('contacts-body');
const emptyState = document.getElementById('empty-state');
const resultCount = document.getElementById('result-count');
const filterDateFrom = document.getElementById('filter-date-from');
const filterDateTo = document.getElementById('filter-date-to');
const filterNeverBtn = document.getElementById('filter-never-btn');
const searchInput = document.getElementById('search-input');

const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalAddedLine = document.getElementById('modal-added-line');
const form = document.getElementById('contact-form');
const emailsList = document.getElementById('emails-list');
const phonesList = document.getElementById('phones-list');
const linksList = document.getElementById('links-list');
const duplicateWarning = document.getElementById('duplicate-warning');
const duplicateWarningText = document.getElementById('duplicate-warning-text');
const duplicateConfirmCheckbox = document.getElementById('duplicate-confirm-checkbox');

const detailBackdrop = document.getElementById('detail-backdrop');

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

function tagLabel(value) {
  return TAGS.find((t) => t.value === value)?.label || value;
}

function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.length <= 10 ? dateStr + 'T00:00:00' : dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

// ---------- Tag filter bar ----------

function renderTagFilters() {
  const allPill = document.createElement('button');
  allPill.className = 'tag-pill' + (activeTag === 'all' ? ' active' : '');
  allPill.textContent = 'All';
  allPill.onclick = () => { activeTag = 'all'; loadContacts(); };
  tagFiltersEl.replaceChildren(allPill, ...TAGS.map((t) => {
    const pill = document.createElement('button');
    pill.className = 'tag-pill' + (activeTag === t.value ? ' active' : '');
    pill.innerHTML = `<span class="dot" style="background:var(--${t.value})"></span>${t.label}`;
    pill.onclick = () => { activeTag = t.value; loadContacts(); };
    return pill;
  }));
}

function renderOwnerFilters() {
  const allPill = document.createElement('button');
  allPill.className = 'tag-pill' + (activeOwner === 'all' ? ' active' : '');
  allPill.textContent = 'All';
  allPill.onclick = () => { activeOwner = 'all'; loadContacts(); };
  ownerFiltersEl.replaceChildren(allPill, ...users.map((u) => {
    const pill = document.createElement('button');
    pill.className = 'tag-pill' + (activeOwner === u ? ' active' : '');
    pill.textContent = u;
    pill.onclick = () => { activeOwner = u; loadContacts(); };
    return pill;
  }));
}

function populateOwnerSelect(selected) {
  const select = document.getElementById('field-owner');
  select.replaceChildren(...users.map((u) => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    return opt;
  }));
  select.value = selected || currentUsername || users[0] || '';
}

async function loadUsers() {
  const res = await apiFetch('/api/users');
  users = res.ok ? await res.json() : [];
  renderOwnerFilters();
}

// ---------- Table ----------

function isAnyFilterActive() {
  return activeTag !== 'all' || activeOwner !== 'all' || neverContacted || Boolean(dateFrom) || Boolean(dateTo) || Boolean(searchTerm);
}

function renderContacts() {
  contactsBody.replaceChildren();
  emptyState.hidden = contacts.length > 0;
  emptyState.textContent = isAnyFilterActive()
    ? 'No contacts match the current filters.'
    : 'No contacts yet. Click "+ New Contact" to add one.';
  resultCount.textContent = contacts.length
    ? `${contacts.length} contact${contacts.length === 1 ? '' : 's'}`
    : '';

  for (const c of contacts) {
    const tr = document.createElement('tr');

    const infoLines = [...(c.emails || []), ...(c.phones || [])]
      .slice(0, 2)
      .map((v) => `<div>${escapeHTML(v)}</div>`)
      .join('');
    const extraCount = (c.emails?.length || 0) + (c.phones?.length || 0) - 2;

    const lastContacted = formatDate(c.last_contacted);

    tr.innerHTML = `
      <td>${escapeHTML(c.name)}</td>
      <td>${escapeHTML(c.company) || '—'}</td>
      <td class="contact-info">${infoLines || '—'}${extraCount > 0 ? `<div>+${extraCount} more</div>` : ''}</td>
      <td>${formatDate(c.created_at) || '—'}</td>
      <td>${lastContacted || '<span class="detail-empty">Never</span>'}</td>
      <td><span class="activity-count">${c.activity_count || 0}</span></td>
      <td><span class="tag-badge" style="background:var(--${c.tag})">${tagLabel(c.tag)}</span></td>
      <td>
        <select class="owner-select">
          ${users.map((u) => `<option value="${escapeHTML(u)}" ${u === c.owner ? 'selected' : ''}>${escapeHTML(u)}</option>`).join('')}
        </select>
      </td>
      <td>
        <div class="row-actions">
          <button class="btn edit-btn">Edit</button>
          <button class="btn btn-danger delete-btn">Delete</button>
        </div>
      </td>
    `;

    tr.addEventListener('click', () => openDetail(c.id));
    tr.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(c);
    });
    tr.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteContact(c.id);
    });
    const ownerSelect = tr.querySelector('.owner-select');
    ownerSelect.addEventListener('click', (e) => e.stopPropagation());
    ownerSelect.addEventListener('change', async (e) => {
      e.stopPropagation();
      await apiFetch(`/api/contacts/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: ownerSelect.value }),
      });
      await loadContacts();
    });

    contactsBody.appendChild(tr);
  }
}

async function loadContacts() {
  renderTagFilters();
  renderOwnerFilters();
  renderDateFilters();

  const params = new URLSearchParams();
  if (searchTerm) params.set('search', searchTerm);
  if (activeTag !== 'all') params.set('tag', activeTag);
  if (activeOwner !== 'all') params.set('owner', activeOwner);
  if (neverContacted) {
    params.set('never_contacted', 'true');
  } else {
    if (dateFrom) params.set('last_contacted_from', dateFrom);
    if (dateTo) params.set('last_contacted_to', dateTo);
  }

  const qs = params.toString();
  const res = await apiFetch(qs ? `/api/contacts?${qs}` : '/api/contacts');
  contacts = await res.json();
  renderContacts();
}

// ---------- Last-reached-out date filter ----------

function renderDateFilters() {
  filterDateFrom.value = dateFrom;
  filterDateTo.value = dateTo;
  filterDateFrom.disabled = neverContacted;
  filterDateTo.disabled = neverContacted;
  filterNeverBtn.classList.toggle('active', neverContacted);
}

filterDateFrom.addEventListener('change', () => {
  dateFrom = filterDateFrom.value;
  neverContacted = false;
  loadContacts();
});

filterDateTo.addEventListener('change', () => {
  dateTo = filterDateTo.value;
  neverContacted = false;
  loadContacts();
});

filterNeverBtn.addEventListener('click', () => {
  neverContacted = !neverContacted;
  if (neverContacted) {
    dateFrom = '';
    dateTo = '';
  }
  loadContacts();
});

document.getElementById('filter-clear-dates-btn').addEventListener('click', () => {
  dateFrom = '';
  dateTo = '';
  neverContacted = false;
  loadContacts();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchTerm = searchInput.value.trim();
    loadContacts();
  }, 250);
});

function getContact(id) {
  return contacts.find((c) => c.id === id);
}

// ---------- Detail (read-only) modal ----------

async function openDetail(id) {
  detailContactId = id;
  outreachHistory = [];
  document.getElementById('outreach-message').value = '';
  renderDetail();
  detailBackdrop.hidden = false;
  await loadOutreachHistory(id);
}

function closeDetail() {
  detailBackdrop.hidden = true;
  detailContactId = null;
}

async function loadOutreachHistory(id) {
  const res = await apiFetch(`/api/contacts/${id}/outreach`);
  outreachHistory = res.ok ? await res.json() : [];
  if (detailContactId === id) renderOutreachHistory();
}

function renderOutreachHistory() {
  const listEl = document.getElementById('detail-outreach');
  listEl.replaceChildren();

  if (!outreachHistory.length) {
    listEl.innerHTML = '<li class="detail-empty">No outreach logged yet</li>';
    return;
  }

  for (const entry of outreachHistory) {
    const li = document.createElement('li');
    li.className = 'outreach-entry';
    li.innerHTML = `
      <button type="button" class="outreach-entry-delete" title="Delete entry">✕</button>
      <div class="outreach-entry-time">${formatDateTime(entry.created_at)}${entry.username ? ` · ${escapeHTML(entry.username)}` : ''}</div>
      ${entry.message ? `<div class="outreach-entry-message">${escapeHTML(entry.message)}</div>` : ''}
    `;
    li.querySelector('.outreach-entry-delete').addEventListener('click', () => deleteOutreachEntry(entry.id));
    listEl.appendChild(li);
  }
}

async function deleteOutreachEntry(entryId) {
  const id = detailContactId;
  if (!confirm('Delete this outreach entry?')) return;
  await apiFetch(`/api/contacts/${id}/outreach/${entryId}`, { method: 'DELETE' });
  await loadOutreachHistory(id);
}

function renderDetail() {
  const c = getContact(detailContactId);
  if (!c) return closeDetail();

  document.getElementById('detail-name').textContent = c.name;
  const tagEl = document.getElementById('detail-tag');
  tagEl.textContent = tagLabel(c.tag);
  tagEl.style.background = `var(--${c.tag})`;
  document.getElementById('detail-company').textContent = c.company || '';
  document.getElementById('detail-company').hidden = !c.company;

  document.getElementById('detail-added').textContent = formatDate(c.created_at) || '—';
  document.getElementById('detail-last-contacted').innerHTML =
    formatDate(c.last_contacted) || '<span class="detail-empty">Never contacted</span>';
  document.getElementById('detail-owner').textContent = c.owner || '—';

  const emailsEl = document.getElementById('detail-emails');
  emailsEl.replaceChildren();
  if (c.emails?.length) {
    for (const email of c.emails) {
      const li = document.createElement('li');
      li.innerHTML = `<a href="mailto:${escapeHTML(email)}">${escapeHTML(email)}</a>`;
      emailsEl.appendChild(li);
    }
  } else {
    emailsEl.innerHTML = '<li class="detail-empty">No emails added</li>';
  }

  const phonesEl = document.getElementById('detail-phones');
  phonesEl.replaceChildren();
  if (c.phones?.length) {
    for (const phone of c.phones) {
      const li = document.createElement('li');
      li.innerHTML = `<a href="tel:${escapeHTML(phone)}">${escapeHTML(phone)}</a>`;
      phonesEl.appendChild(li);
    }
  } else {
    phonesEl.innerHTML = '<li class="detail-empty">No phone numbers added</li>';
  }

  const linksEl = document.getElementById('detail-links');
  linksEl.replaceChildren();
  if (c.links?.length) {
    for (const link of c.links) {
      const li = document.createElement('li');
      const labelHTML = link.label ? `<span class="link-label">${escapeHTML(link.label)}</span>` : '';
      li.innerHTML = `${labelHTML}<a href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(link.url)}</a>`;
      linksEl.appendChild(li);
    }
  } else {
    linksEl.innerHTML = '<li class="detail-empty">No links added</li>';
  }

  const notesEl = document.getElementById('detail-notes');
  notesEl.textContent = c.notes || '';
  notesEl.hidden = !c.notes;
}

document.getElementById('detail-close-btn').onclick = closeDetail;
document.getElementById('detail-edit-btn').onclick = () => {
  const c = getContact(detailContactId);
  closeDetail();
  openModal(c);
};
document.getElementById('detail-delete-btn').onclick = () => {
  const id = detailContactId;
  closeDetail();
  deleteContact(id);
};
document.getElementById('log-outreach-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = detailContactId;
  const messageInput = document.getElementById('outreach-message');
  const message = messageInput.value.trim();

  await apiFetch(`/api/contacts/${id}/touch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  messageInput.value = '';
  await loadContacts();
  if (detailContactId === id) {
    renderDetail();
    await loadOutreachHistory(id);
  }
});
detailBackdrop.addEventListener('click', (e) => {
  if (e.target === detailBackdrop) closeDetail();
});

// ---------- Add / edit modal ----------

function makeRemovableRow(inner) {
  const row = document.createElement('div');
  row.className = 'repeatable-row';
  row.innerHTML = inner;
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-row-btn';
  removeBtn.textContent = '✕';
  removeBtn.onclick = () => (row.closest('.link-row-wrap') || row).remove();
  row.appendChild(removeBtn);
  return row;
}

function addEmailRow(value = '') {
  const row = makeRemovableRow(
    `<input type="email" class="email-input" placeholder="name@example.com" value="${escapeHTML(value)}" />`
  );
  emailsList.appendChild(row);
}

function addPhoneRow(value = '') {
  const row = makeRemovableRow(
    `<input type="tel" class="phone-input" placeholder="(555) 555-5555" value="${escapeHTML(value)}" />`
  );
  phonesList.appendChild(row);
}

function clientNormalizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function addLinkRow(label = '', url = '') {
  const wrap = document.createElement('div');
  wrap.className = 'link-row-wrap';

  const row = makeRemovableRow(
    `<input type="text" class="link-label-input" placeholder="Label" value="${escapeHTML(label)}" />
     <input type="text" class="link-url-input" placeholder="example.com" value="${escapeHTML(url)}" />`
  );

  const preview = document.createElement('div');
  preview.className = 'link-preview';

  const urlInput = row.querySelector('.link-url-input');
  const updatePreview = () => {
    const normalized = clientNormalizeUrl(urlInput.value);
    preview.textContent = normalized ? `Will open: ${normalized}` : '';
  };
  urlInput.addEventListener('input', updatePreview);
  updatePreview();

  wrap.appendChild(row);
  wrap.appendChild(preview);
  linksList.appendChild(wrap);
}

document.getElementById('add-email-btn').onclick = () => addEmailRow();
document.getElementById('add-phone-btn').onclick = () => addPhoneRow();
document.getElementById('add-link-btn').onclick = () => addLinkRow();

function hideDuplicateWarning() {
  duplicateWarning.hidden = true;
  duplicateWarningText.textContent = '';
  duplicateConfirmCheckbox.checked = false;
}

function showDuplicateWarning(duplicates) {
  const lines = duplicates.map((d) => {
    const shared = [...d.matchedEmails, ...d.matchedPhones].join(', ');
    const who = d.company ? `${d.name} (${d.company})` : d.name;
    return `${who} — shared: ${shared}`;
  });
  duplicateWarningText.textContent =
    `This looks like it might already be a lead: ${lines.join('; ')}.`;
  duplicateWarning.hidden = false;
}

function openModal(contact) {
  form.reset();
  emailsList.replaceChildren();
  phonesList.replaceChildren();
  linksList.replaceChildren();
  hideDuplicateWarning();

  document.getElementById('contact-id').value = contact?.id || '';
  document.getElementById('field-name').value = contact?.name || '';
  document.getElementById('field-company').value = contact?.company || '';
  populateOwnerSelect(contact?.owner);
  document.getElementById('field-tag').value = contact?.tag || 'cold';
  document.getElementById('field-notes').value = contact?.notes || '';

  if (contact?.emails?.length) contact.emails.forEach((e) => addEmailRow(e));
  else addEmailRow();

  if (contact?.phones?.length) contact.phones.forEach((p) => addPhoneRow(p));
  else addPhoneRow();

  if (contact?.links?.length) contact.links.forEach((l) => addLinkRow(l.label, l.url));
  else addLinkRow();

  if (contact) {
    modalAddedLine.hidden = false;
    document.getElementById('modal-added').textContent = formatDate(contact.created_at) || '—';
  } else {
    modalAddedLine.hidden = true;
  }

  modalTitle.textContent = contact ? 'Edit Contact' : 'New Contact';
  modalBackdrop.hidden = false;
  document.getElementById('field-name').focus();
}

function closeModal() {
  modalBackdrop.hidden = true;
}

async function deleteContact(id) {
  if (!confirm('Delete this contact?')) return;
  await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
  await loadContacts();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('contact-id').value;

  const emails = [...emailsList.querySelectorAll('.email-input')].map((i) => i.value.trim()).filter(Boolean);
  const phones = [...phonesList.querySelectorAll('.phone-input')].map((i) => i.value.trim()).filter(Boolean);
  const links = [...linksList.querySelectorAll('.repeatable-row')]
    .map((row) => ({
      label: row.querySelector('.link-label-input').value.trim(),
      url: row.querySelector('.link-url-input').value.trim(),
    }))
    .filter((l) => l.url);

  const payload = {
    name: document.getElementById('field-name').value,
    company: document.getElementById('field-company').value,
    emails,
    phones,
    links,
    owner: document.getElementById('field-owner').value,
    tag: document.getElementById('field-tag').value,
    notes: document.getElementById('field-notes').value,
    confirmDuplicate: duplicateConfirmCheckbox.checked,
  };

  const res = await apiFetch(id ? `/api/contacts/${id}` : '/api/contacts', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 409) {
    const err = await res.json().catch(() => ({}));
    showDuplicateWarning(err.duplicates || []);
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Something went wrong');
    return;
  }

  hideDuplicateWarning();
  closeModal();
  await loadContacts();
});

document.getElementById('new-contact-btn').onclick = () => openModal(null);
document.getElementById('cancel-btn').onclick = closeModal;
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalBackdrop.hidden) closeModal();
  if (!detailBackdrop.hidden) closeDetail();
});

(async function init() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/login.html';
      return;
    }
    if (data.username) {
      currentUsername = data.username;
      document.getElementById('current-username').textContent = data.username;
    }
  } catch {
    // If the session check itself fails, fall through and let the
    // first real API call's 401 handling redirect to the login page.
  }
  await loadUsers();
  loadContacts();
})();
