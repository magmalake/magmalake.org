---
checked: 0.3.5
---

## What it's for

sqlite is an embedded SQL database for Mojo: a `Database`, prepared `Statement`s, `Row` snapshots and a `Transaction` guard over libsqlite3. It's the store behind the SQL catalog in [iceberg](/s/iceberg), the one PyIceberg calls `SqlCatalog`, and the way most local Iceberg setups start. [Morca](https://morca.dev) and [Dista](https://morca.dev/dista/) depend on it too. It's a fork of ehsanmok/sqlite with the ORM removed, so it depends on nothing but conda-forge's `libsqlite`.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add sqlite-mojo       # no other tins; brings libsqlite from conda-forge
```

The package is `sqlite-mojo`, because conda-forge owns `sqlite`; you import it as `sqlite`. libsqlite3 is found in `$CONDA_PREFIX/lib`, next to the executable, or through the binary's rpath, so a program built with `pixi run mojo build` also runs from a plain shell.

## Quick start

Create a table, insert two rows in one transaction and read them back:

```mojo
from sqlite import Database


def main() raises:
    var db = Database(":memory:")              # or a file path
    db.execute("CREATE TABLE people (name TEXT, age INTEGER, score REAL)")

    with db.transaction():                     # COMMIT here, ROLLBACK on raise
        var ins = db.prepare("INSERT INTO people VALUES (?, ?, ?)")
        ins.bind_text(1, "Ada")                # parameters are 1-based
        ins.bind_int(2, 36)
        ins.bind_float(3, 9.5)
        _ = ins.step()
        ins.reset()                            # reuse the statement
        ins.bind_text(1, "Grace")
        ins.bind_int(2, 45)
        ins.bind_null(3)
        _ = ins.step()

    var q = db.prepare("SELECT name, age, score FROM people ORDER BY age")
    while True:
        var row = q.step()                     # None once the rows run out
        if not row:
            break
        ref r = row.value()                    # columns are 0-based
        var score = "NULL" if r.is_null(2) else String(r.float_val(2))
        print(r.text_val(0), r.int_val(1), score)
```

## API

Everything is exported from `sqlite`.

**`Database(path: String) raises`**: a connection to a file, or to `":memory:"`. It closes when it's destroyed.

- `execute(self, sql: String) raises`: runs SQL with no parameters and no rows, such as DDL or a script.
- `prepare(self, sql: String) raises -> Statement`: compiles one statement.
- `transaction(self) raises -> Transaction`: issues `BEGIN` and returns the guard.
- `changes(self) raises -> Int`, `total_changes(self) raises -> Int` and `last_insert_rowid(self) raises -> Int`: what the last statements did.
- `last_error(self) raises -> String`: SQLite's message for the last failure.

**`Statement`**: a prepared statement, finalized when it's destroyed. Parameters are 1-based.

- `bind_int(self, idx: Int, val: Int) raises`, `bind_float(self, idx: Int, val: Float64) raises`, `bind_text(self, idx: Int, val: String) raises` and `bind_null(self, idx: Int) raises`.
- `step(self) raises -> Optional[Row]`: the next row, or None when the statement is done.
- `reset(self) raises`: rewinds the statement so you can bind new values and run it again. Bindings you don't replace keep their old values.

**`Row`**: a snapshot of one result row, copied out when it's produced, so it outlives its `Statement`. Columns are 0-based: `num_cols(self) -> Int`, `int_val(self, col: Int) -> Int`, `float_val(self, col: Int) -> Float64`, `text_val(self, col: Int) -> String` and `is_null(self, col: Int) -> Bool`.

**`Transaction`**: `commit(mut self) raises` and `rollback(mut self) raises`. Use it as `with db.transaction():` to commit when the block ends and roll back (and re-raise) when it raises. Keep it as `var tx = db.transaction()` to decide yourself; a guard destroyed without `commit()` rolls back.

## Errors and limits

- Failures raise with SQLite's code and message: `sqlite3_prepare_v2 failed: <sql> -- <message> (sqlite3 rc=1)`, and the same shape for `sqlite3_exec` and `sqlite3_open('<path>')`. `step` raises `sqlite3_step failed (rc=19): <message>` for a constraint violation.
- A library that can't be loaded raises from the first call that needs it, naming every place searched and saying to set `CONDA_PREFIX`.
- The value accessors don't raise. `int_val` and `float_val` on a NULL or a column of another type give 0, and `text_val` gives an empty string, so check `is_null` first when NULL matters.
- BLOB columns aren't exposed: a BLOB cell reads as empty. There is no bind-by-name; named placeholders in SQL work, but you bind them by index.
- `with db.transaction() as tx:` binds `tx` to None, because `__enter__` can't consume the guard; use the `var tx` form when you need the guard. Nested `BEGIN` isn't supported; use `SAVEPOINT` in SQL.
- There is no connection pool, no async and no query builder.

## Tests

`pixi run test` runs the unit suite (every bind and column variant, NULLs, statement reuse, every transaction path) and 13,500 property trials: arbitrary bytes executed as SQL never crash, binds round-trip exactly, and no `bind_text` payload escapes its placeholder. A cross-check has the `sqlite3` shell read back what this tin wrote, under `PRAGMA integrity_check`, and the tin read back what the shell wrote. A last test loads libsqlite3 with `CONDA_PREFIX` unset. CI runs it all on Linux and macOS, on the stable and nightly toolchains.
