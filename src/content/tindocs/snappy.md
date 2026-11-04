---
checked: 0.1.4
---

## What it's for

snappy is Snappy written in Mojo: the raw block format Parquet and Avro compress with, and the `sNaPpY` framing format with a CRC-32C per chunk. [parquet](/s/parquet) reads and writes `SNAPPY` pages with it and [avro](/s/avro) uses it for the `snappy` codec. Unlike the other codecs it has no C library and no shim, so there is nothing to build or load.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add snappy-mojo     # no shelf dependencies, no C library
```

## Quick start

Compress a page as a raw block and as a framed stream, and decompress both:

```mojo
from snappy import (
    compress, compress_framed, crc32c, decompress, decompress_framed,
    uncompressed_length,
)


def main() raises:
    var page = List[UInt8]()
    for i in range(100_000):
        page.append(UInt8(i % 7))

    # Raw block, as in Parquet and Avro: the length leads the block.
    var packed = compress(Span(page))
    print("raw:", len(packed), "bytes for", uncompressed_length(Span(packed)))
    print(decompress(Span(packed)) == page)

    # Framing format: sNaPpY stream, CRC-32C checked per 64 KiB chunk.
    var stream = compress_framed(Span(page))
    print("framed:", len(stream), "bytes,", decompress_framed(Span(stream)) == page)
    print(hex(crc32c("123456789".as_bytes())))   # 0xe3069283
```

## API

Everything is exported from `snappy`.

**Raw blocks**, which begin with the decoded length as a varint:

- `compress(data: Span[UInt8, _]) -> List[UInt8]`: one block; it never fails.
- `decompress(data: Span[UInt8, _]) raises -> List[UInt8]`: one block, sized from its own header.
- `decompress_into[origin: Origin[mut=True], //](data: Span[UInt8, _], dst: Span[UInt8, origin]) raises -> Int`: into a buffer of at least `uncompressed_length(data)` bytes; returns the bytes written.
- `uncompressed_length(data: Span[UInt8, _]) raises -> Int`: the decoded length, read from the header without decompressing.
- `max_compressed_length(n: Int) -> Int`: the worst case, `32 + n + n / 6`, as in the C++ reference.
- `validate(data: Span[UInt8, _]) -> Bool`: whether `data` decompresses without error; it decodes the whole block to find out.

**Framing format**:

- `compress_framed(data: Span[UInt8, _]) -> List[UInt8]` and `decompress_framed(data: Span[UInt8, _]) raises -> List[UInt8]`: a whole stream, in 64 KiB chunks, every checksum verified.
- `FramedWriter()`: `write(mut self, data: Span[UInt8, _])` as often as you like, then `finish(deinit self) -> List[UInt8]`.
- `FramedReader(data: Span[UInt8, _])`: `read_chunk(mut self) raises -> Optional[List[UInt8]]` returns each chunk's bytes, then None.

**CRC-32C**: `crc32c(data: Span[UInt8, _], seed: UInt32 = 0) -> UInt32`, the incremental `Crc32c` with `update` and `finish`, and the framing format's `mask_crc32c` and `unmask_crc32c`.

## Errors and limits

- Corrupt input raises `snappy: <what>`: `truncated varint`, `invalid copy offset`, `length mismatch`, `destination buffer too small`. The framing reader adds `snappy: crc32c mismatch`, `bad stream identifier` and `unsupported unskippable chunk type`; padding and skippable chunks are passed over.
- The compressor is a single-pass greedy matcher with no lazy matching. Its element encoding follows the C++ reference, but its output isn't guaranteed to match libsnappy's byte for byte.
- `FramedReader` copies its whole input when you construct it; it is incremental on the output side only.

## Tests

`pixi run test` checks the CRC-32C check value, the spec's edge cases (long literals, overlapping copies), 64 KiB boundaries, 1 MiB round trips, corrupt input and bad checksums, and decodes a block produced by `python-snappy` and baked in as a constant. CI runs it on Linux and macOS with Mojo 1.2.0 and nightly.
