import { useState } from 'preact/hooks';
import CanvasTab from './tabs/CanvasTab.jsx';
import { Placeholder } from './tabs/Placeholder.jsx';
import { FolderTab } from './tabs/FolderTab.jsx';
import { JournalsTab } from './tabs/journals/JournalsTab.jsx';

// Tab order matches the Keeper design (journals · canvas · agents · notefalls · recents).
// `glyph` is an SF Pro / system-font glyph (rendered as text, not SVG). Swap any
// of these for the exact SF Symbols character from the Figma design if preferred —
// they render via the system font on macOS.
const TABS = [
  { id: 'journals', label: 'journals', glyph: '􁜿' },
  { id: 'canvas', label: 'canvas', glyph: '􁝰' },
  { id: 'agents', label: 'agents', glyph: '􁒊' },
  { id: 'notefalls', label: 'notefalls', glyph: '􀤐' },
  { id: 'organizer', label: 'organizer', glyph: '􀖉' },
];

const PLACEHOLDERS = {
  journals: { title: 'Journals', subtitle: 'Dedicated notebooks for your projects. Coming next.' },
  agents: { title: 'Agents', subtitle: 'Distill agents, planner, and tasks. Coming soon.' },
  notefalls: { title: 'Notefalls', subtitle: 'Your microblog stream — post what you’re thinking. Coming next.' },
  organizer: { title: 'Organizer', subtitle: 'Recent activity across files, projects, posts, and runs. Coming next.' },
};

export function App() {
  // Canvas is the default tab so the legacy app boots into a visible, measurable stage.
  const [active, setActive] = useState('canvas');

  return (
    <div class="keeper-shell">
      <div id="keeper-top" >
      <nav class="keeper-tabbar" role="tablist" aria-label="Keeper">
        {TABS.map((t) => (
          <FolderTab
            key={t.id}
            label={t.label}
            glyph={t.glyph}
            active={active === t.id}
            onSelect={() => setActive(t.id)}
          />
        ))}
      </nav>
      <div id="logomain"></div>
      </div>

      <div class="keeper-panels">
        {/* All panels stay mounted; only the active one is shown. This keeps the
            canvas alive (state + listeners) when switching away and back. */}
        <div class="keeper-panel" hidden={active !== 'journals'}>
          <JournalsTab />
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

        <div class="keeper-panel" hidden={active !== 'organizer'}>
          <Placeholder {...PLACEHOLDERS.organizer} />
        </div>
      </div>
    </div>
  );
}
