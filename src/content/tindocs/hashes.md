---
checked: 0.1.3
---

## What it's for

hashes is the three checksums and hashes the table formats ask for, in plain Mojo: CRC-32 for Parquet page CRCs and gzip, MurmurHash3 x86-32 for Iceberg's `bucket[N]` partition transform, and XXH64 for Parquet's split-block bloom filters. [iceberg](/s/iceberg) and [parquet](/s/parquet) use it. It has no dependencies and calls no C library, so the same input gives the same hash on every platform and toolchain.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add hashes-mojo     # no other tins
```

## Quick start

A CRC-32, the Iceberg spec's own `bucket[16]` example, and XXH64 fed in chunks:

```mojo
from hashes import Xxh64, crc32, iceberg_bucket, iceberg_hash_int, xxh64


def main() raises:
    var data = "123456789".as_bytes()
    print(hex(crc32(data)))                 # 0xcbf43926

    # Iceberg bucket[16] of the int 34, the spec's worked example
    var h = iceberg_hash_int(34)            # 2017239379
    print(iceberg_bucket(h.cast[DType.uint32](), 16))   # 3

    # XXH64 in one call, or fed in chunks
    var x = Xxh64()
    x.update("1234".as_bytes())
    x.update("56789".as_bytes())
    print(x.finish() == xxh64(data))        # True
```

## API

Everything is exported from `hashes`. Nothing raises.

**CRC-32** (IEEE 802.3, the zlib and gzip one):

- `crc32(data: Span[UInt8, _], seed: UInt32 = 0) -> UInt32`: the CRC of `data`. Pass a previous result as `seed` to chain: `crc32(b, seed=crc32(a))` equals the CRC of `a` followed by `b`.
- `Crc32(seed: UInt32 = 0)`: the incremental form, with `update(mut self, data: Span[UInt8, _])` and `finish(self) -> UInt32`.

**MurmurHash3 and the Iceberg bucket transform:**

- `murmur3_x86_32(data: Span[UInt8, _], seed: UInt32 = 0) -> UInt32`: MurmurHash3 x86-32, unsigned, as `mmh3.hash(..., signed=False)` gives it.
- `iceberg_hash_int(v: Int32) -> Int32` and `iceberg_hash_long(v: Int64) -> Int32`: an int is promoted to a long, then hashed as 8 little-endian bytes. Dates, times and timestamps go through these too, as their day or microsecond counts.
- `iceberg_hash_string(s: StringSlice) -> Int32` and `iceberg_hash_bytes(data: Span[UInt8, _]) -> Int32`: the raw UTF-8 or raw bytes.
- `iceberg_hash_uuid(hi: UInt64, lo: UInt64) -> Int32`: the 16 bytes, big-endian.
- `iceberg_hash_decimal(unscaled: Int64) -> Int32`: the unscaled value's minimal two's-complement big-endian bytes, as Java's `BigInteger.toByteArray()` writes them.
- `iceberg_bucket(hash: UInt32, n: Int) -> Int`: `(hash & 0x7FFFFFFF) % n`.

**XXH64:**

- `xxh64(data: Span[UInt8, _], seed: UInt64 = 0) -> UInt64`: XXH64 per its spec.
- `Xxh64(seed: UInt64 = 0)`: the incremental form, with `update(mut self, data: Span[UInt8, _])` and `finish(self) -> UInt64`. Any chunking gives the one-shot result.

## Limits

- The `iceberg_hash_*` functions return the spec's signed `Int32`, while `iceberg_bucket` takes the `UInt32` bits: cast with `.cast[DType.uint32]()` in between, as the quick start does.
- Only MurmurHash3's x86-32 variant is here, and only the decimal serialization that fits an `Int64` unscaled value.
- The implementations are scalar and single-core, at roughly 1.3 to 1.7 GB/s each on an M4. `Crc32` builds its lookup tables per instance, so you pay that for every `crc32` call; reuse one `Crc32` for many small inputs.

## Tests

`pixi run -e stable test` (Mojo 1.2.0) and `pixi run test` (nightly) run `tests/test_hashes.mojo`. Its vectors were taken from Python's `zlib.crc32`, `mmh3` and `xxhash` and from the Iceberg spec's Appendix B, and are baked in as constants. CI runs the tests and `mojolint` on both toolchains, and `pixi run -e bench bench` produces the throughput numbers.
