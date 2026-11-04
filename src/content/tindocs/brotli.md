---
checked: 0.1.4
---

## What it's for

brotli binds libbrotli, the reference Brotli library, through a small C shim it loads at run time. `BROTLI` is one of Parquet's page codecs, and [parquet-full](/s/parquet-full) uses this to read and write it. It is a binding, not an implementation: the speed is libbrotli's.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add brotli-mojo     # no shelf dependencies; builds the shim against conda-forge libbrotli
```

pixi builds the shim, `libbrotlimojo.dylib` on macOS and `libbrotlimojo.so` on Linux, into the environment's `lib`. You need no link flags.

## Quick start

Compress a page at a Parquet-friendly quality, then decode it with and without its size:

```mojo
from brotli import compress, decoder_version, decompress, decompress_unsized


def main() raises:
    var page = List[UInt8]()
    for i in range(100_000):
        page.append(UInt8(i % 7))

    var stream = compress(page, quality=5)   # the default, 11, is slow
    # Parquet: the page header carries the size, so decode in one pass.
    var back = decompress(stream, len(page))
    # Anything else: the decoder grows its buffer until the stream fits.
    var again = decompress_unsized(stream)
    print("libbrotli", decoder_version())
    print(len(stream), "bytes,", back == page, again == page)
```

## API

Everything is exported from `brotli`.

- `compress(data: Span[UInt8, _], quality: Int = DEFAULT_QUALITY, lgwin: Int = DEFAULT_WINDOW_BITS, mode: Int = MODE_GENERIC) raises -> List[UInt8]`: one stream. `quality` is 0 to 11, `lgwin` the window in bits, 10 to 24, and `mode` a hint: `MODE_GENERIC`, `MODE_TEXT` or `MODE_FONT`.
- `decompress(data: Span[UInt8, _], uncompressed_size: Int) raises -> List[UInt8]`: one pass into a buffer of exactly that size, the Parquet path.
- `decompress_into(data: Span[UInt8, _], dst: Span[mut=True, UInt8, _]) raises -> Int`: into a buffer you own; returns the bytes written.
- `decompress_unsized(data: Span[UInt8, _]) raises -> List[UInt8]`: when you don't know the size. It starts at 8 times the input and doubles, decoding from the start each time.
- `encoder_version() raises -> String` and `decoder_version() raises -> String`: the libbrotli versions loaded, such as `1.2.1`.

The constants are `MIN_QUALITY` (0), `MAX_QUALITY` (11), `DEFAULT_QUALITY` (11), `MIN_WINDOW_BITS` (10), `MAX_WINDOW_BITS` (24) and `DEFAULT_WINDOW_BITS` (22).

## Errors and limits

- A Brotli stream records no decoded size anywhere, which is why sized and unsized decoding are separate calls. Prefer the sized one whenever you know the size.
- `decompress` treats a stream that decodes to a different length as corrupt: `brotli.decompress: size mismatch (got <n>, expected <m>)`, or `stream decodes to more than the <m> bytes it was said to hold`. A cut-off stream raises `brotli.decompress: input ended mid-stream`, other decoder failures carry libbrotli's own error string, and `decompress_into` raises `destination too small` rather than growing.
- `quality` 11, the default, runs at single-digit MB/s on large inputs; 4 or 5 is the usual choice for Parquet pages.
- The shim is looked for in `$CONDA_PREFIX/lib`, then next to the executable and in its `../lib`, then on the binary's rpath. If none has it, the first call raises `brotli.mojo: cannot load libbrotlimojo.dylib; looked in: ...` and says to set `CONDA_PREFIX`.
- The shim is opened once per process and never closed, so page-sized calls stay cheap.

## Tests

`pixi run test` round-trips sizes from 0 B to 1 MiB across qualities, window sizes and all three modes, and checks every error path. Three streams produced by CPython's `brotli` package are baked in as constants and decoded: a stored block, a quality-5 stream that uses the static dictionary and a quality-9 stream of back-references. It runs again with `CONDA_PREFIX` unset to test the library search. CI runs it on Linux and macOS with Mojo 1.2.0 and nightly.
