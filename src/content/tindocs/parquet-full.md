---
checked: 0.1.8
---

## What it's for

parquet-full is one type, `AllCodecs`, that gives the [parquet](/s/parquet) reader and writer every codec the Parquet spec defines: `ZSTD`, `BROTLI`, `LZ4_RAW` and the deprecated Hadoop-framed `LZ4`, on top of the `UNCOMPRESSED`, `SNAPPY` and `GZIP` that parquet already has. It calls libzstd, libbrotli and liblz4 through [zstd](/s/zstd), [brotli](/s/brotli) and [lz4](/s/lz4), which is why it's a separate tin: a consumer that never meets those codecs never builds them. [iceberg](/s/iceberg) depends on it, because PyIceberg and most other writers use ZSTD. Everything else (opening files, projection, pruning, the writer) is parquet's API and is documented on [its page](/s/parquet).

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add parquet-full-mojo    # brings parquet-mojo and its tins, zstd, lz4, brotli
```

It is the `full/` package of the parquet repository and depends on `parquet-mojo` at the same commit, so you get both and the two never drift apart. The C libraries come from conda-forge, and pixi builds the three small shims that load them with cmake during install; you don't install anything yourself.

## Quick start

Read a ZSTD file (`evolved.parquet` is a PyIceberg data file in the repository's `tests/fixtures/iceberg`), then write it back out as BROTLI:

```mojo
from std.sys import argv

from parquet import ParquetReader, ParquetWriter, WriterOptions
from parquet_full import AllCodecs
from thrift import CompressionCodec


def main() raises:
    var path = String(argv()[1]) if len(argv()) > 1 else "evolved.parquet"

    # The default reader stops at a ZSTD page and names the codec.
    try:
        var plain = ParquetReader.open(path)
        _ = plain.read_table()
    except e:
        print("DefaultCodecs:", e)

    var r = ParquetReader[AllCodecs].open(path)
    var t = r.read_table()
    for i in range(t.num_columns()):
        print(t.name(i), String(t.type(i)))

    # Write it back out as BROTLI, then read that with the same codec set.
    var opts = WriterOptions()
    opts.codec = CompressionCodec.BROTLI.value
    var w = ParquetWriter[AllCodecs](opts^)
    for b in t.batches:
        w.write_batch(b.arena, b.roots)
    var bytes = w^.finish()
    print(len(bytes), "bytes;", ParquetReader[AllCodecs](bytes^).num_rows(), "rows")
```

`thrift` comes with the tin; `CompressionCodec` is where the codec numbers live.

## API

**`AllCodecs`**, from `parquet_full`, is a `CodecSet`: you never call it, you pass it as the codec parameter of parquet's types.

- `ParquetReader[AllCodecs]`: reads pages in any of the seven codecs. Every constructor works the same way, for example `ParquetReader[AllCodecs].open(path)` or `ParquetReader[AllCodecs].open_projected(path, columns)`.
- `ParquetWriter[AllCodecs](var options: WriterOptions)`: writes with `options.codec` set to `CompressionCodec.ZSTD.value`, `BROTLI.value` or `LZ4_RAW.value`, as well as the three default codecs.

The methods it implements are the `CodecSet` trait from `parquet.codec`, all static:

- `supports(codec: Int32) -> Bool`: true for every codec in the spec.
- `decompress[page_origin: ImmOrigin, scratch_origin: MutOrigin](codec: Int32, data: Span[UInt8, page_origin], uncompressed_size: Int, ref[scratch_origin] scratch: List[UInt8]) raises -> Span[UInt8, origin_of(page_origin, scratch_origin)].Immutable`: one page body, decompressed into a scratch buffer the reader reuses.
- `compress(codec: Int32, data: Span[UInt8, _]) raises -> List[UInt8]`: one page body, for the writer.

To support a different set of codecs, write your own `CodecSet` the same way; `parquet.codec` exports the helpers `AllCodecs` is built from (`page_span`, `sized_scratch`, `gunzip_into`, `gzip_wrap`, `copy_of`, `unsupported_codec`).

## Codecs and limits

| codec | read | write | through |
|---|---|---|---|
| `UNCOMPRESSED`, `SNAPPY`, `GZIP` | yes | yes | parquet's own, pure Mojo |
| `ZSTD` | yes | yes | libzstd |
| `BROTLI` | yes | yes, at quality 5 | libbrotli |
| `LZ4_RAW` | yes | yes | liblz4 |
| `LZ4` (deprecated) | yes, Hadoop-framed or a bare block | no | liblz4 |

- Brotli is written at quality 5, not libbrotli's default of 11, which runs at single-digit MB/s.
- A ZSTD frame with no content size in its header still reads; it decodes into a buffer that grows, rather than one sized up front.
- Writing legacy `LZ4` raises `parquet: page codec LZ4 is not available — ...`, the same message a missing codec gives. Use `LZ4_RAW`.
- Without this tin, a `DefaultCodecs` reader raises that message when it reaches a page in one of these codecs. Project that column away and the rest of the file still reads.
- If a shim's shared library can't be found, the codec tins raise an `Error` rather than aborting the process.

## Tests

`pixi run -e codecs test-codecs` (nightly) or `-e codecs-stable` (Mojo 1.2.0) reads the fixture with a column per codec against its pyarrow oracle, checks that `AllCodecs` reads everything `DefaultCodecs` does, round-trips a write through each FFI codec, and reads the ZSTD Iceberg data files. CI runs it and `lint-codecs` on the stable leg, on Linux and macOS. `pixi run -e codecs conformance <parquet-testing>` runs the apache/parquet-testing corpus through `ParquetReader[AllCodecs]`.
