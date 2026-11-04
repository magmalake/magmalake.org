---
checked: 0.1.4
---

## What it's for

lz4 binds liblz4 through a small C shim it loads at run time, and covers the three LZ4 formats data lakes use: bare blocks for Parquet's `LZ4_RAW` pages, self-describing frames for Iceberg Puffin blobs, and the legacy Hadoop framing older Parquet files still use for `LZ4`. [parquet-full](/s/parquet-full) and [iceberg](/s/iceberg) use it. It is a binding, not an implementation: the speed is liblz4's.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add lz4-mojo        # no shelf dependencies; builds the shim against conda-forge lz4-c
```

pixi builds the shim, `liblz4mojo.dylib` on macOS and `liblz4mojo.so` on Linux, into the environment's `lib`. You need no link flags.

## Quick start

Compress a page as a bare block and as a frame, and decompress both:

```mojo
from lz4 import compress_block, compress_frame, decompress_block, decompress_frame


def main() raises:
    var page = List[UInt8]()
    for i in range(100_000):
        page.append(UInt8(i % 7))

    # Parquet LZ4_RAW: a bare block; the page header keeps the length.
    var block = compress_block(page)
    var back = decompress_block(block, len(page))
    print("block:", len(block), "bytes,", back == page)

    # Iceberg Puffin: a self-describing LZ4 frame, content size recorded.
    var frame = compress_frame(page)
    print("frame:", len(frame), "bytes,", decompress_frame(frame) == page)
```

## API

Everything is exported from `lz4`.

**Blocks** (`LZ4_RAW`), which carry no size of their own:

- `compress_block(data: Span[UInt8, _], acceleration: Int = 1) raises -> List[UInt8]`: the fast encoder; a higher `acceleration` trades ratio for speed.
- `compress_block_hc(data: Span[UInt8, _], level: Int = 9) raises -> List[UInt8]`: the high-compression encoder, level 1 to 12; same wire format.
- `decompress_block(data: Span[UInt8, _], uncompressed_size: Int) raises -> List[UInt8]`: needs the exact decoded size.
- `decompress_block_into(data: Span[UInt8, _], dst: Span[mut=True, UInt8, _]) raises -> Int`: into a buffer you own; returns the bytes written.

**Frames** (`LZ4F`):

- `compress_frame(data: Span[UInt8, _], level: Int = 0, content_size: Bool = True) raises -> List[UInt8]`: level 0 is the fast encoder, 1 to 12 the HC one. The content size is recorded by default, as Puffin requires.
- `decompress_frame(data: Span[UInt8, _]) raises -> List[UInt8]`: sized from the header when it has a size; otherwise it grows the buffer and retries.
- `frame_content_size(data: Span[UInt8, _]) raises -> Optional[Int]`: the size in the header, or None.
- `is_lz4_frame(data: Span[UInt8, _]) -> Bool`: checks the magic number, without loading the library.

**Legacy Parquet `LZ4`**, read only:

- `decompress_hadoop(data: Span[UInt8, _], uncompressed_size: Int) raises -> List[UInt8]`: the `[BE u32 uncompressed][BE u32 compressed][block]` chunks `parquet-mr` wrote.

## Errors and limits

- Errors name the call: `lz4.decompress_block failed: corrupt input or destination too small (rc=<n>)`, `lz4.decompress_frame failed: corrupt or truncated input`, `lz4.decompress_hadoop: truncated block`. `frame_content_size` raises on bytes that aren't a frame header.
- Sizes are C `int` on both sides, so one call handles at most about 2 GiB.
- LZ4F stores "no size" and "size 0" the same way, so `frame_content_size` returns None for both. Content and block checksums in a frame are verified by liblz4.
- The shim is looked for in `$CONDA_PREFIX/lib`, then next to the executable and in its `../lib`, then on the binary's rpath. If none has it, the first call raises `lz4.mojo: cannot load liblz4mojo.dylib; looked in: ...` and says to set `CONDA_PREFIX`.
- The shim is opened once per process and never closed, so page-sized calls stay cheap.

## Tests

`pixi run test` round-trips blocks and frames from 0 B to 1 MiB, decodes vectors produced by CPython's `lz4` package and baked in as constants, checks the corrupt-input errors and decodes a Hadoop-framed stream it builds itself. It runs again with `CONDA_PREFIX` unset to test the library search. CI runs it on Linux and macOS with Mojo 1.2.0 and nightly.
