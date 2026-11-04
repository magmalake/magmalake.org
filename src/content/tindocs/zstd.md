---
checked: 0.1.5
---

## What it's for

zstd binds libzstd, the reference Zstandard library, through a small C shim it loads at run time. Zstandard is Iceberg's default Parquet codec and also an Avro and Puffin codec, so [parquet-full](/s/parquet-full), [avro](/s/avro) and [iceberg](/s/iceberg) use it. It is a binding, not an implementation: the speed is libzstd's.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add zstd-mojo       # no shelf dependencies; builds the shim against conda-forge zstd
```

pixi builds the shim, `libzstdmojo.so` (that suffix on macOS too), into the environment's `lib`. You need no link flags.

## Quick start

Compress a page, decompress it into a buffer of the size the frame records, and compress the same bytes as a stream:

```mojo
from zstd import Compressor, compress, decompress_into, frame_content_size


def main() raises:
    var page = List[UInt8]()
    for i in range(100_000):
        page.append(UInt8(i % 7))

    var z = compress(page, level=3)
    var size = frame_content_size(z).value()     # compress() records it
    var out = List[UInt8](length=size, fill=0)
    var n = decompress_into(z, out)              # no allocation, no growth
    print(len(page), "->", len(z), "->", n, out == page)

    var c = Compressor(level=9)                  # streaming, chunk by chunk
    var streamed = c.update(Span(page)[:50_000])
    streamed.extend(c.update(Span(page)[50_000:]))
    streamed.extend(c.finish())
    print("streamed:", len(streamed), "bytes")
```

## API

Everything is exported from `zstd`.

- `compress(data: Span[UInt8, _], level: Int = 3) raises -> List[UInt8]`: one frame, level 1 to 22, with the content size in its header.
- `decompress(data: Span[UInt8, _]) raises -> List[UInt8]`: one frame; when the header has no content size, it streams and grows the output.
- `decompress_into(data: Span[UInt8, _], dst: Span[mut=True, UInt8, _]) raises -> Int`: into a buffer you own, such as one sized from a Parquet page header; returns the bytes written.
- `is_zstd_frame(data: Span[UInt8, _]) -> Bool`: checks the magic number, without loading the library.
- `frame_content_size(data: Span[UInt8, _]) raises -> Optional[Int]`: the decompressed size from the frame header, or None.

**`Compressor(level: Int = 3)`** and **`Decompressor()`** stream over a libzstd context:

- `update(mut self, chunk: Span[UInt8, _]) raises -> List[UInt8]`: whatever output is ready, which may be empty.
- `finish(mut self) raises -> List[UInt8]`: on a `Compressor`, the last block and the frame epilogue; call it once. On a `Decompressor` it returns nothing and exists for symmetry.

## Errors and limits

- libzstd failures raise with its own error name: `zstd.decompress: Corruption_detected`, `zstd.decompress_into: Dst_Too_Small`.
- The shim is looked for in `$CONDA_PREFIX/lib`, then next to the executable and in its `../lib`, then on the binary's rpath, so a binary built in a pixi environment runs from a plain shell. If none has it, the first call raises `zstd.mojo: cannot load libzstdmojo.so; looked in: ...` and says to set `CONDA_PREFIX`. To ship a binary, put the shim next to it or in `../lib`.
- The shim is opened once per process and never closed, so one-shot calls are cheap in a hot loop.
- There are no dictionaries and no multithreaded compression.

## Tests

`pixi run test` round-trips sizes from 0 B to 1 MiB at several levels, decodes a frame produced independently by Python `zstandard` and baked in as constants, checks streaming against one-shot output and checks that a corrupt frame raises. It runs again with `CONDA_PREFIX` unset to test the library search. CI runs it on Linux and macOS with Mojo 1.2.0 and nightly.
