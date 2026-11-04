/**
 * Excerpts of mojo-census for /getting-started/step-by-step, copied
 * verbatim from the repository (commit db1b20b); the line ranges are in each
 * comment. Regenerate them from the files rather than editing them here.
 */

export const GHARCHIVE_REPO = "https://github.com/magmalake/mojo-census";

/** bin/scheduler.mojo, lines 1-4 */
export const SCHEDULER = "from orca.command import orca_command\n\ndef main() raises:\n    orca_command()";

/** pipelines/gharchive.mojo, lines 30-31 and 72-82 */
export const GHARCHIVE_DECL = "comptime Hour = Task2[String, Int, Seq[RecordBatch], hour_task]\ncomptime GhTasks = Tasks[Hour]\n\ncomptime LoadDay = Step[\n    \"load_day\", Day, Int64, load_day, Mapped, retries=2, writes=[EVENTS]\n]\ncomptime GhArchive = Pipeline[\n    \"gharchive\",\n    LoadDay,\n    tasks=GhTasks,\n    partitions=Daily[\"2023-01-01\"],\n    schedule=Cron[\"0 3 * * *\"],  # 03:00 UTC, for the day before\n    workers=4,\n]";

/** pipelines/gharchive.mojo, lines 34-69 */
export const GHARCHIVE_STEP = "def load_day(mut ctx: Ctx, d: Day) raises -> Int64:\n    var day = String(d)\n    var hours = parse_hours(getenv(\"GHARCHIVE_HOURS\"))\n    var table = ensure_table(ctx, EVENTS, events_schema(), events_spec())\n    ref rt = ctx.runtime[GhTasks]()\n    var window = max(1, Int(getenv(\"GHARCHIVE_PARALLEL\", \"4\")))\n\n    # Hours an earlier attempt of this step already committed come first in\n    # its commit order; recognise them without fetching anything.\n    var done = 0\n    while done < len(hours) and find_commit(ctx, table) >= 0:\n        _ = append(ctx, table, List[RecordBatch]())\n        done += 1\n    if done > 0:\n        ctx.log(String(day, \": \", done, \" hours already committed\"))\n\n    var refs = List[ObjectRef[Seq[RecordBatch]]]()\n    var next = done\n    while next < len(hours) and next - done < window:\n        refs.append(rt.remote[Hour](day, hours[next]))\n        next += 1\n    var rows = Int64(0)\n    for i in range(done, len(hours)):\n        var got = rt.get(refs[i - done])\n        rt.release(refs[i - done])\n        if next < len(hours):\n            refs.append(rt.remote[Hour](day, hours[next]))\n            next += 1\n        var n = 0\n        for b in got.items:\n            n += b.num_rows\n        var id = append(ctx, table, got.items)\n        rows += Int64(n)\n        ctx.log(String(day, \" hour \", hours[i], \": \", n, \" events, snapshot \", id))\n    ctx.log(String(day, \": \", rows, \" events in \", len(hours) - done, \" hours\"))\n    return rows";

/** pipelines/mojo_history.mojo, lines 147-165 */
export const HISTORY_DECL = "comptime Histories = Step[\n    \"histories\",\n    Seq[Name],\n    Int,\n    histories,\n    Gather,\n    retries=1,\n    reads=[REPOS],\n    writes=[COMMITS, MIGRATIONS],\n]\ncomptime MojoHistory = Pipeline[\n    \"mojo_history\",\n    Histories,\n    tasks=HistoryTasks,\n    partitions=Keyed[REPOS, \"repo\"],  # owner/name\n    keys_per_run=50,\n    sensor=True,\n    workers=4,\n]";

/** bin/console.mojo, lines 294-305 */
export const CONSOLE_MAIN = "def main() raises:\n    var r = Router()\n    r.get(\"/\", index)\n    r.get(\"/versions\", versions)\n    r.get(\"/repos/:owner/:name\", repo_page)\n    r.get(\"/api/repos\", index_json)\n    r.get(\"/api/versions\", versions_json)\n    r.get(\"/api/repos/:owner/:name\", repo_json)\n    var addr = String(\"0.0.0.0:\", getenv(\"PORT\", \"8080\"))\n    var server = HttpServer.bind(SocketAddr.parse(addr), ServerConfig())\n    print(\"console on http://\", addr, sep=\"\")\n    server.serve(r^)";

/** bin/console.mojo, lines 159-177 */
export const CONSOLE_VERSIONS = "def versions(req: Request) raises -> Response:\n    try:\n        var rows = versions_by_month()\n        var h = String(\n            \"<h1>Mojo versions over time</h1><p class=mute>Each month, how many\",\n            \" libraries moved to each Mojo version (from their lock file, or\",\n            \" their manifest when there's no lock), in Mojo's own order across\",\n            \" the renumbering: 24.x, 25.x, 0.25.x, 0.26.x, 1.x.</p>\",\n            \"<table><tr><th>Month</th><th>Version</th><th class=num>Libraries</th></tr>\",\n        )\n        for ref r in rows:\n            h.write(\n                \"<tr><td>\", r.month, \"</td><td>\", html_escape(r.version),\n                \"</td><td class=num>\", r.repos, \"</td></tr>\",\n            )\n        h.write(\"</table>\")\n        return _page(\"Mojo versions\", h^)\n    except e:\n        return internal_error(String(e))";

/** mojo-census deployed with `orca aws`: Orca's UI and the console. */
export const ORCA_DEMO = "https://orca.mlake.dev";
export const LIBS = "https://census.mlake.dev";
