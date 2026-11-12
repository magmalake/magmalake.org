---
checked: 0.1.1
---

## What it's for

memory-region gives you a fixed range of bytes, on the heap or in a file mapped `MAP_SHARED`, and a bump allocator that carves it up by offset rather than by pointer. Whatever you lay out inside it refers to the rest of it by offset, so another process can map the same file at a different address and read it unchanged. [arrow-mlake](/s/arrow-mlake) uses it to hand Arrow batches to another process without a copy on the reading side, and [Dista](https://morca.dev/dista/) uses it in its object store.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add memory-region-mojo   # no shelf dependencies
```

It calls POSIX `open`, `ftruncate`, `mmap` and `munmap` directly, so there is no shim to build. It runs on macOS and Linux.

## Quick start

Write a header that points at a payload into a shared mapping, then map the file read-only and follow the offsets:

```mojo
from memory_region import BumpAllocator, MappedRegion, SharedMapping


def main() raises:
    var path = String("/tmp/qs_region.bin")

    # Producer: a header that points at a payload, by offset.
    var bump = BumpAllocator[MappedRegion](MappedRegion(path, 4096))
    var header = bump.claim(16)
    var values: List[Float64] = [1.5, 2.5, 4.0]
    var payload = bump.append(Span(values))       # copies, returns the offset
    var head = bump.span[DType.int64](header, 2)
    head[0] = Int64(payload)
    head[1] = Int64(len(values))
    bump^.close()                                 # unmaps; the file stays

    # Consumer, normally another process: map read-only, follow the offsets.
    var mapped = SharedMapping(path)
    var h = mapped.span[DType.int64](header, 2)
    var total = Float64(0)
    for x in mapped.span[DType.float64](Int(h[0]), Int(h[1])):
        total += x
    print("sum:", total)                          # sum: 8.0
```

## API

Everything is exported from `memory_region`.

**`Region`**: the trait both regions implement, with `base(self) -> Int`, `size(self) -> Int`, `close(deinit self)` and `into_raw(deinit self) -> Int`. A region frees or unmaps itself at end of scope; `into_raw` gives up ownership so the destructor doesn't run, for bytes that become a consumer's.

- `HeapRegion(size: Int)`: an ordinary allocation, rounded up to 8 bytes.
- `MappedRegion(var path: String, size: Int) raises`: creates or truncates `path` at `size` bytes and maps it writable and shared. Its `path` field is what a peer needs.

**`BumpAllocator[R: Region & Deinitable](var region: R)`**: hands out 8-byte-aligned offsets from the front of the region.

- `claim(mut self, n: Int) raises -> Int`: reserves `n` bytes and returns their offset.
- `append[dtype: DType, //](mut self, data: Span[Scalar[dtype], _]) raises -> Int`: claims room for `data`, copies it in and returns the offset.
- `span[dtype: DType](ref self, offset: Int, count: Int) -> Span[Scalar[dtype], origin_of(self)]`: a typed view of what you claimed, writable through a `mut` allocator.
- `unsafe_ptr(self, offset: Int) -> Pointer[UInt8, MutUntrackedOrigin]` and `unsafe_address(self, offset: Int) -> Int`: an offset as an address, valid in this process only.
- `close(deinit self)` and `into_raw(deinit self) -> Int`: the region's two endings, now rather than at end of scope.

**`SharedMapping(var path: String) raises`**: the consumer's half, the whole file mapped read-only and unmapped at end of scope.

- `span[dtype: DType](self, offset: Int, count: Int) raises -> Span[Scalar[dtype], origin_of(self)]`: `count` values at `offset`, checked against the mapping.
- `bytes(self) -> Span[UInt8, origin_of(self)]`, `size(self) -> Int`, and `unsafe_base(self) -> Int` for handing the address to foreign code.

## Errors and limits

- A region has a fixed size. `claim` raises `memory_region: region is full (<used> > <size>)` rather than growing, since moving would break every offset already handed out. Size the region up front; an oversized mapping costs nothing for pages you never touch.
- Pieces can't be freed; the whole region goes at once.
- `SharedMapping.span` raises when the values would fall outside the mapping (`memory_region: <n> values at <offset> run past the end of <path> (<size> bytes)`) or when `offset` isn't aligned for the type. Views can't be written through and can't outlive the mapping: both are compile errors. Nothing stops the producer rewriting or truncating the file underneath you.
- `BumpAllocator.span` only `debug_assert`s its offset, since one the allocator handed out can only be wrong through a bug.
- Neither type has a `Bool` view; read bools as `uint8`.
- A region doesn't describe itself: the reader needs a manifest of where things are, and that belongs to whoever owns the payload. `map_shared(path)` is deprecated; use `SharedMapping`.

## Tests

`pixi run test` checks that dropped regions free themselves, that offsets are 8-byte aligned and refused past the end, and that bytes written through one mapping read back through a second, independent `SharedMapping` of the same file at a different address. It also feeds `SharedMapping.span` out-of-range, misaligned and empty-file cases. CI runs it on Linux and macOS with Mojo 1.2.0 and nightly.
