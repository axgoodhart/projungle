import { useRef, useState, useLayoutEffect } from 'preact/hooks';

// Skeuomorphic folder tab. The silhouette can't be done with border-radius
// (the bottom corners flare OUTWARD with a concave curve), so it's drawn as a
// vector <path>, sized to the tab's content so tabs stay slim/content-hugging.
// The icon + label sit on top as SF Pro font glyphs (not SVG).
//
// Geometry (local px, y=0 top → y=H bottom):
//   H  tab height        F  bottom flare size        R  top corner radius
// The path is left open along the bottom: fill closes it implicitly along the
// baseline, while stroke covers only the top + sides + flares, so the active
// tab reads as connected to the content below.
const H = 32;
const F = 8;
const R = 20;
const PAD_X = 14; // label padding inside the straight section
const FLARE_TANGENT = 4; // how far up the side the flare eases in

function buildPath(w) {
  return [
    `M 0 ${H}`, // bottom-left foot
    `C 5 ${H} ${F} ${H - FLARE_TANGENT} ${F} ${H - F}`, // left flare → side
    `L ${F} ${R}`, // up the left side
    `Q ${F} 0 ${F + R} 0`, // top-left round
    `L ${w - F - R} 0`, // top edge
    `Q ${w - F} 0 ${w - F} ${R}`, // top-right round
    `L ${w - F} ${H - F}`, // down the right side
    `C ${w - F} ${H - FLARE_TANGENT} ${w - 5} ${H} ${w} ${H}`, // right flare → foot
  ].join(' ');
}

export function FolderTab({ label, glyph, active, onSelect }) {
  const contentRef = useRef(null);
  const [w, setW] = useState(120);

  // Size the tab (and its SVG viewBox 1:1) to the intrinsic content width so the
  // curves never distort and each tab hugs its label.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setW(Math.ceil(el.scrollWidth + PAD_X * 2 + F * 2));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label, glyph]);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      class={'keeper-tab' + (active ? ' is-active' : '')}
      style={{ width: `${w}px` }}
      onClick={onSelect}
    >
      <svg class="keeper-tab__shape" width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true">
        <path d={buildPath(w)} />
      </svg>
      <span class="keeper-tab__content" ref={contentRef}>
        <span class="keeper-tab__glyph">{glyph}</span>
        <span class="keeper-tab__label">{label}</span>
      </span>
    </button>
  );
}
