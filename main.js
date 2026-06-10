const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const os = require('os');

function getStateFilePath() {
  return path.join(app.getPath('userData'), 'projungle.library.json');
}

function defaultState() {
  return {
    version: 1,
    viewport: { x: 260, y: 160, scale: 1 },
    projects: [],
  };
}

async function loadState() {
  try {
    const raw = await fs.readFile(getStateFilePath(), 'utf8');
    const parsed = JSON.parse(raw);

    return {
      ...defaultState(),
      ...parsed,
      viewport: {
        ...defaultState().viewport,
        ...(parsed.viewport || {}),
      },
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  } catch {
    return defaultState();
  }
}

async function saveState(state) {
  const payload = {
    version: 1,
    viewport: state?.viewport || defaultState().viewport,
    projects: Array.isArray(state?.projects) ? state.projects : [],
  };

  await fs.mkdir(path.dirname(getStateFilePath()), { recursive: true });
  await fs.writeFile(getStateFilePath(), JSON.stringify(payload, null, 2), 'utf8');

  return { ok: true };
}

const EXT_GROUPS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'avif', 'heic'],
  video: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'wmv', 'flv'],
  audio: ['mp3', 'wav', 'aiff', 'aac', 'ogg', 'm4a', 'flac'],
  pdf: ['pdf'],
  document: ['doc', 'docx', 'rtf', 'txt', 'md', 'pages'],
  spreadsheet: ['xls', 'xlsx', 'csv', 'numbers'],
  slides: ['ppt', 'pptx', 'key'],
  design: ['fig', 'sketch', 'xd', 'psd', 'ai', 'indd'],
  code: [
    'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'scss', 'less',
    'json', 'yaml', 'yml', 'xml', 'py', 'rb', 'php',
    'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'swift',
    'kt', 'sql', 'sh', 'bash'
  ],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz'],
  model: ['blend', 'obj', 'fbx', 'glb', 'gltf', 'stl'],
  data: ['db', 'sqlite', 'parquet'],
};

const GENERIC_PROJECT_NAMES = new Set([
  'desktop',
  'documents',
  'document',
  'downloads',
  'download',
  'files',
  'file',
  'assets',
  'photos',
  'pictures',
  'images',
  'music',
  'audio',
  'video',
  'movies',
  'library',
  'work',
  'projects',
  'project',
  'untitled',
  'misc',
  'stuff',
]);

const TOKEN_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'that',
  'this',
  'into',
  'your',
  'copy',
  'draft',
  'final',
  'new',
  'old',
  'version',
  'export',
  'edited',
  'edit',
  'screen',
  'shot',
  'img',
  'image',
  'doc',
  'file',
  'untitled',
]);

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  '__pycache__',
  'venv',
  '.venv'
]);

const IGNORED_FILES = new Set([
  '.ds_store',
  'thumbs.db'
]);

function typeGroupFromExt(ext) {
  const clean = String(ext || '').replace(/^\./, '').toLowerCase();

  for (const [group, extensions] of Object.entries(EXT_GROUPS)) {
    if (extensions.includes(clean)) return group;
  }

  return 'other';
}

function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token && token.length > 1 && !TOKEN_STOPWORDS.has(token));
}

function hashId(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
}

function smartProjectLabelFromFile(filePath, typeGroup) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const tokens = tokenize(baseName).filter((token) => {
    if (GENERIC_PROJECT_NAMES.has(token)) return false;
    if (/^v?\d+$/.test(token)) return false;
    return true;
  });

  if (tokens.length) return titleCase(tokens[0]);

  const fallbackNames = {
    image: 'Images',
    video: 'Videos',
    audio: 'Audio',
    pdf: 'PDFs',
    document: 'Documents',
    spreadsheet: 'Sheets',
    slides: 'Slides',
    design: 'Design',
    code: 'Code',
    archive: 'Archives',
    model: '3D',
    data: 'Data',
    other: 'Loose Files',
  };

  return fallbackNames[typeGroup] || 'Loose Files';
}

function inferTags(filePath, ext, typeGroup, stat) {
  return [];
}

function buildFileRecord(filePath, stat, projectHint) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const typeGroup = typeGroupFromExt(ext);

  return {
    id: `file-${hashId(filePath)}`,
    name: path.basename(filePath),
    path: filePath,
    ext,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    typeGroup,
    previewable: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'mp4', 'mov', 'm4v', 'webm', 'mp3', 'wav', 'aiff', 'aac', 'ogg', 'm4a', 'flac'].includes(ext),
    tags: inferTags(filePath, ext, typeGroup, stat),
    projectHint,
  };
}

async function walkInputPath(entryPath, projectHint, output, seenPaths) {
  let stat;
  try {
    stat = await fs.lstat(entryPath);
  } catch {
    return;
  }

  const baseName = path.basename(entryPath);

  if (stat.isSymbolicLink()) return;

  if (stat.isDirectory()) {
    if (IGNORED_DIRS.has(baseName)) return;

    let children = [];
    try {
      children = await fs.readdir(entryPath);
    } catch {
      return;
    }

    for (const child of children) {
      await walkInputPath(path.join(entryPath, child), projectHint, output, seenPaths);
    }
    return;
  }

  if (!stat.isFile()) return;
  if (IGNORED_FILES.has(baseName.toLowerCase())) return;

  const resolved = path.resolve(entryPath);
  if (seenPaths.has(resolved)) return;
  seenPaths.add(resolved);

  output.push(buildFileRecord(resolved, stat, projectHint));
}

function normalizeProjectKey(name) {
  return String(name || 'Untitled Project').trim().toLowerCase();
}

async function importDroppedPaths(inputPaths = []) {
  const uniqueInputs = Array.from(new Set((inputPaths || []).filter(Boolean)));
  const seenFiles = new Set();
  const groups = new Map();

  for (const rawPath of uniqueInputs) {
    const fullPath = path.resolve(rawPath);

    let stat;
    try {
      stat = await fs.lstat(fullPath);
    } catch {
      continue;
    }

    let projectHint;

    if (stat.isDirectory()) {
      projectHint = path.basename(fullPath) || 'Untitled Project';
    } else {
      const parentName = path.basename(path.dirname(fullPath)) || '';
      const ext = path.extname(fullPath).slice(1).toLowerCase();
      const typeGroup = typeGroupFromExt(ext);

      projectHint = !GENERIC_PROJECT_NAMES.has(parentName.toLowerCase())
        ? parentName
        : smartProjectLabelFromFile(fullPath, typeGroup);
    }

    const files = [];
    await walkInputPath(fullPath, projectHint, files, seenFiles);

    for (const file of files) {
      const key = normalizeProjectKey(file.projectHint);

      if (!groups.has(key)) {
        groups.set(key, {
          name: titleCase(file.projectHint),
          files: [],
          tagCounts: new Map(),
        });
      }

      const group = groups.get(key);
      group.files.push(file);

      for (const tag of file.tags) {
        group.tagCounts.set(tag, (group.tagCounts.get(tag) || 0) + 1);
      }
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      name: group.name,
      tags: Array.from(group.tagCounts.entries())
        .filter(([tag]) => tag && tag.length > 1)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag]) => tag)
        .slice(0, 10),
      files: group.files.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Hunter ─────────────────────────────────────────────────────────── */

function hunterDefaultDirs() {
  const homeDir = os.homedir();
  return [
    path.join(homeDir, 'Desktop'),
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Downloads'),
    path.join(homeDir, 'Pictures'),
    path.join(homeDir, 'Movies'),
    path.join(homeDir, 'Music'),
  ];
}

async function hunterSearch(keywords = [], excludePaths = [], customDirs = []) {
  const searchDirs = customDirs.length ? customDirs : hunterDefaultDirs();

  const excludeSet = new Set(excludePaths.map((p) => path.resolve(p)));
  const normalizedKeywords = keywords
    .map((k) => String(k).toLowerCase())
    .filter((k) => k.length > 2 && !TOKEN_STOPWORDS.has(k));

  if (!normalizedKeywords.length) return [];

  const results = [];
  const MAX_RESULTS = 60;
  const MAX_DEPTH = 4;

  async function searchDir(dir, depth) {
    if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) break;

      const fullPath = path.join(dir, entry.name);
      const resolved = path.resolve(fullPath);

      if (excludeSet.has(resolved)) continue;
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const dirLower = entry.name.toLowerCase();
        const dirMatches = normalizedKeywords.some((k) => dirLower.includes(k));
        if (dirMatches || depth < 2) {
          await searchDir(fullPath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (IGNORED_FILES.has(entry.name.toLowerCase())) continue;

      const nameLower = entry.name.toLowerCase();
      const stem = path.basename(entry.name, path.extname(entry.name)).toLowerCase();
      const parentName = path.basename(dir).toLowerCase();

      let relevance = 0;
      for (const kw of normalizedKeywords) {
        if (stem === kw) relevance += 5;
        else if (stem.includes(kw)) relevance += 3;
        else if (nameLower.includes(kw)) relevance += 2;
        if (parentName.includes(kw)) relevance += 1;
      }

      if (relevance > 0) {
        try {
          const stat = await fs.stat(fullPath);
          const record = buildFileRecord(resolved, stat, path.basename(dir));
          record.relevance = relevance;
          results.push(record);
        } catch {
          /* skip inaccessible */
        }
      }
    }
  }

  for (const dir of searchDirs) {
    if (results.length >= MAX_RESULTS) break;
    try {
      await fs.access(dir);
      await searchDir(dir, 0);
    } catch {
      /* dir may not exist */
    }
  }

  return results.sort((a, b) => b.relevance - a.relevance);
}

/* ── Hunter v2: query-based search + relocate ───────────────────────────
   Generalized filesystem search used by the rebuilt Hunter panel and by
   FileHawk's "relocate" repair. Scores matches from an explicit query
   (highest weight) and/or project-derived keywords (suggestions), with an
   optional type filter and an exact-name mode for locating a moved file. */
async function huntFiles(opts = {}) {
  const {
    query = '',
    keywords = [],
    types = null,
    excludePaths = [],
    customDirs = [],
    limit = 80,
    exactName = false,
  } = opts;

  const searchDirs = customDirs.length ? customDirs : hunterDefaultDirs();
  const excludeSet = new Set(excludePaths.map((p) => path.resolve(p)));
  const typeSet = Array.isArray(types) && types.length ? new Set(types) : null;

  const queryTerms = String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1);
  const kwTerms = (keywords || [])
    .map((k) => String(k).toLowerCase())
    .filter((k) => k.length > 2 && !TOKEN_STOPWORDS.has(k));

  if (!queryTerms.length && !kwTerms.length && !exactName) return [];

  const wantStem = exactName
    ? path.basename(String(query), path.extname(String(query))).toLowerCase()
    : '';
  const wantName = exactName ? String(query).toLowerCase() : '';

  const results = [];
  const HARD_CAP = 400;
  const MAX_DEPTH = 5;

  async function walk(dir, depth) {
    if (depth > MAX_DEPTH || results.length >= HARD_CAP) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= HARD_CAP) break;
      const full = path.join(dir, entry.name);
      const resolved = path.resolve(full);
      if (excludeSet.has(resolved)) continue;
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const dl = entry.name.toLowerCase();
        const dirMatches =
          queryTerms.some((t) => dl.includes(t)) || kwTerms.some((k) => dl.includes(k));
        if (dirMatches || depth < 2 || (exactName && depth < 4)) {
          await walk(full, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (IGNORED_FILES.has(entry.name.toLowerCase())) continue;

      const ext = path.extname(entry.name).slice(1).toLowerCase();
      const typeGroup = typeGroupFromExt(ext);
      if (typeSet && !typeSet.has(typeGroup)) continue;

      const nameLower = entry.name.toLowerCase();
      const stem = path.basename(entry.name, path.extname(entry.name)).toLowerCase();
      const parentName = path.basename(dir).toLowerCase();

      let relevance = 0;

      if (exactName) {
        if (nameLower === wantName) relevance += 100;
        else if (stem === wantStem) relevance += 60;
        else if (wantStem && stem.includes(wantStem)) relevance += 20;
      }
      for (const t of queryTerms) {
        if (stem === t) relevance += 8;
        else if (stem.includes(t)) relevance += 5;
        else if (nameLower.includes(t)) relevance += 3;
        if (parentName.includes(t)) relevance += 1;
      }
      for (const k of kwTerms) {
        if (stem === k) relevance += 4;
        else if (stem.includes(k)) relevance += 2;
        else if (nameLower.includes(k)) relevance += 1;
        if (parentName.includes(k)) relevance += 1;
      }

      if (relevance > 0) {
        try {
          const stat = await fs.stat(full);
          const record = buildFileRecord(resolved, stat, path.basename(dir));
          record.relevance = relevance;
          results.push(record);
        } catch {
          /* skip inaccessible */
        }
      }
    }
  }

  for (const dir of searchDirs) {
    if (results.length >= HARD_CAP) break;
    try {
      await fs.access(dir);
      await walk(dir, 0);
    } catch {
      /* dir may not exist */
    }
  }

  results.sort(
    (a, b) => b.relevance - a.relevance || String(b.modifiedAt).localeCompare(String(a.modifiedAt)),
  );
  return results.slice(0, limit);
}

/* ── FileHawk ───────────────────────────────────────────────────────── */

async function filehawkCheck(filePaths = []) {
  const results = [];

  for (const filePath of filePaths) {
    try {
      const stat = await fs.stat(filePath);
      results.push({
        path: filePath,
        exists: true,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      results.push({ path: filePath, exists: false });
    }
  }

  return results;
}

/* ── File Consolidation ─────────────────────────────────────────────── */

async function consolidateProject(projectName, filePaths = []) {
  const safeName = String(projectName || 'Untitled')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .trim();
  const targetDir = path.join(
    os.homedir(),
    'Documents',
    'projungle',
    'projects',
    safeName,
  );

  await fs.mkdir(targetDir, { recursive: true });

  const result = { copied: 0, skipped: 0, failed: 0, targetDir };

  for (const src of filePaths) {
    const dest = path.join(targetDir, path.basename(src));
    try {
      try {
        await fs.access(dest);
        result.skipped += 1;
        continue;
      } catch {
        /* doesn't exist yet – proceed */
      }
      await fs.copyFile(src, dest);
      result.copied += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}

function createWindow() {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 180,
    minHeight: 180,
    show: false,
    backgroundColor: '#111111',
    titleBarStyle: 'customButtonsOnHover',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Dev serves the renderer over http://localhost (Vite); the canvas loads user
      // media via file:// URLs (toFileUrl in src/app.js), which Chromium blocks from
      // an http origin ("Not allowed to load local resource"). Relax web security in
      // dev only — production loads over file:// where file media works natively.
      webSecurity: !devServerUrl,
    },
  });

  // Dev: load the Vite dev server (set VITE_DEV_SERVER_URL via `npm run electron:dev`).
  // Prod: load the built renderer produced by `vite build` (dist/index.html) over file://.
  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('library:load', async () => loadState());
ipcMain.handle('library:save', async (_event, state) => saveState(state));
ipcMain.handle('library:importPaths', async (_event, inputPaths) => importDroppedPaths(inputPaths));

ipcMain.handle('shell:openPath', async (_event, targetPath) => {
  if (!targetPath) return '';
  return shell.openPath(targetPath);
});

ipcMain.handle('shell:showItemInFolder', async (_event, targetPath) => {
  if (targetPath) shell.showItemInFolder(targetPath);
  return { ok: true };
});

ipcMain.handle('hunter:search', async (_event, keywords, excludePaths, customDirs) =>
  hunterSearch(keywords, excludePaths, customDirs),
);

ipcMain.handle('hunter:defaultDirs', async () => hunterDefaultDirs());

ipcMain.handle('hunter:query', async (_event, opts) => huntFiles(opts || {}));

ipcMain.handle('dialog:openDirectory', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Add Hunter search directory',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('filehawk:check', async (_event, filePaths) =>
  filehawkCheck(filePaths),
);

ipcMain.handle('filehawk:locate', async (_event, name, excludePaths, dirs) =>
  huntFiles({
    query: name,
    exactName: true,
    excludePaths: excludePaths || [],
    customDirs: dirs || [],
    limit: 40,
  }),
);

ipcMain.handle('consolidate:project', async (_event, projectName, filePaths) =>
  consolidateProject(projectName, filePaths),
);

/* ── Journals (SQLite) ───────────────────────────────────────────────
   Backing store for the journals tab. Uses Node's built-in node:sqlite
   (stable in Node 24 / Electron 41) — no native module rebuild needed.
   DB lives in userData/keeper.db so it survives app updates. */

let journalsDb = null;

function getJournalsDb() {
  if (journalsDb) return journalsDb;
  const { DatabaseSync } = require('node:sqlite');
  journalsDb = new DatabaseSync(path.join(app.getPath('userData'), 'keeper.db'));
  journalsDb.exec(`
    CREATE TABLE IF NOT EXISTS journals (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      cover       TEXT NOT NULL,
      page        TEXT NOT NULL,
      folio_count INTEGER NOT NULL DEFAULT 0,
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS folios (
      id         TEXT PRIMARY KEY,
      journal_id TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'notes',
      title      TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL DEFAULT '{}',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_folios_journal ON folios (journal_id, position);
  `);
  return journalsDb;
}

function rowToFolio(row) {
  let content = {};
  try { content = JSON.parse(row.content); } catch { /* keep {} */ }
  return {
    id: row.id,
    journalId: row.journal_id,
    type: row.type,
    title: row.title,
    content,
    position: row.position,
    createdAt: row.created_at,
  };
}

function rowToJournal(row) {
  let tags = [];
  try { tags = JSON.parse(row.tags); } catch { /* keep [] */ }
  return {
    id: row.id,
    title: row.title,
    tags,
    cover: row.cover,
    page: row.page,
    folioCount: row.folio_count,
    position: row.position,
    createdAt: row.created_at,
  };
}

ipcMain.handle('journals:list', async () => {
  const rows = getJournalsDb()
    .prepare('SELECT * FROM journals ORDER BY position ASC, created_at ASC')
    .all();
  return rows.map(rowToJournal);
});

ipcMain.handle('journals:create', async (_event, input) => {
  const title = String(input?.title || '').trim();
  if (!title) throw new Error('Journal title is required');

  const db = getJournalsDb();
  const tags = Array.isArray(input?.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const id = crypto.randomUUID();
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS max FROM journals').get().max;

  // Template folios: optional array of { type, title, content } seeded at create time.
  const folios = Array.isArray(input?.folios) ? input.folios : [];
  const now = Date.now();

  db.prepare(
    'INSERT INTO journals (id, title, tags, cover, page, folio_count, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, title, JSON.stringify(tags), String(input?.cover || ''), String(input?.page || ''), folios.length, maxPos + 1, now);

  const insertFolio = db.prepare(
    'INSERT INTO folios (id, journal_id, type, title, content, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  folios.forEach((f, i) => {
    insertFolio.run(
      crypto.randomUUID(),
      id,
      String(f?.type || 'notes'),
      String(f?.title || ''),
      JSON.stringify(f?.content ?? {}),
      i,
      now + i,
    );
  });

  return rowToJournal(db.prepare('SELECT * FROM journals WHERE id = ?').get(id));
});

ipcMain.handle('journals:delete', async (_event, id) => {
  const db = getJournalsDb();
  db.prepare('DELETE FROM folios WHERE journal_id = ?').run(String(id));
  db.prepare('DELETE FROM journals WHERE id = ?').run(String(id));
  return { ok: true };
});

ipcMain.handle('folios:list', async (_event, journalId) => {
  const rows = getJournalsDb()
    .prepare('SELECT * FROM folios WHERE journal_id = ? ORDER BY position ASC, created_at ASC')
    .all(String(journalId));
  return rows.map(rowToFolio);
});

ipcMain.handle('folios:create', async (_event, journalId, folio) => {
  const db = getJournalsDb();
  const jid = String(journalId);
  const journal = db.prepare('SELECT id FROM journals WHERE id = ?').get(jid);
  if (!journal) throw new Error('Journal not found');
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS max FROM folios WHERE journal_id = ?').get(jid).max;
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO folios (id, journal_id, type, title, content, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, jid, String(folio?.type || 'notes'), String(folio?.title || ''), JSON.stringify(folio?.content ?? {}), maxPos + 1, Date.now());
  db.prepare('UPDATE journals SET folio_count = (SELECT COUNT(*) FROM folios WHERE journal_id = ?) WHERE id = ?').run(jid, jid);
  return rowToFolio(db.prepare('SELECT * FROM folios WHERE id = ?').get(id));
});

ipcMain.handle('folios:delete', async (_event, id) => {
  const db = getJournalsDb();
  const row = db.prepare('SELECT journal_id FROM folios WHERE id = ?').get(String(id));
  if (row) {
    db.prepare('DELETE FROM folios WHERE id = ?').run(String(id));
    db.prepare('UPDATE journals SET folio_count = (SELECT COUNT(*) FROM folios WHERE journal_id = ?) WHERE id = ?')
      .run(row.journal_id, row.journal_id);
  }
  return { ok: true };
});

ipcMain.handle('folios:update', async (_event, id, patch) => {
  const db = getJournalsDb();
  const row = db.prepare('SELECT * FROM folios WHERE id = ?').get(String(id));
  if (!row) throw new Error('Folio not found');
  const title = patch?.title !== undefined ? String(patch.title) : row.title;
  const content = patch?.content !== undefined ? JSON.stringify(patch.content) : row.content;
  db.prepare('UPDATE folios SET title = ?, content = ? WHERE id = ?').run(title, content, String(id));
  return rowToFolio(db.prepare('SELECT * FROM folios WHERE id = ?').get(String(id)));
});