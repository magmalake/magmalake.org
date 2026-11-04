---
checked: 0.4.4
---

## What it's for

avro reads and writes Apache Avro: schemas, the binary encoding, Object Container Files and schema resolution. Iceberg's manifest lists and manifests are Avro container files, so this is the first thing [iceberg](/s/iceberg) reads when it plans a scan and the last thing it writes when it commits. It's pure Mojo; its one dependency is [deflate](/s/deflate), for the `deflate` block codec.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add avro-mojo       # brings deflate-mojo
```

## Quick start

Write a small container file, then read it back with both readers:

```mojo
from avro import (
    DataFileReader,
    DataFileWriter,
    RecordBuilder,
    RecordCursor,
    Value,
    parse_schema,
)


def main() raises:
    var schema = parse_schema(
        '{"type": "record", "name": "trip", "fields": ['
        '{"name": "id", "type": "long"},'
        '{"name": "city", "type": ["null", "string"]}]}'
    )
    var w = DataFileWriter(schema^, "deflate")
    for i in range(3):
        var b = RecordBuilder()
        b.add("id", Value.long(Int64(i)))
        b.add("city", Value.union(1, Value.string("Lisbon")))
        w.append(b^.build())
    w.save("trips.avro")

    # The general reader: one dynamically typed Value per record.
    var r = DataFileReader.open("trips.avro")
    print(r.codec, r.schema_json())
    while r.has_next():
        var rec = r.next()
        print(rec.field("id").as_long(), rec.field("city").as_string())

    # The fast reader: compile the schema once, read into reused slots.
    var c = RecordCursor.open("trips.avro")
    var id = c.plan.slot_of("id")
    var city = c.plan.slot_of("city")
    while c.next():
        print(c.get_long(id), c.get_str(city))
```

## API

Everything below is exported from `avro`.

**Schemas.** `parse_schema(text: StringSlice) raises -> Schema` parses Avro schema JSON into an arena of nodes with a `root` index; a named type that refers to itself is the same index twice.

- `kind(self, i: Int) -> Int`, `name`, `logical_type`, `num_fields`, `field(self, i: Int, k: Int) -> Field`, `field_index(self, i: Int, name: StringSlice) -> Int`, `items`, `values`, `branch`: walk the tree. Kinds are the constants `NULL`, `BOOLEAN`, `INT`, `LONG`, `FLOAT`, `DOUBLE`, `BYTES`, `STRING`, `RECORD`, `ENUM`, `ARRAY`, `MAP`, `UNION`, `FIXED`.
- `is_optional(self, i: Int) -> Bool` and `optional_branch(self, i: Int) -> Int`: recognise `["null", T]`. `is_logical_map(self, i: Int) -> Bool` flags Iceberg's non-string-key maps.
- `Field.field_id(self) -> Int`, `element_id(self, i: Int) -> Int`, `key_id`, `value_id`: the Iceberg ids kept from the schema JSON.
- `to_json(self) -> String`, `parsing_canonical_form(self) -> String`, `fingerprint(self) -> UInt64` (CRC-64-AVRO).

**`Value`**: one dynamically typed datum, cheap to copy (the arena is behind an `ArcPointer`).

- `field(self, name: StringSlice) raises -> Value`: a record field, with a `["null", T]` union unwrapped; `field_raw` keeps the union.
- `at(self, k: Int) -> Value`, `key(self, k: Int) -> String`, `len()`: arrays and maps.
- `as_long(self) -> Int64`, `as_int`, `as_double`, `as_float`, `as_bool`, `as_string(self) -> String`, `as_bytes(self) -> List[UInt8]`, `is_null(self) -> Bool`, `symbol`, `unwrap`.
- Constructors `Value.null()`, `.long(v: Int64)`, `.string(v: StringSlice)`, `.bytes`, `.array(items: List[Value])`, `.record(var names: List[String], values: List[Value])`, `.union(index: Int, branch: Value)` and the rest; `RecordBuilder`, `ArrayBuilder` and `MapBuilder` build one field at a time (`add`, then `b^.build()`).

**`DataFileReader[C: CodecSet = DefaultCodecs]`**: a container file in memory.

- `open(path: StringSlice) raises -> Self`, `from_bytes(data: Span[UInt8, _]) raises -> Self`, or `DataFileReader(var data: List[UInt8], *, defer_schema: Bool = False)`.
- `has_next(mut self) raises -> Bool`, `next(mut self) raises -> Value`, `read_all(mut self) raises -> List[Value]`.
- `schema`, `codec`, `metadata_keys`/`metadata_vals`, `metadata_string(self, key: StringSlice) raises -> String`, `schema_json(self) raises -> String`: the header, including Iceberg's own keys.

**`DataFileWriter[C: CodecSet = DefaultCodecs]`**: `DataFileWriter(var schema: Schema, codec: StringSlice = "null", sync_interval: Int = DEFAULT_SYNC_INTERVAL)`, then `append(mut self, value: Value) raises`, `set_metadata_string(mut self, key: StringSlice, value: StringSlice) raises`, `set_schema_json(mut self, text: StringSlice) raises` (write an exact schema text) and `bytes(mut self) raises -> List[UInt8]` or `save(mut self, path: StringSlice) raises`.

**`RecordCursor[C: CodecSet = DefaultCodecs]`**: the schema compiled into a `DecodePlan` once; records decode into reused slot buffers with no allocation per record, about ten times faster than `Value`.

- `open(path: StringSlice, select: List[String] = []) raises -> Self`, `from_bytes`, `of_bytes`, `of(var reader, select)`: `select` keeps only those dotted paths.
- `open_cached(path: StringSlice, mut cache: PlanCache, select: List[String] = []) raises -> Self`: reuse a plan across files whose `avro.schema` bytes are identical. `PlanCache()` is yours to own; it counts `hits` and `misses`.
- `resolved(var reader, var resolution: ResolvedReader, select: List[String] = []) raises -> Self`: read in a reader schema.
- `next(mut self) raises -> Bool`, then `plan.slot_of(path: StringSlice) raises -> Int` (or `try_slot`, -1 when absent) and `get_long(self, slot: Int, k: Int = 0) -> Int64`, `get_str`, `get_string`, `get_bytes`, `get_double`, `get_bool`, `is_null`, `array_len`, `union_branch`. Nested paths are dotted: `data_file.lower_bounds.element.key`, with `k` indexing array elements.

**Also exported:** `resolve(writer: Schema, reader: Schema) raises -> ResolvedReader`, `Decoder`, `Encoder`, `encode_value(schema: Schema, value: Value) raises -> List[UInt8]`, `crc32`, and the `CodecSet` trait.

## Errors and limits

- Errors start with where they came from: `avro.DataFileReader: sync marker mismatch after a data block`, `avro.Decoder: truncated input, wanted 8 byte(s) at offset ...`, `avro.DataFileWriter: codec 'x' is not in the CodecSet this writer was built with`.
- The installed package handles the `null` and `deflate` codecs. `snappy` and `zstandard` live in a separate `avro_codecs` package (`DataFileReader[AllCodecs]`) that isn't part of the published tin: to use them, put a checkout's `src` on the include path and install `snappy-mojo` and `zstd-mojo`. You can also implement `CodecSet` yourself.
- `get_str` and `get_bytes` are views into the cursor's current block: they're valid until the next `next()`. Copy with `get_string` or `get_bytes_copy` to keep them.
- Logical types are parsed but not converted: a `decimal` decodes to its bytes and a `date` to its `int`.
- Not implemented: Avro's JSON datum encoding (`Value.to_json()` is a debug view), single-object encoding, and the `bzip2` and `xz` codecs.
- A cursor refuses a reader-schema default that is a record, array or map, and a decompressed block over 2 GiB; read those files through `Value`.

## Tests

`pixi run -e stable test` runs the core suite and `test-cursor` the schema-compiled reader, whose oracle is the `Value` path: both decode the same fastavro fixtures and two real Iceberg manifests, field by field, and a second pass must not grow the slot buffers. `pixi run -e codecs crosscheck` has fastavro read the files this writer produced, one per codec. CI runs the suites on stable 1.2.0 and nightly, on macOS and Linux.
