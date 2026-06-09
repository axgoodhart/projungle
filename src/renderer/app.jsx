import { useState } from 'preact/hooks';
import CanvasTab from './tabs/CanvasTab.jsx';
import { Placeholder } from './tabs/Placeholder.jsx';

// Tab order matches the Keeper design (journals · canvas · agents · notefalls · recents).
const TABS = [
  { id: 'journals', label: 'journals' },
  { id: 'canvas', label: 'canvas' },
  { id: 'agents', label: 'agents' },
  { id: 'notefalls', label: 'notefalls' },
  { id: 'recents', label: 'recents' },
];

const PLACEHOLDERS = {
  journals: { title: 'Journals', subtitle: 'Notebook folders that filter the canvas. Coming next.' },
  agents: { title: 'Agents', subtitle: 'Distill agents, planner, and tasks. Coming next.' },
  notefalls: { title: 'Notefalls', subtitle: 'Your microblog stream — post what you’re thinking. Coming next.' },
  recents: { title: 'Recents', subtitle: 'Recent activity across files, projects, posts, and runs. Coming next.' },
};

export function App() {
  // Canvas is the default tab so the legacy app boots into a visible, measurable stage.
  const [active, setActive] = useState('canvas');

  return (
    <div class="keeper-shell">
      <nav class="keeper-tabbar" role="tablist" aria-label="Keeper">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            class={'keeper-tab' + (active === t.id ? ' is-active' : '')}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div class="keeper-panels">
        {/* All panels stay mounted; only the active one is shown. This keeps the
            canvas alive (state + listeners) when switching away and back. */}
        <div class="keeper-panel" hidden={active !== 'journals'}>
          <Placeholder {...PLACEHOLDERS.journals} />
        </div>

        <div class="keeper-panel" hidden={active !== 'canvas'}>
          <CanvasTab />
        </div>

        <div class="keeper-panel" hidden={active !== 'agents'}>
          <Placeholder {...PLACEHOLDERS.agents} />
        </div>

        <div class="keeper-panel" hidden={active !== 'notefalls'}>
          <Placeholder {...PLACEHOLDERS.notefalls} />
        </div>

        <div class="keeper-panel" hidden={active !== 'recents'}>
          <Placeholder {...PLACEHOLDERS.recents} />
        </div>
      </div>
    </div>
  );
}
