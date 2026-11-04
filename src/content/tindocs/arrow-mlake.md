---
checked: 0.2.1
---

## What it's for

arrow-mlake holds Arrow data in Mojo and moves it in and out: to another library in the same process over the C Data Interface, to a file or socket as an IPC stream, or to another process through a [memory-region](/s/memory-region) mapping. [parquet](/s/parquet) returns its batches as arrow-mlake `RecordBatch`es and re-exports the module as `parquet.arrow`. It is a stopgap: when marrow, the community Arrow for Mojo, builds on Mojo 1.x, magmalake moves to it, so expect this API to change.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add arrow-mlake-mojo     # brings memory-region-mojo
```

## Quick start

Build a two-column batch by hand, write it as an Arrow IPC stream and read it back:

```mojo
from arrow_mlake import (
    AT_INT64, AT_UTF8, ArrayData, ArrowType, IpcWriter, RecordBatch,
    bit_set, read_ipc_stream, store_u64,
)


def main() raises:
    var ids = ArrayData(ArrowType(AT_INT64), "id")
    ids.length = 3
    ids.null_count = 1
    for i in range(3):
        bit_set(ids.validity, i, i != 1)   # row 1 is null
        store_u64(ids.values, UInt64(i * 10))
    var names = ArrayData(ArrowType(AT_UTF8), "name")
    names.length = 3
    names.offsets.append(0)
    for s in ["ada", "bo", "cy"]:
        names.values.extend(s.as_bytes())
        names.offsets.append(Int32(len(names.values)))

    var batch = RecordBatch()
    batch.roots.append(batch.arena.add(ids^))
    batch.roots.append(batch.arena.add(names^))
    batch.num_rows = 3

    var w = IpcWriter(batch)               # the schema comes from this batch
    w.write(batch)
    var bytes = w^.finish()                # pyarrow.ipc.open_stream reads this

    var s = read_ipc_stream(Span(bytes))
    ref back = s.batches[0]
    var col = back.column_i64(0)           # (values, validity)
    var strs = back.column_str(1)
    for i in range(back.num_rows):
        var v = String(col[0][i]) if col[1][i] else String("null")
        print(v, strs[0][i])
```

## API

Everything below is exported from `arrow_mlake` except the shared-mapping export.

**`ArrowType(id: Int)`**: a logical type, `id` one of the `AT_*` constants (`AT_INT64`, `AT_UTF8`, `AT_LIST`, `AT_STRUCT`, ...). `at_decimal(precision: Int, scale: Int)`, `at_timestamp(unit: Int, var tz: String)`, `at_time(unit: Int)` and `at_fixed(width: Int)` build the parameterized ones; `format(self) -> String` is its C format string.

**`ArrayData(var type: ArrowType, var name: String)`**: one array as the columnar spec lays it out. Its fields are `length`, `null_count`, `nullable`, `field_id`, `validity`, `offsets` (`List[Int32]`), `large_offsets`, `values` (raw bytes) and `children`, which are indices into the arena. `bit_set`, `bit_get` and `store_u64` help fill the buffers.

**`ArrayArena`**: owns every array of a batch, nested ones included. `add(mut self, var node: ArrayData) -> Int` appends one and returns its index.

**`RecordBatch`**: `arena`, `roots` (one index per column) and `num_rows`.

- `num_columns(self) -> Int`, `name(self, i: Int) -> String`, `type(self, i: Int) -> ArrowType` and `column(ref self, i: Int)`: the columns.
- `column_i64(self, i: Int) raises -> Tuple[List[Int64], List[Bool]]`, and `column_f64`, `column_bool`, `column_str`: a column as values plus validity.

**IPC streams**:

- `IpcWriter(schema: RecordBatch) raises`, then `write(mut self, batch: RecordBatch) raises` per batch and `finish(deinit self) -> List[UInt8]`.
- `write_ipc_stream(batches: List[RecordBatch]) raises -> List[UInt8]`: the same in one call.
- `read_ipc_stream(data: Span[UInt8, _]) raises -> IpcStream`: `schema` (a batch of no rows) and every batch in `batches`.

**C Data Interface**, with addresses passed as `Int`:

- `export_c(arena: ArrayArena, root: Int) raises -> ExportedArray`: one array out, buffers copied. `into_raw(mut self) -> Tuple[Int, Int]` hands the `ArrowArray` and `ArrowSchema` to the consumer, which must release them.
- `import_c(mut arena: ArrayArena, array: Int, schema: Int) raises -> Int`: copies a pair into the arena and releases nothing.
- `ImportedArray(array: Int, schema: Int)`: takes ownership of a pair; `into_batch(self) raises -> RecordBatch`, and the release callbacks run once, on `release()` or at destruction.
- `ImportedStream(stream: Int) raises`: takes an `ArrowArrayStream`; `next(mut self) raises -> Optional[RecordBatch]` until it returns None.
- `export_stream(arena: ArrayArena, roots: List[Int]) raises -> Int`: these arrays as a stream the consumer pulls and releases.

**Across processes** (`from arrow_mlake.carrow_shared import ...`): `export_shared(arena: ArrayArena, roots: List[Int], names: List[String], path: String) raises -> String` writes flat columns into a new shared mapping at `path` and returns a JSON manifest of where each buffer landed, as offsets from the base. `export_shared_into` and `shared_size` put several batches in one mapping.

## Errors and limits

- Types it can't represent raise with the format string: `arrow_mlake.carrow: <why> — Arrow format string "<fmt>"`. That covers unions, run-end encoding, list views, fixed-size lists, `date64`, durations, intervals, decimal32/64/256, the view types and dictionary encoding.
- IPC errors start with `ipc:`. Dictionaries, compression and the IPC file format aren't implemented and are refused by name; the reader bounds-checks every FlatBuffers offset and buffer.
- Every import copies the producer's buffers into `ArrayData`; nothing is borrowed. A producer's `offset` is honored by copying the window it names.
- What the C interface lets you check is checked (buffer and child counts, offsets, nesting up to `MAX_IMPORT_DEPTH`), but it carries no buffer sizes, so a truncated data buffer can't be detected.
- `get_next` failing raises with the producer's `get_last_error` message; the end of a stream is a released array, never an error.
- `export_shared` takes primitive, `utf8` and `binary` columns only, and raises on nested ones.

## Tests

`pixi run test` builds every layout by hand against the columnar spec and round-trips it through C export, import and IPC, with negative controls the comparators must catch. The pyarrow gates need `uv`: `verify-c-import` has pyarrow produce 63 cases and compare what comes back, `verify-c-stream` has pyarrow drain a Mojo `ArrowArrayStream`, and `verify-ipc` checks IPC streams both ways. CI runs the tests on Linux and macOS with Mojo 1.2.0 and nightly, and the three pyarrow gates with nightly.
