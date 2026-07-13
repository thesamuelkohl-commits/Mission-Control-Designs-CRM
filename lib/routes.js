const crypto = require('node:crypto');
const db = require('./db');

const VALID_TAGS = ['cold', 'warm', 'hot', 'customer', 'lost', 'non_responsive'];

// ---------- Auth ----------

const SESSION_COOKIE = 'crm_session';
const SESSION_DAYS = 30;
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

const loginAttempts = new Map(); // ip -> { count, lockUntil }

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

async function findUser(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  return db.prepare('SELECT * FROM users WHERE username = ?').get(normalized);
}

// Resolves a candidate owner string to a real, existing username, or null.
async function resolveOwner(candidate) {
  const user = await findUser(candidate);
  return user ? user.username : null;
}

// Returns the user row if username/password match, otherwise null.
async function verifyUserPassword(username, password) {
  const user = await findUser(username);
  if (!user || typeof password !== 'string' || !password) return null;
  const candidate = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.hash, 'hex');
  const ok = candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  return ok ? user : null;
}

function isLockedOut(ip) {
  const entry = loginAttempts.get(ip);
  return Boolean(entry && entry.lockUntil && entry.lockUntil > Date.now());
}

function recordFailedLogin(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockUntil = Date.now() + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(ip, entry);
}

function clearFailedLogins(ip) {
  loginAttempts.delete(ip);
}

async function createSession(username) {
  const id = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.prepare('INSERT INTO sessions (id, username, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(id, username, now.toISOString(), expires.toISOString());
  return { id, expiresInSeconds: SESSION_DAYS * 24 * 60 * 60 };
}

// Returns the session row (with .username) if valid, otherwise null.
async function getValidSession(sessionId) {
  if (!sessionId) return null;
  const row = await db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return row;
}

async function destroySession(sessionId) {
  if (sessionId) await db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isHttpsRequest(req) {
  return req.headers['x-forwarded-proto'] === 'https' || Boolean(process.env.VERCEL);
}

function setSessionCookie(req, res, session) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${session.id}; HttpOnly; Path=/; Max-Age=${session.expiresInSeconds}; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(req, res) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
}

// ---------- Helpers ----------

function nowISO() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function sendJSON(res, status, data) {
  const body = data === null ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1e6) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
}

function normalizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const url = typeof item.url === 'string' ? normalizeUrl(item.url) : '';
      if (!url) return null;
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      return { label, url };
    })
    .filter(Boolean);
}

function validateContactInput(input, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || input.name !== undefined) {
    if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
      errors.push('name is required');
    } else {
      out.name = input.name.trim();
    }
  }

  for (const field of ['company', 'notes']) {
    if (input[field] !== undefined) {
      out[field] = typeof input[field] === 'string' ? input[field].trim() : '';
    } else if (!partial) {
      out[field] = '';
    }
  }

  if (input.emails !== undefined) {
    out.emails = normalizeStringList(input.emails);
  } else if (!partial) {
    out.emails = [];
  }

  if (input.phones !== undefined) {
    out.phones = normalizeStringList(input.phones);
  } else if (!partial) {
    out.phones = [];
  }

  if (input.links !== undefined) {
    out.links = normalizeLinks(input.links);
  } else if (!partial) {
    out.links = [];
  }

  if (input.tag !== undefined) {
    if (!VALID_TAGS.includes(input.tag)) {
      errors.push(`tag must be one of: ${VALID_TAGS.join(', ')}`);
    } else {
      out.tag = input.tag;
    }
  } else if (!partial) {
    out.tag = 'cold';
  }

  return { errors, data: out };
}

function rowToContact(row) {
  return {
    ...row,
    emails: JSON.parse(row.emails || '[]'),
    phones: JSON.parse(row.phones || '[]'),
    links: JSON.parse(row.links || '[]'),
  };
}

function normalizeEmailForMatch(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizePhoneForMatch(phone) {
  return typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
}

// Looks across all existing contacts (optionally excluding one, for edits) for any
// shared email or phone number with the given lists. Used to warn about duplicate leads.
async function findDuplicateContacts(emails, phones, excludeId) {
  const normEmails = new Set((emails || []).map(normalizeEmailForMatch).filter(Boolean));
  const normPhones = new Set(
    (phones || []).map(normalizePhoneForMatch).filter((p) => p.length >= 7)
  );
  if (normEmails.size === 0 && normPhones.size === 0) return [];

  const rows = excludeId
    ? await db.prepare('SELECT id, name, company, emails, phones FROM contacts WHERE id != ?').all(excludeId)
    : await db.prepare('SELECT id, name, company, emails, phones FROM contacts').all();

  const matches = [];
  for (const row of rows) {
    const rowEmails = JSON.parse(row.emails || '[]').map(normalizeEmailForMatch);
    const rowPhones = JSON.parse(row.phones || '[]').map(normalizePhoneForMatch);
    const matchedEmails = rowEmails.filter((e) => e && normEmails.has(e));
    const matchedPhones = rowPhones.filter((p) => p.length >= 7 && normPhones.has(p));
    if (matchedEmails.length || matchedPhones.length) {
      matches.push({
        id: row.id,
        name: row.name,
        company: row.company,
        matchedEmails,
        matchedPhones,
      });
    }
  }
  return matches;
}

// ---------- Routes ----------

const routes = {
  async 'POST /api/login'(req, res) {
    const ip = req.socket.remoteAddress || 'unknown';
    if (isLockedOut(ip)) {
      return sendJSON(res, 429, { error: 'Too many failed attempts. Try again in a few minutes.' });
    }
    const input = await readBody(req);
    const user = await verifyUserPassword(input.username, input.password);
    if (!user) {
      recordFailedLogin(ip);
      return sendJSON(res, 401, { error: 'Incorrect username or password' });
    }
    clearFailedLogins(ip);
    const session = await createSession(user.username);
    setSessionCookie(req, res, session);
    sendJSON(res, 200, { ok: true, username: user.username });
  },

  async 'POST /api/logout'(req, res) {
    const cookies = parseCookies(req);
    await destroySession(cookies[SESSION_COOKIE]);
    clearSessionCookie(req, res);
    sendJSON(res, 200, { ok: true });
  },

  async 'GET /api/session'(req, res) {
    const cookies = parseCookies(req);
    const session = await getValidSession(cookies[SESSION_COOKIE]);
    sendJSON(res, 200, { authenticated: Boolean(session), username: session?.username || null });
  },

  async 'GET /api/users'(req, res) {
    const rows = await db.prepare('SELECT username FROM users ORDER BY username').all();
    sendJSON(res, 200, rows.map((r) => r.username));
  },

  // Sam-only dashboard: activity/lead breakdowns across the whole team.
  async 'GET /api/reports'(req, res) {
    if (req.session?.username !== 'sam') {
      return sendJSON(res, 403, { error: 'forbidden' });
    }

    const [
      totalContactsRow,
      neverContactedRow,
      totalActivitiesRow,
      contactsByTag,
      contactsByOwner,
      activitiesByUser,
      activitiesByOwner,
      activityByDayDesc,
      recentActivity,
      topContacts,
    ] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS count FROM contacts').get(),
      db.prepare('SELECT COUNT(*) AS count FROM contacts WHERE last_contacted IS NULL').get(),
      db.prepare('SELECT COUNT(*) AS count FROM outreach_log').get(),
      db.prepare('SELECT tag, COUNT(*) AS count FROM contacts GROUP BY tag ORDER BY count DESC').all(),
      db.prepare(`
        SELECT COALESCE(owner, 'Unassigned') AS owner, COUNT(*) AS count
        FROM contacts GROUP BY owner ORDER BY count DESC
      `).all(),
      db.prepare(`
        SELECT COALESCE(username, 'Unknown') AS username, COUNT(*) AS count
        FROM outreach_log GROUP BY username ORDER BY count DESC
      `).all(),
      db.prepare(`
        SELECT COALESCE(c.owner, 'Unassigned') AS owner, COUNT(ol.id) AS count
        FROM outreach_log ol JOIN contacts c ON c.id = ol.contact_id
        GROUP BY c.owner ORDER BY count DESC
      `).all(),
      db.prepare(`
        SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
        FROM outreach_log GROUP BY day ORDER BY day DESC LIMIT 14
      `).all(),
      db.prepare(`
        SELECT ol.id, ol.message, ol.username, ol.created_at, c.id AS contact_id, c.name AS contact_name
        FROM outreach_log ol JOIN contacts c ON c.id = ol.contact_id
        ORDER BY ol.created_at DESC LIMIT 20
      `).all(),
      db.prepare(`
        SELECT c.id, c.name, c.company, COUNT(ol.id) AS count
        FROM contacts c LEFT JOIN outreach_log ol ON ol.contact_id = c.id
        GROUP BY c.id ORDER BY count DESC, c.name ASC LIMIT 10
      `).all(),
    ]);

    sendJSON(res, 200, {
      totalContacts: totalContactsRow.count,
      neverContacted: neverContactedRow.count,
      totalActivities: totalActivitiesRow.count,
      contactsByTag,
      contactsByOwner,
      activitiesByUser,
      activitiesByOwner,
      activityByDay: activityByDayDesc.slice().reverse(),
      recentActivity,
      topContacts,
    });
  },

  async 'GET /api/contacts'(req, res, query) {
    const tag = query.get('tag');
    const owner = query.get('owner');
    const from = query.get('last_contacted_from');
    const to = query.get('last_contacted_to');
    const never = query.get('never_contacted') === 'true';
    const search = (query.get('search') || '').trim();

    const conditions = [];
    const params = [];

    if (search) {
      const like = `%${search}%`;
      conditions.push('(name LIKE ? OR company LIKE ? OR emails LIKE ? OR phones LIKE ? OR notes LIKE ?)');
      params.push(like, like, like, like, like);
    }

    if (tag && tag !== 'all') {
      if (!VALID_TAGS.includes(tag)) {
        return sendJSON(res, 400, { error: `invalid tag: ${tag}` });
      }
      conditions.push('tag = ?');
      params.push(tag);
    }

    if (owner && owner !== 'all') {
      conditions.push('owner = ?');
      params.push(owner);
    }

    if (never) {
      conditions.push('last_contacted IS NULL');
    } else {
      if (from) {
        conditions.push('last_contacted >= ?');
        params.push(from);
      }
      if (to) {
        conditions.push('last_contacted <= ?');
        params.push(to);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM outreach_log ol WHERE ol.contact_id = c.id) AS activity_count
      FROM contacts c
      ${where}
      ORDER BY c.updated_at DESC
    `).all(...params);
    sendJSON(res, 200, rows.map(rowToContact));
  },

  async 'POST /api/contacts'(req, res) {
    const input = await readBody(req);
    const { errors, data } = validateContactInput(input);
    if (errors.length) return sendJSON(res, 400, { error: errors.join('; ') });

    let owner = req.session?.username || null;
    if (input.owner) {
      const resolved = await resolveOwner(input.owner);
      if (!resolved) return sendJSON(res, 400, { error: 'invalid owner' });
      owner = resolved;
    }

    if (!input.confirmDuplicate) {
      const duplicates = await findDuplicateContacts(data.emails, data.phones, null);
      if (duplicates.length) {
        return sendJSON(res, 409, { error: 'possible duplicate contact', duplicates });
      }
    }

    const ts = nowISO();
    const result = await db.prepare(`
      INSERT INTO contacts (name, company, emails, phones, links, last_contacted, tag, notes, owner, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name, data.company,
      JSON.stringify(data.emails), JSON.stringify(data.phones), JSON.stringify(data.links),
      null, data.tag, data.notes, owner, ts, ts
    );
    const created = await db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
    sendJSON(res, 201, rowToContact(created));
  },

  async 'PUT /api/contacts/:id'(req, res, query, params) {
    const id = Number(params.id);
    const existing = await db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    if (!existing) return sendJSON(res, 404, { error: 'contact not found' });

    const input = await readBody(req);
    const { errors, data } = validateContactInput(input, { partial: true });
    if (errors.length) return sendJSON(res, 400, { error: errors.join('; ') });

    if (!input.confirmDuplicate && (data.emails || data.phones)) {
      const effectiveEmails = data.emails ?? JSON.parse(existing.emails || '[]');
      const effectivePhones = data.phones ?? JSON.parse(existing.phones || '[]');
      const duplicates = await findDuplicateContacts(effectiveEmails, effectivePhones, id);
      if (duplicates.length) {
        return sendJSON(res, 409, { error: 'possible duplicate contact', duplicates });
      }
    }

    let owner = existing.owner;
    if (input.owner !== undefined && input.owner !== '') {
      const resolved = await resolveOwner(input.owner);
      if (!resolved) return sendJSON(res, 400, { error: 'invalid owner' });
      owner = resolved;
    }

    const merged = {
      name: data.name ?? existing.name,
      company: data.company ?? existing.company,
      emails: data.emails ? JSON.stringify(data.emails) : existing.emails,
      phones: data.phones ? JSON.stringify(data.phones) : existing.phones,
      links: data.links ? JSON.stringify(data.links) : existing.links,
      tag: data.tag ?? existing.tag,
      notes: data.notes ?? existing.notes,
      owner,
      updated_at: nowISO(),
    };
    await db.prepare(`
      UPDATE contacts SET name = ?, company = ?, emails = ?, phones = ?, links = ?,
        tag = ?, notes = ?, owner = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.name, merged.company, merged.emails, merged.phones, merged.links,
      merged.tag, merged.notes, merged.owner, merged.updated_at, id
    );
    const updated = await db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    sendJSON(res, 200, rowToContact(updated));
  },

  async 'POST /api/contacts/:id/touch'(req, res, query, params) {
    const id = Number(params.id);
    const existing = await db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    if (!existing) return sendJSON(res, 404, { error: 'contact not found' });

    const input = await readBody(req);
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    const ts = nowISO();
    const username = req.session?.username || null;

    const logResult = await db.prepare(
      'INSERT INTO outreach_log (contact_id, message, username, created_at) VALUES (?, ?, ?, ?)'
    ).run(id, message, username, ts);

    await db.prepare('UPDATE contacts SET last_contacted = ?, updated_at = ? WHERE id = ?')
      .run(todayDate(), ts, id);

    const updated = await db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    const entry = await db.prepare('SELECT * FROM outreach_log WHERE id = ?').get(logResult.lastInsertRowid);
    sendJSON(res, 200, { contact: rowToContact(updated), entry });
  },

  async 'GET /api/contacts/:id/outreach'(req, res, query, params) {
    const id = Number(params.id);
    const existing = await db.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    if (!existing) return sendJSON(res, 404, { error: 'contact not found' });

    const rows = await db.prepare('SELECT * FROM outreach_log WHERE contact_id = ? ORDER BY created_at DESC').all(id);
    sendJSON(res, 200, rows);
  },

  async 'DELETE /api/contacts/:id/outreach/:entryId'(req, res, query, params) {
    const id = Number(params.id);
    const entryId = Number(params.entryId);
    const result = await db.prepare('DELETE FROM outreach_log WHERE id = ? AND contact_id = ?').run(entryId, id);
    if (result.changes === 0) return sendJSON(res, 404, { error: 'outreach entry not found' });
    sendJSON(res, 204, null);
  },

  async 'DELETE /api/contacts/:id'(req, res, query, params) {
    const id = Number(params.id);
    const result = await db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    if (result.changes === 0) return sendJSON(res, 404, { error: 'contact not found' });
    await db.prepare('DELETE FROM outreach_log WHERE contact_id = ?').run(id);
    sendJSON(res, 204, null);
  },
};

function matchRoute(method, pathname) {
  for (const key of Object.keys(routes)) {
    const [routeMethod, routePath] = key.split(' ');
    if (routeMethod !== method) continue;
    const routeParts = routePath.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    if (routeParts.length !== pathParts.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler: routes[key], params };
  }
  return null;
}

const PUBLIC_API_PATHS = new Set(['/api/login', '/api/session']);

// Handles a single /api/* request end-to-end: auth gate + route dispatch.
// Shared by the local server (server.js) and the Vercel serverless function (api/[...path].js).
async function handleApiRequest(req, res, pathname, searchParams) {
  const cookies = parseCookies(req);
  const session = await getValidSession(cookies[SESSION_COOKIE]);

  if (!session && !PUBLIC_API_PATHS.has(pathname)) {
    return sendJSON(res, 401, { error: 'unauthorized' });
  }
  req.session = session;

  const match = matchRoute(req.method, pathname);
  if (!match) return sendJSON(res, 404, { error: 'not found' });

  try {
    await match.handler(req, res, searchParams, match.params);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: 'internal server error' });
  }
}

module.exports = { handleApiRequest, ensureSchema: db.ensureSchema };
