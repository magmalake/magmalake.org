---
checked: 0.1.3
---

## What it's for

iceberg-rs is Apache Iceberg through [iceberg-rust](https://github.com/apache/iceberg-rust): a small Rust library exposes it over a C ABI, and this tin loads that library and wraps it in Mojo types. It opens SQL and REST catalogs, creates and loads tables, scans them with projection, time travel and pushdown filters, and appends. It came before the native [iceberg](/s/iceberg) and nothing needs it any more; it stays as a third, independent implementation that the native one's fixtures and scan plans are checked against. Its filter strings use the same grammar as iceberg's, so you can hand one filter to both and compare the plans.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add iceberg-rs-mojo # no other tins; builds the Rust shim
```

The first install compiles the shim (`libicebergrsmojo`) with conda's own Rust toolchain: 472 crates, so it takes several minutes; later installs are cached. You don't need Rust installed yourself unless you run the shim's own tests.

## Quick start

Create a table in a SQLite catalog, append three rows and scan them back with a filter:

```mojo
from std.os import makedirs

from iceberg_rs import Catalog


def main() raises:
    # A SQLite catalog: no server. Both paths must be absolute and exist.
    makedirs("/tmp/ibrs-demo/wh", exist_ok=True)
    var cat = Catalog.sql(
        "sqlite:/tmp/ibrs-demo/catalog.db?mode=rwc", "file:///tmp/ibrs-demo/wh"
    )
    if not cat.namespace_exists("sales"):
        cat.create_namespace("sales")
    if cat.table_exists("sales", "orders"):
        cat.drop_table("sales", "orders")
    var t = cat.create_table(
        "sales",
        "orders",
        '{"type":"struct","schema-id":0,"fields":['
        '{"id":1,"name":"id","required":true,"type":"long"},'
        '{"id":2,"name":"amount","required":false,"type":"double"}]}',
    )

    var b = t.builder()
    b.int_col("id", [Int64(1), Int64(2), Int64(3)])
    b.float_col("amount", [1.5, 2.5, 3.5])
    t.append(b.build())
    print("snapshot", t.commit())

    var scan = t.scan("id,amount", '[">","amount",2.0]')
    while True:
        var batch = scan.next()
        if not batch:
            break
        print(batch.value().int_col("id"), batch.value().float_col("amount"))
```

## API

Everything is exported from `iceberg_rs`. Results that are lists or documents come back as JSON text.

**`Catalog`**

- `Catalog.sql(uri: String, warehouse: String) raises -> Catalog`: a SQL catalog over SQLite, PostgreSQL or MySQL. `uri` is an sqlx connection string (`sqlite:/abs/path/catalog.db?mode=rwc`); `warehouse` is the data root (`file:///...`, `s3://...`).
- `Catalog.rest(uri: String, warehouse: String, props_json: String) raises -> Catalog`, or `Catalog.rest(uri: String)`: a REST catalog. OAuth2 settings and `header.*` entries go in `props_json`; see `examples/rest_polaris.md` in the repo.
- `create_namespace(mut self, ns: String) raises`, `namespace_exists(self, ns: String) raises -> Bool`, `drop_namespace`, `list_namespaces(self) raises -> String`.
- `create_table(mut self, ns: String, name: String, schema_json: String, partition_spec_json: String, props_json: String) raises -> Table`, with shorter overloads that leave out the spec and properties. The schema is Iceberg's metadata-JSON form and the spec an unbound partition spec.
- `load_table(self, ns: String, name: String) raises -> Table`, `table_exists`, `drop_table`, `list_tables(self, ns: String) raises -> String`.

**`Table`**

- `builder(self) raises -> BatchBuilder`: a batch bound to the table's schema.
- `append(mut self, imm batch: Batch) raises`: writes the batch's Parquet file(s) now and stages them; `pending_files` and `rollback` see and drop what's staged.
- `commit(mut self) raises -> Int64`: one new snapshot from everything staged; returns its id.
- `scan(self, columns: String, snapshot_id: Int64, filter: String) raises -> Scan`, and overloads `scan()`, `scan(columns)` and `scan(columns, filter)`. An empty string means all columns or no filter; snapshot 0 is the current one.
- `metadata_json`, `schema_json`, `partition_spec_json`, `snapshots_json`, `location`, `current_snapshot_id(self) raises -> Int64` (0 with no snapshot) and `refresh(mut self) raises`.

**`Scan`**: `next(mut self) raises -> Optional[Batch]`, `batches(mut self) raises -> List[Batch]`, and `plan_files(self) raises -> String`, the planned file tasks and their delete files, without reading data.

**`Batch`**: `num_rows`, `num_columns`, `schema_json`, and typed copies of a column: `int_col(self, name: String) raises -> List[Int64]` (any integer, date or timestamp; timestamps in microseconds, dates in days), `float_col`, `bool_col`, `str_col`. Nulls read as 0, 0.0, False or `""`; `validity(self, name: String) raises -> List[Bool]` tells them apart.

**`BatchBuilder`**: `int_col(mut self, name: String, imm values: List[Int64]) raises`, `float_col`, `bool_col`, `str_col`, each with an optional `valid: List[Bool]`, then `build(self) raises -> Batch`. Values are cast to the column's type; columns you leave out must be optional and are filled with nulls.

**Arrow C Data Interface:** `Scan.next_c_data`, `Batch.export_c_data` and `Table.append_c_data` move batches as `ArrowCData` (an `ArrowArray` plus `ArrowSchema` pair, released when it's destroyed).

## Errors and limits

- A failed call raises `<Type.method>: <iceberg-rust's message>`, for example `Catalog.sql: ib_catalog_sql_new: ... unable to open database file` when the catalog's directory doesn't exist.
- The shim is looked for in `$CONDA_PREFIX/lib`, next to the executable, in its `../lib` and on the binary's rpath, so a binary built in the pixi environment runs from a plain shell. If none loads, the error lists every place it looked and says to set `CONDA_PREFIX`.
- Writes are append only: no overwrite, row-level delete, compaction, snapshot expiry or schema evolution.
- iceberg-rust 0.10 doesn't apply v3 deletion vectors in scans: such a table reads back rows that should be gone. Don't use this as an oracle for those tables.
- The REST catalog has no SigV4 request signing (AWS Glue's REST endpoint and S3 Tables need a signing proxy); use vended credentials or ambient ones. Storage covers `file://`, `s3://`, `gs://`, `abfss://` and a few more, through OpenDAL.
- Filters bind literals against the column type and work on primitive columns only, not `binary` or `fixed`.

## Tests

`pixi run test` builds and runs the round trip against a SQLite catalog in a scratch directory: a partitioned table, two appends, and scans with filters and projection. It also checks the shim loads with `CONDA_PREFIX` unset. `pixi run pyiceberg` then has PyIceberg 0.11.1 open the same SQLite catalog file and read the same rows, snapshots and partitions. `pixi run test-ffi` is the Rust shim's own C-ABI test. CI runs all three on macOS and Linux.
