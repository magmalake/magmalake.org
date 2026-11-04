---
checked: 0.3.3
---

## What it's for

postgres is a PostgreSQL client over libpq: you write the SQL, bind `$1`-style parameters, and read typed rows. It backs the Postgres SQL catalog in [iceberg](/s/iceberg), and it's where [Orca](/s/orca) records runs so they resume where they stopped. `postgres.pool` adds a connection pool for a threaded service, such as one built on [threads](/s/threads). It's a client, not a framework: there's no ORM and no async.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add postgres-mojo     # brings threads-mojo, and libpq from conda-forge
```

libpq is loaded at run time from the environment, and conda-forge's build links OpenSSL, so `sslmode=require` works. You need a PostgreSQL server to talk to; for a local one, `pixi add postgresql` gives you `initdb` and `pg_ctl`.

## Quick start

Create a table, insert a row in a transaction, read it back and catch a duplicate by its SQLSTATE. This needs a running server; the program compiles as is.

```mojo
from postgres import Connection, Params, sqlstate_of


def main() raises:
    var conn = Connection("postgresql://localhost/app?connect_timeout=5")
    _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS people ("
        " id bigint PRIMARY KEY, name text NOT NULL, note text)"
    )

    var tx = conn.begin()
    _ = tx.execute(
        "INSERT INTO people VALUES ($1, $2, $3)",
        Params().int64(1).text("Ada").null(),
    )
    tx.commit()                        # without this, the insert rolls back

    var res = conn.query(
        "SELECT id, name, note FROM people WHERE id >= $1", Params().int64(1)
    )
    for row in res:
        var note = "NULL" if row.is_null("note") else row.text("note")
        print(row.int64("id"), row.text("name"), note)

    try:
        _ = conn.execute(
            "INSERT INTO people VALUES ($1, $2, $3)",
            Params().int64(1).text("Ada").null(),
        )
    except e:
        if sqlstate_of(e) == "23505":
            print("already there")
```

## API

Everything but the pool is exported from `postgres`.

**`Connection(conninfo: String) raises`** or **`Connection(config: ConnectionConfig) raises`**: one `PGconn`, used from one thread. The conninfo is a libpq URI or keyword string.

- `execute(mut self, sql: String, params: Params = Params()) raises -> Int`: runs a command, discards any rows and returns the count from the command tag.
- `query(mut self, sql: String, params: Params = Params()) raises -> Result`: runs a command and returns its rows.
- `prepare(mut self, name: String, sql: String) raises -> Statement`: prepares `sql` on the server once; the `Statement` then has `execute(params)` and `query(params)`.
- `begin(mut self) raises -> Transaction`: issues `BEGIN`.
- `copy_in(mut self, sql: String) raises -> CopyIn` and `copy_out(mut self, sql: String) raises -> CopyOut`: the bulk path, `COPY ... FROM STDIN` and `COPY ... TO STDOUT`.
- `last_error(self) -> PostgresError`, `is_alive(self) -> Bool`, `ping(mut self) -> Bool` and `close(mut self)`.

**`Transaction`**: `execute`, `query`, `savepoint(name)`, `rollback_to(name)`, `release(name)`, `commit()` and `rollback()`. A transaction that is dropped, or a `with conn.begin()` block left, without `commit()` rolls back.

**`Params()`**: a chainable builder, one method per type, each binding the matching OID: `text`, `int16`, `int32`, `int64`, `float32`, `float64`, `bool`, `numeric` (a `String`), `bytea`, `date_days`, `time_micros`, `timestamp_micros`, `timestamptz_micros`, `uuid`, `json`, `jsonb`, and `null(oid: UInt32 = 0)`.

**`Result`**: iterable over `Row`, with `num_rows()`, `num_cols()`, `row(row: Int) raises -> Row`, `column_name`, `column_oid` and `affected_rows()`. **`Row`** is a snapshot that outlives its `Result`. Its accessors take a column index or a name: `is_null`, `opt_text`, `text`, `bool`, `int16`, `int32`, `int64`, `float32`, `float64`, `numeric`, `bytea`, `date_days`, `time_micros`, `timestamp_micros`, `timestamptz_micros`, `uuid` and `json`.

**`CopyIn`**: `write(data)`, `write_rows(mut encoder: CopyEncoder)`, `finish() raises -> Int` (the row count) and `abort(reason)`. **`CopyOut`**: `next(mut chunk)`, `read_all()` and `rows() raises -> List[String]`. **`CopyEncoder`** builds COPY rows (`field`, `null`, `end_row`, `row`) and `decode_row` splits one back into `Optional[String]` cells.

**`ConnectionConfig(host: String = "localhost", port: Int = 5432, dbname: String = "", user: String = "", password: String = "", application_name: String = "postgres.mojo", sslmode: String = "prefer", connect_timeout: Int = 10)`**: typed fields instead of a URI. `set(key, value)` adds any other libpq keyword.

**`postgres.pool`** (import it by name): `ConnectionPool(conninfo: String, config: PoolConfig = PoolConfig()) raises`, with `lease() raises -> Lease` for `with pool.lease() as lease: lease.connection().query(...)`, plus `ref()`, `stats()`, `reap()` and `close()`. `PoolConfig(max_size: Int = 10, min_idle: Int = 0, acquire_timeout_ms: Int = 5000, max_lifetime_ms: Int = 1_800_000, max_idle_ms: Int = 600_000, on_return: Int = ON_RETURN_ROLLBACK, validate_on_checkout: Bool = True)`.

## Errors and types

- Every server error raises an `Error` shaped `postgres [SQLSTATE 23505] <message>`, followed by `DETAIL:`, `HINT:` and `SQL:` lines when there are any. `sqlstate_of(e)` reads the code back. `last_error()` keeps the structured `PostgresError` with predicates such as `is_unique_violation()`, `is_deadlock()` and `is_retryable()`.
- Two codes are made on the client: `08001` when a connection never came up, `08006` once it's closed or lost. Committing a transaction block that already failed raises `25P02` (after rolling it back) instead of silently rolling back.
- Typed accessors parse the cell's text as the type you ask for; they don't check the OID. A NULL cell raises instead of reading as zero. `numeric` stays a `String`, so no digits are lost. Dates and times are epoch integers, `timestamptz` is normalized to UTC, and an `infinity` or BC date raises: read it with `text()`.
- A `Statement`, `Transaction`, `CopyIn` or `CopyOut` shares its connection and keeps it open after the `Connection` value is gone. `close()` ends it for all of them; they raise `08006` after that.
- A pool lease returns its connection with `ROLLBACK` if a block is still open. A handle that outlives its lease gets the connection closed instead of pooled, so two threads never share a `PGconn`. A checkout that waits longer than `acquire_timeout_ms` raises `53300`. Nothing reaps idle connections in the background: call `reap()` on your own timer.
- Results and parameters use text format; binary format, `LISTEN`/`NOTIFY` and async aren't supported. Server notices go to stderr; add `options=-c client_min_messages=warning` to the conninfo to quiet them.

## Tests

`pixi run unit` needs no server: config rendering, SQLSTATE parsing, the text codec, `Params`, the COPY codec, and loading libpq with and without `CONDA_PREFIX`. `pixi run server` and `pixi run pool` each start a throwaway cluster from the conda `postgresql` package on a free port, with no Docker. They cover every type, transactions, COPY, every error path and the pool under twelve threads (on the stable toolchain only, since the nightly can't read the threads package), with a negative control that proves the escape check can fail. A cross-check writes an eighteen-column fixture with this tin and reads it cell by cell with psycopg 3, then the other way round, and compares both with `psql`. CI runs `pixi run test` on Linux and macOS, on the stable and nightly toolchains.
