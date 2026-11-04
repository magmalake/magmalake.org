/**
 * Site search, built by Pagefind after `astro build` (`npm run build` runs
 * `pagefind --site dist`). Base.astro marks each page's <main> as the text to
 * index and tags the page with two filters from its path, so a new page is
 * searchable, and scoped, with nothing added:
 *
 *   section  Start here, Orca, Dista, Tins or Blog: the scopes /search offers;
 *   tin      the tin a /s/<tin>/... page belongs to, for a tin's own search.
 */
export const SECTIONS = ["Start here", "Orca", "Dista", "Tins", "Blog"] as const;

export function scopeOf(path: string): { section: string; tin?: string } {
  const p = path.replace(/\/$/, "") || "/";
  const tin = p.match(/^\/s\/([^/]+)/)?.[1];
  if (tin === "orca") return { section: "Orca", tin };
  if (tin === "dista") return { section: "Dista", tin };
  if (tin || p === "/tins" || p === "/performance") return { section: "Tins", tin };
  if (p.startsWith("/blog")) return { section: "Blog" };
  return { section: "Start here" };
}

/** Pages left out of the index. */
export const unindexed = (path: string): boolean => /^\/(404|search)\/?$/.test(path);
