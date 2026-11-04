/**
 * The pages each tin gets under /s/<tin> (src/pages/s/[tin]/), and so the
 * links in its header and footer. Orca and Dista have sections of their own
 * and are left out. A page appears for a tin only when it has something to
 * show: Performance when there are numbers or notes for it, API when
 * scripts/api-docs.mjs has written src/data/api/<slug>.json for it. Orca and
 * Dista keep their own pages and get an API reference too.
 */
import { tins, slugOf, type Tin } from "./tins";
import { perfFor, passesFor } from "./perf";
import { apiOf } from "./apiref";
import { orcaLinks } from "./orca";
import { distaLinks } from "./dista";

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
  const slug = slugOf(t);
  const base = `/s/${slug}`;
  const api = apiOf(slug) ? [{ href: `${base}/api`, label: "API" }] : [];
  if (t.site === "/s/orca") return [...orcaLinks, ...api];
  if (t.site === "/s/dista") return [...distaLinks, ...api];
  return [
    { href: base, label: "Overview" },
    { href: `${base}/docs`, label: "Docs" },
    ...api,
    ...(hasPerformance(t) ? [{ href: `${base}/performance`, label: "Performance" }] : []),
  ];
};

/** The tins with an API reference, Orca and Dista among them. */
export const apiTins = (): Tin[] => tins.filter((t) => apiOf(slugOf(t)));

/** The licence line in its footer: the three republished tins keep upstream's. */
export const licenceOf = (t: Tin): string =>
  t.tier === "republished" ? "MIT, as upstream" : "Apache 2.0 · © 2026 Marius Seritan";
