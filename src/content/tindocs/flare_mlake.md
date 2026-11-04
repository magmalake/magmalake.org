---
checked: 0.13.2
---

## What it is

flare_mlake is a packaged build of [flare](https://github.com/ehsanmok/flare) by Ehsan M. Kermani: TCP, UDP, TLS, DNS, HTTP/1.1, HTTP/2, HTTP/3, QUIC, WebSocket and gRPC for Mojo, with its own reactor. magmalake republishes it only because flare isn't on a conda channel pixi can resolve. [k8s](/s/k8s) uses it for HTTPS with client certificates. Essentially all of the code is upstream's, and the module is still imported as `flare`. Star it and file issues upstream.

## Install

```sh
pixi shelf add flare_mlake     # brings json_mlake, threads-mojo; OpenSSL, zlib, brotli from conda-forge
```

Then `from flare.http import HttpClient` and the rest, as upstream documents. The package ships its TLS, zlib and brotli shims prebuilt in the environment's `lib/`.

## What magmalake changed

Seven small source deltas, each worth sending upstream:

- **OS threads come from [threads](/s/threads)** (`flare/runtime/_thread.mojo`), so a program can use flare and threads.mojo together: Mojo declares an extern per signature, and the two spelled `pthread_create` and `pthread_join` differently, which kept such programs from linking.
- **macOS defaults to one shared listener** (`flare/runtime/scheduler.mojo`), since BSD's `SO_REUSEPORT` doesn't spread connections across listeners. `FLARE_REUSEPORT_WORKERS=1` restores one listener per worker.
- **`eventfd_write` is Linux-only** (`flare/runtime/_balance.mojo`). Unguarded, anything reaching the unified reactor failed to link on macOS.
- **`libflare_tls` pins itself in memory** with `RTLD_NODELETE` (`flare/tls/ffi/openssl_wrapper.cpp`), because macOS's linker has no `-z nodelete`.
- **The FFI shims are found next to the executable too** (`flare/utils/_dlopen.mojo`): `$CONDA_PREFIX/lib`, then the executable's directory and its `../lib`, then the rpath. A missing shim raises an Error that says to set `CONDA_PREFIX`.
- **`fcntl` is declared variadic** (`flare/net/_libc.mojo`), as dista and orca declare it, so flare's HTTP client links beside [Dista](/s/dista) on Linux.
- **`tests/tools/proto_gen.py` decodes `repeated string` and `bytes` one element per field**, as they are never packed.

And packaging: the package is named `flare_mlake` while the module stays `flare`, it depends on [json_mlake](/s/json_mlake) and its fuzz environment on [mozz_mlake](/s/mozz_mlake) instead of upstream's repositories, and [CHANGELOG.md](https://github.com/magmalake/flare_mlake/blob/main/CHANGELOG.md) lists every change as it's made. CI runs upstream's gRPC, HTTP, TLS, net and crypto tests on the packaged build.

The repository is archived the day flare is on a channel pixi can resolve.

## Upstream

- Project, issues and pull requests: [github.com/ehsanmok/flare](https://github.com/ehsanmok/flare)
- Documentation: [ehsanmok.github.io/flare](https://ehsanmok.github.io/flare/)
- Upstream's README, verbatim: [README.upstream.md](https://github.com/magmalake/flare_mlake/blob/main/README.upstream.md)
