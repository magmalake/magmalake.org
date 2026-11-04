/**
 * The home page's code tabs (src/components/CodeTabs.astro): one short
 * example per layer, each with a line under it and a link to its page.
 */
export type Example = { id: string; label: string; code: string; note: string; href: string };

export const examples: Example[] = [
  {
    id: "orchestration",
    label: "Orchestration",
    code: `from orca import Cron, Ctx, Mapped, Month, Monthly, Pipeline, Step, orca_main
from orca.tables import append

def load(mut ctx: Ctx, m: Month) raises -> Int64:
    var table = trips()
    return append(ctx, table, read_month(download(m)))

comptime Load = Step["load", Month, Int64, load, Mapped, retries=2]
comptime Taxi = Pipeline[
    "taxi", Load,
    partitions=Monthly["2011-01"],
    schedule=Cron["0 6 2 * *"],
    max_runs=4,
]

def main() raises:
    orca_main[Taxi]()`,
    note: `Orca: the compiler checks every edge, the binary gets run, resume and status, and the orca scheduler fires it monthly and backfills 2011–2024 four runs at a time.`,
    href: "/s/orca",
  },
  {
    id: "distributed",
    label: "Distributed compute",
    code: `from dista import ObjectRef, Runtime, Task
from parquet import ParquetReader

def rows(path: String) raises -> Int:
    return ParquetReader.open(path).num_rows()

comptime Rows = Task[String, Int, rows]

def main() raises:
    var rt = Runtime[Rows](workers=16)
    var refs = List[ObjectRef[Int]]()
    for path in files:
        refs.append(rt.remote[Rows](path))
    var total = 0
    for r in refs:
        total += rt.get(r)`,
    note: `Dista: one compiled binary is the driver, the head and every worker, on a laptop or a cluster; large results stay on the worker that made them.`,
    href: "/s/dista",
  },
  {
    id: "data",
    label: "Data processing",
    code: `from iceberg import Catalog

var table = Catalog.rest("https://polaris.example/api/catalog").load("db.events")
var rows = table.scan().filter('["=", "region", "eu"]').select(["id", "amount"]).to_table()`,
    note: `Metadata, manifests, scan planning, Parquet decode, deletes and deletion vectors, S3 IO and the REST catalog — all of it Mojo.`,
    href: "/s/iceberg",
  },
];
