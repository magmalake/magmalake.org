---
checked: 0.8.6
---

## What it's for

iceberg is native Apache Iceberg, the top of the magmalake stack. It reads a table's metadata, plans a scan from its manifests and reads the rows as Arrow, with deletes applied and filters evaluated. It also writes: create, append, delete, overwrite, schema changes and snapshot expiry, committed through a filesystem, REST or SQL catalog. Manifests go through [avro](/s/avro), data files through [parquet](/s/parquet), storage through [objectstore](/s/objectstore), and the SQL catalog through [sqlite](/s/sqlite) or [postgres](/s/postgres). [Morca](https://morca.dev) pipelines run their steps on [Dista](https://morca.dev/dista/) over Iceberg tables read and committed with it.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add iceberg-mojo    # brings avro, parquet-full, objectstore, sqlite, postgres, roaring, threads and the codec tins
```

It sits at the top of the stack, so it pulls in fifteen tins. The FFI ones (zstd, lz4, brotli, objectstore, sqlite, postgres) install their C libraries into the environment, and a binary built there finds them without `CONDA_PREFIX`.

## Quick start

Create a table in a local warehouse, append rows, scan them with a filter, then add a column:

```mojo
from iceberg.batch import ColumnBuilder, batch_of
from iceberg.catalog.filesystem import FilesystemCatalog
from iceberg.schema import Schema
from iceberg.update_schema import UpdateSchema
from iceberg.values import Datum


def main() raises:
    var catalog = FilesystemCatalog.local("/tmp/iceberg-demo")
    if catalog.table_exists("db", "orders"):
        catalog.drop_table("db", "orders")
    var schema = Schema.parse(
        '{"schema-id":0,"type":"struct","fields":['
        '{"id":1,"name":"id","required":true,"type":"long"},'
        '{"id":2,"name":"region","required":true,"type":"string"}]}'
    )
    var table = catalog.create_table("db", "orders", schema)

    # Build an Arrow batch from Mojo values and fast-append it.
    var ids = ColumnBuilder.of(schema, 1)
    var region = ColumnBuilder.of(schema, 2)
    for k in range(6):
        ids.add(Datum.long_(Int64(k)))
        region.add(Datum.string_("eu" if k % 2 == 0 else "us"))
    print(table.append([batch_of([ids^, region^])]), "rows appended")

    # Scan with a filter and a projection.
    var rows = (
        table.scan().filter('[">","id",2]').select(["id", "region"]).to_table()
    )
    print(rows.to_csv())

    # Evolve the schema: old files read the new column as null.
    var u = UpdateSchema()
    u.add_column("note", "string")
    _ = table.update_schema(u)
    print(table.scan().to_table().to_csv())
    print(table.scan().count(), "rows")
```

## API

Import from the submodules, as below. `iceberg` itself re-exports most names except the catalogs (`Table` is the one catalog type it has). The README's API table lists every module.

**Catalogs.** Three exist, and all three create, load and commit tables:

- `FilesystemCatalog.local(var warehouse: String) -> Self`: tables at `<warehouse>/<ns>/<table>`, committed by writing a new `metadata.json`. `create_table(self, namespace: String, name: String, schema: Schema, spec: PartitionSpec = PartitionSpec.unpartitioned(), var properties: Dict[String, String] = Dict[String, String](), format_version: Int = 2) raises -> Table`, plus `load_table`, `table_exists`, `list_tables`, `list_namespaces` and `drop_table`.
- `RestCatalog(var uri: String)` or `RestCatalog(var config: RestCatalogConfig, var io: FileIO)` (in `iceberg.catalog.rest`): an Iceberg REST server over HTTPS. Set `config.with_token(...)`, `config.with_warehouse(...)` and `config.vend_credentials = True` as needed, then `connect(mut self) raises`. It has `load_table`, `list_tables`, `create_table`, and writes by name: `append(mut self, namespace: String, table: String, batches: List[RecordBatch], retries: Int = 4) raises -> Table`, `delete_where`, `overwrite`, `dynamic_partition_overwrite` and `update_schema`.
- `SqlCatalog.local(var name: String, uri: String, var warehouse: String) raises -> Self` (in `iceberg.catalog.sql`): PyIceberg's `SqlCatalog` tables, on SQLite (`sqlite:///catalog.db`) or PostgreSQL (`postgresql://user@host/db`), picked by the URI. Same write methods as `RestCatalog`, plus namespaces with properties and `rename_table`.

**`Table`** (`iceberg.catalog.filesystem`): a loaded table and its `FileIO`.

- `Table.load(location: String, var io: FileIO) raises -> Table` and `Table.load_local(location: String) raises -> Table`: a table directory or `metadata.json`, without a catalog.
- `scan(self) -> TableScan`, `refresh(mut self) raises`.
- `append(mut self, batches: List[RecordBatch]) raises -> Int64`, or `new_append(self) -> AppendFiles` then `add(batch)` and `commit() raises -> Int64`: a fast append. Returns the rows appended.
- `delete_where(mut self, filter_dsl: String, mode: String = String("")) raises -> Int64`: copy-on-write by default; `merge-on-read` writes deletion vectors on v3 and position delete files on v2.
- `overwrite(mut self, batches: List[RecordBatch], filter_dsl: String = String('["true"]')) raises -> Int64` and `dynamic_partition_overwrite(mut self, batches: List[RecordBatch]) raises -> Int64`.
- `expire_snapshots(mut self, older_than_ms: Int64 = -1, keep_last: Int = 1, dry_run: Bool = False) raises -> ExpireResult`: drops snapshots, then the files nothing references.
- `update_schema(mut self, update: UpdateSchema) raises -> Schema`: commits schema changes and returns the new schema.

**`TableScan`** (`iceberg.scan`): built up by chaining, then read.

- `filter(self, dsl: String) -> Self`, `select(self, var columns: List[String]) -> Self` (dotted names reach into structs; `_file`, `_pos` and other metadata columns work too), `use_snapshot(self, id: Int64) raises -> Self`, `use_ref`, `as_of(self, timestamp_ms: Int64) raises -> Self`.
- `to_table(self, options: ScanOptions = ScanOptions()) raises -> ScanResult`: every row, as Arrow columns. `ScanResult` has `num_rows`, `cell(row, col)`, `to_csv()`, `to_json()` and `to_batch()`.
- `to_batches(self, options: ScanOptions = ScanOptions()) raises -> List[RecordBatch]`, and `to_batch_reader(...) raises -> BatchReader` to stream them; call `raise_if_failed()` after looping over `reader.batches()`.
- `count(self, options: ScanOptions = ScanOptions()) raises -> Int64`: answered from manifest record counts where it can be.
- `plan_files(self) raises -> List[FileScanTask]`: the data files and delete files a read would open.

**`ScanOptions`** (`iceberg.read`): `num_workers` (1 by default, 0 for one per core), `limit`, `prune`, `batch_size` and `split_size`.

**Building batches** (`iceberg.batch`): `ColumnBuilder.of(schema: Schema, field_id: Int) raises -> Self`, `add(mut self, var value: Datum)`, `add_null`, then `batch_of(columns: List[ColumnBuilder]) raises -> RecordBatch`. `NestedBuilder` takes one JSON value per row for struct, list and map columns.

**Schema evolution** (`iceberg.update_schema`), new in 0.8.6: `UpdateSchema()` records changes, applied to the current schema at commit time (a lost race re-applies them).

- `add_column(mut self, name: String, type: String, doc: String = String("")) raises`: an optional column; `type` is a primitive (`long`, `decimal(10, 2)`) or a struct, list or map in JSON.
- `add_nested_column(mut self, parent: String, name: String, type: String, doc: String = String("")) raises`: into a struct, a list's element or a map's value.
- `rename_column(mut self, path: String, new_name: String) raises`, `make_column_optional(mut self, path: String)`.
- `update_column_type(mut self, path: String, new_type: String) raises`: `int` to `long`, `float` to `double`, or a wider decimal.
- `union_by_name(mut self, schema: Schema)`: merge another schema in by name; a type difference raises.

**Storage.** `FileIO` (`iceberg.io`) chooses a backend by URI scheme: local files, `s3://`, `gs://`, Azure (`abfss://`, `az://`) and `http(s)://`. Configure it with `FileIO.local()` then `set(mut self, var key: String, var value: String)` with Iceberg's property names (`s3.endpoint`, `s3.region`, ...); it falls back to the `AWS_*` environment. `rebase(old, new)` rewrites location prefixes, for a warehouse that has moved.

**Filters** are a JSON S-expression: `["and", [">", "id", 2], ["=", "region", "eu"]]`, with `=`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `not-in`, `is-null`, `not-null`, `is-nan`, `starts-with`, `and`, `or`, `not`, `true` and `false`. Literals are typed against the column.

## Errors and limits

- Errors start with `iceberg: `, such as `iceberg: table '<location>' already exists` or `iceberg: the schema has no field 'x'`. A REST error reads `iceberg: <operation> failed with 409 (conflict): <the server's message>`.
- Commits are optimistic: a writer that loses a race reloads and retries, four times by default, then raises. A REST commit that fails with a 5xx and can't be confirmed raises `iceberg: CommitStateUnknown ...`: it may have landed, so reload before retrying.
- A filesystem catalog over an object store isn't safe with two writers (S3 has no atomic create-if-absent). Use a REST catalog or the SQL catalog on PostgreSQL. The SQL catalog on SQLite is for local development and PyIceberg parity.
- Reads cover format v1 to v3; writes cover v2 and v3. Data files must be Parquet; ORC and Avro data files are refused.
- Schema changes are additive: added columns are optional, and you can't delete or move a column. Partition specs are fixed at `create_table`.
- Not implemented: compaction (`rewrite_manifests`, `rewrite_data_files`), encryption, predicates inside list or map elements (`tags.element = 'x'` is refused), REST remote signing, and equality deletes on partitioned or v3 tables.
- `write.parquet.row-group-size-bytes` is ignored; use `write.parquet.row-group-size-rows`.

## Tests

`pixi run test` runs over 200 tests against fixture tables written by iceberg-rust, PyIceberg and DuckDB, with expected rows and scan plans taken from those implementations. The runner also starts a mock REST catalog, MinIO for `s3://`, and a throwaway PostgreSQL server for the SQL catalog. `pixi run verify-writes` has PyIceberg and DuckDB read back tables this tin wrote, and `verify-sql-catalog` and `verify-pg-catalog` share a SQL catalog with PyIceberg in both directions, schema evolution included. CI runs the suite on macOS and Linux, and the PyIceberg and DuckDB write checks on Linux.
