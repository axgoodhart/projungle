/* ── Journal templates ────────────────────────────────────────────────
   A template is a recipe for a new journal: a default cover + page style
   and a set of prefab folios. Folio `content` shapes by type:

   dashboard → { widgets: [...], note }
     widget: { kind:'progress'|'stat', label, value, target?, hint?,
               format?: 'money'|'days'|'hours',
               editable?: true,           // manual click-to-edit value
               source?: {                  // live-computed from a sibling folio
                 from: 'tracker'|'todo',  // sibling type
                 folio: string,           // sibling title
                 agg: 'count'|'countWeek'|'sumMonth'|'sumNum'|'topValue'|'daysSinceLast'|'doneRatio',
                 column?: string,         // tracker column for sums/topValue
               } }
     Computed widgets win over stored `value`; progress targets and
     sourceless stats are click-to-edit in the viewer.
   tracker   → { columns: [string], rows: [[string]] }
   todo      → { items: [{ text, done }] }
   prompts   → { intro, prompts: [string] }
   notes     → { body }

   Journals store only data, never component code, so templates stay
   forward-compatible with whatever the viewer learns to render. */

export const TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank',
    tagline: 'An empty book. You bring the ink.',
    cover: null, // keep whatever the user picked
    page: null,
    tags: [],
    folios: [],
  },

  /* Distilled from the old HabiTrac project: track a habit's instances,
     spot triggers, set wean-off goals, plan substitutions. */
  {
    id: 'health-goal',
    name: 'Health Goal',
    tagline: 'Track a habit, find its triggers, wean it down.',
    cover: 'Humanist',
    page: 'White Lined',
    tags: ['health'],
    folios: [
      {
        type: 'dashboard',
        title: 'Habit Dashboard',
        content: {
          widgets: [
            {
              kind: 'progress', label: 'Weekly limit used', value: 0, target: 7,
              source: { from: 'tracker', folio: 'Habit Log', agg: 'countWeek' },
            },
            {
              kind: 'stat', label: 'Instances this week', value: '0', hint: 'live from the log',
              source: { from: 'tracker', folio: 'Habit Log', agg: 'countWeek' },
            },
            {
              kind: 'stat', label: 'Days since last', value: '—', hint: 'keep it climbing', format: 'days',
              source: { from: 'tracker', folio: 'Habit Log', agg: 'daysSinceLast' },
            },
            {
              kind: 'stat', label: 'Top trigger', value: '—', hint: 'live from the log',
              source: { from: 'tracker', folio: 'Habit Log', agg: 'topValue', column: 'Trigger' },
            },
          ],
          note: 'Click the limit to set it, then log every instance honestly — patterns beat willpower.',
        },
      },
      {
        type: 'tracker',
        title: 'Habit Log',
        content: {
          columns: ['Date', 'Time', 'Location', 'Trigger', 'Notes'],
          rows: [],
        },
      },
      {
        type: 'todo',
        title: 'Wean-Off Goals',
        content: {
          items: [
            { text: 'Define the habit I’m tracking, precisely', done: false },
            { text: 'Set a weekly instance limit', done: false },
            { text: 'Pick one substitution to try this week', done: false },
            { text: 'Review the log every Sunday', done: false },
          ],
        },
      },
      {
        type: 'prompts',
        title: 'Trigger Insights',
        content: {
          intro: 'After a week of logging, sit with these.',
          prompts: [
            'When does the habit show up most — time of day, place, mood?',
            'What happened right before the last three instances?',
            'Which trigger surprised you?',
            'What does the habit actually give you in that moment?',
          ],
        },
      },
      {
        type: 'notes',
        title: 'Substitutions',
        content: {
          body: 'Alternative activities to reach for, matched to triggers:\n\nBoredom →\nStress →\nSocial settings →\nLate night →\n',
        },
      },
      {
        type: 'prompts',
        title: 'Daily Summary',
        content: {
          intro: 'A two-minute close-out, every evening.',
          prompts: [
            'How did today go against the goal?',
            'One win, however small.',
            'One thing to do differently tomorrow.',
          ],
        },
      },
    ],
  },

  {
    id: 'idea-incubator',
    name: 'Idea Incubator',
    tagline: 'Catch sparks, grow seedlings, ship the keepers.',
    cover: 'Fantasy Card',
    page: 'Pastel Botanical',
    tags: ['ideas'],
    folios: [
      {
        type: 'notes',
        title: 'Spark Page',
        content: { body: 'Raw, unfiltered captures. No idea is too dumb for this page.\n\n• ' },
      },
      {
        type: 'tracker',
        title: 'Idea Pipeline',
        content: {
          columns: ['Idea', 'Stage', 'Next step', 'Energy (1–5)'],
          rows: [],
        },
      },
      {
        type: 'todo',
        title: 'To Validate',
        content: {
          items: [
            { text: 'Pick one idea and describe it in a single sentence', done: false },
            { text: 'Find one person who has this problem', done: false },
          ],
        },
      },
      {
        type: 'prompts',
        title: 'Incubation Prompts',
        content: {
          intro: 'For ideas that feel stuck.',
          prompts: [
            'What would the lazy version of this look like?',
            'Who already solved something adjacent?',
            'What would make this idea ten times smaller?',
            'If it failed, why did it fail?',
          ],
        },
      },
    ],
  },

  {
    id: 'finances',
    name: 'Finances',
    tagline: 'Expense log, budget dials, money plans.',
    cover: 'Coverboard',
    page: 'Graph-dark',
    tags: ['money'],
    folios: [
      {
        type: 'dashboard',
        title: 'Money Dashboard',
        content: {
          widgets: [
            {
              kind: 'progress', label: 'Monthly budget used', value: 0, target: 500, format: 'money',
              source: { from: 'tracker', folio: 'Expense Log', agg: 'sumMonth', column: 'Amount' },
            },
            {
              kind: 'stat', label: 'Spent this month', value: '$0', hint: 'live from the log', format: 'money',
              source: { from: 'tracker', folio: 'Expense Log', agg: 'sumMonth', column: 'Amount' },
            },
            {
              kind: 'stat', label: 'Biggest category', value: '—', hint: 'watch this one',
              source: { from: 'tracker', folio: 'Expense Log', agg: 'topValue', column: 'Category' },
            },
            { kind: 'stat', label: 'Savings goal', value: '0%', hint: 'click to edit', editable: true },
          ],
          note: 'Click the budget to set it. Log first, judge later — the dashboard only works if the log is honest.',
        },
      },
      {
        type: 'tracker',
        title: 'Expense Log',
        content: {
          columns: ['Date', 'Item', 'Category', 'Amount', 'Worth it?'],
          rows: [],
        },
      },
      {
        type: 'todo',
        title: 'Bills & Planning',
        content: {
          items: [
            { text: 'List fixed monthly bills with due dates', done: false },
            { text: 'Set this month’s budget ceiling', done: false },
            { text: 'Pick one subscription to cancel or downgrade', done: false },
          ],
        },
      },
      {
        type: 'notes',
        title: 'Money Notes',
        content: { body: 'Plans, worries, windfalls, weird purchases that need explaining.\n' },
      },
    ],
  },

  {
    id: 'new-skill',
    name: 'New Skill Log',
    tagline: 'Practice sessions, milestones, honest reflection.',
    cover: 'Diagrammical',
    page: 'Modern Frame',
    tags: ['learning'],
    folios: [
      {
        type: 'dashboard',
        title: 'Skill Dashboard',
        content: {
          widgets: [
            {
              kind: 'progress', label: 'Hours practiced', value: 0, target: 20, format: 'hours',
              source: { from: 'tracker', folio: 'Practice Sessions', agg: 'sumNum', column: 'Duration' },
            },
            {
              kind: 'stat', label: 'Sessions logged', value: '0', hint: 'consistency > length',
              source: { from: 'tracker', folio: 'Practice Sessions', agg: 'count' },
            },
            {
              kind: 'stat', label: 'Milestones hit', value: '0%', hint: 'from the checklist',
              source: { from: 'todo', folio: 'Milestones', agg: 'doneRatio' },
            },
            { kind: 'stat', label: 'Current focus', value: '—', hint: 'click to edit', editable: true },
          ],
          note: 'Log Duration in hours (e.g. 1.5). Click the target to change the 20-hour goal.',
        },
      },
      {
        type: 'tracker',
        title: 'Practice Sessions',
        content: {
          columns: ['Date', 'Duration', 'Focus', 'What clicked', 'What fought back'],
          rows: [],
        },
      },
      {
        type: 'todo',
        title: 'Milestones',
        content: {
          items: [
            { text: 'Define what “good enough” looks like', done: false },
            { text: 'First micro-milestone', done: false },
            { text: 'First thing made/performed for someone else', done: false },
          ],
        },
      },
      {
        type: 'prompts',
        title: 'Reflection',
        content: {
          intro: 'Every few sessions, not every session.',
          prompts: [
            'What feels easier than it did last week?',
            'Where am I practicing the comfortable part instead of the hard part?',
            'What would a teacher tell me to stop doing?',
          ],
        },
      },
    ],
  },

  {
    id: 'meandering',
    name: 'Meandering Thoughts',
    tagline: 'No structure, no goals. Just a place to wander.',
    cover: 'Leathermeal',
    page: 'Parchment',
    tags: [],
    folios: [
      {
        type: 'prompts',
        title: 'Wander Starters',
        content: {
          intro: 'Only if you want them. Blank pages follow.',
          prompts: [
            'What’s been circling in your head lately?',
            'Describe today as weather.',
            'Something you noticed that nobody else seemed to.',
          ],
        },
      },
      { type: 'notes', title: 'Stream', content: { body: '' } },
      { type: 'notes', title: 'Fragments', content: { body: '' } },
    ],
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
