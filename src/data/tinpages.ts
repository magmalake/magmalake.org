/**
 * The pages each tin gets under /s/<tin> (src/pages/s/[tin]/), and so the
 * links in its header and footer. Orca and Dista have sections of their own
 * and are left out. A page appears for a tin only when it has something to
 * show: Performance when there are numbers or notes for it.
 */
import { tins, slugOf, type Tin } from "./tins";
import { perfFor, passesFor } from "./perf";

export type TinLink = { href: string; label: string };

/** The tins with generated pages. */
export const pagedTins = (): Tin[] => tins.filter((t) => !t.site);

export const hasPerformance = (t: Tin): boolean => {
  const slug = slugOf(t);
  return (
    perfFor(slug).length > 0 ||
    passesFor(slug).length > 0 ||
    (t.perfNotes?.length ?? 0) > 0 ||
    Boolean(t.benchmarks)
  );
};

/** Its pages, in the order its header shows them. */
export const tinLinks = (t: Tin): TinLink[] => {
  const base = `/s/${slugOf(t)}`;
  return [
    { href: base, label: "Overview" },
    { href: `${base}/docs`, label: "Docs" },
    ...(hasPerformance(t) ? [{ href: `${base}/performance`, label: "Performance" }] : []),
  ];
};

/** The licence line in its footer: the three republished tins keep upstream's. */
export const licenceOf = (t: Tin): string =>
  t.tier === "republished" ? "MIT, as upstream" : "Apache 2.0 · © 2026 Marius Seritan";
