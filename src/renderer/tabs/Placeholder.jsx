// Simple placeholder screen for tabs not yet built (Journals, Agents,
// Notefalls, Recents). Replaced by real implementations in later phases.
export function Placeholder({ title, subtitle }) {
  return (
    <div class="keeper-placeholder">
      <span class="keeper-placeholder__badge">Coming soon</span>
      <h2 class="keeper-placeholder__title">{title}</h2>
      <p class="keeper-placeholder__subtitle">{subtitle}</p>
    </div>
  );
}
