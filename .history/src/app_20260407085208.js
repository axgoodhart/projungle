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
const projectViewer = document.getElementById('projectViewer');
const hunterPanel = document.getElementById('hunterPanel');
const sortActivityBtn = document.getElementById('sortActivityBtn');
const dimToggle = document.getElementById('dimToggle');
                        const triangle = document.getElementById('cursor-triangle');




            // Update cursor position
          function  updateCursorPosition(x, y) {
                this.cursor.x = x;
                this.cursor.y = y;
                if (triangle) {
                  triangle.style.display = 'block';
                    triangle.style.left = x + 'px';
                    triangle.style.top = y + 'px';
                }
          }

         function   toggleMouseLook() {
                this.mouseLook.userEnabled = !this.mouseLook.userEnabled;
                this.updateMouseLook();
                showToast(this.mouseLook.userEnabled ? 'MOUSE LOOK ENABLED' : 'MOUSE LOOK DISABLED [Tab to re-enable]', 'info');
            }
          window.addEventListener('mousemove', (e) => this.onMouseLook(e));


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
  viewerProjectId: null,
  hunterProjectId: null,
  hunterResults: [],
  hunterLoading: false,
  hunterDirs: [],
  sortByActivity: false,
  viewerActiveModal: null,
  viewerTagFilter: new Set(),
  viewerDrag: null,
};

let interaction = null;
let saveTimer = null;
let dragDepth = 0;
let filehawkTimer = null;

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

const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'webm']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'aiff', 'aac', 'ogg', 'm4a', 'flac']);

function isVideoFile(file) {
  return VIDEO_EXTS.has((file.ext || '').toLowerCase());
}

function isAudioFile(file) {
  return AUDIO_EXTS.has((file.ext || '').toLowerCase());
}

function renderPreviewMedia(file, className, extraAttrs = '') {
  const src = escapeAttr(toFileUrl(file.path));
  if (isVideoFile(file)) {
    return `<video class="${className}" src="${src}" muted playsinline preload="metadata" ${extraAttrs}></video>`;
  }
  if (isAudioFile(file)) {
    return `<div class="${className} audio-preview" ${extraAttrs}>
      <div class="audio-preview-icon">♫</div>
      <div class="audio-preview-name">${escapeHtml(file.name)}</div>
      <audio src="${src}" preload="metadata"></audio>
    </div>`;
  }
  return `<img class="${className}" src="${src}" alt="${escapeAttr(file.name)}" loading="lazy" ${extraAttrs} />`;
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

  const milestones = (project.milestones || []).map((m) => ({
    id: m.id || uid(),
    label: m.label || 'Milestone',
    date: m.date || new Date().toISOString().slice(0, 10),
    completed: Boolean(m.completed),
    description: m.description || '',
    estimatedDays: Number(m.estimatedDays) || 0,
    fileIds: Array.isArray(m.fileIds) ? m.fileIds : [],
    subtasks: (m.subtasks || []).map((s) => ({
      id: s.id || uid(),
      text: s.text || '',
      done: Boolean(s.done),
    })),
  }));

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
    milestones,
    consolidated: Boolean(project.consolidated),
    coverFileId: project.coverFileId || null,
    coverPosition: project.coverPosition || '50% 50%',
  };
}

function serializeState() {
  return {
    version: 1,
    viewport: { ...state.viewport },
    hunterDirs: [...state.hunterDirs],
    projects: state.projects.map((project) => ({
      ...project,
      files: project.files.map((file) => ({ ...file })),
      tags: [...project.tags],
      milestones: (project.milestones || []).map((m) => ({
        ...m,
        fileIds: [...(m.fileIds || [])],
        subtasks: (m.subtasks || []).map((s) => ({ ...s })),
      })),
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
  const filtered = state.projects.filter(projectMatches);
  if (state.sortByActivity) {
    filtered.sort((a, b) => {
      const aNewest = a.files.length ? Math.max(...a.files.map((f) => new Date(f.modifiedAt).getTime())) : 0;
      const bNewest = b.files.length ? Math.max(...b.files.map((f) => new Date(f.modifiedAt).getTime())) : 0;
      return bNewest - aNewest;
    });
  }
  return filtered;
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
    const count = previewFiles.length;
    const layoutClass = count === 1 ? 'preview-grid--solo' : count === 2 ? 'preview-grid--duo' : '';

    const items = previewFiles.map((file) => `
      <div class="preview-thumb">
        ${renderPreviewMedia(file, 'preview-thumb-media')}
      </div>
    `).join('');

    return `<div class="preview-grid ${layoutClass}">${items}</div>`;
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

function renderFileRow(projectId, file, isCover = false) {
  const meta = [
    file.ext ? file.ext.toUpperCase() : 'FILE',
    formatBytes(file.size),
    relativeDate(file.modifiedAt),
  ].join(' • ');

  return `
    <div class="file-row ${isCover ? 'is-cover' : ''}" data-action="open-file" data-project-id="${projectId}" data-file-id="${file.id}" title="${escapeAttr(file.path)}">
      <div class="file-badge">${escapeHtml(fileBadgeLabel(file))}</div>
      <div class="file-copy">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-sub">${escapeHtml(meta)}</div>
      </div>
      ${file.previewable && !isAudioFile(file) ? `<button class="tiny-btn cover-btn ${isCover ? 'active' : ''}" data-action="set-cover" data-project-id="${projectId}" data-file-id="${file.id}" title="${isCover ? 'Current cover' : 'Set as cover'}">⊞</button>` : ''}
      <button class="tiny-btn" data-action="show-file" data-project-id="${projectId}" data-file-id="${file.id}" title="Reveal in folder">↗</button>
    </div>
  `;
}

function renderProject(project) {
  const shownTags = project.tags.slice(0, project.expanded ? 18 : 8);
  const moreTags = !project.expanded && project.tags.length > 8 ? project.tags.length - 8 : 0;
  const summary = topGroups(project);
  const coverFile = project.coverFileId ? project.files.find((f) => f.id === project.coverFileId) : null;
  const hasCover = coverFile && coverFile.previewable;

  return `
    <article
      class="project-card ${project.expanded ? 'expanded' : ''} ${state.selectedProjectId === project.id ? 'selected' : ''} ${hasCover ? 'has-cover' : ''}"
      data-id="${project.id}"
      style="left:${project.x}px; top:${project.y}px; --accent:${project.accent}; --accent-rgb:${project.accentRgb};"
    >
      <div class="project-accent"></div>

      ${hasCover ? `
        <div class="project-cover" data-role="cover-drag-area">
          ${renderPreviewMedia(coverFile, 'project-cover-img', `style="object-position:${project.coverPosition}"`)}
          <div class="project-cover-fade"></div>
        </div>
      ` : ''}

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
          <button class="icon-btn" data-action="open-viewer" title="Open Project Viewer">⊞</button>
          <button class="icon-btn" data-action="toggle-expand" title="${project.expanded ? 'Collapse project' : 'Expand project'}">${project.expanded ? '–' : '+'}</button>
        </div>
      </div>

      ${hasCover ? '' : `
        <div class="project-tags">
          ${shownTags.map((tag) => `
            <span class="tag-chip-wrap">
              <button
                class="tag-chip"
                data-action="tag-filter"
                data-tag="${escapeAttr(tag)}"
                title="Click to filter • Double-click to edit"
              >#${escapeHtml(tag)}</button>${project.expanded ? `<button
                class="tag-x"
                data-action="delete-tag"
                data-tag="${escapeAttr(tag)}"
                title="Remove tag"
              >×</button>` : ''}
            </span>
          `).join('')}
          ${moreTags ? `<span class="tag-fade">+${moreTags}</span>` : ''}
        </div>
      `}

      ${hasCover ? '' : renderPreviewGrid(project)}

      ${project.expanded ? `
        <div class="project-body">
          ${hasCover ? `
            <div class="project-tags">
              ${shownTags.map((tag) => `
                <span class="tag-chip-wrap">
                  <button class="tag-chip" data-action="tag-filter" data-tag="${escapeAttr(tag)}" title="Click to filter • Double-click to edit">#${escapeHtml(tag)}</button>
                  <button class="tag-x" data-action="delete-tag" data-tag="${escapeAttr(tag)}" title="Remove tag">×</button>
                </span>
              `).join('')}
            </div>
          ` : ''}

          <div class="tag-editor">
            <input class="tag-input" data-role="tag-input" autocomplete="off" placeholder="Add a tag and press Enter" />
          </div>

          <div class="project-actions">
            <button class="action-btn" data-action="open-viewer" title="Full-screen project view with timeline">⊞ Viewer</button>
            <button class="action-btn" data-action="hunter-search" title="Search filesystem for related files">⌕ Hunter</button>
            <button class="action-btn" data-action="consolidate" title="Copy files to ~/Documents/projungle/projects/${escapeAttr(project.name)}">⤓ Consolidate</button>
            ${hasCover ? '<button class="action-btn" data-action="remove-cover" title="Remove cover image">✕ Cover</button>' : ''}
          </div>

          ${renderActivityBadge(project)}

          <div class="file-list">
            ${project.files.length
              ? project.files.map((file) => renderFileRow(project.id, file, hasCover && file.id === project.coverFileId)).join('')
              : '<div class="no-files">Drop files on this card to add them here.</div>'
            }
          </div>
        </div>
      ` : ''}
    </article>
  `;
}

/* ── FileHawk: activity badge ───────────────────────────────────────── */

function projectActivityLevel(project) {
  if (!project.files.length) return 'idle';
  const now = Date.now();
  const newest = Math.max(...project.files.map((f) => new Date(f.modifiedAt).getTime()));
  const hoursAgo = (now - newest) / 3600000;
  if (hoursAgo < 24) return 'active';
  if (hoursAgo < 24 * 7) return 'recent';
  if (hoursAgo < 24 * 30) return 'moderate';
  return 'stale';
}

function activityLabel(level) {
  return { active: 'Active today', recent: 'This week', moderate: 'This month', stale: 'Inactive', idle: 'No files' }[level] || '';
}

function renderActivityBadge(project) {
  const level = projectActivityLevel(project);
  return `<div class="activity-badge activity-${level}" title="FileHawk: ${activityLabel(level)}">
    <span class="activity-dot"></span> ${activityLabel(level)}
  </div>`;
}

/* ── Project progress from milestones ──────────────────────────────── */

function projectProgress(project) {
  const ms = project.milestones || [];
  if (!ms.length) return -1;
  const done = ms.filter((m) => m.completed).length;
  return Math.round((done / ms.length) * 100);
}

/* ── Project Viewer ────────────────────────────────────────────────── */

function formatMilestoneDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderMilestoneModal(milestone, project) {
  const subtasks = milestone.subtasks || [];
  const fileIds = new Set(milestone.fileIds || []);

  return `
    <div class="tl-modal" data-modal-id="${milestone.id}">
      <div class="tl-modal-arrow"></div>
      <div class="tl-modal-inner">
        <div class="tl-modal-header">
          <input class="tl-modal-title" value="${escapeAttr(milestone.label)}"
                 data-role="modal-milestone-label" data-milestone-id="${milestone.id}"
                 placeholder="Milestone name" spellcheck="false" autocomplete="off" />
          <div class="tl-modal-actions">
            <button class="tl-modal-toggle ${milestone.completed ? 'completed' : ''}"
                    data-action="toggle-milestone" data-milestone-id="${milestone.id}"
                    title="${milestone.completed ? 'Mark incomplete' : 'Mark complete'}">
              ${milestone.completed ? '✓ Done' : '○ Todo'}
            </button>
            <button class="tl-modal-delete" data-action="delete-milestone" data-milestone-id="${milestone.id}" title="Delete milestone">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>

        <div class="tl-modal-row">
          <label class="tl-modal-label">Due</label>
          <input type="date" class="tl-modal-date" value="${milestone.date}"
                 data-role="modal-milestone-date" data-milestone-id="${milestone.id}" />
        </div>

        <div class="tl-modal-row">
          <label class="tl-modal-label">Estimate</label>
          <div class="tl-modal-estimate">
            <input type="number" class="tl-modal-days" value="${milestone.estimatedDays || ''}"
                   data-role="modal-milestone-days" data-milestone-id="${milestone.id}"
                   placeholder="—" min="0" step="0.5" />
            <span class="tl-modal-days-unit">days</span>
          </div>
        </div>

        <div class="tl-modal-divider"></div>

        <div class="tl-modal-row tl-modal-row--col">
          <label class="tl-modal-label">Description</label>
          <textarea class="tl-modal-desc" rows="2" placeholder="What needs to happen…"
                    data-role="modal-milestone-desc" data-milestone-id="${milestone.id}"
          >${escapeHtml(milestone.description || '')}</textarea>
        </div>

        <div class="tl-modal-divider"></div>

        <div class="tl-modal-row tl-modal-row--col">
          <label class="tl-modal-label">Subtasks ${subtasks.length ? `<span class="tl-modal-count">${subtasks.filter((s) => s.done).length}/${subtasks.length}</span>` : ''}</label>
          <div class="tl-subtask-list">
            ${subtasks.map((s) => `
              <label class="tl-subtask ${s.done ? 'done' : ''}">
                <input type="checkbox" ${s.done ? 'checked' : ''}
                       data-action="toggle-subtask" data-milestone-id="${milestone.id}" data-subtask-id="${s.id}" />
                <span class="tl-subtask-text">${escapeHtml(s.text)}</span>
                <button class="tl-subtask-delete" data-action="delete-subtask" data-milestone-id="${milestone.id}" data-subtask-id="${s.id}">×</button>
              </label>
            `).join('')}
          </div>
          <div class="tl-subtask-add">
            <input class="tl-subtask-input" placeholder="Add subtask…"
                   data-role="subtask-input" data-milestone-id="${milestone.id}" autocomplete="off" />
          </div>
        </div>

        <div class="tl-modal-divider"></div>

        <div class="tl-modal-row tl-modal-row--col">
          <label class="tl-modal-label">Linked Files <span class="tl-modal-count">${fileIds.size}</span></label>
          <div class="tl-file-picker">
            ${project.files.map((f) => `
              <label class="tl-file-option ${fileIds.has(f.id) ? 'linked' : ''}">
                <input type="checkbox" ${fileIds.has(f.id) ? 'checked' : ''}
                       data-action="toggle-file-link" data-milestone-id="${milestone.id}" data-file-id="${f.id}" />
                <span class="tl-file-badge">${escapeHtml(fileBadgeLabel(f))}</span>
                <span class="tl-file-name">${escapeHtml(f.name)}</span>
              </label>
            `).join('')}
            ${!project.files.length ? '<div class="tl-file-picker-empty">No files in project</div>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMilestoneTimeline(project) {
  const milestones = project.milestones || [];
  const activeModalId = state.viewerActiveModal;
  const progress = projectProgress(project);

  if (!milestones.length) {
    return `
      <div class="tl-empty">
        <div class="tl-empty-track">
          <div class="tl-empty-line"></div>
          <button class="tl-add-node" data-action="add-milestone-inline" title="Add your first milestone">
            <span class="tl-add-icon">+</span>
          </button>
          <div class="tl-empty-line"></div>
        </div>
        <p class="tl-empty-hint">Click + to add your first milestone</p>
      </div>
    `;
  }

  const sorted = [...milestones].sort((a, b) => a.date.localeCompare(b.date));

  return `
    <div class="tl-container">
      <div class="tl-progress-row">
        <div class="tl-progress-bar">
          <div class="tl-progress-fill" style="width:${Math.max(progress, 0)}%"></div>
        </div>
        <span class="tl-progress-label">${progress >= 0 ? `${progress}%` : '—'}</span>
      </div>
      <div class="tl-scroll">
        <div class="tl-track" data-draggable-track>
          <div class="tl-line">
            <div class="tl-line-fill" style="width:${Math.max(progress, 0)}%"></div>
          </div>

          ${sorted.map((m, i) => {
            const pct = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100;
            const subtasks = m.subtasks || [];
            const fileCount = (m.fileIds || []).length;
            const isOpen = activeModalId === m.id;
            const estLabel = m.estimatedDays ? `${m.estimatedDays}d` : '';

            return `
              <div class="tl-node ${m.completed ? 'completed' : ''} ${isOpen ? 'active' : ''}"
                   style="left:${pct}%"
                   data-milestone-id="${m.id}"
                   data-draggable-node>
                <button class="tl-dot" data-action="open-milestone-modal" data-milestone-id="${m.id}" title="Click to expand · Drag to reorder">
                  ${m.completed
                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
                    : `<span class="tl-dot-index">${i + 1}</span>`}
                </button>
                <div class="tl-node-info">
                  <span class="tl-node-label">${escapeHtml(m.label)}</span>
                  <span class="tl-node-date">${formatMilestoneDate(m.date)}</span>
                  <div class="tl-node-chips">
                    ${fileCount ? `<span class="tl-node-chip">${fileCount} file${fileCount > 1 ? 's' : ''}</span>` : ''}
                    ${estLabel ? `<span class="tl-node-chip">${estLabel}</span>` : ''}
                    ${subtasks.length ? `<span class="tl-node-chip">${subtasks.filter((s) => s.done).length}/${subtasks.length}</span>` : ''}
                  </div>
                </div>

                ${isOpen ? renderMilestoneModal(m, project) : ''}
              </div>
            `;
          }).join('')}

          <button class="tl-add-end" data-action="add-milestone-inline" title="Add milestone"
                  style="left:calc(${sorted.length === 1 ? 75 : 100}% + 40px)">
            <span class="tl-add-icon">+</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderViewer(project) {
  if (!project) return '';

  const progress = projectProgress(project);
  const level = projectActivityLevel(project);
  const activeFilters = state.viewerTagFilter;

  /* filtered file set */
  const filteredFiles = activeFilters.size === 0
    ? project.files
    : project.files.filter((f) => (f.tags || []).some((t) => activeFilters.has(t)));

  const filteredByType = new Map();
  filteredFiles.forEach((f) => {
    if (!filteredByType.has(f.typeGroup)) filteredByType.set(f.typeGroup, []);
    filteredByType.get(f.typeGroup).push(f);
  });

  /* hero images (visual media only) */
  const heroImages = project.files.filter((f) => f.previewable && !isAudioFile(f)).slice(0, 5);

  /* total estimates */
  const totalDays = (project.milestones || []).reduce((sum, m) => sum + (m.estimatedDays || 0), 0);

  return `
    <div class="viewer-backdrop" data-action="close-viewer"></div>
    <div class="viewer-content" style="--accent:${project.accent}; --accent-rgb:${project.accentRgb};">

      <div class="viewer-hero ${heroImages.length ? '' : 'viewer-hero--empty'}">
        ${heroImages.length
          ? heroImages.map((f) => renderPreviewMedia(f, 'viewer-hero-img')).join('')
          : '<div class="viewer-hero-pattern"></div>'}
      </div>

      <div class="viewer-body">
        <div class="viewer-header">
          <div class="viewer-emblem">${escapeHtml((project.name || 'P').trim().slice(0, 2).toUpperCase())}</div>
          <div class="viewer-title-area">
            <h2 class="viewer-title">${escapeHtml(project.name)}</h2>
            <div class="viewer-meta">
              <span class="viewer-meta-pill">${project.files.length} file${project.files.length === 1 ? '' : 's'}</span>
              <span class="viewer-meta-pill">${relativeDate(project.createdAt)}</span>
              <span class="viewer-meta-pill activity-${level}">${activityLabel(level)}</span>
              ${progress >= 0 ? `<span class="viewer-meta-pill viewer-meta-progress">${progress}%</span>` : ''}
              ${totalDays ? `<span class="viewer-meta-pill">${totalDays}d est.</span>` : ''}
            </div>
          </div>
          <button class="viewer-close" data-action="close-viewer" title="Close viewer">✕</button>
        </div>

        <div class="viewer-tags">
          ${project.tags.map((tag) => `
            <button class="viewer-tag-btn ${activeFilters.has(tag) ? 'active' : ''}"
                    data-action="toggle-tag-filter" data-tag="${escapeAttr(tag)}">
              #${escapeHtml(tag)}
            </button>
          `).join('')}
          ${activeFilters.size > 0 ? `<button class="viewer-tag-clear" data-action="clear-tag-filter">Clear</button>` : ''}
        </div>

        <section class="viewer-section viewer-timeline-section">
          <div class="viewer-section-header">
            <h3>Timeline</h3>
            ${progress >= 0 ? `<span class="viewer-progress-chip">${progress}% complete</span>` : ''}
          </div>
          ${renderMilestoneTimeline(project)}
        </section>

        ${(() => {
          const previewable = filteredFiles.filter((f) => f.previewable);
          if (!previewable.length) return '';
          return `
            <section class="viewer-section">
              <div class="viewer-section-header">
                <h3>Preview</h3>
                <span class="viewer-file-total">${previewable.length}</span>
              </div>
              <div class="viewer-carousel">
                ${previewable.map((f) => `
                  <div class="viewer-carousel-item" data-action="open-file" data-project-id="${project.id}" data-file-id="${f.id}" title="${escapeAttr(f.name)}">
                    ${renderPreviewMedia(f, 'viewer-carousel-img')}
                    <div class="viewer-carousel-label">${escapeHtml(f.name)}</div>
                  </div>
                `).join('')}
              </div>
            </section>
          `;
        })()}

        <section class="viewer-section">
          <div class="viewer-section-header">
            <h3>Files${activeFilters.size > 0 ? ' <span class="viewer-filter-note">filtered</span>' : ''}</h3>
            <span class="viewer-file-total">${filteredFiles.length === project.files.length ? `${project.files.length}` : `${filteredFiles.length} / ${project.files.length}`}</span>
          </div>
          <div class="viewer-file-groups">
            ${Array.from(filteredByType.entries())
              .sort((a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]))
              .map(([group, files]) => `
                <details class="viewer-file-group" open>
                  <summary>${readableGroup(group)} <span class="viewer-group-count">${files.length}</span></summary>
                  <div class="viewer-file-list">
                    ${files.map((f) => {
                      const linkedMs = (project.milestones || []).filter((m) => (m.fileIds || []).includes(f.id));
                      return `
                        <div class="file-row" data-action="open-file" data-project-id="${project.id}" data-file-id="${f.id}" title="${escapeAttr(f.path)}">
                          <div class="file-badge">${escapeHtml(fileBadgeLabel(f))}</div>
                          <div class="file-copy">
                            <div class="file-name">${escapeHtml(f.name)}</div>
                            <div class="file-sub">${formatBytes(f.size)} · ${relativeDate(f.modifiedAt)}${linkedMs.length ? ` · ${linkedMs.map((m) => m.label).join(', ')}` : ''}</div>
                          </div>
                          <button class="tiny-btn" data-action="show-file" data-project-id="${project.id}" data-file-id="${f.id}" title="Reveal in folder">↗</button>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </details>
              `).join('')}
          </div>
        </section>

        ${project.consolidated ? '<div class="consolidated-badge">✓ Files consolidated</div>' : ''}
      </div>
    </div>
  `;
}

function refreshViewer() {
  const project = getProject(state.viewerProjectId);
  if (!project) return;
  projectViewer.innerHTML = renderViewer(project);
}

function openViewer(projectId) {
  state.viewerProjectId = projectId;
  state.viewerActiveModal = null;
  state.viewerTagFilter = new Set();
  state.viewerDrag = null;
  const project = getProject(projectId);
  if (!project) return;
  projectViewer.innerHTML = renderViewer(project);
  projectViewer.classList.remove('hidden');
}

function closeViewer() {
  state.viewerProjectId = null;
  state.viewerActiveModal = null;
  state.viewerTagFilter = new Set();
  state.viewerDrag = null;
  projectViewer.classList.add('hidden');
  projectViewer.innerHTML = '';
}

/* ── Hunter ─────────────────────────────────────────────────────────── */

async function runHunterSearch(projectId) {
  const project = getProject(projectId);
  if (!project) return;

  state.hunterProjectId = projectId;
  state.hunterLoading = true;
  state.hunterResults = [];
  renderHunterPanel();
  hunterPanel.classList.remove('hidden');

  const keywords = [
    ...project.tags,
    ...project.name.toLowerCase().split(/\s+/),
  ].filter((k) => k.length > 2);

  const excludePaths = project.files.map((f) => f.path);

  try {
    const results = await window.electronAPI.hunterSearch(keywords, excludePaths, state.hunterDirs);
    state.hunterResults = results || [];
  } catch (err) {
    console.error('Hunter search failed:', err);
    state.hunterResults = [];
  }

  state.hunterLoading = false;
  renderHunterPanel();
}

function renderHunterPanel() {
  const project = getProject(state.hunterProjectId);
  if (!project) {
    hunterPanel.classList.add('hidden');
    return;
  }

  const dirList = state.hunterDirs.length
    ? state.hunterDirs
        .map((d, i) => `
          <div class="hunter-dir-row">
            <span class="hunter-dir-path" title="${escapeAttr(d)}">${escapeHtml(d)}</span>
            <button class="tag-x hunter-dir-remove" data-action="hunter-remove-dir" data-index="${i}" title="Remove">×</button>
          </div>
        `).join('')
    : '<div class="hunter-dir-default">Using default directories (Desktop, Documents, Downloads, Pictures, Movies, Music)</div>';

  hunterPanel.innerHTML = `
    <div class="hunter-header">
      <h3>⌕ Hunter — ${escapeHtml(project.name)}</h3>
      <button class="icon-btn" data-action="close-hunter" title="Close">✕</button>
    </div>

    <details class="hunter-dirs-section">
      <summary class="hunter-dirs-toggle">Search directories</summary>
      <div class="hunter-dirs-list">${dirList}</div>
      <button class="action-btn hunter-add-dir-btn" data-action="hunter-add-dir">+ Add folder</button>
    </details>

    ${state.hunterLoading
      ? '<div class="hunter-loading">Searching your filesystem…</div>'
      : state.hunterResults.length
        ? `
          <div class="hunter-count">${state.hunterResults.length} related file${state.hunterResults.length === 1 ? '' : 's'} found</div>
          <div class="hunter-results">
            ${state.hunterResults.map((file) => `
              <div class="hunter-result" data-path="${escapeAttr(file.path)}">
                <div class="file-badge">${escapeHtml(fileBadgeLabel(file))}</div>
                <div class="file-copy">
                  <div class="file-name">${escapeHtml(file.name)}</div>
                  <div class="file-sub">${escapeHtml(file.path)}</div>
                </div>
                <button class="action-btn hunter-add-btn" data-action="hunter-add-file" data-path="${escapeAttr(file.path)}" title="Add to project">+ Add</button>
              </div>
            `).join('')}
          </div>
        `
        : '<div class="hunter-empty">No related files found on your filesystem.</div>'
    }
  `;
}

function closeHunter() {
  state.hunterProjectId = null;
  state.hunterResults = [];
  hunterPanel.classList.add('hidden');
  hunterPanel.innerHTML = '';
}

/* ── File Consolidation ─────────────────────────────────────────────── */

async function consolidateFiles(projectId) {
  const project = getProject(projectId);
  if (!project || !project.files.length) return;

  setSaveStatus('Consolidating…');
  try {
    const filePaths = project.files.map((f) => f.path);
    const result = await window.electronAPI.consolidateProject(project.name, filePaths);
    project.consolidated = true;
    render();
    scheduleSave(true);
    setSaveStatus(`Consolidated: ${result.copied} copied, ${result.skipped} skipped`);
  } catch (err) {
    console.error('Consolidation failed:', err);
    setSaveStatus('Consolidation failed');
  }
}

/* ── FileHawk: periodic scan ───────────────────────────────────────── */

async function filehawkScan() {
  if (!state.projects.length) return;

  const allPaths = state.projects.flatMap((p) => p.files.map((f) => f.path));
  if (!allPaths.length) return;

  try {
    const results = await window.electronAPI.filehawkCheck(allPaths);
    const statMap = new Map(results.map((r) => [r.path, r]));

    let changed = false;
    state.projects.forEach((project) => {
      project.files.forEach((file) => {
        const info = statMap.get(file.path);
        if (!info || !info.exists) return;
        if (info.modifiedAt !== file.modifiedAt) {
          file.modifiedAt = info.modifiedAt;
          file.size = info.size;
          changed = true;
        }
      });
    });

    if (changed) {
      render();
      scheduleSave();
    }
  } catch (err) {
    console.error('FileHawk scan error:', err);
  }
}

function startFileHawk() {
  if (filehawkTimer) clearInterval(filehawkTimer);
  filehawkScan();
  filehawkTimer = setInterval(filehawkScan, 4 * 60 * 60 * 1000);
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
        <p>Drop files or whole folders on the canvas. Projungle will cluster them into projects and keep your original files exactly where they are.</p>
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
  if (!card) return;

  /* ── Cover image drag-to-pan ────────────────────────────── */
  const coverArea = event.target.closest('[data-role="cover-drag-area"]');
  if (coverArea) {
    const project = getProject(card.dataset.id);
    if (!project) return;
    const coverImg = coverArea.querySelector('.project-cover-img, video.project-cover-img');
    if (!coverImg) return;

    const pos = (project.coverPosition || '50% 50%').split(/\s+/).map(parseFloat);

    interaction = {
      kind: 'pan-cover',
      project,
      coverImg,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: pos[0] || 50,
      originY: pos[1] || 50,
      containerW: coverArea.offsetWidth,
      containerH: coverArea.offsetHeight,
    };

    event.preventDefault();
    event.stopPropagation();
    return;
  }

  /* ── Card drag ──────────────────────────────────────────── */
  const handle = event.target.closest('[data-drag-handle]');
  const interactive = event.target.closest('button') || event.target.matches('input');

  if (!handle || interactive) return;

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

  if (interaction.kind === 'pan-cover') {
    const dx = event.clientX - interaction.startClientX;
    const dy = event.clientY - interaction.startClientY;
    /* invert: dragging right moves the viewport left, revealing the right side */
    const sensitivity = 0.25;
    const newX = clamp(interaction.originX - (dx * sensitivity / interaction.containerW) * 100, 0, 100);
    const newY = clamp(interaction.originY - (dy * sensitivity / interaction.containerH) * 100, 0, 100);
    interaction.coverImg.style.objectPosition = `${newX}% ${newY}%`;
    interaction.currentX = newX;
    interaction.currentY = newY;
  }
});

window.addEventListener('pointerup', () => {
  if (!interaction) return;
  if (interaction.kind === 'pan-cover' && interaction.currentX != null) {
    interaction.project.coverPosition = `${Math.round(interaction.currentX)}% ${Math.round(interaction.currentY)}%`;
    scheduleSave();
  }
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

    case 'delete-tag': {
      event.stopPropagation();
      if (!project) return;
      const tagToDelete = cleanTag(actionEl.dataset.tag);
      project.tags = project.tags.filter((t) => t !== tagToDelete);
      render();
      scheduleSave();
      break;
    }

    case 'open-viewer': {
      event.stopPropagation();
      if (projectId) openViewer(projectId);
      break;
    }

    case 'hunter-search': {
      event.stopPropagation();
      if (projectId) runHunterSearch(projectId);
      break;
    }

    case 'consolidate': {
      event.stopPropagation();
      if (projectId) consolidateFiles(projectId);
      break;
    }

    case 'set-cover': {
      event.stopPropagation();
      if (!project) return;
      const fid = actionEl.dataset.fileId;
      project.coverFileId = project.coverFileId === fid ? null : fid;
      project.coverPosition = '50% 50%';
      render();
      scheduleSave();
      break;
    }

    case 'remove-cover': {
      event.stopPropagation();
      if (!project) return;
      project.coverFileId = null;
      project.coverPosition = '50% 50%';
      render();
      scheduleSave();
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

/* ── Tag editing: double-click to edit ──────────────────────────────── */

world.addEventListener('dblclick', (event) => {
  const chip = event.target.closest('.tag-chip');
  if (!chip) return;

  const card = event.target.closest('.project-card');
  const project = getProject(card?.dataset.id);
  if (!project || !project.expanded) return;

  event.preventDefault();
  event.stopPropagation();

  const oldTag = cleanTag(chip.dataset.tag);
  if (!oldTag) return;

  project.tags = project.tags.filter((t) => t !== oldTag);
  render();
  scheduleSave();

  requestAnimationFrame(() => {
    const updatedCard = world.querySelector(`.project-card[data-id="${project.id}"]`);
    const input = updatedCard?.querySelector('.tag-input');
    if (input) {
      input.value = oldTag;
      input.focus();
      input.select();
    }
  });
});

/* ── Viewer event handlers ─────────────────────────────────────────── */

/* Save modal field changes back to milestone */
function commitModalFields() {
  const project = getProject(state.viewerProjectId);
  if (!project || !state.viewerActiveModal) return;
  const ms = project.milestones.find((m) => m.id === state.viewerActiveModal);
  if (!ms) return;

  const labelEl = projectViewer.querySelector(`[data-role="modal-milestone-label"][data-milestone-id="${ms.id}"]`);
  const dateEl = projectViewer.querySelector(`[data-role="modal-milestone-date"][data-milestone-id="${ms.id}"]`);
  const daysEl = projectViewer.querySelector(`[data-role="modal-milestone-days"][data-milestone-id="${ms.id}"]`);
  const descEl = projectViewer.querySelector(`[data-role="modal-milestone-desc"][data-milestone-id="${ms.id}"]`);

  let changed = false;
  if (labelEl && labelEl.value.trim() && labelEl.value.trim() !== ms.label) { ms.label = labelEl.value.trim(); changed = true; }
  if (dateEl && dateEl.value && dateEl.value !== ms.date) { ms.date = dateEl.value; changed = true; }
  if (daysEl) { const v = Number(daysEl.value) || 0; if (v !== ms.estimatedDays) { ms.estimatedDays = v; changed = true; } }
  if (descEl && descEl.value !== ms.description) { ms.description = descEl.value; changed = true; }

  if (changed) { render(); scheduleSave(); }
}

projectViewer.addEventListener('click', async (event) => {
  const actionEl = event.target.closest('[data-action]');

  /* clicking inside a modal should not close it */
  const insideModal = event.target.closest('.tl-modal');

  /* close modal on click outside */
  if (!insideModal && state.viewerActiveModal && !event.target.closest('[data-action="open-milestone-modal"]')) {
    commitModalFields();
    state.viewerActiveModal = null;
    refreshViewer();
    return;
  }

  if (!actionEl) return;

  const project = getProject(state.viewerProjectId);

  switch (actionEl.dataset.action) {
    case 'close-viewer':
      commitModalFields();
      closeViewer();
      break;

    case 'open-milestone-modal': {
      commitModalFields();
      const mid = actionEl.dataset.milestoneId;
      state.viewerActiveModal = state.viewerActiveModal === mid ? null : mid;
      refreshViewer();
      break;
    }

    case 'toggle-milestone': {
      if (!project) return;
      const ms = project.milestones.find((m) => m.id === actionEl.dataset.milestoneId);
      if (ms) {
        ms.completed = !ms.completed;
        refreshViewer();
        render();
        scheduleSave();
      }
      break;
    }

    case 'delete-milestone': {
      if (!project) return;
      if (state.viewerActiveModal === actionEl.dataset.milestoneId) state.viewerActiveModal = null;
      project.milestones = project.milestones.filter((m) => m.id !== actionEl.dataset.milestoneId);
      refreshViewer();
      render();
      scheduleSave();
      break;
    }

    case 'add-milestone-inline': {
      if (!project) return;
      const newId = uid();
      project.milestones.push({
        id: newId,
        label: 'New Milestone',
        date: new Date().toISOString().slice(0, 10),
        completed: false,
        description: '',
        estimatedDays: 0,
        fileIds: [],
        subtasks: [],
      });
      state.viewerActiveModal = newId;
      refreshViewer();
      render();
      scheduleSave();
      /* focus the title input */
      requestAnimationFrame(() => {
        const titleInput = projectViewer.querySelector(`[data-role="modal-milestone-label"][data-milestone-id="${newId}"]`);
        if (titleInput) { titleInput.select(); titleInput.focus(); }
      });
      break;
    }

    case 'toggle-tag-filter': {
      const tag = actionEl.dataset.tag;
      if (state.viewerTagFilter.has(tag)) {
        state.viewerTagFilter.delete(tag);
      } else {
        state.viewerTagFilter.add(tag);
      }
      refreshViewer();
      break;
    }

    case 'clear-tag-filter': {
      state.viewerTagFilter = new Set();
      refreshViewer();
      break;
    }

    case 'toggle-subtask': {
      event.preventDefault();
      if (!project) return;
      const ms = project.milestones.find((m) => m.id === actionEl.dataset.milestoneId);
      if (!ms) return;
      const sub = (ms.subtasks || []).find((s) => s.id === actionEl.dataset.subtaskId);
      if (sub) {
        sub.done = !sub.done;
        refreshViewer();
        render();
        scheduleSave();
      }
      break;
    }

    case 'delete-subtask': {
      event.preventDefault();
      event.stopPropagation();
      if (!project) return;
      const ms = project.milestones.find((m) => m.id === actionEl.dataset.milestoneId);
      if (!ms) return;
      ms.subtasks = (ms.subtasks || []).filter((s) => s.id !== actionEl.dataset.subtaskId);
      refreshViewer();
      render();
      scheduleSave();
      break;
    }

    case 'toggle-file-link': {
      event.preventDefault();
      if (!project) return;
      const ms = project.milestones.find((m) => m.id === actionEl.dataset.milestoneId);
      if (!ms) return;
      const fid = actionEl.dataset.fileId;
      const idx = ms.fileIds.indexOf(fid);
      if (idx >= 0) { ms.fileIds.splice(idx, 1); } else { ms.fileIds.push(fid); }
      refreshViewer();
      render();
      scheduleSave();
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

/* Modal input change listeners */
projectViewer.addEventListener('change', (event) => {
  const role = event.target.dataset?.role;
  if (!role) return;
  const project = getProject(state.viewerProjectId);
  if (!project) return;
  const mid = event.target.dataset.milestoneId;
  const ms = mid ? project.milestones.find((m) => m.id === mid) : null;

  if (role === 'modal-milestone-date' && ms) {
    ms.date = event.target.value || ms.date;
    refreshViewer();
    render();
    scheduleSave();
  }
  if (role === 'modal-milestone-days' && ms) {
    ms.estimatedDays = Number(event.target.value) || 0;
    render();
    scheduleSave();
  }
});

projectViewer.addEventListener('input', (event) => {
  /* live-save description as you type */
  if (event.target.dataset?.role === 'modal-milestone-desc') {
    const project = getProject(state.viewerProjectId);
    if (!project) return;
    const ms = project.milestones.find((m) => m.id === event.target.dataset.milestoneId);
    if (ms) { ms.description = event.target.value; scheduleSave(); }
  }
});

/* Hover-to-play for video/audio previews in viewer */
projectViewer.addEventListener('mouseenter', (event) => {
  const item = event.target.closest('.viewer-carousel-item');
  if (!item) return;
  const media = item.querySelector('video, audio');
  if (media) media.play().catch(() => {});
}, true);

projectViewer.addEventListener('mouseleave', (event) => {
  const item = event.target.closest('.viewer-carousel-item');
  if (!item) return;
  const media = item.querySelector('video, audio');
  if (media) { media.pause(); media.currentTime = 0; }
}, true);

projectViewer.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (state.viewerActiveModal) {
      commitModalFields();
      state.viewerActiveModal = null;
      refreshViewer();
      return;
    }
    closeViewer();
    return;
  }

  /* Enter in subtask input → add subtask */
  if (event.key === 'Enter' && event.target.matches('[data-role="subtask-input"]')) {
    event.preventDefault();
    const text = event.target.value.trim();
    if (!text) return;
    const project = getProject(state.viewerProjectId);
    if (!project) return;
    const ms = project.milestones.find((m) => m.id === event.target.dataset.milestoneId);
    if (!ms) return;
    if (!ms.subtasks) ms.subtasks = [];
    ms.subtasks.push({ id: uid(), text, done: false });
    refreshViewer();
    render();
    scheduleSave();
    requestAnimationFrame(() => {
      const input = projectViewer.querySelector(`[data-role="subtask-input"][data-milestone-id="${ms.id}"]`);
      if (input) input.focus();
    });
    return;
  }

  /* Enter in modal title → blur */
  if (event.key === 'Enter' && event.target.matches('[data-role="modal-milestone-label"]')) {
    event.preventDefault();
    commitModalFields();
    refreshViewer();
  }
});

/* ── Milestone drag-to-reorder ───────────────────────────────────────── */

projectViewer.addEventListener('mousedown', (event) => {
  const dot = event.target.closest('.tl-dot');
  if (!dot) return;
  /* only start drag on left button */
  if (event.button !== 0) return;

  const node = dot.closest('.tl-node');
  const track = dot.closest('.tl-track');
  if (!node || !track) return;

  const milestoneId = node.dataset.milestoneId;
  const trackRect = track.getBoundingClientRect();

  state.viewerDrag = {
    milestoneId,
    startX: event.clientX,
    trackLeft: trackRect.left,
    trackWidth: trackRect.width,
    moved: false,
  };

  node.classList.add('dragging');
  track.classList.add('drag-active');
  event.preventDefault();
});

document.addEventListener('mousemove', (event) => {
  if (!state.viewerDrag) return;
  const drag = state.viewerDrag;
  const dx = Math.abs(event.clientX - drag.startX);
  if (dx > 4) drag.moved = true;
  if (!drag.moved) return;

  const node = projectViewer.querySelector(`.tl-node[data-milestone-id="${drag.milestoneId}"]`);
  if (!node) return;

  const pct = clamp(((event.clientX - drag.trackLeft) / drag.trackWidth) * 100, 0, 100);
  node.style.left = `${pct}%`;
  node.style.zIndex = '10';
});

document.addEventListener('mouseup', (event) => {
  if (!state.viewerDrag) return;
  const drag = state.viewerDrag;
  state.viewerDrag = null;

  const node = projectViewer.querySelector(`.tl-node[data-milestone-id="${drag.milestoneId}"]`);
  const track = projectViewer.querySelector('.tl-track');
  if (node) { node.classList.remove('dragging'); node.style.zIndex = ''; }
  if (track) track.classList.remove('drag-active');

  if (!drag.moved) return; /* was a click, not a drag */

  const project = getProject(state.viewerProjectId);
  if (!project) return;

  const milestones = project.milestones;
  const sorted = [...milestones].sort((a, b) => a.date.localeCompare(b.date));
  const dragIdx = sorted.findIndex((m) => m.id === drag.milestoneId);
  if (dragIdx < 0) return;

  const finalPct = clamp(((event.clientX - drag.trackLeft) / drag.trackWidth) * 100, 0, 100);
  const totalNodes = sorted.length;
  let targetIdx = Math.round((finalPct / 100) * (totalNodes - 1));
  targetIdx = clamp(targetIdx, 0, totalNodes - 1);

  if (targetIdx === dragIdx) { refreshViewer(); return; }

  /* reorder by updating the dragged milestone's date to slot into new position */
  const dragged = sorted[dragIdx];
  sorted.splice(dragIdx, 1);

  let newDate;
  if (targetIdx === 0) {
    const nextDate = new Date(sorted[0].date + 'T00:00:00');
    nextDate.setDate(nextDate.getDate() - 1);
    newDate = nextDate.toISOString().slice(0, 10);
  } else if (targetIdx >= sorted.length) {
    const prevDate = new Date(sorted[sorted.length - 1].date + 'T00:00:00');
    prevDate.setDate(prevDate.getDate() + 1);
    newDate = prevDate.toISOString().slice(0, 10);
  } else {
    const before = new Date(sorted[targetIdx - 1].date + 'T00:00:00');
    const after = new Date(sorted[targetIdx].date + 'T00:00:00');
    const midMs = (before.getTime() + after.getTime()) / 2;
    newDate = new Date(midMs).toISOString().slice(0, 10);
  }

  dragged.date = newDate;
  refreshViewer();
  render();
  scheduleSave();
});

/* ── Hunter panel event handlers ───────────────────────────────────── */

hunterPanel.addEventListener('click', async (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;

  switch (actionEl.dataset.action) {
    case 'close-hunter':
      closeHunter();
      break;

    case 'hunter-add-file': {
      event.stopPropagation();
      const project = getProject(state.hunterProjectId);
      if (!project) return;

      const filePath = actionEl.dataset.path;
      const fileRecord = state.hunterResults.find((f) => f.path === filePath);
      if (!fileRecord) return;

      const alreadyHas = project.files.some((f) => f.path === filePath);
      if (alreadyHas) return;

      project.files.push(normalizeFile(fileRecord));
      project.files.sort(sortFiles);

      state.hunterResults = state.hunterResults.filter((f) => f.path !== filePath);
      renderHunterPanel();
      render();
      scheduleSave();
      break;
    }

    case 'hunter-add-dir': {
      event.stopPropagation();
      const dir = await window.electronAPI.openDirectoryDialog();
      if (!dir) return;
      if (!state.hunterDirs.includes(dir)) {
        state.hunterDirs.push(dir);
        renderHunterPanel();
        scheduleSave();
      }
      break;
    }

    case 'hunter-remove-dir': {
      event.stopPropagation();
      const idx = Number(actionEl.dataset.index);
      if (idx >= 0 && idx < state.hunterDirs.length) {
        state.hunterDirs.splice(idx, 1);
        renderHunterPanel();
        scheduleSave();
      }
      break;
    }

    default:
      break;
  }
});

/* ── Sort by activity ──────────────────────────────────────────────── */

sortActivityBtn.addEventListener('click', () => {
  state.sortByActivity = !state.sortByActivity;
  sortActivityBtn.classList.toggle('active', state.sortByActivity);
  render();
});

dimToggle.addEventListener('click', () => {
  document.querySelector('*').classList.toggle('dim-mode');
  //root data target
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dim' ? '' : 'dim';
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
  const typingInInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active !== searchInput;

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
    if (state.viewerProjectId) { closeViewer(); return; }
    if (state.hunterProjectId) { closeHunter(); return; }
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
    state.hunterDirs = Array.isArray(saved.hunterDirs) ? saved.hunterDirs : [];

    if (!state.projects.length) {
      resetView(false);
    }

    render();
    startFileHawk();
  } catch (error) {
    console.error(error);
    render();
  }
}

init();
