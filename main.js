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
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 180,
    minHeight: 180,
    show: false,
    backgroundColor: '#0b1020',
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
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

ipcMain.handle('consolidate:project', async (_event, projectName, filePaths) =>
  consolidateProject(projectName, filePaths),
);