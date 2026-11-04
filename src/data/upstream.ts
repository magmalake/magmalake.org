export type UpstreamStatus = "filed" | "confirmed";

export interface UpstreamIssue {
  /** The upstream project the issue lives in. */
  project: string;
  /** Issue reference as it should read, e.g. `apache/arrow#51097`. */
  ref: string;
  url: string;
  /** One line: what is wrong. */
  bug: string;
  /**
   * `filed` — magmalake reported it.
   * `confirmed` — it was already open upstream; magmalake reproduced it independently.
   */
  status: UpstreamStatus;
  /** The tins whose pages list it: the ones whose oracle turned it up. */
  tins: string[];
}

/** Shown above the list, on each tin page that has one. */
export const UPSTREAM_BLURB =
  "Holding three implementations against each other surfaces disagreements, and not all of them turned out to be my fault. I cut each one below down to a standalone script or unit test with no magmalake code in it, then either reported it upstream or — where someone had got there first — matched it to the report that already existed.";

export const STATUS_LABEL: Record<UpstreamStatus, string> = {
  filed: "reported",
  confirmed: "reproduced",
};

/**
 * Disagreements between magmalake and its oracles that turned out to be the
 * oracle's fault. Every one was reduced to a standalone script or unit test
 * with no magmalake code in it before it was reported or linked here.
 */
export const upstreamIssues: UpstreamIssue[] = [
  {
    project: "Apache Arrow",
    ref: "apache/arrow#51097",
    url: "https://github.com/apache/arrow/issues/51097",
    bug: "The Parquet writer undercounts nulls for a fixed-width leaf under list<struct> when some lists are null or empty. The BYTE_ARRAY leaf beside it in the same struct is right, so two leaves disagree about the same level records.",
    status: "filed",
    tins: ["parquet"],
  },
  {
    project: "iceberg-rust",
    ref: "apache/iceberg-rust#3118",
    url: "https://github.com/apache/iceberg-rust/issues/3118",
    bug: "An In predicate whose literals straddle a file's bounds is never pruned: the lower and upper bounds are each tested against the whole literal set instead of narrowing it, as Java and PyIceberg do.",
    status: "filed",
    tins: ["iceberg", "iceberg-rs"],
  },
  {
    project: "PyIceberg",
    ref: "apache/iceberg-python#3690",
    url: "https://github.com/apache/iceberg-python/pull/3690",
    bug: "v3 manifests and manifest lists are read with the v2 projection, so first_row_id, referenced_data_file, content_offset and content_size_in_bytes are dropped on the way in.",
    status: "confirmed",
    tins: ["iceberg"],
  },
  {
    project: "PyIceberg",
    ref: "apache/iceberg-python#3620",
    url: "https://github.com/apache/iceberg-python/issues/3620",
    bug: "The mirror image on the write path: the manifest writer builds its record schema at DEFAULT_READ_VERSION, so those same v3 fields would serialise as null.",
    status: "confirmed",
    tins: ["iceberg"],
  },
  {
    project: "PyIceberg",
    ref: "apache/iceberg-python#3833",
    url: "https://github.com/apache/iceberg-python/issues/3833",
    bug: "A null list<struct> or map<K, struct> is rebuilt as an empty one — on the write path too, so the null is gone at rest and no reader can recover it.",
    status: "confirmed",
    tins: ["iceberg"],
  },
];

export const upstreamFor = (tin: string) => upstreamIssues.filter((u) => u.tins.includes(tin));
