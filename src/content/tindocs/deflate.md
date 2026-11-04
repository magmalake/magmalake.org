---
checked: 0.1.3
---

## What it's for

deflate is raw DEFLATE (RFC 1951) and the gzip file format (RFC 1952) around it, in pure Mojo with no FFI and no dependencies. [avro](/s/avro) uses it for the `deflate` block codec, [parquet](/s/parquet) for the DEFLATE half of the `GZIP` page codec, and [iceberg](/s/iceberg) through both. Since 0.1.3 it also reads and writes whole `.gz` files, which is what you need for gzipped inputs such as GH Archive's hourly JSON.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add deflate-mojo    # no other tins: no dependencies at all
```

## Quick start

Round-trip raw DEFLATE, then write a two-member gzip file and read it back whole and member by member:

```mojo
from deflate import deflate, gunzip, gunzip_at, gzip, inflate


def main() raises:
    var text = "hello, deflate\n" * 100
    var data = List[UInt8](text.as_bytes())

    var packed = deflate(Span(data))        # raw DEFLATE, no framing
    var back = inflate(Span(packed))
    print(len(data), "->", len(packed), "bytes, round trip ok:", back == data)

    var gz = gzip(Span(data), 6)            # one gzip member
    gz.extend(Span(gzip(Span(data), 0)))    # a second, stored uncompressed
    print("gunzip:", len(gunzip(Span(gz))), "bytes from 2 members")

    var pos = 0                             # or one member at a time
    while pos < len(gz):
        var end = 0
        var part = gunzip_at(Span(gz)[pos:], end)
        print("member at", pos, "->", len(part), "bytes")
        pos += end
```

## API

Everything is exported from `deflate`, and everything takes and returns bytes: a `Span[UInt8, _]` in, a fresh `List[UInt8]` out.

**Raw DEFLATE.** These streams have no zlib header, no gzip wrapper and no checksum.

- `deflate(data: Span[UInt8, _]) raises -> List[UInt8]`: compresses into one fixed-Huffman block, using a single-slot hash-chain LZ77 matcher.
- `inflate(data: Span[UInt8, _]) raises -> List[UInt8]`: decompresses a stream of stored, fixed-Huffman or dynamic-Huffman blocks.
- `inflate_at(data: Span[UInt8, _], mut end: Int) raises -> List[UInt8]`: decompresses the stream at the start of `data` and sets `end` to the first byte after it, rounded up to a byte, so you can find the next of several streams laid back to back.

**gzip.**

- `gunzip(data: Span[UInt8, _]) raises -> List[UInt8]`: decodes a whole `.gz` file, every member of a concatenated file joined into one output, as `gzip -d` does. It parses all the optional header fields (FTEXT, FHCRC, FEXTRA, FNAME, FCOMMENT), checks a header CRC when there is one, and checks each member's CRC-32 and ISIZE.
- `gunzip_at(data: Span[UInt8, _], mut end: Int) raises -> List[UInt8]`: decodes and verifies the one member at the start of `data` and sets `end` to the byte after its trailer. Use it to walk a large multi-member file holding one member's output at a time.
- `gzip(data: Span[UInt8, _], level: Int = 6) raises -> List[UInt8]`: writes one member with no name, comment or timestamp (MTIME 0, OS 255).

## Errors and limits

- gzip errors raise `gunzip: member <n> at byte <offset>: <what>`, where `<what>` is one of `not a gzip stream (bad magic)`, `unknown compression method <cm>`, `reserved flag bits set: <flags>`, `truncated header (...)`, `header CRC (FHCRC) mismatch`, `truncated trailer (CRC-32 and ISIZE)`, `CRC-32 mismatch` or `ISIZE mismatch`. A corrupt body carries the inflate error after the colon.
- `gunzip` accepts zero bytes after the last member as padding. Anything else there raises `gunzip: trailing garbage after member <n> at byte <offset>`, and an empty input raises `gunzip: empty input`.
- `inflate` errors are prefixed `avro.deflate:` (the code began inside avro.mojo): an invalid or over-subscribed Huffman code, a truncated stream or stored block, reserved block type 3, or a distance that runs before the start of the output.
- `gzip` raises `gzip: level must be 0..9, got <level>`. Level 0 writes stored blocks; levels 1 to 9 all use the one fixed-Huffman strategy and give the same bytes, so output is larger than zlib's (about 17% of GH Archive JSON against zlib's 14% at level 6). `deflate` never emits dynamic-Huffman blocks.
- There is no streaming form: a stream or member is decoded whole, into memory. There is no zlib (RFC 1950) wrapper either; strip its 2-byte header and 4-byte Adler-32 yourself.
- The CRC-32 uses the Arm CRC32 instructions where the build target has them, and a slice-by-8 table elsewhere. On an Apple M4, `gunzip` decodes 670 MB of GH Archive JSON from 94 MB of gzip in 0.78 s, about what Python's `zlib.decompress` takes.

## Tests

`pixi run test` runs two suites, on nightly by default and on Mojo 1.2.0 with `-e stable`. `test_deflate.mojo` checks `inflate` against fixtures written by Python's `zlib`, one per block type, as well as round trips. `test_gzip.mojo` checks `gunzip` against `.gz` files from Python's `gzip`, one per header flag plus multi-member and padded files, and against corrupted and truncated copies of them. CI runs both suites and `pixi run lint` on Linux and macOS.
