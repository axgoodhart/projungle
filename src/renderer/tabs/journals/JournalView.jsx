import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from './api.js';
import { TEMPLATES } from './templates.js';
import { createNotesEditor, EditorToolbar } from './richtext.jsx';

/* ── Journal viewer — open book ───────────────────────────────────────
   Renders a journal's folios two-up. Everything that looks interactive
   is interactive: dashboard stats compute live from sibling folios (and
   targets/manual stats are click-to-edit), prompts have answer fields,
   tracker cells and todo items edit and delete. All edits persist via
   folios:update. */

/* ── Widget compute engine ───────────────────────────────────────────── */

const DAY = 86400000;

function parseDate(s) {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function parseNum(s) {
  const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

/* Returns the computed raw value, or null when the source can't resolve
   (missing sibling, no rows yet, unparseable dates…). */
function computeWidget(widget, folios) {
  const src = widget.source;
  if (!src) return null;
  const f = folios.find((x) => x.type === src.from && x.title === src.folio);
  if (!f) return null;

  if (src.from === 'tracker') {
    const cols = f.content?.columns || [];
    const rows = f.content?.rows || [];
    const ci = src.column ? cols.indexOf(src.column) : -1;
    const di = cols.findIndex((c) => /date/i.test(c));
    const now = new Date();

    switch (src.agg) {
      case 'count':
        return rows.length;
      case 'countWeek':
        return rows.filter((r) => {
          if (di < 0) return true;
          const d = parseDate(r[di]);
          return d ? now - d < 7 * DAY && now - d >= -DAY : false;
        }).length;
      case 'sumMonth':
        if (ci < 0) return null;
        return rows
          .filter((r) => {
            if (di < 0) return true;
            const d = parseDate(r[di]);
            return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          })
          .reduce((a, r) => a + parseNum(r[ci]), 0);
      case 'sumNum':
        if (ci < 0) return null;
        return rows.reduce((a, r) => a + parseNum(r[ci]), 0);
      case 'topValue': {
        if (ci < 0) return null;
        const tally = {};
        for (const r of rows) {
          const v = String(r[ci] || '').trim();
          if (v) tally[v] = (tally[v] || 0) + 1;
        }
        const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
        return top ? top[0] : null;
      }
      case 'daysSinceLast': {
        const dates = rows.map((r) => parseDate(r[di >= 0 ? di : 0])).filter(Boolean);
        if (!dates.length) return null;
        const last = Math.max(...dates.map((d) => +d));
        return Math.max(0, Math.floor((Date.now() - last) / DAY));
      }
      default:
        return null;
    }
  }

  if (src.from === 'todo') {
    const items = f.content?.items || [];
    if (src.agg === 'doneRatio') {
      return items.length ? Math.round((100 * items.filter((i) => i.done).length) / items.length) : 0;
    }
    if (src.agg === 'count') return items.length;
    return null;
  }

  return null;
}

function formatValue(v, format) {
  if (v === null || v === undefined) return '—';
  if (format === 'money') return `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (format === 'days') return `${v} ${v === 1 ? 'day' : 'days'}`;
  if (format === 'hours') return `${v}h`;
  if (typeof v === 'number' && String(v).length > 6) return v.toFixed(1);
  return String(v);
}

/* ── Page groups ──────────────────────────────────────────────────────
   Consecutive folios sharing a type+title form one "pagegroup": a single
   continuity rendered as numbered pages ("Notes — pg. 3 of 10"). Groups
   carry their own tag strip (stored on the group's first folio) and are
   the unit the sidebar jumps between. */

const groupKeyOf = (f) => `${f.type}|${f.title}`;

function computeGroups(folios) {
  const out = [];
  (folios || []).forEach((f, i) => {
    const key = groupKeyOf(f);
    const last = out[out.length - 1];
    if (last && last.key === key) last.folios.push(f);
    else out.push({ key, type: f.type, title: f.title || TYPE_LABELS[f.type] || 'page', folios: [f], start: i });
  });
  return out;
}

/* ── Canvas project @mentions ─────────────────────────────────────────
   Notes text mentioning "@<canvas project name>" links that project to
   the journal; the sidebar then lists its files (with duplicate-name
   detection). Projects come from the legacy canvas store (library:load). */

function collectDocText(node, out) {
  if (!node) return;
  if (typeof node.text === 'string') out.push(node.text);
  (node.content || []).forEach((c) => collectDocText(c, out));
}

function folioText(folio) {
  const c = folio.content || {};
  const out = [];
  // notes
  if (c.doc && typeof c.doc === 'object') collectDocText(c.doc, out);
  else if (typeof c.body === 'string') out.push(c.body.replace(/<[^>]+>/g, ' '));
  // todo
  (c.items || []).forEach((it) => out.push(String(it?.text || '')));
  // tracker
  (c.rows || []).forEach((r) => (Array.isArray(r) ? r : []).forEach((cell) => out.push(String(cell || ''))));
  // prompts
  if (c.intro) out.push(String(c.intro));
  (c.prompts || []).forEach((p) => out.push(String(p || '')));
  (c.answers || []).forEach((a) => out.push(String(a || '')));
  // dashboard
  if (c.note) out.push(String(c.note));
  return out.join('\n');
}

/* Unique file rows for a project, flagging duplicate basenames. */
function projectFileRows(project) {
  const files = project.files || [];
  const counts = {};
  for (const f of files) {
    const n = String(f.name || '').toLowerCase();
    counts[n] = (counts[n] || 0) + 1;
  }
  const seen = new Set();
  const rows = [];
  for (const f of files) {
    const n = String(f.name || '').toLowerCase();
    if (seen.has(n)) continue;
    seen.add(n);
    rows.push({ file: f, dups: counts[n] });
  }
  return rows;
}

/* ── Overflow rollover ────────────────────────────────────────────────
   Pages have a fixed height (the paper must END so the page texture
   stays honest). When a notes doc overflows its page body, trailing
   top-level blocks are popped off and handed to the caller, which
   prepends them to the next page of the group (creating one if needed). */

function rolloverOverflow(editor, proseEl) {
  const body = proseEl?.closest('.jv-page__body');
  if (!body || !editor || editor.isDestroyed) return null;
  const fits = () => body.scrollHeight <= body.clientHeight + 1;
  if (fits()) return null;
  const moved = [];
  while (!fits() && editor.state.doc.childCount > 1) {
    const doc = editor.state.doc;
    const last = doc.child(doc.childCount - 1);
    moved.unshift(last.toJSON());
    editor.commands.deleteRange({ from: doc.content.size - last.nodeSize, to: doc.content.size });
  }
  return moved.length ? moved : null;
}

/* ── Inline-editable value (click → input → Enter/blur saves) ────────── */

function InlineEdit({ value, display, onCommit, class: cls }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!editing) {
    return (
      <button
        type="button"
        class={'jv-editable ' + (cls || '')}
        title="Click to edit"
        onClick={() => {
          setDraft(String(value ?? ''));
          setEditing(true);
        }}
      >
        {display}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (draft !== String(value ?? '')) onCommit(draft);
  };
  return (
    <input
      class={'jv-editable__input ' + (cls || '')}
      type="text"
      value={draft}
      ref={(el) => el?.focus()}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

/* ── Folio renderers ─────────────────────────────────────────────────── */

function DashboardFolio({ folio, siblings, onSave }) {
  const { widgets = [], note } = folio.content || {};

  const saveWidget = (i, patch) => {
    const next = widgets.map((w, j) => (j === i ? { ...w, ...patch } : w));
    onSave({ content: { ...folio.content, widgets: next } });
  };

  return (
    <div class="jv-dashboard">
      {widgets.map((w, i) => {
        const computed = computeWidget(w, siblings);
        const live = computed !== null;
        const value = live ? computed : w.value;

        if (w.kind === 'progress') {
          const target = Number(w.target) || 1;
          const num = typeof value === 'number' ? value : parseNum(value);
          const pct = Math.min(100, (num / target) * 100);
          return (
            <div class={'jv-widget jv-widget--progress' + (num > target ? ' is-over' : '')} key={i}>
              <span class="jv-widget__label">
                {w.label}
                {live && <em class="jv-live">live</em>}
              </span>
              <div class="jv-bar">
                <div class="jv-bar__fill" style={{ width: `${pct}%` }} />
              </div>
              <span class="jv-widget__hint">
                {formatValue(num, w.format)} /{' '}
                <InlineEdit
                  value={w.target}
                  display={formatValue(target, w.format)}
                  onCommit={(v) => saveWidget(i, { target: parseNum(v) || target })}
                />
              </span>
            </div>
          );
        }

        return (
          <div class="jv-widget" key={i}>
            {live || !w.editable ? (
              <span class="jv-widget__value">{formatValue(value, w.format)}</span>
            ) : (
              <InlineEdit
                value={w.value}
                display={formatValue(w.value, w.format)}
                class="jv-widget__value"
                onCommit={(v) => saveWidget(i, { value: v })}
              />
            )}
            <span class="jv-widget__label">
              {w.label}
              {live && <em class="jv-live">live</em>}
            </span>
            {w.hint && <span class="jv-widget__hint">{w.hint}</span>}
          </div>
        );
      })}
      {note && <p class="jv-dashboard__note">{note}</p>}
    </div>
  );
}

function TrackerFolio({ folio, onSave }) {
  const { columns = [] } = folio.content || {};
  const rows = folio.content?.rows || [];
  const [draft, setDraft] = useState(() => columns.map(() => ''));
  const [editCell, setEditCell] = useState(null); // [row, col]
  const [cellDraft, setCellDraft] = useState('');

  const saveRows = (next) => onSave({ content: { ...folio.content, rows: next } });

  const addRow = () => {
    if (!draft.some((c) => c.trim())) return;
    saveRows([...rows, draft.map((c) => c.trim())]);
    setDraft(columns.map(() => ''));
  };

  const commitCell = () => {
    if (!editCell) return;
    const [ri, ci] = editCell;
    const next = rows.map((r, i) =>
      i === ri ? columns.map((_, j) => (j === ci ? cellDraft.trim() : r[j] || '')) : r,
    );
    setEditCell(null);
    saveRows(next);
  };

  return (
    <div class="jv-tracker">
      <table>
        <thead>
          <tr>
            {columns.map((c) => <th key={c}>{c}</th>)}
            <th class="jv-tracker__rowctl" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {columns.map((_, ci) =>
                editCell && editCell[0] === ri && editCell[1] === ci ? (
                  <td>
                    <input
                      type="text"
                      value={cellDraft}
                      ref={(el) => el?.focus()}
                      onInput={(e) => setCellDraft(e.currentTarget.value)}
                      onBlur={commitCell}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitCell();
                        if (e.key === 'Escape') setEditCell(null);
                      }}
                    />
                  </td>
                ) : (
                  <td
                    class="jv-cell"
                    title="Click to edit"
                    onClick={() => {
                      setEditCell([ri, ci]);
                      setCellDraft(r[ci] || '');
                    }}
                  >
                    {r[ci] || ''}
                  </td>
                ),
              )}
              <td class="jv-tracker__rowctl">
                <button
                  type="button"
                  class="jv-x"
                  title="Delete row"
                  onClick={() => saveRows(rows.filter((_, i) => i !== ri))}
                >×</button>
              </td>
            </tr>
          ))}
          <tr class="jv-tracker__draft">
            {columns.map((c, j) => (
              <td key={c}>
                <input
                  type="text"
                  value={draft[j]}
                  placeholder={c}
                  onInput={(e) => {
                    const d = [...draft];
                    d[j] = e.currentTarget.value;
                    setDraft(d);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && addRow()}
                />
              </td>
            ))}
            <td class="jv-tracker__rowctl" />
          </tr>
        </tbody>
      </table>
      <button type="button" class="jv-minibtn" onClick={addRow}>+ add row</button>
    </div>
  );
}

function TodoFolio({ folio, onSave }) {
  const items = folio.content?.items || [];
  const [draft, setDraft] = useState('');
  const [editIdx, setEditIdx] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  const save = (next) => onSave({ content: { ...folio.content, items: next } });

  const addItem = () => {
    const t = draft.trim();
    if (!t) return;
    save([...items, { text: t, done: false }]);
    setDraft('');
  };

  const commitEdit = () => {
    const t = editDraft.trim();
    setEditIdx(null);
    if (t) save(items.map((x, j) => (j === editIdx ? { ...x, text: t } : x)));
  };

  return (
    <div class="jv-todo">
      {items.map((it, i) => (
        <div class={'jv-todo__item' + (it.done ? ' is-done' : '')} key={i}>
          <input
            type="checkbox"
            checked={it.done}
            onChange={() => save(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
          />
          {editIdx === i ? (
            <input
              class="jv-todo__editinput"
              type="text"
              value={editDraft}
              ref={(el) => el?.focus()}
              onInput={(e) => setEditDraft(e.currentTarget.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditIdx(null);
              }}
            />
          ) : (
            <span
              class="jv-todo__text"
              title="Double-click to edit"
              onDblClick={() => {
                setEditIdx(i);
                setEditDraft(it.text);
              }}
            >
              {it.text}
            </span>
          )}
          <button
            type="button"
            class="jv-x"
            title="Delete item"
            onClick={() => save(items.filter((_, j) => j !== i))}
          >×</button>
        </div>
      ))}
      <div class="jv-todo__add">
        <input
          type="text"
          value={draft}
          placeholder="Add an item…"
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
        />
      </div>
    </div>
  );
}

function PromptsFolio({ folio, onSave }) {
  const { intro, prompts = [] } = folio.content || {};
  const [answers, setAnswers] = useState(() => {
    const a = folio.content?.answers || [];
    return prompts.map((_, i) => a[i] || '');
  });

  const commit = () => onSave({ content: { ...folio.content, answers } });

  return (
    <div class="jv-prompts">
      {intro && <p class="jv-prompts__intro">{intro}</p>}
      <ol>
        {prompts.map((p, i) => (
          <li key={i}>
            <span class="jv-prompts__q">{p}</span>
            <textarea
              class="jv-prompts__answer"
              value={answers[i]}
              placeholder="Write your answer…"
              rows={2}
              onInput={(e) => {
                const next = [...answers];
                next[i] = e.currentTarget.value;
                setAnswers(next);
              }}
              onBlur={commit}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function NotesFolio({ folio, onSave, onRollover, registerEditor, onTick }) {
  const hostRef = useRef(null);
  const edRef = useRef(null);
  const saveRef = useRef(onSave);
  const rollRef = useRef(onRollover);
  const contentRef = useRef(folio.content);
  saveRef.current = onSave;
  rollRef.current = onRollover;
  contentRef.current = folio.content;

  useEffect(() => {
    // Older notes stored a plain `body` string; seed the editor with it once.
    const initial = folio.content?.doc || folio.content?.body || '';
    const ed = createNotesEditor(hostRef.current, initial, {
      onSave: (doc) => {
        // Pages END here: anything past the paper edge rolls to the next
        // page of the group before the trimmed doc is persisted.
        const moved = rollRef.current ? rolloverOverflow(ed, hostRef.current) : null;
        saveRef.current({ content: { ...contentRef.current, doc: moved ? ed.getJSON() : doc, body: undefined } });
        if (moved) rollRef.current(moved);
      },
      onTick,
      onFocus: () => registerEditor(folio.id, ed, { focus: true }),
    });
    edRef.current = ed;
    registerEditor(folio.id, ed);

    // Legacy/overlong docs: trim once the page has laid out.
    const raf = requestAnimationFrame(() => {
      if (ed.isDestroyed || !rollRef.current) return;
      const moved = rolloverOverflow(ed, hostRef.current);
      if (moved) {
        saveRef.current({ content: { ...contentRef.current, doc: ed.getJSON(), body: undefined } });
        rollRef.current(moved);
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      registerEditor(folio.id, null);
      ed.destroy();
    };
  }, [folio.id]);

  // A rollover can land in a folio that's already on screen — refresh its
  // editor when content changes underneath it (never mid-typing).
  useEffect(() => {
    const ed = edRef.current;
    if (!ed || ed.isDestroyed || ed.isFocused) return;
    const doc = folio.content?.doc;
    if (doc && typeof doc === 'object' && JSON.stringify(doc) !== JSON.stringify(ed.getJSON())) {
      ed.commands.setContent(doc);
    }
  }, [folio.content?.doc]);

  return (
    <div class="rt-host">
      <div class="rt-prose" ref={hostRef} />
    </div>
  );
}

const RENDERERS = {
  dashboard: DashboardFolio,
  tracker: TrackerFolio,
  todo: TodoFolio,
  prompts: PromptsFolio,
  notes: NotesFolio,
};

const TYPE_LABELS = {
  dashboard: 'dashboard',
  tracker: 'log',
  todo: 'list',
  prompts: 'prompts',
  notes: 'notes',
};

/* ── À la carte page picker ──────────────────────────────────────────
   Add any blank page type, or borrow a single prefab page from any
   template, into the open journal. */

const BLANK_PAGES = [
  { label: 'Notes', folio: { type: 'notes', title: 'Notes', content: { body: '' } } },
  { label: 'To-do list', folio: { type: 'todo', title: 'List', content: { items: [] } } },
  {
    label: 'Log',
    folio: { type: 'tracker', title: 'Log', content: { columns: ['Date', 'Entry', 'Notes'], rows: [] } },
  },
];

function AddPageModal({ onClose, onPick }) {
  return (
    <div class="jr-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="jr-modal" role="dialog" aria-label="Add page" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2 class="jr-modal__title">add a page</h2>

        <div class="jr-field">
          <span class="jr-field__label">blank pages</span>
          <div class="jv-pagepick">
            {BLANK_PAGES.map((b) => (
              <button type="button" key={b.label} class="jv-pagepick__item" onClick={() => onPick(b.folio)}>
                <span class="jv-pagepick__name">{b.label}</span>
                <span class="jv-pagepick__from">blank</span>
              </button>
            ))}
          </div>
        </div>

        {TEMPLATES.filter((t) => t.folios.length).map((t) => (
          <div class="jr-field" key={t.id}>
            <span class="jr-field__label">from {t.name}</span>
            <div class="jv-pagepick">
              {t.folios.map((f) => (
                <button
                  type="button"
                  key={f.title}
                  class="jv-pagepick__item"
                  onClick={() => onPick(JSON.parse(JSON.stringify(f)))}
                >
                  <span class="jv-pagepick__name">{f.title}</span>
                  <span class="jv-pagepick__from">{TYPE_LABELS[f.type] || f.type}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div class="jr-modal__actions">
          <button type="button" class="jr-btn" onClick={onClose}>cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ── Page + spread ───────────────────────────────────────────────────── */

function FolioPage({ folio, siblings, pageUrl, onSave, onDelete, onRollover, registerEditor, onTick }) {
  if (!folio) return <div class="jv-page jv-page--empty" />;
  const Renderer = RENDERERS[folio.type] || NotesFolio;
  // Notes pages have a hard end (overflow rolls over); other types scroll.
  const fixed = folio.type === 'notes';
  return (
    <div class="jv-page" style={pageUrl ? { backgroundImage: `url(${pageUrl})` } : undefined}>
      <div class={'jv-page__paper' + (fixed ? ' jv-page__paper--fixed' : '')}>
        <header class="jv-page__head">
          <h3>{folio.title}</h3>
          <span class="jv-page__type">
            {TYPE_LABELS[folio.type] || folio.type}
            {onDelete && (
              <button type="button" class="jv-x" title="Remove this page" onClick={onDelete}>×</button>
            )}
          </span>
        </header>
        <div class="jv-page__body">
          <Renderer folio={folio} siblings={siblings} onSave={onSave} onRollover={onRollover} registerEditor={registerEditor} onTick={onTick} />
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar: pagegroup jumps + linked project files ─────────────────── */

function Sidebar({ open, query, setQuery, groups, currentIdx, onJumpGroup, projects }) {
  const q = query.trim().toLowerCase();
  const visible = groups
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => !q || g.title.toLowerCase().includes(q));
  const visibleProjects = projects.filter((p) => !q || p.name.toLowerCase().includes(q));

  const openFile = (file) => {
    if (file?.path) window.electronAPI?.openPath?.(file.path);
  };

  return (
    <aside class={'jvs' + (open ? '' : ' is-closed')}>
      <div class="jvs__top">
        <input
          class="jvs__search"
          type="text"
          value={query}
          placeholder="search"
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
        <div class="jvs__groups">
          {visible.map(({ g, i }) => (
            <button
              type="button"
              key={`${g.key}-${g.start}`}
              class={'jvs__group' + (i === currentIdx ? ' is-current' : '')}
              title={g.folios.length > 1 ? `${g.folios.length} pages` : '1 page'}
              onClick={() => onJumpGroup(g)}
            >
              {g.title}
            </button>
          ))}
          {!visible.length && <p class="jvs__hint">No pages match.</p>}
        </div>
      </div>

      <div class="jvs__files">
        <h4 class="jvs__filehead">project files</h4>
        {visibleProjects.map((p) => (
          <div class="jvs__proj" key={p.id || p.name}>
            <span class="jvs__projname">{p.name}</span>
            {projectFileRows(p).map(({ file, dups }) => (
              <div class="jvs__filerow" key={file.id || file.path || file.name}>
                <button
                  type="button"
                  class="jvs__file"
                  title={file.path || file.name}
                  onClick={() => openFile(file)}
                >
                  {file.name}
                </button>
                {dups > 1 && <span class="jvs__dup">{dups} duplicates?</span>}
              </div>
            ))}
          </div>
        ))}
        {!projects.length && (
          <p class="jvs__hint">Mention a canvas project with <strong>@Name</strong> on any page to link its files here.</p>
        )}
      </div>
    </aside>
  );
}

/* ── Bottom bar: group chip · page jumper · group tag strip ──────────── */

function PageJumper({ group, page, onJump }) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page, group?.key, group?.start]);
  if (!group) return null;

  const commit = () => {
    const n = Math.max(1, Math.min(group.folios.length, parseInt(draft, 10) || page));
    setDraft(String(n));
    if (n !== page) onJump(group.folios[n - 1]);
  };

  return (
    <span class="jvb__pageno">
      pg.{' '}
      <input
        class="jvb__pageinput"
        type="text"
        inputMode="numeric"
        value={draft}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(String(page));
        }}
      />{' '}
      of {group.folios.length}
    </span>
  );
}

function TagStrip({ tags, onSave }) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const t = draft.trim().replace(/^#/, '').replace(/,+$/, '');
    setDraft('');
    if (!t) return;
    // Tags must be meaningfully different words — dedupe case-insensitively.
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    onSave([...tags, t]);
  };

  return (
    <div class="jvb__tags" title="Pagegroup tags">
      {tags.map((t) => (
        <span class="jr-tag" key={t}>
          {t}
          <button type="button" class="jr-tag__x" aria-label={`Remove ${t}`} onClick={() => onSave(tags.filter((x) => x !== t))}>×</button>
        </span>
      ))}
      <input
        class="jvb__taginput"
        type="text"
        value={draft}
        placeholder={tags.length ? '' : 'tag…'}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onSave(tags.slice(0, -1));
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

export function JournalView({ journal, pageUrl, coverUrl, onBack }) {
  const [folios, setFolios] = useState(null); // null = loading
  const [spread, setSpread] = useState(0);
  const [adding, setAdding] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sideQuery, setSideQuery] = useState('');
  const [canvasProjects, setCanvasProjects] = useState([]);
  const [, setTick] = useState(0); // re-renders the shared toolbar on editor transactions

  // Async handlers (rollover) need the current list without stale closures.
  const foliosRef = useRef(null);
  foliosRef.current = folios;

  // Live notes editors, keyed by folio id; the shared toolbar binds to the
  // focused one (or the first visible one).
  const editorsRef = useRef(new Map());
  const [activeEditorId, setActiveEditorId] = useState(null);

  const registerEditor = (folioId, editorInstance, opts) => {
    if (editorInstance) {
      editorsRef.current.set(folioId, editorInstance);
      if (opts?.focus) setActiveEditorId(folioId);
      else setTick((t) => t + 1); // mounted: make toolbar appear
    } else {
      editorsRef.current.delete(folioId);
      setActiveEditorId((id) => (id === folioId ? null : id));
    }
  };

  const onEditorTick = () => setTick((t) => t + 1);

  useEffect(() => {
    api.foliosList(journal.id).then(setFolios).catch((err) => {
      console.error('folios:list failed', err);
      setFolios([]);
    });
  }, [journal.id]);

  // Canvas projects (legacy library store) for @mention file linking.
  useEffect(() => {
    window.electronAPI?.loadState?.()
      .then((s) => setCanvasProjects(Array.isArray(s?.projects) ? s.projects : []))
      .catch(() => {});
  }, []);

  const spreadCount = useMemo(() => Math.max(1, Math.ceil((folios?.length || 0) / 2)), [folios]);
  const left = folios?.[spread * 2];
  const right = folios?.[spread * 2 + 1];

  /* Pagegroups + the group under the reading eye (left page wins). */
  const groups = useMemo(() => computeGroups(folios), [folios]);
  const activeFolio = left || right;
  const activeGroupIdx = activeFolio
    ? groups.findIndex((g) => g.folios.some((f) => f.id === activeFolio.id))
    : -1;
  const activeGroup = activeGroupIdx >= 0 ? groups[activeGroupIdx] : null;
  const activePage = activeGroup
    ? activeGroup.folios.findIndex((f) => f.id === activeFolio.id) + 1
    : 0;

  const jumpToFolio = (target) => {
    const idx = (foliosRef.current || []).findIndex((f) => f.id === target.id);
    if (idx >= 0) setSpread(Math.floor(idx / 2));
  };

  /* Journal text → linked canvas projects (sidebar "project files"). */
  const linkedProjects = useMemo(() => {
    if (!folios?.length || !canvasProjects.length) return [];
    const text = folios.map(folioText).join('\n').toLowerCase();
    return canvasProjects.filter((p) => p.name && text.includes('@' + p.name.toLowerCase()));
  }, [folios, canvasProjects]);

  /* Group tags live on the group's first folio (content.groupTags). */
  const activeTags = activeGroup?.folios[0]?.content?.groupTags || [];
  const saveActiveTags = (tags) => {
    if (!activeGroup) return;
    const first = activeGroup.folios[0];
    saveFolio(first)({ content: { ...first.content, groupTags: tags } });
  };

  /* Overflowing notes hand their surplus blocks here: prepend to the next
     page of the group, or grow the group by one page right after. */
  const handleRollover = (folio) => (movedNodes) => {
    const list = foliosRef.current || [];
    const idx = list.findIndex((f) => f.id === folio.id);
    const next = idx >= 0 ? list[idx + 1] : null;

    if (next && groupKeyOf(next) === groupKeyOf(folio)) {
      // Legacy `body` strings can't be merged; the JSON doc wins.
      const existing = next.content?.doc && typeof next.content.doc === 'object'
        ? next.content.doc.content || []
        : [];
      const patch = {
        content: { ...next.content, doc: { type: 'doc', content: [...movedNodes, ...existing] }, body: undefined },
      };
      setFolios((prev) => prev.map((f) => (f.id === next.id ? { ...f, ...patch } : f)));
      api.foliosUpdate(next.id, patch).catch((err) => console.error('rollover update failed', err));
    } else {
      const spec = {
        type: folio.type,
        title: folio.title,
        content: { doc: { type: 'doc', content: movedNodes } },
      };
      api.foliosCreate(journal.id, spec, { afterId: folio.id }).then((created) => {
        setFolios((prev) => {
          const i = (prev || []).findIndex((f) => f.id === folio.id);
          const nextList = [...(prev || [])];
          nextList.splice(i + 1, 0, created);
          return nextList;
        });
      }).catch((err) => console.error('rollover create failed', err));
    }
  };

  // Toolbar binds to the focused notes editor on this spread, else the first one.
  const visibleNoteIds = [left, right].filter((f) => f?.type === 'notes').map((f) => f.id);
  const toolbarId = visibleNoteIds.includes(activeEditorId) ? activeEditorId : visibleNoteIds[0];
  const toolbarEditor = toolbarId ? editorsRef.current.get(toolbarId) : null;

  const addPage = (spec) => {
    api.foliosCreate(journal.id, spec).then((created) => {
      setFolios((prev) => {
        const next = [...(prev || []), created];
        setSpread(Math.floor((next.length - 1) / 2)); // jump to the new page
        return next;
      });
      setAdding(false);
    }).catch((err) => console.error('folios:create failed', err));
  };

  const deleteFolio = (folio) => () => {
    if (!window.confirm(`Remove the page “${folio.title}”? Its contents will be lost.`)) return;
    api.foliosDelete(folio.id).then(() => {
      setFolios((prev) => {
        const next = prev.filter((f) => f.id !== folio.id);
        setSpread((s) => Math.min(s, Math.max(0, Math.ceil(next.length / 2) - 1)));
        return next;
      });
    }).catch((err) => console.error('folios:delete failed', err));
  };

  const saveFolio = (folio) => (patch) => {
    // Optimistic local update so live dashboard widgets refresh instantly.
    setFolios((prev) => prev.map((f) => (f.id === folio.id ? { ...f, ...patch } : f)));
    api.foliosUpdate(folio.id, patch).then((updated) => {
      setFolios((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    }).catch((err) => console.error('folios:update failed', err));
  };

  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack arrows/Escape while typing in a field or the editor.
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') onBack();
      if (e.key === 'ArrowLeft') setSpread((s) => Math.max(0, s - 1));
      if (e.key === 'ArrowRight') setSpread((s) => Math.min(spreadCount - 1, s + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spreadCount, onBack]);

  return (
    <div class="jv-root">
      {coverUrl && (
        <div
          class="jv-backdrop"
          style={{ backgroundImage: `url(${coverUrl})` }}
          aria-hidden="true"
        />
      )}
      <div class="jv-topbar">
        <button type="button" class="jr-btn" onClick={onBack}>← shelf</button>
        <h2 class="jv-title">{journal.title}</h2>
        <button type="button" class="jr-btn" onClick={() => setAdding(true)}>+ page</button>
        <span class="jv-pageno">
          {folios?.length ? `spread ${spread + 1} / ${spreadCount}` : ''}
        </span>
      </div>

      {folios === null && <p class="jr-empty">Opening…</p>}

      {folios?.length === 0 && (
        <p class="jr-empty">No pages yet — press <strong>+ page</strong> to add one.</p>
      )}

      {folios?.length > 0 && (
        <div class="jv-main">
          <Sidebar
            open={sidebarOpen}
            query={sideQuery}
            setQuery={setSideQuery}
            groups={groups}
            currentIdx={activeGroupIdx}
            onJumpGroup={(g) => jumpToFolio(g.folios[0])}
            projects={linkedProjects}
          />
          <button
            type="button"
            class="jvs-toggle"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >{sidebarOpen ? '‹' : '›'}</button>

          <div class="jv-center">
            <div class="jv-book">
              <button
                type="button"
                class="jv-nav"
                disabled={spread === 0}
                onClick={() => setSpread(spread - 1)}
                aria-label="Previous spread"
              >‹</button>

              <div class="jv-spread">
                <FolioPage
                  folio={left}
                  siblings={folios}
                  pageUrl={pageUrl}
                  onSave={left ? saveFolio(left) : undefined}
                  onDelete={left ? deleteFolio(left) : undefined}
                  onRollover={left ? handleRollover(left) : undefined}
                  registerEditor={registerEditor}
                  onTick={onEditorTick}
                />
                <div class="jv-spine" />
                <FolioPage
                  folio={right}
                  siblings={folios}
                  pageUrl={pageUrl}
                  onSave={right ? saveFolio(right) : undefined}
                  onDelete={right ? deleteFolio(right) : undefined}
                  onRollover={right ? handleRollover(right) : undefined}
                  registerEditor={registerEditor}
                  onTick={onEditorTick}
                />
              </div>

              {toolbarEditor && <EditorToolbar editor={toolbarEditor} key={toolbarId} />}

              <button
                type="button"
                class="jv-nav right"
                disabled={spread >= spreadCount - 1}
                onClick={() => setSpread(spread + 1)}
                aria-label="Next spread"
              >›</button>
            </div>

            <div class="jvb">
              {activeGroup && <span class="jvb__chip">{activeGroup.title}</span>}
              <PageJumper
                group={activeGroup}
                page={activePage}
                onJump={jumpToFolio}
              />
              {activeGroup && <TagStrip tags={activeTags} onSave={saveActiveTags} />}
            </div>
          </div>
        </div>
      )}

      {adding && <AddPageModal onClose={() => setAdding(false)} onPick={addPage} />}
    </div>
  );
}
