# Keeper — Engineering Build Specification

> **Product:** Keeper (codebase formerly *Projungle*)
> **Distill:** the in‑app AI / agent service brand (managed or bring‑your‑own model)
> **Doc status:** Draft v0.1 · **Date:** 2026‑06‑09 · **Scope:** Full expansion (all five tabs + Settings)
> **Audience:** Engineering — this is a build‑ready specification, not a marketing PRD.

---

## 0. How to read this document

This spec describes the expansion of the existing Projungle Electron app into **Keeper**, a local‑first AI knowledge workspace organized as a five‑tab shell: **journals · canvas · agents · notefalls · recents**, plus a full Settings system and a right‑hand "sidecar" browser.

- **Sections 1–4** establish vision, goals, the *current* (baseline) architecture, and the *target* architecture.
- **Sections 5–14** specify each surface (the five tabs + every Settings pane), each with a data model, behavior, IPC, and acceptance criteria.
- **Sections 15–18** consolidate the data model, the full IPC surface, persistence/migration, and security.
- **Sections 19–20** give a phased delivery plan and the open questions/risks.
- **Appendix A** is a screenshot → feature traceability table.

Everything in §3 ("Current Architecture") is verified against the present code (`main.js`, `preload.js`, `src/app.js`, `src/index.html`, `src/styles.css`). Everything from §4 onward is *proposed* and is the actual subject of this build.

---

## 1. Vision

Projungle today is a **passive file organizer**: drop files onto one infinite canvas and they cluster into project cards. Keeper turns that single canvas into one surface of an **active, agent‑driven knowledge workspace**:

- **journals** group projects into notebooks/folders.
- **canvas** stays the spatial home for a journal's projects (the existing infinite forest).
- **agents** introduces persistent AI agents that execute scheduled and on‑demand tasks.
- **notefalls** is a fast journaling/microblog stream that agents can also post into.
- **recents** is a unified activity feed.
- **Settings** gains a real backbone: AI provider configuration (Distill or BYO), Context (RAG), MCP tools, Vault (secrets), Memories (agent long‑term memory), plus Appearance, Shortcuts, Backup, and License.

**North‑star principle (inherited, must not break):** *Keeper never moves or mutates a user's original files unless explicitly asked.* Files stay where they are on disk; Keeper indexes and references them.

---

## 2. Goals & Non‑Goals

### 2.1 Engineering goals

1. Introduce a **tabbed shell + view router** without throwing away the bespoke canvas/viewer/timeline code.
2. Add a **journal foldering layer** above projects; journals act as a **filter lens** over the single canvas (not a partition).
3. Build a **persistent agent runtime** (scheduling, execution, tool use, streaming status) in the main process.
4. Add an **AI gateway** that abstracts the model provider (Distill managed service *or* any OpenAI‑compatible endpoint) with tiered model routing (default / small / large).
5. Add **Context (RAG)**: mount folders, index `.txt`/`.md`, make them searchable and injectable into agent prompts.
6. Add an **MCP host** so agents can call external tools.
7. Add **notefalls** (user + agent posts) and **recents** (activity aggregation).
8. Evolve persistence from the single `library.json` into a **versioned, queryable store** with a safe migration path.
9. Store all secrets in a **Vault** backed by the OS keychain; the renderer never holds API keys.

### 2.2 Non‑goals (this scope)

- Real‑time multi‑user collaboration / sharing.
- Mobile or web builds (Keeper remains a desktop Electron app).
- Cloud sync of the library itself (beyond what the optional Distill service provides).
- Replacing the file system as the source of truth for user files.
- A plugin marketplace (MCP covers external tools for now).

---

## 3. Current Architecture (verified baseline)

### 3.1 Stack & process model

| Concern | Current implementation |
|---|---|
| Framework | **Electron ^41.2.1** (`package.json`). No UI framework, no bundler, no build step. |
| Main process | `main.js` (~555 LOC): window creation + all Node/file work + IPC handlers. |
| Preload bridge | `preload.js` (14 LOC): `contextBridge.exposeInMainWorld('electronAPI', {…})`. |
| Renderer | `src/index.html` (~94 LOC) + `src/app.js` (~2,970 LOC, single file) + `src/styles.css` (~2,814 LOC). |
| Windows | A single `BrowserWindow` (1600×1000, `backgroundColor: #0b1020`, frameless: `titleBarStyle: 'hidden'`). |
| Hardening | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`. CSP locked to `'self'` (+ `data:`/`file:` for media). |

**Implication:** a 2,970‑line single renderer file with global DOM lookups and a global `state` object cannot absorb five tabs, a settings system, and an agent UI without a structural refactor. §4 addresses this.

### 3.2 Persistence (current)

- File: `projungle.library.json` in `app.getPath('userData')`.
- Shape: `{ version: 1, viewport: { x, y, scale }, projects: [] }`.
- Saved from the renderer via a debounced `saveState(serializeState())`; loaded on `init()`.

**Project record (renderer `state.projects[]`):** `id`, `name`, `accent`, `accentRgb`, `files[]`, `tags[]`, `coverFileId`, `coverPosition`, `createdAt`, plus timeline `milestones[]` and a per‑project position/viewport for canvas layout.

**File record (`buildFileRecord` in `main.js`):**
`{ id, name, path, ext, size, modifiedAt, typeGroup, previewable, tags, projectHint }`
where `typeGroup ∈ {image, video, audio, pdf, document, spreadsheet, slides, design, code, archive, model, data, other}` (see `EXT_GROUPS`).

### 3.3 IPC surface (current — all 10 channels)

| `electronAPI` method | Channel | Main handler | Purpose |
|---|---|---|---|
| `loadState()` | `library:load` | `loadState` | Read library JSON. |
| `saveState(state)` | `library:save` | `saveState` | Persist library JSON. |
| `importPaths(paths)` | `library:importPaths` | `importDroppedPaths` | Walk dropped files/folders → project groups (smart naming, type grouping). |
| `openPath(p)` | `shell:openPath` | `shell.openPath` | Open a file in its OS app. |
| `showItemInFolder(p)` | `shell:showItemInFolder` | `shell.showItemInFolder` | Reveal in Finder/Explorer. |
| `hunterSearch(keywords, exclude, dirs)` | `hunter:search` | `hunterSearch` | Keyword search across default dirs. |
| `hunterDefaultDirs()` | `hunter:defaultDirs` | `hunterDefaultDirs` | Desktop/Documents/Downloads/Pictures/Movies/Music. |
| `openDirectoryDialog()` | `dialog:openDirectory` | `dialog.showOpenDialog` | Pick a folder (already used by Hunter; reused by Context). |
| `filehawkCheck(paths)` | `filehawk:check` | `filehawkCheck` | Confirm referenced files still exist. |
| `consolidateProject(name, paths)` | `consolidate:project` | `consolidateProject` | Copy a project's files into `~/Documents/projungle/projects/<name>`. |

### 3.4 Feature inventory (what already works)

- **Infinite canvas**: pan/zoom `#world` via a `viewport {x,y,scale}` transform over a dot‑grid `#grid`; `fit`/`reset` view.
- **Project cards**: cover image, preview grid, file rows, activity badge, expand/collapse.
- **Project Viewer overlay**: hero, tag filters, and a **milestone Timeline** with multi‑tier time axis (years→months→days→hours), zoom, pan, ghost/pending node creation.
- **Hunter**: searches the filesystem for related files by keyword and offers to attach them.
- **FileHawk**: periodically checks that referenced files still exist.
- **Consolidate**: copies a project's scattered files into one folder on request.
- **Tag strip, global search, dim mode, custom triangle cursor, aurora background.**

These must continue to work, relocated under the **canvas** tab (§7).

---

## 4. Target Architecture

### 4.1 Architecture decision: renderer structure

**Problem:** one 2,970‑line `app.js` + one global `state` cannot host five tabs, settings, and live agent UI.

**Decision:** introduce a **module structure + a lightweight view router + a single observable store**, and add a minimal build step.

- **Recommended:** adopt **Vite** + a small component layer (Preact *or* Svelte). Rationale: the agent/planner/notefalls UIs are state‑heavy and benefit from declarative components and reactivity; Vite keeps startup fast and gives HMR.
- **Lower‑risk alternative:** stay vanilla, but split `app.js` into **ES modules** behind a hand‑rolled reactive store and a hash/route switch. Preserves the hand‑tuned canvas exactly; costs more boilerplate for the new screens.
- **Constraint either way:** the **canvas** module keeps its imperative DOM/transform code essentially intact (it is performance‑sensitive and already tuned). New surfaces are built in the chosen component model; canvas is wrapped, not rewritten.

> This is the one decision that should be ratified before P0 starts (see §20). The rest of the spec is written to be framework‑agnostic: "component" means a Preact/Svelte component or a vanilla view module.

### 4.2 Proposed module layout

```
src/
  main/
    index.js              # app/window lifecycle (from today's main.js)
    ipc/                  # one file per IPC domain (registers handlers)
    services/
      library.js          # projects/files (today's import/consolidate/hawk/hunter)
      journals.js         # NEW: journal CRUD + project membership
      store.js            # NEW: versioned persistence (SQLite + files)
      vault.js            # NEW: secrets via safeStorage / keychain
    ai/
      gateway.js          # NEW: provider abstraction + tier routing
      providers/openai.js # OpenAI-compatible client (covers Ollama, etc.)
      providers/distill.js# Distill managed service client
    agents/
      runtime.js          # NEW: scheduler + execution loop (utility process)
      tools.js            # NEW: built-in tool registry exposed to agents
    mcp/
      host.js             # NEW: MCP client/host, server lifecycle, tool proxy
    context/
      indexer.js          # NEW: mount, watch, chunk, embed/index .txt/.md
  renderer/
    shell/                # tab bar, routing, sidecar, window chrome
    tabs/journals/        # NEW
    tabs/canvas/          # WRAPS today's app.js canvas/viewer/timeline
    tabs/agents/          # NEW (inbox, planner, lists, agent detail)
    tabs/notefalls/       # NEW (composer, feed, date-rail)
    tabs/recents/         # NEW
    settings/             # NEW: one component per pane (§11–14)
    sidecar/              # NEW: browser/search/memories panel
    store/                # renderer-side observable state + IPC client
    components/           # shared UI (cards, menus, date picker, dialogs)
  preload.js              # expanded electronAPI (namespaced by domain)
```

### 4.3 Process & threading

- **Main process** owns all privileged work: file I/O, store, Vault, AI gateway, MCP host, context indexer.
- **Agent runtime** runs in a **`utilityProcess`** (or a hidden worker) so long‑running agent loops and model streaming never block the UI thread. It talks to the AI gateway and tool registry in main and streams status events to the renderer.
- **Renderer** is presentation + local interaction only. It never makes network calls and never holds secrets; everything goes through `electronAPI`.

### 4.4 Persistence evolution (summary; full detail §17)

- Keep **user files on disk untouched** (north‑star principle).
- Move app data from one JSON blob to a **versioned local store**. **Recommended: SQLite via `better-sqlite3`** for the queryable entities (tasks, posts, memories, recents, search index), while large/loose blobs (timeline, settings) may stay as JSON columns.
- Provide a **v1 → v2 migration** that imports the existing `library.json` (projects/files/viewport) into the new store and assigns every existing project to a default **"Unsorted"** journal.

### 4.5 Security posture (summary; full detail §18)

- API keys/tokens live in the **Vault** (Electron `safeStorage`, OS keychain). The renderer receives only booleans like `hasKey`, never the secret.
- Outbound network is allowed **only** from main, **only** to the configured model endpoint (Distill or BYO) and configured MCP servers.
- Tool calls that touch the filesystem or network require an explicit, auditable consent model (§8.6, §13).
- CSP in `index.html` stays `'self'`; no remote origins are added to the renderer.

---

## 5. Navigation Shell (tabs + sidecar)

The window chrome is a top tab bar with five tabs and an optional right‑hand sidecar.

### 5.1 Tab bar

- Tabs, fixed order: **journals · canvas · agents · notefalls · recents**.
- Exactly one tab active; active tab label is bright, others dimmed (per screenshots).
- Each tab is a route. The router preserves each tab's scroll/selection state when switching away and back (the canvas keeps its `viewport`; the planner keeps its filter; etc.).
- **Deep links between tabs:** opening a journal (journals tab) navigates to **canvas** with that journal applied as a filter. Clicking a project's source in **recents** opens it in **canvas** (or the sidecar). A task's "open result" can jump to **notefalls** or a file.
- Keyboard: `⌘1…⌘5` select tabs; `⌘,` opens Settings; `⌘K` global search (feeds the sidecar). Full keymap is owned by Settings → Shortcuts (§14.4).

### 5.2 Sidecar (right panel / "New tab")

A collapsible right panel that overlays content without leaving the active tab.

- **New tab** state shows: a **Search** entry, an **Experiments** group containing **Memories** (§14.2), and a **Documentation** link.
- "You can click on an entry to open it in the sidecar" — search results, a memory, a doc page, or a referenced URL render inside the sidecar so the user keeps their place in the main tab.
- The sidecar is a constrained web view; it obeys the same outbound‑network rules (documentation/allowed origins only) and never receives secrets.

### 5.3 Shell state & acceptance

- Shell state: `{ activeTab, sidecarOpen, sidecarRoute, canvasJournalFilter }`, persisted so the app reopens where the user left it (`canvasJournalFilter: null` = canvas shows all projects).
- **AC‑5.1** Switching tabs is instant and non‑destructive (no reload, no lost scroll/selection).
- **AC‑5.2** `⌘1…⌘5`, `⌘,`, `⌘K` work from any tab.
- **AC‑5.3** Opening a journal lands on the canvas tab with that journal active.
- **AC‑5.4** Closing the app and reopening restores `activeTab`, `canvasJournalFilter`, and sidecar state.

---

## 6. Tab: Journals

A grid of notebooks ("journals") that group projects. This is the new top of the hierarchy: **Journal → Projects → Files**.

### 6.1 Data model

```
Journal {
  id: string
  name: string                 // "Code/Dev", "Poetry", "Ideas to Share"
  icon: enum|customAssetId      // skeuomorphic folder art (see Appearance)
  color: string                 // accent
  cover: { kind: 'art'|'image', ref } 
  projectIds: string[]          // membership (a project belongs to exactly one journal)
  sort: number
  createdAt, updatedAt: ISO
  isSystem: boolean             // true for "Unsorted"
}
```

- A default **"Unsorted"** journal (`isSystem: true`) always exists and cannot be deleted; it receives newly imported projects and projects whose journal is deleted.
- Project count badge = `projectIds.length` (e.g., "Code/Dev — 17 Projects").

### 6.2 Behavior

- Grid of folder tiles with name, art, and project count; a **+ new** tile creates a journal (name + icon/color picker).
- Click a tile (or its → affordance) → navigate to **canvas** with that journal applied as the active filter (§7); the canvas still contains every project — the filter just narrows what's shown.
- Move a project between journals via drag‑drop or a context action; dropping files/folders **onto a journal tile** imports them as projects into that journal (reuses `library:importPaths`).
- Rename, recolor, re‑icon, reorder (drag), archive/delete (with reassignment to Unsorted).

### 6.3 IPC

`journals:list`, `journals:create`, `journals:update`, `journals:delete`, `journals:reorder`, `journals:addProjects`, `journals:moveProject`.

### 6.4 Acceptance

- **AC‑6.1** A fresh install shows "Unsorted"; first import lands there.
- **AC‑6.2** Creating, renaming, recoloring, reordering, and deleting journals persists across restart.
- **AC‑6.3** Deleting a journal reassigns its projects to Unsorted (never deletes user files).
- **AC‑6.4** Dropping a folder on a journal tile imports it as a project in that journal.
- **AC‑6.5** Project counts are always accurate.

---

## 7. Tab: Canvas (extend existing)

The existing infinite forest, showing **all projects across every journal**. Journals are a **filter lens, not a partition**: by default the canvas renders the whole library; selecting a journal narrows the visible cards. This tab reuses today's canvas/viewer/timeline code with minimal, surgical changes.

### 7.1 Filtering model

- The canvas maintains a composable **filter state**: `{ journalId: string|null, query: string, tags: string[] }`. `journalId: null` = show everything.
- Journal, search, and tag filters **compose** (e.g., journal "Code/Dev" + tag `#wip` + query "parser"). Clearing the journal filter returns to the full canvas.
- A filter bar/breadcrumb shows the active journal (and any other active filters) with one‑click clear and a journal switcher — all without leaving the tab.
- The canvas keeps a **single global `viewport {x,y,scale}`** (today's behavior); changing the journal filter does **not** reset pan/zoom. Cards filtered out fade away rather than relayout the survivors' positions, so spatial memory is preserved.

### 7.2 Membership

- Each project is filed in exactly one journal (folder‑like; default **Unsorted**) — that membership is what the journal filter keys on. **Tags** remain many‑per‑project and orthogonal to journals.
- Project creation/import on the canvas files the new project into the currently filtered journal, or **Unsorted** when no journal filter is active.
- Whether journals should instead allow multi‑membership (fully tag‑like) is an open question — see §20.

### 7.3 Preserved features (must not regress)

Pan/zoom, fit/reset, project cards (cover, preview grid, file rows, activity), the **Project Viewer** overlay, the **milestone Timeline** (multi‑tier axis, zoom/pan, node creation), **Hunter**, **FileHawk**, **Consolidate**, tag strip, search, dim mode, custom cursor.

### 7.4 IPC

Reuses `library:*`, `hunter:*`, `filehawk:check`, `consolidate:project`, `shell:*`. Journal membership/filtering is handled renderer‑side over `journals:*`; no new canvas‑specific channels required.

### 7.5 Acceptance

- **AC‑7.1** With no filter active, the canvas shows every project in the library.
- **AC‑7.2** Selecting a journal filters the visible cards to that journal; clearing it restores the full set **without changing pan/zoom**.
- **AC‑7.3** Journal + tag + search filters compose correctly.
- **AC‑7.4** Viewer, Timeline, Hunter, FileHawk, Consolidate behave exactly as before.
- **AC‑7.5** Importing on the canvas files the project into the active journal filter (or Unsorted).

---

## 8. Tab: Agents (core new capability)

Persistent AI agents that execute scheduled and on‑demand tasks. The tab has a left rail (**Inbox**, **Planner**, **Settings**, an **Agents** list, and user **Lists**) and a main pane showing a status pipeline + grouped tasks, plus a task‑edit popover.

### 8.1 Concepts & data model

```
Agent {
  id, name, avatarRef,
  persona: string                       // system prompt / character
  state: 'settling-in'|'idle'|'working'|'sleeping'|'error'
  modelTier: 'small'|'large'|'default'  // which tier this agent runs at
  tools: string[]                       // enabled tool ids (built-in + MCP)
  workHours: { tz, days[], start, end } // gates proactive/scheduled runs
  contextMounts: string[]               // Context folder ids visible to it
  createdAt, updatedAt
}

Task {
  id, title, notes,
  listId: string|null,
  assigneeAgentId: string|null,         // null = unassigned/user task
  status: 'inbox'|'scheduled'|'running'|'done'|'failed',
  due: ISO|null,
  repeat: 'none'|'daily'|'weekly'|'weekdays'|'custom-cron',
  tags: string[],                       // e.g. "work hours", "Poetry"
  subtasks: {id,title,done}[],
  result: { runId, summary, links[] }|null,
  createdAt, updatedAt, completedAt
}

List   { id, name, archived: boolean, sort }
AgentRun {
  id, taskId, agentId, startedAt, endedAt,
  status, steps: Step[], tokens, cost, error?
}
Step { kind:'model'|'tool', name, input, output, ts }
```

> Screenshot mapping: the four header cards are status counts — **running** (green ▶), **scheduled** (orange ⏰), **inbox** (tray), **done** (double‑check). "Neo — Settling in" is an `Agent` in the `settling-in` state. "work hours" is a tag/gate; "Does not repeat" + the **No due date / Today / Tomorrow / Next week / Pick a date** menu are the `due`/`repeat` editors.

### 8.2 Views

- **Inbox** — unassigned/untriaged tasks (`status:'inbox'`).
- **Planner** — tasks grouped by due bucket: **Today**, **Tomorrow**, **No due date** (matches screenshot), each row showing time, repeat, assignee, and tags. Header pipeline cards show live counts for running/scheduled/inbox/done.
- **Lists** — user‑created lists ("organize entries, group by topic, track tasks"), with **+ New list** and **Archived**.
- **Agents list** — each agent with avatar + state; an avatar cluster collapses overflow ("+1"). Clicking an agent opens its detail (persona, model tier, tools, work hours, recent runs).

### 8.3 Task editor (popover)

Inline popover (per screenshot): title, notes, **list**, **assignee agent**, **due** menu (No due date / Today / Tomorrow / Next week / Pick a date → date+time), **repeat** menu, **tags** (incl. "work hours"), subtasks. Edits autosave.

### 8.4 Agent runtime (main / utility process)

- **Triggers:** (a) **schedule** — `due` + `repeat` produce timer/cron fires, gated by the agent's `workHours`; (b) **manual run** from the UI; (c) **proactive** — idle agents may generate notefalls posts within work hours (§9.4), rate‑limited.
- **Execution loop:** build prompt (persona + task + injected Context §12 + relevant Memories §14.2) → call AI gateway at the agent's tier → if the model emits tool calls, dispatch to the tool registry (§8.5) → feed results back → iterate until completion or step/cost cap → write `result` + `AgentRun`, set task `done`/`failed`, set agent back to `idle`.
- **Streaming:** the runtime emits `agents:run:event` (step start/finish, token deltas, status) to the renderer so the pipeline cards and agent state update live.
- **Guards:** max steps per run, max tokens/cost per run and per day, wall‑clock timeout, and a hard stop on repeated identical tool calls (loop breaker). Cancellation via `agents:run:cancel`.

### 8.5 Built‑in tools (exposed to agents)

`search_context` (§12), `search_library`/`hunter`, `read_file`, `list_journal_projects`, `create_task`, `post_notefall` (§9), `write_file_to_outputs` (sandboxed dir only), `remember`/`recall` (§14.2), plus all MCP‑provided tools (§13). Each tool declares a JSON schema and a consent class (§8.6).

### 8.6 Consent & safety

- Tools are classed **read** (auto‑allowed), **write‑local** (writes only inside a Keeper‑owned outputs dir; never the user's originals), and **external** (network/MCP — require per‑agent enablement and, optionally, per‑run confirmation).
- Every run is fully logged as an `AgentRun` (auditable in the agent detail view).
- Agents cannot delete or overwrite user files. Period.

### 8.7 IPC

`agents:list/create/update/delete`, `agents:run`, `agents:run:cancel`, `agents:run:event` (event channel), `tasks:list/create/update/delete/complete`, `lists:list/create/update/archive`, `runs:list/get`.

### 8.8 Acceptance

- **AC‑8.1** Create an agent (name, persona, tier, tools, work hours); it appears with a state and persists.
- **AC‑8.2** Create a task, assign it to an agent, set due+repeat; it appears in the right Planner bucket.
- **AC‑8.3** A scheduled task fires within its agent's work hours, runs, streams steps, and lands a result; the pipeline counts update live.
- **AC‑8.4** Cancel a running task; the run stops and is marked failed/cancelled with a logged reason.
- **AC‑8.5** Step/cost/timeout guards halt runaway runs; loop breaker trips on repeated identical tool calls.
- **AC‑8.6** No agent run ever modifies a user's original files.

---

## 9. Tab: Notefalls

A fast journaling/microblog stream. Users (and agents) post short entries; the feed is reverse‑chronological with a scrollable date rail.

### 9.1 Data model

```
Post {
  id,
  authorType: 'user'|'agent',
  authorAgentId: string|null,
  body: string,                  // markdown
  media: { id, path, kind }[],   // attached images/files
  journalId: string|null,        // optional association
  tags: string[],
  statusDot: string|null,        // color marker seen in screenshot
  createdAt: ISO
}
```

### 9.2 Composer

- Prompt: **"What are you thinking?"**, an **image attach** affordance, and a **Post** button.
- Supports markdown + media attachments; Enter‑to‑post (configurable in Shortcuts).

### 9.3 Feed & date rail

- Reverse‑chron list; each entry shows body, optional status dot, and a relative timestamp ("1 month ago").
- **Left date rail:** a vertical month/day index (e.g., "Jun 2026 … May 2026" with weekday letters and numbers, current day highlighted). Clicking a date scrolls the feed to that day; scrolling the feed moves the rail highlight. The rail virtualizes for long histories.

### 9.4 Agent (proactive) posts

- Agents may publish posts (`authorType:'agent'`) via the `post_notefall` tool or a proactive trigger (§8.4). Per Services (§11) these use the **large** model tier.
- Agent posts are visually attributed (agent avatar/name) and rate‑limited; a global toggle disables proactive posting.

### 9.5 IPC

`notefalls:list` (paged, by date range), `notefalls:create`, `notefalls:update`, `notefalls:delete`, `notefalls:attachMedia`.

### 9.6 Acceptance

- **AC‑9.1** Posting (with/without an image) prepends to the feed and persists.
- **AC‑9.2** The date rail reflects real post history; clicking a date scrolls there; the highlight tracks scroll.
- **AC‑9.3** Agent posts appear attributed and obey the proactive toggle + rate limit.
- **AC‑9.4** Feed paginates smoothly over thousands of posts.

---

## 10. Tab: Recents

A unified, read‑only activity feed across the workspace.

- **Sources:** recently modified files (via `modifiedAt` / FileHawk), recently opened projects, new notefalls posts, completed agent runs/tasks. Derived by querying the store; not a separate stored entity (optionally cached as a materialized view for speed).
- **Row:** icon by kind, title, source (journal/agent), relative time. Click → open in place or in the sidecar.
- **Controls:** filter by kind (files / projects / posts / tasks), and the existing **"↕ Activity"** sort concept generalized to all kinds.
- **IPC:** `recents:list({ kinds, limit, before })`.
- **AC‑10.1** Recents merges all four sources in correct time order.
- **AC‑10.2** Filters work; clicking a row opens the right destination.

---

## 11. Settings → Services (AI provider)

Configures how Distill's agents reach a model. Two provider modes, with tiered model routing.

### 11.1 Provider modes

- **Distill service** — "Everything you need. Requires an active subscription." Managed endpoint; auth via the user's Distill license/token (§14.5). No endpoint/model entry required.
- **Connect your own AI** — "Bring your existing agent or AI API to power Distill's agents." Any **OpenAI‑compatible** endpoint.

### 11.2 BYO connection fields (per screenshot)

| Field | Example | Notes |
|---|---|---|
| Endpoint URL | `https://api.openai.com/v1` | OpenAI‑compatible base URL. |
| Default model | `gpt-5.4` | Used when a tier‑specific model is blank. |
| Small model | `gpt-4.1-mini` | "Used for search, categorization, and tool routing." |
| Large model | `gpt-4.1` | "Required for final agent replies and proactive posts." |
| API Key | `••••••` | Stored in Vault. "Leave blank for local servers like Ollama." |

Actions: **Test Connection** (round‑trips a cheap call, reports latency/model availability) and **Save**.

### 11.3 AI gateway & tier routing

- `ai/gateway.js` exposes `complete({ tier, messages, tools, stream })` and resolves the concrete model by tier (`small`/`large`/`default` fallback).
- **Routing rules:** small tier → search, categorization, tool routing, cheap classification; large tier → final agent replies and proactive notefalls posts. Agents may override with their own `modelTier`.
- Provider clients live behind one interface (`ai/providers/openai.js`, `ai/providers/distill.js`) so the rest of the app is provider‑agnostic. All calls originate in main/utility — never the renderer.

### 11.4 IPC & acceptance

- IPC: `ai:getConfig`, `ai:setConfig`, `ai:testConnection`. `setConfig` writes the key to Vault and returns only `{ hasKey: true }`.
- **AC‑11.1** Switching Distill ↔ BYO persists and reconfigures the gateway.
- **AC‑11.2** Test Connection succeeds for a valid OpenAI‑compatible endpoint and for a keyless local server (Ollama).
- **AC‑11.3** Tier routing picks the configured model; blank tiers fall back to Default.
- **AC‑11.4** The API key is never returned to the renderer after save.

---

## 12. Settings → Context (RAG)

"Mount external context sources for your agents. Add a folder to use any `.txt`/`.md` files from them as context."

### 12.1 Model & behavior

```
ContextMount { id, path, fileGlobs:['*.md','*.txt'], status, fileCount, lastIndexedAt }
ContextChunk { id, mountId, filePath, heading, text, embedding?, updatedAt }
```

- **Add folder** uses the existing `dialog:openDirectory`. Empty state: "No mounted folders".
- Indexer walks the mount, reads `.txt`/`.md`, chunks by heading/paragraph, and builds a search index. **Embeddings optional:** if the provider exposes an embeddings model, store vectors for semantic search; otherwise fall back to keyword/BM25 (works fully offline).
- A file watcher re‑indexes on change/add/remove.
- **Debug** field: "Search mounted context…" runs the same retrieval the agents use, for inspection.
- Retrieval feeds agent prompts (§8.4); each agent sees only the mounts in its `contextMounts`.

### 12.2 IPC & acceptance

- IPC: `context:listMounts`, `context:addMount`, `context:removeMount`, `context:reindex`, `context:search`.
- **AC‑12.1** Adding a folder indexes its `.txt`/`.md` and shows a file count + last‑indexed time.
- **AC‑12.2** The Debug search returns relevant chunks; editing a file updates results after re‑index.
- **AC‑12.3** Agents retrieve from their assigned mounts during runs.
- **AC‑12.4** Keyword retrieval works with no network/embeddings configured.

---

## 13. Settings → MCP

Host Model Context Protocol servers so agents can call external tools.

- **Model:** `McpServer { id, name, transport:'stdio'|'sse'|'http', command/args|url, env, enabled, status, tools:[{name,schema}] }`.
- **Host:** `mcp/host.js` launches/connects servers, lists their tools, and proxies tool calls from the agent runtime. Discovered tools join the tool registry (§8.5) and become enableable per agent, subject to the **external** consent class (§8.6).
- **Security:** servers are user‑added and disabled by default; secrets for a server go through Vault; a server's tools must be explicitly enabled per agent.
- **IPC:** `mcp:listServers`, `mcp:addServer`, `mcp:updateServer`, `mcp:removeServer`, `mcp:toggleServer`, `mcp:listTools`, `mcp:callTool` (internal, runtime‑only).
- **AC‑13.1** Add/enable a stdio MCP server; its tools list populates and shows healthy status.
- **AC‑13.2** An agent with the tool enabled can call it during a run; the call is logged in the `AgentRun`.
- **AC‑13.3** Disabling a server immediately removes its tools from agents.

---

## 14. Settings → Vault, Memories, Appearance, Shortcuts, Backup, License

### 14.1 Vault

- Secret store for all API keys/tokens/MCP secrets, backed by Electron **`safeStorage`** (OS keychain).
- Renderer sees only metadata (`{ name, hasValue, updatedAt }`); never plaintext.
- UI: list secrets, set/rotate/delete. IPC: `vault:list`, `vault:set`, `vault:delete` (no `get` exposed to renderer).

### 14.2 Memories (experiment)

- Agent long‑term memory. `Memory { id, agentId|global, kind:'fact'|'preference'|'event', content, embedding?, salience, createdAt, lastUsedAt }`.
- Written via the `remember` tool, read via `recall`; relevant memories are injected into agent prompts (§8.4).
- Surfaced in the **sidecar** "Memories" experiment (browse/search/edit/forget). Flagged experimental; toggleable.
- IPC: `memories:list`, `memories:search`, `memories:upsert`, `memories:delete`.

### 14.3 Appearance

- Themes including the existing **dim mode**, aurora background toggle, accent palette, and the custom triangle cursor toggle. Journal folder‑art set lives here.

### 14.4 Shortcuts

- Editable keymap registry (tab switching `⌘1–5`, `⌘,`, `⌘K`, post‑on‑Enter, new task/journal/post). IPC: `shortcuts:get`, `shortcuts:set`.

### 14.5 Backup & License

- **Backup:** export/import the entire store + settings (excluding Vault secrets, which are keychain‑bound) as a single archive; optional periodic local snapshots. IPC: `backup:export`, `backup:import`, `backup:listSnapshots`. Never touches user originals.
- **License:** activation/auth for the **Distill** managed service and any pro entitlements. IPC: `license:status`, `license:activate`, `license:deactivate`.

### 14.6 Acceptance (settings system)

- **AC‑14.1** Secrets persist in the keychain and survive restart; plaintext never reaches the renderer.
- **AC‑14.2** A memory written during a run is retrievable and influences a later run.
- **AC‑14.3** Theme/appearance and shortcut changes apply immediately and persist.
- **AC‑14.4** Backup export → fresh profile → import reproduces journals, projects, tasks, posts, and settings.

---

## 15. Consolidated Data Model

Entities and key relationships (files‑on‑disk remain external and are only referenced):

```
Settings (singleton)
  ├─ ai: { mode:'distill'|'byo', endpoint, models:{default,small,large}, hasKey }
  ├─ appearance, shortcuts, flags(experiments)
Journal 1───* Project 1───* FileRef         (FileRef.path → real file on disk; Journal = folder + canvas filter, one journal per Project)
Project 1───* Milestone                      (timeline)
Agent 1───* AgentRun *───1 Task
Task *───1 List
Post (authorType user|agent → Agent?)
Memory (agentId|global)
ContextMount 1───* ContextChunk
McpServer 1───* McpTool
Vault: name → secret (keychain; out of band from the store)
Recents: derived view over FileRef/Project/Post/Task/AgentRun
```

---

## 16. Consolidated IPC / API surface

`preload.js` is reorganized into **namespaced domains** on `electronAPI` (e.g., `electronAPI.journals.create(...)`). Event channels (`agents:run:event`, `context:reindex:progress`) use a subscribe/emit bridge.

| Domain | Channels |
|---|---|
| library *(exists)* | `load, save, importPaths, openPath, showItemInFolder, hunterSearch, hunterDefaultDirs, openDirectoryDialog, filehawkCheck, consolidateProject` |
| journals | `list, create, update, delete, reorder, addProjects, moveProject` |
| agents | `list, create, update, delete, run, run:cancel, run:event*` |
| tasks / lists / runs | `tasks:{list,create,update,delete,complete}`, `lists:{list,create,update,archive}`, `runs:{list,get}` |
| ai | `getConfig, setConfig, testConnection` |
| context | `listMounts, addMount, removeMount, reindex, reindex:progress*, search` |
| mcp | `listServers, addServer, updateServer, removeServer, toggleServer, listTools` |
| notefalls | `list, create, update, delete, attachMedia` |
| recents | `list` |
| vault | `list, set, delete` |
| memories | `list, search, upsert, delete` |
| shortcuts / appearance | `get, set` |
| backup / license | `backup:{export,import,listSnapshots}`, `license:{status,activate,deactivate}` |

`*` = event/streaming channel.

---

## 17. Persistence & Migration

### 17.1 Target store

- **`better-sqlite3`** database in `app.getPath('userData')` (`keeper.db`), with tables mirroring §15. JSON columns are fine for `milestones`, `media`, `subtasks`, `settings`.
- A schema `version` row drives forward migrations.
- User files stay on disk; only `FileRef.path` + metadata are stored.

### 17.2 v1 → v2 migration

1. On first launch of Keeper, detect legacy `projungle.library.json`.
2. Create the **"Unsorted"** system journal.
3. Insert every legacy `project` (and its `files` → `FileRef`, `milestones`) and add all project ids to Unsorted.
4. Preserve the legacy global `viewport` as the single global canvas viewport (the canvas is not partitioned by journal).
5. Stamp `version: 2`; keep the legacy JSON as a `.bak` until the first clean save.

- **AC‑17.1** A user with an existing library opens Keeper and finds all projects under "Unsorted" with covers, tags, and timelines intact.
- **AC‑17.2** Migration is idempotent and reversible (the `.bak` allows rollback).

---

## 18. Security & Privacy

- **Local‑first:** all data lives on the user's machine; the only outbound traffic is to the configured model endpoint (Distill or BYO), configured MCP servers, and allow‑listed documentation in the sidecar.
- **Secrets:** only in Vault (OS keychain). Renderer never receives plaintext keys; `ai:setConfig`/`vault:set` return booleans.
- **Process isolation:** keep `contextIsolation: true`, `nodeIntegration: false`; revisit enabling `sandbox: true` for the renderer (currently `false`). All privileged work stays in main/utility.
- **CSP:** renderer stays `'self'`; no model/MCP origins are ever added to the renderer's CSP because the renderer makes no network calls.
- **Agent safety:** tool consent classes (read / write‑local / external); a hard rule that agents cannot modify or delete user originals; full per‑run audit logs; step/cost/time guards; global proactive‑posting kill switch.
- **Privacy controls:** clear what gets sent to the model (task text + retrieved context + memories); per‑agent context scoping; an option to redact file contents (paths/metadata only) for BYO endpoints.

---

## 19. Phased Delivery

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 — Foundation** | Architecture decision (§4.1); module split; tab shell + router + sidecar skeleton; SQLite store; **v1→v2 migration**; journals CRUD; journals as a composable canvas filter. | Existing users migrate cleanly; journals + canvas work end‑to‑end (AC‑5, AC‑6, AC‑7, AC‑17). |
| **P1 — Brains** | Vault; AI gateway + provider clients; Services pane (Distill + BYO, tiers, Test Connection); Context (mount/index/search). | Configure a provider, pass Test Connection, search mounted context (AC‑11, AC‑12, AC‑14.1). |
| **P2 — Agents** | Agent model + detail; tasks/lists; Planner/Inbox; runtime (schedule/manual), streaming, guards; built‑in tools. | Scheduled + manual runs execute, stream, and respect guards/work‑hours (AC‑8). |
| **P3 — Streams** | Notefalls (composer, feed, date rail); proactive agent posts; Recents. | Posting + date‑rail + attributed agent posts + unified recents (AC‑9, AC‑10). |
| **P4 — Reach & polish** | MCP host; Memories + sidecar Memories; Appearance/Shortcuts; Backup; License/Distill activation. | MCP tools callable by agents; memories influence runs; backup round‑trips (AC‑13, AC‑14). |

---

## 20. Open Questions & Risks

1. **Naming.** Spec uses **Keeper** (product) + **Distill** (AI service). Confirm the final public name and whether "Projungle" is fully retired (it remains the npm/package id today).
2. **Framework decision (§4.1).** Vite + Preact/Svelte vs. structured vanilla ES modules — ratify before P0; it shapes every new screen.
3. **Embeddings for Context/Memories.** Local model vs. provider embeddings vs. keyword‑only default. Affects offline behavior and privacy.
4. **Agent cost/runaway controls.** Confirm default step/token/cost caps and whether per‑run confirmation is required for external tools.
5. **"briizOS".** A planner task references "Finish GUI for briizOS reconfiguration" — clarify whether Keeper relates to a broader briizOS environment (shared theming, packaging, or host).
6. **Distill service contract.** Endpoints, auth, billing, and model availability for the managed option (§11.1, §14.5) are external dependencies.
7. **Sandbox.** Decide whether to flip the renderer to `sandbox: true` during the refactor.
8. **Sync/backup scope.** Local‑only backup now; is any cross‑device sync expected via Distill later?
9. **Journal membership.** Journals are currently modeled as folder‑like (one journal per project) and used as a canvas filter. Should they instead allow multi‑membership / behave fully tag‑like? This changes the membership store and the "Unsorted" semantics.

---

## Appendix A — Screenshot → feature traceability

| Screenshot region | Spec section |
|---|---|
| Tabs: journals / canvas / agents / notefalls / recents | §5 Shell |
| Notefalls composer "What are you thinking?" + Post + entries + date rail | §9 Notefalls |
| "New tab" panel: Search, Experiments → Memories, Documentation, "open in sidecar" | §5.2 Sidecar, §14.2 Memories |
| Settings → **Context**: mount folders, .txt/.md, "No mounted folders", Debug search | §12 Context |
| Settings → **Services**: Distill vs Connect your own AI; endpoint; default/small/large models; API key; Test Connection/Save | §11 Services |
| Settings left nav: General, Appearance, Vault, Agents, Services, Search, MCP, Shortcuts, Context, Backup, License | §11–§14 |
| Agents: Inbox / Planner / Settings; **Neo "Settling in"**; agent avatar cluster "+1"; Lists | §8.2 Views, §8.1 Agent model |
| Agents header cards: ▶1 / ⏰2 / inbox 3 / ✓1 | §8.1 status pipeline |
| Tasks: "Compile screenshots", "Get Claude to write a spec sheet…", "Finish GUI for briizOS reconfiguration" | §8 Tasks |
| Task popover: "work hours", "Does not repeat", due menu (No due date/Today/Tomorrow/Next week/Pick a date) | §8.3 Task editor |
| Journals grid: Unsorted, Code/Dev (17 Projects), Poetry, Ideas to Share, + new | §6 Journals |

---

*End of specification v0.1. §3 is verified against the current codebase; §4 onward is the proposed build and should be ratified against the open questions in §20 before P0.*
