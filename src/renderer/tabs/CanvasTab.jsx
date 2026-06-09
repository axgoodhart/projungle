import { useEffect } from 'preact/hooks';
// Legacy canvas markup, injected verbatim so app.js finds the IDs it expects.
import canvasMarkup from '../canvas-markup.html?raw';
// The untouched legacy canvas script, imported as a URL (not bundled/executed
// as a module). We load it via a classic <script> tag, exactly like the
// original `<script src="./app.js">`, so it runs in global scope unchanged.
import legacyCanvasUrl from '../../app.js?url';

// Module-level guard: boot the legacy canvas exactly once for the app lifetime,
// even though the Canvas panel stays mounted across tab switches.
let booted = false;

export default function CanvasTab() {
  useEffect(() => {
    if (booted) return;
    booted = true;

    // The markup is already in the DOM (rendered below before this effect runs),
    // so app.js's top-level document.getElementById(...) calls resolve correctly.
    const script = document.createElement('script');
    script.src = legacyCanvasUrl;
    script.dataset.keeperLegacyCanvas = 'true';
    document.body.appendChild(script);
  }, []);

  return <div class="canvas-host" dangerouslySetInnerHTML={{ __html: canvasMarkup }} />;
}
