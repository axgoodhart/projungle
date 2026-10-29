import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import './notefalls.css';
import { api, mediaUrl } from './api.js';
import {
  relativeTime,
  formatSessionDate,
  formatTimeRange,
  dayKey,
  WEEKDAY_LETTERS,
  MONTH_SHORT,
  DAY,
} from './dates.js';

/* ── Icons (inline SVG, stroke/fill = currentColor unless noted) ─────── */

const Icon = {
  image: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4.5 17.5l5-5 3 3 3.5-3.5 4 4" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  music: (
    <svg viewBox="0 0 24 24" fill="#e0473e" stroke="none">
      <path d="M9 19a2.6 2.6 0 1 1-1.2-4.9c.55-.12 1-.2 1.4-.32V6.6a1 1 0 0 1 .78-.97l8-1.8A1 1 0 0 1 19.4 4.8V6l-8 1.8v6.5c0 1.7-1.1 2.9-2.4 2.9zM19.4 14.3a2.6 2.6 0 1 1-1.2-4.9c.55-.12 1-.2 1.2-.27V8.8" />
    </svg>
  ),
  journal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 5.5c2-1 4.7-1.3 7-.3v13c-2.3-1-5-.7-7 .3z" />
      <path d="M21 5.5c-2-1-4.7-1.3-7-.3v13c2.3-1 5-.7 7 .3z" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4h16v12H8l-4 4z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  ),
};

/** Small leading icon per post — falls back to a generic note glyph. */
function SourceIcon({ post }) {
  switch (post.sourceIcon) {
    case 'music':
      return <span class="nf-icon nf-icon--music">{Icon.music}</span>;
    case 'photoshop':
      return <span class="nf-icon nf-icon--ps">Ps</span>;
    case 'journal':
      return <span class="nf-icon nf-icon--journal">{Icon.journal}</span>;
    default:
      return <span class="nf-icon nf-icon--note">{Icon.note}</span>;
  }
}

/* ── Composer ──────────────────────────────────────────────────────── */

function Composer({ onPost }) {
  const [body, setBody] = useState('');
  const [media, setMedia] = useState([]);
  const [busy, setBusy] = useState(false);
  const [autoCaptureOn, setAutoCaptureOn] = useState(true);
  const taRef = useRef(null);

  const canPost = (body.trim().length > 0 || media.length > 0) && !busy;

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    try {
      await onPost({ body: body.trim(), media, tags: [] });
      setBody('');
      setMedia([]);
      if (taRef.current) taRef.current.style.height = 'auto';
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    const picked = await api.attachMedia();
    if (picked?.length) setMedia((prev) => [...prev, ...picked]);
  };

  const autoGrow = (e) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  return (
    <div class="nf-composer">
      <div class="nf-composer__top">
        <textarea
          ref={taRef}
          class="nf-composer__input"
          rows={1}
          placeholder="What's up?"
          value={body}
          onInput={(e) => { setBody(e.currentTarget.value); autoGrow(e); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          class={'nf-autocapture' + (autoCaptureOn ? ' is-on' : '')}
          onClick={() => setAutoCaptureOn((v) => !v)}
          title="Toggle auto-capture (UI preview only — wired up in a future pass)"
        >
          auto capture is {autoCaptureOn ? 'ON' : 'OFF'}
        </button>
      </div>

      {media.length > 0 && (
        <div class="nf-composer__media">
          {media.map((m) => (
            <div class="nf-composer__thumb" key={m.id}>
              <img src={mediaUrl(m.path)} alt={m.name || ''} draggable={false} />
              <button
                type="button"
                class="nf-composer__thumbx"
                aria-label="Remove image"
                onClick={() => setMedia((prev) => prev.filter((x) => x.id !== m.id))}
              >
                {Icon.x}
              </button>
            </div>
          ))}
        </div>
      )}

      <div class="nf-composer__bottom">
        <button type="button" class="nf-iconbtn" title="Attach image" onClick={attach}>
          {Icon.image}
        </button>
        <button type="button" class="nf-postbtn" disabled={!canPost} onClick={submit}>
          Post
        </button>
      </div>
    </div>
  );
}

/* ── Session / post detail drawer ─────────────────────────────────── */

function SessionDrawer({ post, onClose, onSave }) {
  const [notes, setNotes] = useState(post.notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => setNotes(post.notes || ''), [post.id, post.notes]);

  const commitNotes = async () => {
    if (notes === (post.notes || '')) return;
    setSaving(true);
    try {
      await onSave(post.id, { notes });
    } finally {
      setSaving(false);
    }
  };

  const hasSession = post.sessionStart && post.sessionEnd;
  const dateLabel = formatSessionDate(post.sessionStart || post.createdAt);
  const timeLabel = hasSession ? formatTimeRange(post.sessionStart, post.sessionEnd) : '';

  return (
    <div class="nf-drawer">
      <button type="button" class="nf-drawer__tab" title="Configure screen sharing & auto-capture (coming soon)">
        configure screen sharing &amp; auto-capture
      </button>

      <div class="nf-drawer__body">
        <button type="button" class="nf-drawer__collapse" onClick={onClose} title="Collapse">
          <span class="nf-drawer__chevron is-up">{Icon.chevron}</span>
        </button>

        <div class="nf-drawer__content">
          <h3 class="nf-drawer__title">{post.body.toLowerCase()}</h3>
          <div class="nf-drawer__meta">
            <span class="nf-drawer__date">{dateLabel}</span>
            {timeLabel && <span class="nf-drawer__time">{timeLabel}</span>}
          </div>

          {post.media?.length > 0 && (
            <div class="nf-drawer__section">
              <span class="nf-drawer__label">attachments</span>
              <div class="nf-drawer__shots">
                {post.media.map((m, i) => (
                  <img key={m.id || i} src={mediaUrl(m.path)} alt={m.name || ''} loading="lazy" />
                ))}
              </div>
            </div>
          )}

          <div class="nf-drawer__section">
            <span class="nf-drawer__label">screenshots</span>
            {post.screenshots?.length ? (
              <div class="nf-drawer__shots">
                {post.screenshots.map((s, i) => (
                  <img key={s.id || i} src={mediaUrl(s.path)} alt="" loading="lazy" />
                ))}
              </div>
            ) : (
              <p class="nf-drawer__empty">no screenshots from session</p>
            )}
          </div>

          <div class="nf-drawer__section">
            <span class="nf-drawer__label">notes</span>
            <textarea
              class="nf-drawer__notes"
              placeholder="no notes taken from session"
              value={notes}
              onInput={(e) => setNotes(e.currentTarget.value)}
              onBlur={commitNotes}
              rows={2}
            />
            {saving && <span class="nf-drawer__saving">saving…</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Feed row ─────────────────────────────────────────────────────── */

function FeedRow({ post, expanded, onToggle, rowRef }) {
  return (
    <button
      type="button"
      ref={rowRef}
      data-day={dayKey(post.createdAt)}
      class={'nf-row' + (expanded ? ' is-expanded' : '')}
      onClick={onToggle}
    >
      <SourceIcon post={post} />
      <span class="nf-row__body">
        {post.body}
        {(post.tags || []).map((t) => (
          <span class="nf-row__tag" key={t}>{t}</span>
        ))}
      </span>
      {post.media?.length > 0 && (
        <span class="nf-row__media">
          {post.media.slice(0, 4).map((m, i) => (
            <img key={m.id || i} src={mediaUrl(m.path)} alt="" draggable={false} />
          ))}
          {post.media.length > 4 && <span class="nf-row__mediamore">+{post.media.length - 4}</span>}
        </span>
      )}
      <span class="nf-row__meta">
        <span class="nf-row__time">{relativeTime(post.createdAt)}</span>
        {post.captureMode === 'auto' && <span class="nf-row__auto">auto-capture</span>}
      </span>
    </button>
  );
}

/* ── Date rail ───────────────────────────────────────────────────── */

function buildRailDays(posts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();

  let earliest = todayTs - 44 * DAY;
  posts.forEach((p) => {
    if (p.createdAt < earliest) earliest = p.createdAt;
  });
  // Snap to start of that day.
  const earliestDate = new Date(earliest);
  earliestDate.setHours(0, 0, 0, 0);

  const days = [];
  for (let t = todayTs; t >= earliestDate.getTime(); t -= DAY) {
    days.push(new Date(t));
  }
  return days;
}

function DateRail({ posts, activeDay, todayKey, onJump }) {
  const days = useMemo(() => buildRailDays(posts), [posts]);

  const postsByDay = useMemo(() => {
    const map = new Map();
    for (const p of posts) {
      const k = dayKey(p.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    }
    return map;
  }, [posts]);

  let lastMonth = null;

  return (
    <div class="nf-rail">
      {days.map((d) => {
        const key = dayKey(d.getTime());
        const month = d.getMonth();
        const showMonth = month !== lastMonth;
        lastMonth = month;
        const isToday = key === todayKey;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const dayPosts = postsByDay.get(key);

        return (
          <div class="nf-rail__group" key={key}>
            {showMonth && (
              <div class="nf-rail__month">{MONTH_SHORT[month]} {d.getFullYear()}</div>
            )}
            <button
              type="button"
              class={
                'nf-rail__day' +
                (isToday ? ' is-today' : '') +
                (key === activeDay ? ' is-active' : '') +
                (isWeekend ? ' is-weekend' : '')
              }
              onClick={() => onJump(key)}
              title={d.toDateString()}
            >
              <span class="nf-rail__letter">{WEEKDAY_LETTERS[d.getDay()]}</span>
              <span class="nf-rail__num">{d.getDate()}</span>
              {dayPosts?.some((p) => p.sourceIcon === 'journal') && (
                <span class="nf-rail__marker nf-rail__marker--journal">{Icon.journal}</span>
              )}
              {dayPosts?.some((p) => p.captureMode === 'auto' && p.sourceIcon !== 'journal') && (
                <span class="nf-rail__marker nf-rail__marker--dot" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main tab ────────────────────────────────────────────────────── */

export function NotefallsTab() {
  const [posts, setPosts] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [activeDay, setActiveDay] = useState(dayKey(Date.now()));
  const feedRef = useRef(null);
  const rowRefs = useRef(new Map());

  const todayKey = dayKey(Date.now());

  useEffect(() => {
    api.list().then(setPosts).catch((err) => console.error('notefalls:list failed', err));
  }, []);

  const handlePost = async (input) => {
    const created = await api.create(input);
    setPosts((prev) => [created, ...prev]);
  };

  const handleSaveDrawer = async (id, patch) => {
    const updated = await api.update(id, patch);
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
  };

  const toggleExpand = (id) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  // Track which day's posts are scrolled to the top of the feed, so the
  // date rail can highlight the matching day.
  const onFeedScroll = () => {
    const container = feedRef.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top;
    let best = null;
    let bestDist = Infinity;
    for (const [day, el] of rowRefs.current) {
      if (!el) continue;
      const dist = el.getBoundingClientRect().top - top;
      if (dist >= -4 && dist < bestDist) {
        bestDist = dist;
        best = day;
      }
    }
    if (best && best !== activeDay) setActiveDay(best);
  };

  const jumpToDay = (key) => {
    const container = feedRef.current;
    if (!container) return;
    // Find the nearest row on or before this day (feed is reverse-chron).
    let target = null;
    for (const [day, el] of rowRefs.current) {
      if (!el) continue;
      if (day <= key) {
        if (!target || day > target.day) target = { day, el };
      }
    }
    if (target) {
      target.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveDay(target.day);
    } else {
      setActiveDay(key);
    }
  };

  const expandedPost = posts.find((p) => p.id === expandedId) || null;

  return (
    <div class="nf-tab">
      <DateRail posts={posts} activeDay={activeDay} todayKey={todayKey} onJump={jumpToDay} />

      <div class="nf-main">
        <div class="nf-feed" ref={feedRef} onScroll={onFeedScroll}>
          <Composer onPost={handlePost} />

          {(() => {
            // Only the topmost row for each day gets registered in rowRefs,
            // so jump-to-date / scroll-tracking land on the start of a day's group.
            rowRefs.current.clear();
            const seenDays = new Set();
            return posts.map((post) => {
              const key = dayKey(post.createdAt);
              const isFirst = !seenDays.has(key);
              seenDays.add(key);
              return (
                <FeedRow
                  key={post.id}
                  post={post}
                  expanded={expandedId === post.id}
                  onToggle={() => toggleExpand(post.id)}
                  rowRef={isFirst ? (el) => { if (el) rowRefs.current.set(key, el); } : undefined}
                />
              );
            });
          })()}

          {!posts.length && <p class="nf-empty">Nothing here yet — say what's up above.</p>}
        </div>

        {expandedPost && (
          <SessionDrawer post={expandedPost} onClose={() => setExpandedId(null)} onSave={handleSaveDrawer} />
        )}
      </div>
    </div>
  );
}
