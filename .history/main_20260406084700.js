const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

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
  const tags = new Set();
  const baseName = path.basename(filePath, path.extname(filePath));
  const folders = path.dirname(filePath).split(path.sep).filter(Boolean).slice(-4);

  if (ext) tags.add(ext);
  if (typeGroup && typeGroup !== 'other') tags.add(typeGroup);

  if (['image', 'video', 'audio'].includes(typeGroup)) tags.add('media');
  if (['document', 'pdf', 'spreadsheet', 'slides'].includes(typeGroup)) tags.add('docs');
  if (typeGroup === 'code') tags.add('source');

  tokenize(baseName).slice(0, 6).forEach((token) => tags.add(token));

  for (const folder of folders) {
    const folderToken = folder.toLowerCase().trim();
    if (GENERIC_PROJECT_NAMES.has(folderToken)) continue;
    tokenize(folderToken).slice(0, 2).forEach((token) => tags.add(token));
  }

  const year = new Date(stat.mtimeMs).getFullYear();
  if (Number.isFinite(year)) tags.add(String(year));

  return Array.from(tags).slice(0, 12);
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
    previewable: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic'].includes(ext),
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1180,
    minHeight: 780,
    show: false,
    backgroundColor: '#0b1020',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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