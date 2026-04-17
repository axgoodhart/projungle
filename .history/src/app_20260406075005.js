const stage = document.getElementById('stage');
const world = document.getElementById('world');
const grid = document.getElementById('grid');
const dropOverlay = document.getElementById('dropOverlay');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const resetViewBtn = document.getElementById('resetViewBtn');
const fitBtn = document.getElementById('fitBtn');
const projectCountEl = document.getElementById('projectCount');
const fileCountEl = document.getElementById('fileCount');
const zoomReadoutEl = document.getElementById('zoomReadout');
const saveStateEl = document.getElementById('saveState');
const tagStrip = document.getElementById('tagStrip');

const ACCENTS = [
  { hex: '#7C3AED', rgb: '124,58,237' },
  { hex: '#38BDF8', rgb: '56,189,248' },
  { hex: '#22C55E', rgb: '34,197,94' },
  { hex: '#F97316', rgb: '249,115,22' },
  { hex: '#EC4899', rgb: '236,72,153' },
  { hex: '#14B8A6', rgb: '20,184,166' },
  { hex: '#EAB308', rgb: '234,179,8' },
  { hex: '#8B5CF6', rgb: '139,92,246' },
];

const TYPE_ORDER = [
  'design',
  'image',
  'video',
  'audio',
  'pdf',
  'document',
  'spreadsheet',
  'slides',
  'code',
  'data',
  'archive',
  'model',
  'other',
];

const TYPE_LABELS = {
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
  pdf: 'PDFs',
  document: 'Documents',
  spreadsheet: 'Sheets',
  slides: 'Slides',
  design: 'Design',
  code: 'Code',
  data: 'Data',
  archive: 'Archives',
  model: '3D',
  other: 'Files',
};

const state = {
  viewport: { x: 260, y: 160, scale: 1 },
  projects: [],
  query: '',
  selectedProjectId: null,
};

let interaction = null;
let saveTimer = null;
let dragDepth = 0;

function uid() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function positiveMod(value, modulus) {
  if (!modulus) return 0;
  return ((value % modulus) + modulus) % modulus;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function cleanTag(value) {
  return normalizeText(value)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 32);
}

function dedupe(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function hashString(value) {
  let hash = 2166136261;
  const input = String(value ?? '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function accentForSeed(seed) {
  return ACCENTS[hashString(seed) % ACCENTS.length];
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (match) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]
  ));
}

function escapeAttr(value = '') {
  return escapeHtml(value);
}

function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function relativeDate(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  const diff = Date.now() - date.getTime();
  const day = 86400000;

  if (diff < day) return 'Today';
  if (diff < day * 2) return 'Yesterday';
  if (diff < day * 30) return `${Math.round(diff / day)}d ago`;

  return date.toLocaleDateString();
}

function toFileUrl(filePath = '') {
  let value = String(filePath).replace(/\\/g, '/');
  if (!value.startsWith('/')) value = `/${value}`;
  return encodeURI(`file://${value}`);
}

function readableGroup(group) {
  return TYPE_LABELS[group] || 'Files';
}

function fileBadgeLabel(file) {
  const ext = (file.ext || '').toUpperCase();
  if (ext && ext.length <= 5) return ext;

  const labels = {
    image: 'IMG',
    video: 'VID',
    audio: 'AUD',
    pdf: 'PDF',
    document: 'DOC',
    spreadsheet: 'XLS',
    slides: 'PPT',
    design: 'DES',
    code: 'CODE',
    data: 'DATA',
    archive: 'ZIP',
    model: '3D',
    other: 'FILE',
  };

  return labels[file.typeGroup] || 'FILE';
}

function sortFiles(a, b) {
  const aIndex = TYPE_ORDER.indexOf(a.typeGroup);
  const bIndex = TYPE_ORDER.indexOf(b.typeGroup);

  const typeCompare = (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  if (typeCompare !== 0) return typeCompare;

  return a.name.localeCompare(b.name);
}

function normalizeFile(file = {}) {
  const ext = normalizeText(file.ext || (file.name?.split('.').pop() ?? '')).replace(/^\./, '');

  return {
    id: file.id || uid(),
    name: file.name || 'Untitled',
    path: file.path || '',
    ext,
    size: Number(file.size || 0),
    modifiedAt: file.modifiedAt || new Date().toISOString(),
    typeGroup: file.typeGroup || 'other',
    previewable: Boolean(file.previewable),
    tags: dedupe((file.tags || []).map(cleanTag)),
  };
}

function normalizeProject(project = {}) {
  const x = Number(project.x);
  const y = Number(project.y);

  const accent = project.accent && project.accentRgb
    ? { hex: project.accent, rgb: project.accentRgb }
    : accentForSeed(project.name || project.id || uid());

  const files = (project.files || []).map(normalizeFile).sort(sortFiles);

  return {
    id: project.id || uid(),
    name: project.name || 'Untitled Project',
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    expanded: Boolean(project.expanded),
    tags: dedupe((project.tags || []).map(cleanTag)),
    accent: accent.hex,
    accentRgb: accent.rgb,
    createdAt: project.createdAt || new Date().toISOString(),
    files,
  };
}

function serializeState() {
  return {
    version: 1,
    viewport: { ...state.viewport },
    projects: state.projects.map((project) => ({
      ...project,
      files: project.files.map((file) => ({ ...file })),
      tags: [...project.tags],
    })),
  };
}

function setSaveStatus(text) {
  saveStateEl.textContent = text;
}

function scheduleSave(immediate = false) {
  clearTimeout(saveTimer);
  setSaveStatus('Saving…');
  saveTimer = setTimeout(saveNow, immediate ? 60 : 550);
}

async function saveNow() {
  try {
    await window.electronAPI.saveState(serializeState());
    setSaveStatus(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  } catch (error) {
    console.error(error);
    setSaveStatus('Save failed');
  }
}

function getProject(projectId) {
  return state.projects.find((project) => project.id === projectId) || null;
}

function getFile(projectId, fileId) {
  const project = getProject(projectId);
  if (!project) return null;
  return project.files.find((file) => file.id === fileId) || null;
}

function parseQuery(query = '') {
  const raw = String(query).toLowerCase();
  const tags = [...raw.matchAll(/#([a-z0-9._-]+)/g)].map((match) => match[1]);
  const terms = raw.replace(/#[a-z0-9._-]+/g, ' ').split(/\s+/).filter(Boolean);
  return { tags, terms };
}

function projectMatches(project) {
  const { tags, terms } = parseQuery(state.query);
  if (!tags.length && !terms.length) return true;

  const tagSet = new Set([
    ...project.tags,
    ...project.files.flatMap((file) => file.tags || []),
  ].map(normalizeText));

  const text = [
    project.name,
    ...project.tags,
    ...project.files.flatMap((file) => [file.name, ...(file.tags || [])]),
  ].join(' ').toLowerCase();

  return tags.every((tag) => tagSet.has(tag) || text.includes(tag))
    && terms.every((term) => text.includes(term));
}

function getVisibleProjects() {
  return state.projects.filter(projectMatches);
}

function topGroups(project, limit = 2) {
  const counts = new Map();

  project.files.forEach((file) => {
    counts.set(file.typeGroup, (counts.get(file.typeGroup) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([group, count]) => `${readableGroup(group)} ${count}`)
    .join(' • ');
}

function renderPreviewGrid(project) {
  const previewFiles = project.files.filter((file) => file.previewable).slice(0, 4);

  if (previewFiles.length) {
    const items = previewFiles.map((file) => `
      <div class="preview-thumb">
        <img loading="lazy" src="${escapeAttr(toFileUrl(file.path))}" alt="${escapeAttr(file.name)}" />
      </div>
    `).join('');

    const filler = Array.from({ length: Math.max(0, 4 - previewFiles.length) }, () => `
      <div class="preview-thumb placeholder"></div>
    `).join('');

    return `<div class="preview-grid">${items}${filler}</div>`;
  }

  const groups = [...new Set(project.files.map((file) => readableGroup(file.typeGroup)))].slice(0, 3);

  if (!groups.length) {
    return `<div class="preview-grid empty"><div class="preview-type-pill">No files yet</div></div>`;
  }

  return `
    <div class="preview-grid empty">
      ${groups.map((group) => `<div class="preview-type-pill">${escapeHtml(group)}</div>`).join('')}
    </div>
  `;
}

function renderFileRow(projectId, file) {
  const meta = [
    file.ext ? file.ext.toUpperCase() : 'FILE',
    formatBytes(file.size),
    relativeDate(file.modifiedAt),
  ].join(' • ');

  return `
    <div class="file-row" data-action="open-file" data-project-id="${projectId}" data-file-id="${file.id}" title="${escapeAttr(file.path)}">
      <div class="file-badge">${escapeHtml(fileBadgeLabel(file))}</div>
      <div class="file-copy">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-sub">${escapeHtml(meta)}</div>
      </div>
      <button class="tiny-btn" data-action="show-file" data-project-id="${projectId}" data-file-id="${file.id}" title="Reveal in folder">↗</button>
    </div>
  `;
}

function renderProject(project) {
  const shownTags = project.tags.slice(0, project.expanded ? 18 : 8);
  const moreTags = !project.expanded && project.tags.length > 8 ? project.tags.length - 8 : 0;
  const summary = topGroups(project);

  return `
    <article
      class="project-card ${project.expanded ? 'expanded' : ''} ${state.selectedProjectId === project.id ? 'selected' : ''}"
      data-id="${project.id}"
      style="left:${project.x}px; top:${project.y}px; --accent:${project.accent}; --accent-rgb:${project.accentRgb};"
    >
      <div class="project-accent"></div>

      <div class="project-header" data-drag-handle>
        <div class="project-emblem">${escapeHtml((project.name || 'P').trim().slice(0, 1).toUpperCase())}</div>

        <div class="project-heading">
          <input
            class="project-title-input"
            data-role="project-title"
            spellcheck="false"
            autocomplete="off"
            value="${escapeAttr(project.name)}"
          />
          <div class="project-meta">
            ${project.files.length} file${project.files.length === 1 ? '' : 's'}${summary ? ` • ${escapeHtml(summary)}` : ''}
          </div>
        </div>

        <div class="project-controls">
          <button class="icon-btn" data-action="toggle-expand" title="${project.expanded ? 'Collapse project' : 'Expand project'}">${project.expanded ? '–' : '+'}</button>
        </div>
      </div>

      <div class="project-tags">
        ${shownTags.map((tag) => `
          <button
            class="tag-chip"
            data-action="tag-filter"
            data-tag="${escapeAttr(tag)}"
            title="Click to filter • Shift+click to remove from this project"
          >#${escapeHtml(tag)}</button>
        `).join('')}
        ${moreTags ? `<span class="tag-fade">+${moreTags}</span>` : ''}
      </div>

      ${renderPreviewGrid(project)}

      ${project.expanded ? `
        <div class="project-body">
          <div class="tag-editor">
            <input class="tag-input" data-role="tag-input" autocomplete="off" placeholder="Add a tag and press Enter" />
          </div>
          <div class="file-list">
            ${project.files.length
              ? project.files.map((file) => renderFileRow(project.id, file)).join('')
              : '<div class="no-files">Drop files on this card to add them here.</div>'
            }
          </div>
        </div>
      ` : ''}
    </article>
  `;
}

function updateStats() {
  const totalFiles = state.projects.reduce((sum, project) => sum + project.files.length, 0);
  projectCountEl.textContent = `${state.projects.length} project${state.projects.length === 1 ? '' : 's'}`;
  fileCountEl.textContent = `${totalFiles} file${totalFiles === 1 ? '' : 's'}`;
  zoomReadoutEl.textContent = `${Math.round(state.viewport.scale * 100)}%`;
}

function renderTagStrip() {
  const counts = new Map();

  state.projects.forEach((project) => {
    project.tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });

  const tags = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 16);

  if (!tags.length) {
    tagStrip.innerHTML = `<div class="tag-strip-empty">Drop files to generate smart tags and quick filters.</div>`;
    return;
  }

  tagStrip.innerHTML = tags.map(([tag, count]) => `
    <button class="global-tag" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)} <span>${count}</span></button>
  `).join('');
}

function renderEmptyState(visibleProjects) {
  if (!state.projects.length) {
    emptyState.hidden = false;
    emptyState.innerHTML = `
      <div class="empty-card">
        <div class="empty-kicker">Spatial file organization</div>
        <h2>Build a beautiful workspace from folders, references, and media.</h2>
        <p>Drop files or whole folders on the canvas. Atlas will auto-tag them, cluster them into projects, and keep your original files exactly where they are.</p>
      </div>
    `;
    return;
  }

  if (!visibleProjects.length) {
    emptyState.hidden = false;
    emptyState.innerHTML = `
      <div class="empty-card">
        <div class="empty-kicker">No matches</div>
        <h2>Nothing matches your current search.</h2>
        <p>Try a broader term, remove a #tag, or press Escape to clear the filter.</p>
      </div>
    `;
    return;
  }

  emptyState.hidden = true;
  emptyState.innerHTML = '';
}

function render() {
  if (state.selectedProjectId && !state.projects.some((project) => project.id === state.selectedProjectId)) {
    state.selectedProjectId = null;
  }

  const visibleProjects = getVisibleProjects();
  world.innerHTML = visibleProjects.map(renderProject).join('');
  updateStats();
  renderTagStrip();
  renderEmptyState(visibleProjects);
  applyTransform();
}

function updateSelectionHighlight() {
  world.querySelectorAll('.project-card.selected').forEach((card) => card.classList.remove('selected'));
  if (!state.selectedProjectId) return;

  const card = world.querySelector(`.project-card[data-id="${state.selectedProjectId}"]`);
  if (card) card.classList.add('selected');
}

function applyTransform() {
  world.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;

  const minor = Math.max(24, 48 * state.viewport.scale);
  const major = minor * 5;

  grid.style.setProperty('--minor', `${minor}px`);
  grid.style.setProperty('--major', `${major}px`);
  grid.style.setProperty('--off-x', `${positiveMod(state.viewport.x, minor)}px`);
  grid.style.setProperty('--off-y', `${positiveMod(state.viewport.y, minor)}px`);
  grid.style.setProperty('--major-off-x', `${positiveMod(state.viewport.x, major)}px`);
  grid.style.setProperty('--major-off-y', `${positiveMod(state.viewport.y, major)}px`);

  zoomReadoutEl.textContent = `${Math.round(state.viewport.scale * 100)}%`;
}

function screenToWorld(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.viewport.x) / state.viewport.scale,
    y: (clientY - rect.top - state.viewport.y) / state.viewport.scale,
  };
}

function getStageCenter() {
  const rect = stage.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function zoomAt(clientX, clientY, multiplier) {
  const rect = stage.getBoundingClientRect();
  const before = screenToWorld(clientX, clientY);
  const nextScale = clamp(state.viewport.scale * multiplier, 0.25, 2.4);

  state.viewport.x = clientX - rect.left - before.x * nextScale;
  state.viewport.y = clientY - rect.top - before.y * nextScale;
  state.viewport.scale = nextScale;

  applyTransform();
  scheduleSave();
}

function resetView(shouldSave = true) {
  state.viewport = {
    x: Math.round(stage.clientWidth * 0.25),
    y: Math.round(stage.clientHeight * 0.18),
    scale: 1,
  };

  applyTransform();
  if (shouldSave) scheduleSave();
}

function estimateCardHeight(project) {
  return project.expanded ? 520 : 260;
}

function fitProjects(projects = getVisibleProjects()) {
  if (!projects.length) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  projects.forEach((project) => {
    minX = Math.min(minX, project.x);
    minY = Math.min(minY, project.y);
    maxX = Math.max(maxX, project.x + 360);
    maxY = Math.max(maxY, project.y + estimateCardHeight(project));
  });

  const pad = 220;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  state.viewport.scale = clamp(
    Math.min(
      (stage.clientWidth - pad) / width,
      (stage.clientHeight - pad) / height,
      1.3
    ),
    0.25,
    1.3
  );

  state.viewport.x = stage.clientWidth / 2 - (minX + width / 2) * state.viewport.scale;
  state.viewport.y = stage.clientHeight / 2 - (minY + height / 2) * state.viewport.scale;

  applyTransform();
  scheduleSave();
}

function normalizedProjectName(name) {
  return normalizeText(name).replace(/\s+/g, ' ');
}

function mergeGroupIntoProject(group, target) {
  const knownPaths = new Set(target.files.map((file) => file.path));
  let added = 0;

  (group.files || []).forEach((rawFile) => {
    const file = normalizeFile(rawFile);
    if (!file.path || knownPaths.has(file.path)) return;

    target.files.push(file);
    knownPaths.add(file.path);
    added += 1;
  });

  target.tags = dedupe([
    ...target.tags,
    ...((group.tags || []).map(cleanTag)),
  ]).slice(0, 24);

  target.files.sort(sortFiles);
  return added;
}

function createProjectFromImport(group, x, y) {
  const accent = accentForSeed(group.name || uid());

  return normalizeProject({
    id: uid(),
    name: group.name || 'Untitled Project',
    x,
    y,
    expanded: true,
    accent: accent.hex,
    accentRgb: accent.rgb,
    tags: dedupe((group.tags || []).map(cleanTag)).slice(0, 18),
    files: group.files || [],
  });
}

function spiralPoint(origin, index) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const radius = index === 0 ? 0 : 240 * Math.sqrt(index);
  const angle = index * goldenAngle;

  return {
    x: origin.x + Math.cos(angle) * radius,
    y: origin.y + Math.sin(angle) * radius,
  };
}

function mergeImportedGroups(importedGroups, origin, forcedProjectId = null) {
  let addedFiles = 0;
  let createdProjects = 0;
  let lastTouched = null;

  if (forcedProjectId) {
    const target = getProject(forcedProjectId);
    if (!target) return { addedFiles: 0, createdProjects: 0 };

    importedGroups.forEach((group) => {
      addedFiles += mergeGroupIntoProject(group, target);
    });

    target.expanded = true;
    lastTouched = target.id;
  } else {
    const newGroups = [];

    importedGroups.forEach((group) => {
      const existing = state.projects.find(
        (project) => normalizedProjectName(project.name) === normalizedProjectName(group.name),
      );

      if (existing) {
        addedFiles += mergeGroupIntoProject(group, existing);
        existing.expanded = true;
        lastTouched = existing.id;
      } else {
        newGroups.push(group);
      }
    });

    newGroups.forEach((group, index) => {
      const point = spiralPoint(origin, index);
      const project = createProjectFromImport(group, point.x, point.y);
      state.projects.push(project);
      addedFiles += project.files.length;
      createdProjects += 1;
      lastTouched = project.id;
    });
  }

  if (lastTouched) state.selectedProjectId = lastTouched;

  return { addedFiles, createdProjects };
}

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function showDropOverlay() {
  dropOverlay.classList.remove('hidden');
}

function hideDropOverlay() {
  dropOverlay.classList.add('hidden');
}

async function openFile(projectId, fileId) {
  const file = getFile(projectId, fileId);
  if (!file) return;
  await window.electronAPI.openPath(file.path);
}

async function revealFile(projectId, fileId) {
  const file = getFile(projectId, fileId);
  if (!file) return;
  await window.electronAPI.showItemInFolder(file.path);
}

async function handleDrop(event) {
  if (!isFileDrag(event)) return;

  event.preventDefault();
  dragDepth = 0;
  hideDropOverlay();

  const paths = dedupe(Array.from(event.dataTransfer.files || []).map((file) => file.path).filter(Boolean));
  if (!paths.length) return;

  setSaveStatus('Importing…');

  try {
    const importedGroups = await window.electronAPI.importPaths(paths);
    if (!importedGroups?.length) {
      setSaveStatus('Nothing imported');
      return;
    }

    const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest('.project-card');
    const forcedProjectId = dropTarget?.dataset.id || null;
    const dropPoint = screenToWorld(event.clientX, event.clientY);

    const result = mergeImportedGroups(importedGroups, dropPoint, forcedProjectId);
    render();

    if (result.addedFiles === 0) {
      setSaveStatus('No new files added');
      return;
    }

    scheduleSave(true);
  } catch (error) {
    console.error(error);
    setSaveStatus('Import failed');
  }
}

function selectProjectCard(card) {
  state.selectedProjectId = card?.dataset.id || null;
  updateSelectionHighlight();
}

stage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;

  const card = event.target.closest('.project-card');
  if (card) {
    selectProjectCard(card);
    return;
  }

  state.selectedProjectId = null;
  updateSelectionHighlight();

  interaction = {
    kind: 'pan',
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: state.viewport.x,
    startY: state.viewport.y,
  };

  document.body.classList.add('is-panning');
});

world.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;

  const card = event.target.closest('.project-card');
  const handle = event.target.closest('[data-drag-handle]');
  const interactive = event.target.closest('button') || event.target.matches('input');

  if (!card || !handle || interactive) return;

  const project = getProject(card.dataset.id);
  if (!project) return;

  state.selectedProjectId = project.id;
  updateSelectionHighlight();

  interaction = {
    kind: 'move-project',
    card,
    project,
    startPointer: screenToWorld(event.clientX, event.clientY),
    originX: project.x,
    originY: project.y,
  };

  event.preventDefault();
  event.stopPropagation();
});

window.addEventListener('pointermove', (event) => {
  if (!interaction) return;

  if (interaction.kind === 'pan') {
    state.viewport.x = interaction.startX + (event.clientX - interaction.startClientX);
    state.viewport.y = interaction.startY + (event.clientY - interaction.startClientY);
    applyTransform();
    return;
  }

  if (interaction.kind === 'move-project') {
    const point = screenToWorld(event.clientX, event.clientY);
    interaction.project.x = interaction.originX + (point.x - interaction.startPointer.x);
    interaction.project.y = interaction.originY + (point.y - interaction.startPointer.y);
    interaction.card.style.left = `${interaction.project.x}px`;
    interaction.card.style.top = `${interaction.project.y}px`;
  }
});

window.addEventListener('pointerup', () => {
  if (!interaction) return;
  interaction = null;
  document.body.classList.remove('is-panning');
  scheduleSave();
});

window.addEventListener('blur', () => {
  interaction = null;
  document.body.classList.remove('is-panning');
});

stage.addEventListener('wheel', (event) => {
  if (event.target.closest('.file-list') && !event.ctrlKey) return;

  event.preventDefault();
  const multiplier = Math.exp(-event.deltaY * 0.0015);
  zoomAt(event.clientX, event.clientY, multiplier);
}, { passive: false });

world.addEventListener('click', async (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;

  const card = event.target.closest('.project-card');
  const projectId = card?.dataset.id || actionEl.dataset.projectId;
  const project = projectId ? getProject(projectId) : null;

  switch (actionEl.dataset.action) {
    case 'toggle-expand': {
      if (!project) return;
      project.expanded = !project.expanded;
      render();
      scheduleSave();
      break;
    }

    case 'tag-filter': {
      const tag = cleanTag(actionEl.dataset.tag);
      if (!tag) return;

      if (event.shiftKey && project) {
        project.tags = project.tags.filter((entry) => entry !== tag);
        render();
        scheduleSave();
        return;
      }

      searchInput.value = `#${tag}`;
      state.query = searchInput.value;
      render();
      break;
    }

    case 'open-file': {
      await openFile(actionEl.dataset.projectId, actionEl.dataset.fileId);
      break;
    }

    case 'show-file': {
      event.stopPropagation();
      await revealFile(actionEl.dataset.projectId, actionEl.dataset.fileId);
      break;
    }

    default:
      break;
  }
});

world.addEventListener('keydown', (event) => {
  if (event.target.matches('.project-title-input') && event.key === 'Enter') {
    event.preventDefault();
    event.target.blur();
    return;
  }

  if (event.target.matches('.tag-input') && event.key === 'Enter') {
    event.preventDefault();

    const project = getProject(event.target.closest('.project-card')?.dataset.id);
    if (!project) return;

    const tag = cleanTag(event.target.value);
    if (!tag) return;

    project.tags = dedupe([...project.tags, tag]);
    event.target.value = '';
    render();
    scheduleSave();
  }
});

world.addEventListener('blur', (event) => {
  if (!event.target.matches('.project-title-input')) return;

  const project = getProject(event.target.closest('.project-card')?.dataset.id);
  if (!project) return;

  const nextName = event.target.value.trim() || 'Untitled Project';
  if (project.name !== nextName) {
    project.name = nextName;
    render();
    scheduleSave();
  }
}, true);

searchInput.addEventListener('input', () => {
  state.query = searchInput.value.trim();
  render();
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    searchInput.value = '';
    state.query = '';
    render();
    searchInput.blur();
  }

  if (event.key === 'Enter') {
    fitProjects();
  }
});

tagStrip.addEventListener('click', (event) => {
  const button = event.target.closest('.global-tag');
  if (!button) return;

  const tag = cleanTag(button.dataset.tag);
  searchInput.value = `#${tag}`;
  state.query = searchInput.value;
  render();
});

resetViewBtn.addEventListener('click', () => resetView(true));
fitBtn.addEventListener('click', () => fitProjects());

window.addEventListener('dragenter', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  showDropOverlay();
});

window.addEventListener('dragover', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  showDropOverlay();
});

window.addEventListener('dragleave', (event) => {
  if (!isFileDrag(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) hideDropOverlay();
});

window.addEventListener('drop', (event) => {
  if (!isFileDrag(event)) return;
  dragDepth = 0;
  hideDropOverlay();
});

stage.addEventListener('dragover', (event) => {
  if (isFileDrag(event)) event.preventDefault();
});

stage.addEventListener('drop', handleDrop);

window.addEventListener('resize', () => applyTransform());

window.addEventListener('keydown', (event) => {
  const active = document.activeElement;
  const typingInInput = active && active.tagName === 'INPUT' && active !== searchInput;

  if (typingInInput) {
    if (event.key === 'Escape') active.blur();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === '0') {
    event.preventDefault();
    resetView(true);
  }

  if ((event.metaKey || event.ctrlKey) && (event.key === '=' || event.key === '+')) {
    event.preventDefault();
    const center = getStageCenter();
    zoomAt(center.x, center.y, 1.15);
  }

  if ((event.metaKey || event.ctrlKey) && event.key === '-') {
    event.preventDefault();
    const center = getStageCenter();
    zoomAt(center.x, center.y, 0.87);
  }

  if (event.key === 'Escape' && document.activeElement !== searchInput) {
    state.selectedProjectId = null;
    updateSelectionHighlight();
  }
});

async function init() {
  try {
    const saved = await window.electronAPI.loadState();

    state.viewport = {
      ...state.viewport,
      ...(saved.viewport || {}),
    };

    state.projects = (saved.projects || []).map(normalizeProject);

    if (!state.projects.length) {
      resetView(false);
    }

    render();
  } catch (error) {
    console.error(error);
    render();
  }
}

init();
