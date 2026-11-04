---
checked: 0.1.3
---

## What it's for

roaring is compressed sets of integers: 32- and 64-bit Roaring bitmaps, with the portable serialization CRoaring and pyroaring write. Its reason for being in magmalake is Iceberg v3 deletion vectors, which record a data file's deleted row positions as a 64-bit portable bitmap inside a framed Puffin blob. [iceberg](/s/iceberg) reads and writes those through it. The bitmaps work on their own too, for row positions, IDs or masks.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add roaring-mojo    # no other tins
```

## Quick start

Build a deletion vector, frame it as Iceberg does, read it back and use it:

```mojo
from roaring import Bitmap64, decode_iceberg_dv, encode_iceberg_dv


def main() raises:
    # Deleted row positions of one data file
    var deleted = Bitmap64()
    deleted.add(7)
    deleted.add_range(1000, 1500)       # [1000, 1500)
    deleted.add(UInt64(1) << 33)        # a second 32-bit bitmap
    deleted.run_optimize()              # run-encode the range

    # The Iceberg deletion-vector v1 blob, as it goes into a Puffin file
    var blob = encode_iceberg_dv(deleted)
    var back = decode_iceberg_dv(Span(blob))
    print(back.cardinality(), back.contains(1200), back.max())

    var kept = Bitmap64()
    kept.add_range(0, 2000)
    print(Bitmap64.and_not(kept, back).cardinality())   # 1499
```

## API

Everything is exported from `roaring`.

**`Bitmap32()`** holds `UInt32` values and **`Bitmap64()`** holds `UInt64` values; their methods are the same, with `V` the value type. `Bitmap64` is a map from the high 32 bits to a `Bitmap32` of the low 32 bits.

- `add(mut self, v: V) raises` and `remove(mut self, v: V) raises`: add or remove one value. Adding twice or removing an absent value does nothing.
- `add_range(mut self, start: V, stop: V) raises`: adds every value in `[start, stop)`.
- `contains(self, v: V) raises -> Bool`, `cardinality(self) raises -> Int` and `is_empty(self) -> Bool`.
- `min(self) raises -> V` and `max(self) raises -> V`: the smallest and largest value; they raise on an empty bitmap.
- `to_list(self) raises -> List[V]`: every value, ascending.
- `run_optimize(mut self) raises`: switches each container to run-length encoding where that is smaller. Nothing is run-encoded until you call it.
- `or_(a, b)`, `and_(a, b)`, `and_not(a, b)` and `xor(a, b)`: static methods, for example `Bitmap64.or_(a: Bitmap64, b: Bitmap64) raises -> Bitmap64`, returning union, intersection, difference and symmetric difference.
- `serialize_portable(self) raises -> List[UInt8]`: the RoaringFormatSpec bytes (for `Bitmap64`, its 64-bit extension).
- `deserialize_portable(data: Span[UInt8, origin]) raises -> Self`: static, the reverse. Trailing bytes are an error.
- `portable_size(self) raises -> Int`: the serialized size, without building the buffer.

**Iceberg deletion vectors:**

- `encode_iceberg_dv(bitmap: Bitmap64) raises -> List[UInt8]`: the deletion-vector v1 blob: a big-endian length, the magic `D1 D3 39 64`, the portable 64-bit bitmap and a big-endian CRC-32.
- `decode_iceberg_dv(data: Span[UInt8, origin]) raises -> Bitmap64`: checks the length, magic and CRC, then decodes the bitmap.

Also exported: `crc32(data) -> UInt32`, the CRC the framing uses, and `Container`, the per-16-bit-key array, bitset or run container behind `Bitmap32.containers`, for inspection.

## Errors and limits

- Malformed input raises an `Error` that starts with where it was found: `iceberg_dv: blob too short`, `iceberg_dv: length field does not match blob size`, `iceberg_dv: bad magic bytes`, `iceberg_dv: CRC-32 mismatch`, `roaring: bad portable cookie`, `roaring: truncated portable payload`, or `Bitmap32.deserialize_portable: trailing bytes`. Treat any of them as a corrupt blob.
- Containers live in a `Dict`, which is why nearly every method raises. It also makes `add` cost a dictionary lookup per value: about 7.7 million random adds a second on an M4.
- `add_range` adds its values one at a time, and its stop is exclusive, so a `Bitmap32` range can't reach `0xFFFFFFFF`.
- To get pyroaring's exact bytes for a set with long runs, call `run_optimize()` first: pyroaring run-encodes on its own, and this library doesn't.

## Tests

`pixi run test` builds and runs `tests/roaring_test.mojo`: container promotion at 4096 values in both directions, the four set operations across mixed containers, portable round trips, and corrupted deletion-vector blobs. About a dozen tests compare against pyroaring byte for byte in both directions, with its output baked in as constants. CI runs them and `mojolint` on stable and nightly Mojo.
