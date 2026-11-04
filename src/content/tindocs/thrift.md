---
checked: 0.1.3
---

## What it's for

thrift is Apache Thrift serialization, without the RPC: the compact and binary protocols, and every struct, union and enum of the Parquet metadata schema, generated ahead of time from `parquet.thrift`. [parquet](/s/parquet) reads and writes its footers, page headers and page indexes through it. You use it directly when you want a Parquet file's metadata without reading any data, or when you have other Thrift-encoded bytes at rest.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add thrift-mojo     # no shelf dependencies
```

## Quick start

Print a Parquet file's row groups, each column's codec, and where its first page body starts:

```mojo
from std.sys import argv
from thrift import read_footer, read_page_header, read_parquet_file


def main() raises:
    var bytes = read_parquet_file(String(argv()[1]))
    var meta = read_footer(Span(bytes))
    print(meta.num_rows, "rows in", len(meta.row_groups), "row groups")
    for rg in meta.row_groups:
        for cc in rg.columns:
            ref cm = cc.meta_data.value()
            print(cm.path_in_schema[0], cm.codec.name(), cm.num_values)
            var start = Int(cm.data_page_offset)
            if cm.dictionary_page_offset:
                start = Int(cm.dictionary_page_offset.value())
            var head = read_page_header(Span(bytes), start)
            print("  first page:", head[0].type_.name(), "body at", start + head[1])
```

## API

Everything is exported from `thrift`; the submodules are `thrift.protocol`, `thrift.parquet_types` and `thrift.parquet_footer`.

**Parquet footer and pages** (`thrift.parquet_footer`):

- `read_parquet_file(path: StringSlice) raises -> List[UInt8]`: reads a whole file into memory.
- `read_footer(file_bytes: Span[UInt8, _]) raises -> FileMetaData`: checks both `PAR1` magics and decodes the footer of a whole file.
- `read_footer_bytes(metadata_bytes: Span[UInt8, _]) raises -> FileMetaData`: decodes a footer you have already sliced out.
- `footer_length(data: Span[UInt8, _]) raises -> Int`: the declared length of the serialized `FileMetaData`.
- `read_page_header(data: Span[UInt8, _], offset: Int) raises -> Tuple[PageHeader, Int]`: the header at `offset` and its length; the body follows it for `compressed_page_size` bytes.
- `write_footer(meta: FileMetaData) raises -> List[UInt8]`: the compact-protocol footer body, without magic or length.
- `write_footer_trailer(mut out: List[UInt8], metadata_length: Int) raises`: appends the little-endian length and the trailing `PAR1`.

**Parquet metadata types** (`thrift.parquet_types`): all 69 of the IDL's types, such as `FileMetaData`, `RowGroup`, `ColumnChunk`, `ColumnMetaData`, `SchemaElement`, `Statistics`, `PageHeader`, `OffsetIndex`, `ColumnIndex` and `BloomFilterHeader`. Field names follow the IDL, with `type_` for `type`; optional fields are `Optional[T]`. Every struct has:

- `read[P: TProtocolReader, //](mut self, mut p: P) raises`: fills the struct from either protocol.
- `write[W: TProtocolWriter, //](self, mut p: W) raises`: writes it, fields in ascending id order.

Enums such as `Type`, `Encoding`, `CompressionCodec` and `PageType` are open `Int32` wrappers with `comptime` members (`CompressionCodec.ZSTD`) and `name(self) -> String`, which gives `CompressionCodec(99)` for a value the IDL doesn't define.

**Protocols** (`thrift.protocol`):

- `TCompactProtocolReader[origin](data: Span[UInt8, origin])` and `TBinaryProtocolReader[origin](data: Span[UInt8, origin])`: read from a span (the binary reader also takes `strict_read=False` for unversioned messages); both implement the `TProtocolReader` trait.
- `TCompactProtocolWriter()` and `TBinaryProtocolWriter()` (or `TBinaryProtocolWriter(strict_write=False)`): write to an owned `List[UInt8]`; `take(deinit self) -> List[UInt8]` hands it over. Both implement `TProtocolWriter`.
- The traits carry the full Thrift surface: `read_struct_begin`, `read_field_begin(mut self) raises -> Tuple[Int8, Int16]` (type, field id), `read_list_begin`, `read_i32`, `read_string` and so on, with matching `write_` methods. Readers add `skip(mut self, ttype: Int8) raises`, `offset()`, `remaining()` and, on the compact reader, a zero-copy `read_binary_view()`.
- Type ids are `T_STOP`, `T_BOOL`, `T_BYTE`, `T_I16`, `T_I32`, `T_I64`, `T_DOUBLE`, `T_STRING`, `T_STRUCT`, `T_MAP`, `T_SET`, `T_LIST` and `T_UUID`, and `type_name(t: Int8) -> String` spells one.

## Errors and limits

- Every read is bounds checked and raises with a protocol prefix and the offset: `thrift.compact: truncated input, wanted <n> byte(s) at offset <pos> of <len>`, `thrift.compact: varint too long`, `thrift.binary: bad version 0x...`. A container that claims more elements than bytes remain is refused before anything is allocated, and nesting deeper than `MAX_SKIP_DEPTH` (64) raises.
- A missing required field raises `parquet.<Struct>: missing required field <name>`, and a union with more than one member set raises too. Unknown field ids are skipped, so newer files still decode.
- Footer errors start with `parquet:`: a file too short, a bad leading or trailing magic, or a footer length that can't fit. Encrypted footers (`PARE`) raise `parquet: encrypted footer unsupported`.
- In the compact protocol a bool field's value lives in its field header, so `write_field_begin(T_BOOL, id)` writes nothing until the following `write_bool`.
- There is no RPC layer, no JSON or debug protocol and no IDL parsing at run time.

## Tests

`pixi run test` replays 13 wire vectors produced by Apache Thrift's own Python library through both protocols and requires identical bytes, then decodes nine pyarrow-written Parquet fixtures and compares them with an oracle from the Thrift compiler's Python bindings, cross-checked against pyarrow. It also round-trips every footer, decodes every page header of every chunk, and feeds the readers truncated and hostile input. CI runs it on Linux and macOS with Mojo 1.2.0 and nightly; `pixi run cli parquet-meta f.parquet --pages` prints any file's metadata.
