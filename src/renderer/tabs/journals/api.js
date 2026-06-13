/* ── Journals API (IPC → SQLite, with in-browser fallback) ────────────
   Falls back to in-memory stores when running `vite` in a plain browser
   so the views stay workable without Electron. */

const memJournals = [];
const memFolios = {}; // journalId → [folio]

export const api = {
  list: () =>
    window.electronAPI?.journalsList
      ? window.electronAPI.journalsList()
      : Promise.resolve([...memJournals]),

  create: (input) => {
    if (window.electronAPI?.journalsCreate) return window.electronAPI.journalsCreate(input);
    const folios = (input.folios || []).map((f, i) => ({
      id: `${Date.now()}-${i}`,
      journalId: String(Date.now()),
      type: f.type || 'notes',
      title: f.title || '',
      content: f.content ?? {},
      position: i,
    }));
    const j = { id: String(Date.now()), folioCount: folios.length, ...input };
    delete j.folios;
    memJournals.push(j);
    memFolios[j.id] = folios.map((f) => ({ ...f, journalId: j.id }));
    return Promise.resolve(j);
  },

  foliosList: (journalId) =>
    window.electronAPI?.foliosList
      ? window.electronAPI.foliosList(journalId)
      : Promise.resolve([...(memFolios[journalId] || [])]),

  // opts.afterId inserts the new folio directly after an existing one
  // (page-group rollover); default appends at the end.
  foliosCreate: (journalId, folio, opts) => {
    if (window.electronAPI?.foliosCreate) return window.electronAPI.foliosCreate(journalId, folio, opts);
    const list = (memFolios[journalId] = memFolios[journalId] || []);
    const f = {
      id: `${Date.now()}-${list.length}`,
      journalId,
      type: folio.type || 'notes',
      title: folio.title || '',
      content: folio.content ?? {},
      position: list.length,
    };
    const at = opts?.afterId ? list.findIndex((x) => x.id === opts.afterId) : -1;
    if (at >= 0) list.splice(at + 1, 0, f);
    else list.push(f);
    list.forEach((x, i) => { x.position = i; });
    const j = memJournals.find((x) => x.id === journalId);
    if (j) j.folioCount = list.length;
    return Promise.resolve({ ...f });
  },

  foliosDelete: (id) => {
    if (window.electronAPI?.foliosDelete) return window.electronAPI.foliosDelete(id);
    for (const [jid, list] of Object.entries(memFolios)) {
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) {
        list.splice(i, 1);
        const j = memJournals.find((x) => x.id === jid);
        if (j) j.folioCount = list.length;
        break;
      }
    }
    return Promise.resolve({ ok: true });
  },

  foliosUpdate: (id, patch) => {
    if (window.electronAPI?.foliosUpdate) return window.electronAPI.foliosUpdate(id, patch);
    for (const list of Object.values(memFolios)) {
      const f = list.find((x) => x.id === id);
      if (f) {
        Object.assign(f, patch);
        return Promise.resolve({ ...f });
      }
    }
    return Promise.reject(new Error('Folio not found'));
  },
};
