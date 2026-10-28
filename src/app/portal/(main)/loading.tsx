// Shown the instant a menu item or link is clicked, while the page's data loads on the server.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6 h-7 w-48 rounded-md bg-muted" />
      <div className="mb-6 h-4 w-80 max-w-full rounded bg-muted" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-xl border bg-card" />)}
      </div>
      <div className="rounded-xl border bg-card p-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="mb-3 h-4 rounded bg-muted" style={{ width: `${90 - (i % 3) * 15}%` }} />)}
      </div>
    </div>
  );
}
