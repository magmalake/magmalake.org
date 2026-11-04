---
checked: 0.11.7
---

## What it's for

parquet reads and writes Apache Parquet natively: footer, page headers, levels and values are all decoded in Mojo, and a read comes back as Arrow arrays from [arrow-mlake](/s/arrow-mlake). It is the data-file layer under [iceberg](/s/iceberg), which uses its field-id projection, statistics, page index and bloom filters to plan and prune scans. This tin handles `UNCOMPRESSED`, `SNAPPY` and `GZIP` with no FFI. For `ZSTD`, `BROTLI` and `LZ4`, add [parquet-full](/s/parquet-full) as well: it plugs into the same reader and writer.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add parquet-mojo    # brings arrow-mlake, thrift, hashes, snappy, deflate, threads
```

Most Parquet in the wild, Iceberg's included, is ZSTD. Unless you control the files you read, add `parquet-full-mojo` instead; see [parquet-full](/s/parquet-full).

## Quick start

Open a file, prune row groups by their statistics, read what's left, and write it back out. `prune.parquet` is in the repository's `tests/fixtures`:

```mojo
from std.sys import argv

from parquet import (
    OP_GE,
    OP_LT,
    ParquetReader,
    ParquetWriter,
    Predicate,
    ScalarValue,
    WriterOptions,
)


def main() raises:
    var path = String(argv()[1]) if len(argv()) > 1 else "prune.parquet"
    var r = ParquetReader.open(path)
    print(r.num_rows(), "rows in", r.num_row_groups(), "row groups")

    # Keep only the row groups whose statistics allow 250 <= k < 260.
    r.select_columns(["k"])
    var preds: List[Predicate] = [
        Predicate("k", OP_GE, ScalarValue.of_int(250)),
        Predicate("k", OP_LT, ScalarValue.of_int(260)),
    ]
    print(r.prune_row_groups(preds), "row groups left")

    var t = r.read_table()
    var k = t.column_i64(0)                 # (values, validity)
    var n = 0
    for i in range(len(k[0])):
        if k[1][i] and k[0][i] >= 250 and k[0][i] < 260:
            n += 1
    print(t.num_rows, "rows read,", n, "match")

    # Write what was read back out (SNAPPY by default) and read that.
    var w = ParquetWriter(WriterOptions())
    for b in t.batches:
        w.write_batch(b.arena, b.roots)
    var again = ParquetReader(w^.finish())
    print("rewritten:", again.num_rows(), "rows,", again.num_row_groups(), "row group")
```

## API

Everything below is exported from `parquet`, along with the arrow-mlake types it returns (`RecordBatch`, `ArrayData`, `ArrayArena`, `ArrowType`, `export_c`, `import_c`).

**`ParquetReader[Codecs: CodecSet = DefaultCodecs]`**: one file, projected and read in batches. Pass `AllCodecs` from [parquet-full](/s/parquet-full) as `Codecs` for the FFI codecs.

- `ParquetReader.open(path: StringSlice) raises -> Self`: reads the whole file into memory.
- `ParquetReader.open_projected(path: StringSlice, columns: List[String]) raises -> Self`: reads the footer, then only the column chunks those columns need.
- `ParquetReader(var data: List[UInt8])` and `ParquetReader.from_span(data: Span[UInt8, _])`: a file already in memory, owned or borrowed. A borrowed span must outlive the reader.
- `num_rows()`, `num_row_groups()`, `created_by()`, `key_value_metadata()`, `split_offsets()`: the file's metadata; `schema` is its `ParquetSchema`.
- `statistics(self, rg: Int, leaf: Int) raises -> TypedStats`: a column chunk's min, max, null and distinct counts, decoded to the column's type.
- `select_columns(mut self, names: List[String]) raises`, `select_field_ids(mut self, ids: List[Int32]) raises`, `select_field_ids_deep(mut self, ids: List[Int32]) raises`: project by top-level name, by Parquet field id, or into nested fields by id.
- `select_row_groups(mut self, var groups: List[Int]) raises`: read only these row groups.
- `prune_row_groups(mut self, predicates: List[Predicate]) raises -> Int`: drops the row groups whose statistics prove no row can match all the predicates; returns how many are left.
- `prune_pages(mut self, predicates: List[Predicate]) raises -> Int`: the same with the page index, so pages outside the matching rows are never decompressed; returns the rows left. `pages_read()` counts the pages that were decoded.
- `has_next(mut self) -> Bool`, `read_batch(mut self) raises -> RecordBatch`, `rewind(mut self)`: stream up to `batch_size` rows (default 65536) at a time, one row group in memory.
- `read_table(mut self) raises -> Table`: every selected row group at once.
- Fields you can set: `batch_size`, `verify_crc` (default true), `num_workers` (default 1; 0 means one per core), `max_batch_value_bytes`.

**`Predicate(column: String, op: Int, value: ScalarValue)`**: `column op value`, with `op` one of `OP_EQ`, `OP_NE`, `OP_LT`, `OP_LE`, `OP_GT`, `OP_GE`. Build the value with `ScalarValue.of_int`, `of_uint`, `of_float`, `of_bool`, `of_string` or `of_bytes`.

**`Table`**: `batches: List[RecordBatch]` and `num_rows`, with `num_columns()`, `name(i)`, `type(i)` and the typed accessors `column_i64`, `column_f64`, `column_bool` and `column_str`, each returning `(values, validity)` across all batches.

**`ParquetWriter[Codecs: CodecSet = DefaultCodecs](var options: WriterOptions)`**: writes Arrow arrays as Parquet.

- `write_batch(mut self, arena: ArrayArena, roots: List[Int]) raises`: appends a batch, in the shape `RecordBatch` has.
- `add_metadata(mut self, key: StringSlice, value: StringSlice)`: a key/value pair for the footer.
- `finish(deinit self) raises -> List[UInt8]`: the file's bytes.

**`WriterOptions()`**: `codec` (a thrift `CompressionCodec` value, default `SNAPPY`), `row_group_size`, `data_page_size`, `use_dictionary`, `write_statistics`, `write_page_index` and `created_by`.

Also exported: `build_schema` and `ParquetSchema` (with `field_by_name`, `field_by_id`, `leaf_by_path`), `decode_stats`, `CodecSet` and `DefaultCodecs`. Bloom filters are `read_bloom_filter(file, column_metadata) -> Optional[BloomFilter]` and `BloomFilter.might_contain(ScalarValue)`.

## Errors and limits

- Errors are `Error`s whose message starts with `parquet:` or the module, such as `parquet.page:` or `parquet.writer:`, and names what was wrong: `parquet: no column named 'x'`, `parquet: row group 12 does not exist`, `parquet.page: CRC32 mismatch on the page at ...`. Truncated or corrupt files raise; they don't crash or read out of bounds.
- A page in a codec this reader's `CodecSet` lacks raises `parquet: page codec ZSTD is not available — use parquet_full.AllCodecs ...` when the read reaches it. Project that column away and the rest of the file still reads.
- With `num_workers` above 1, a failing column chunk raises the same error as it would sequentially, in row-group then column order.
- One row with more than 2 GiB of `BYTE_ARRAY` data in a column raises: Arrow `large_binary` isn't produced. Larger column chunks read, cut into smaller batches.
- Not supported: Parquet encryption, and pyarrow's `ARROW:schema` metadata, so a `large_string` column reads as `string`.
- The writer writes v1 pages with `PLAIN` or `RLE_DICTIONARY` values, statistics, field ids and a page index. It doesn't write v2 pages, the delta or byte-stream-split encodings, page CRCs, `INT96` or bloom filters.

## Tests

pyarrow is the oracle: 24 fixtures written by pyarrow and nine real Iceberg data files are read and compared with pyarrow's dump of every value, at several batch sizes and worker counts. `pixi run test` runs that suite and the writer's round trips; `pixi run verify-written` has pyarrow read back everything the writer writes, and `pixi run verify-c` imports the C Data Interface export into pyarrow. CI runs them on Linux and macOS, on nightly and Mojo 1.2.0, with the sibling tins checked out beside the repository. The codec tests are [parquet-full](/s/parquet-full)'s.
