'use client';

export default function RouteThemeToggle({ theme = 'dark', onToggle, compact = false }) {
  return (
    <button
      type="button"
      className={`route-theme-toggle ${compact ? 'is-compact' : ''}`}
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="route-theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
      <span className="route-theme-toggle-icon" aria-hidden="true">
        {theme === 'dark' ? '◐' : '☀'}
      </span>
    </button>
  );
}
