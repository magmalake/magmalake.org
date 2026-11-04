---
checked: 0.4.3
---

## What it is

json_mlake is a packaged build of [json](https://github.com/ehsanmok/json) by Ehsan M. Kermani: simdjson-backed JSON parsing for Mojo, with value types, reflection, JSONPath, schema validation and a GPU backend. magmalake republishes it only because json isn't on a conda channel pixi can resolve, and [flare_mlake](/s/flare_mlake) and [k8s](/s/k8s) need it. The code is upstream's and the module is still imported as `json`. Star it and file issues upstream.

## Install

```sh
pixi shelf add json_mlake      # no other tins; brings simdjson from conda-forge
```

Then `from json import ...` as upstream documents. The package build compiles the simdjson wrapper into the environment's `lib/`, so you need no compiler of your own. The GPU parser (`json.gpu`) is opt-in: add `max-core ==26.7` to your own dependencies, since that package is under the Modular Community License.

## What magmalake changed

It tracks upstream v0.4.2. The one source delta:

- **The simdjson wrapper is found without `CONDA_PREFIX`** (`json/cpu/_dlopen.mojo`): it looks in `$CONDA_PREFIX/lib`, then the executable's directory and its `../lib`, then the binary's rpath, so a binary built under pixi runs from a plain shell. A missing wrapper raises an Error that says to set `CONDA_PREFIX`. Upstream's fallback to `build/libsimdjson_wrapper.so` relative to the working directory is dropped.

And packaging:

- The package is named `json_mlake`; the module stays `json`, so switching to an official package later is a one-line dependency change.
- `mojodoc` is dropped from the dev feature, so the `docs` task isn't available.
- CI builds the package and consumes it from a clean project on linux-64 and osx-arm64, instead of running upstream's test matrix; upstream's docs and fuzz workflows are dropped.

The repository is archived the day json is on a channel pixi can resolve.

## Upstream

- Project, issues and pull requests: [github.com/ehsanmok/json](https://github.com/ehsanmok/json)
- Documentation: [ehsanmok.github.io/json](https://ehsanmok.github.io/json/)
- Upstream's README, verbatim: [README.upstream.md](https://github.com/magmalake/json_mlake/blob/main/README.upstream.md)
