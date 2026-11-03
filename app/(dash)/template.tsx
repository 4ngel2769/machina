/**
 * Re-mounts on every client-side navigation: gives quick fade-in page
 * changes instead of the browser's blank flash. 0.18s, 6px rise.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="pagefade">{children}</div>;
}
