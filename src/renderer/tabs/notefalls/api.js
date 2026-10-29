/* ── Notefalls API (IPC → SQLite, with in-browser fallback) ───────────
   Falls back to an in-memory store (seeded with sample posts) when running
   `vite` in a plain browser, mirroring the journals api.js pattern. */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function seedPosts() {
  const now = Date.now();
  const photoshopEnd = now - 14 * DAY;
  const photoshopStart = photoshopEnd - 46 * 60 * 1000;
  return [
    {
      id: 'seed-1',
      authorType: 'user',
      authorAgentId: null,
      body: 'Violin works, etudes vs. sonata',
      media: [],
      journalId: null,
      tags: [],
      statusDot: '#e0473e',
      sourceApp: null,
      sourceIcon: 'music',
      captureMode: 'auto',
      sessionStart: now - 3 * HOUR - 25 * 60 * 1000,
      sessionEnd: now - 3 * HOUR,
      screenshots: [],
      notes: null,
      createdAt: now - 3 * HOUR,
    },
    {
      id: 'seed-2',
      authorType: 'user',
      authorAgentId: null,
      body: 'Worked in Sibelius for 45 minutes',
      media: [],
      journalId: null,
      tags: [],
      statusDot: '#e0473e',
      sourceApp: 'Sibelius',
      sourceIcon: 'music',
      captureMode: 'auto',
      sessionStart: now - 2 * DAY - 45 * 60 * 1000,
      sessionEnd: now - 2 * DAY,
      screenshots: [],
      notes: null,
      createdAt: now - 2 * DAY - 1,
    },
    {
      id: 'seed-3',
      authorType: 'user',
      authorAgentId: null,
      body: 'Edited Journal',
      media: [],
      journalId: null,
      tags: ['Habit Track'],
      statusDot: null,
      sourceApp: null,
      sourceIcon: 'journal',
      captureMode: 'manual',
      sessionStart: null,
      sessionEnd: null,
      screenshots: [],
      notes: null,
      createdAt: now - 7 * DAY - 2,
    },
    {
      id: 'seed-4',
      authorType: 'user',
      authorAgentId: null,
      body: 'Worked in Photoshop for 45 minutes',
      media: [],
      journalId: null,
      tags: [],
      statusDot: null,
      sourceApp: 'Photoshop',
      sourceIcon: 'photoshop',
      captureMode: 'auto',
      sessionStart: photoshopStart,
      sessionEnd: photoshopEnd,
      screenshots: [],
      notes: null,
      createdAt: photoshopEnd - 3,
    },
  ];
}

const memPosts = seedPosts();

export const api = {
  list: () =>
    window.electronAPI?.notefallsList
      ? window.electronAPI.notefallsList()
      : Promise.resolve([...memPosts].sort((a, b) => b.createdAt - a.createdAt)),

  create: (input) => {
    if (window.electronAPI?.notefallsCreate) return window.electronAPI.notefallsCreate(input);
    const post = {
      id: `local-${Date.now()}`,
      authorType: 'user',
      authorAgentId: null,
      body: String(input?.body || ''),
      media: Array.isArray(input?.media) ? input.media : [],
      journalId: input?.journalId || null,
      tags: Array.isArray(input?.tags) ? input.tags : [],
      statusDot: input?.statusDot || null,
      sourceApp: null,
      sourceIcon: 'note',
      captureMode: 'manual',
      sessionStart: null,
      sessionEnd: null,
      screenshots: [],
      notes: null,
      createdAt: Date.now(),
    };
    memPosts.unshift(post);
    return Promise.resolve(post);
  },

  update: (id, patch) => {
    if (window.electronAPI?.notefallsUpdate) return window.electronAPI.notefallsUpdate(id, patch);
    const post = memPosts.find((p) => p.id === id);
    if (!post) return Promise.reject(new Error('Post not found'));
    Object.assign(post, patch);
    return Promise.resolve({ ...post });
  },

  remove: (id) => {
    if (window.electronAPI?.notefallsDelete) return window.electronAPI.notefallsDelete(id);
    const i = memPosts.findIndex((p) => p.id === id);
    if (i >= 0) memPosts.splice(i, 1);
    return Promise.resolve({ ok: true });
  },

  attachMedia: () => {
    if (window.electronAPI?.notefallsAttachMedia) return window.electronAPI.notefallsAttachMedia();
    return Promise.resolve([]);
  },
};

// Resolve a media/screenshot path to a displayable URL. Local file paths are
// served via the `file://` scheme (allowed by CSP for media in the shell).
export function mediaUrl(p) {
  if (!p) return '';
  if (/^(file|data|https?):/.test(p)) return p;
  return `file://${p}`;
}
