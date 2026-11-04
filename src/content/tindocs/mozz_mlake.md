---
checked: 0.2.2
---

## What it is

mozz_mlake is a packaged build of [mozz](https://github.com/ehsanmok/mozz) by Ehsan M. Kermani: pure-Mojo fuzzing and property-based testing, with a mutation engine, an `Arbitrary` trait, shrinking and corpus handling. magmalake republishes it only because mozz isn't on a conda channel pixi can resolve, which blocked [flare_mlake](/s/flare_mlake)'s fuzz environment and fuzzing in magmalake's own repositories. The code is upstream's, and the module is still imported as `mozz`. Star it and file issues upstream.

## Install

```sh
pixi shelf add mozz_mlake      # no other tins
```

Then `from mozz import ...` as upstream documents.

## What magmalake changed

No source changes, only packaging:

- **The build backend pin.** Upstream pins `pixi-build-rattler-build ==0.3.13`, which speaks a `pixi-build-api-version` no current pixi provides, so upstream holds its CI at pixi 0.70.2. This build takes the backend as a lower bound, `>=0.3.13`, and lets pixi pick a matching one.
- **The package is named `mozz_mlake`**; the module stays `mozz`, so you change no source, and switching to an official package later is a one-line dependency change.

CI builds the package and consumes it from a clean project on Linux and macOS. The repository is archived the day mozz is on a channel pixi can resolve.

## Upstream

- Project, issues and pull requests: [github.com/ehsanmok/mozz](https://github.com/ehsanmok/mozz)
- Documentation: [ehsanmok.github.io/mozz](https://ehsanmok.github.io/mozz/)
- Upstream's README, verbatim: [README.upstream.md](https://github.com/magmalake/mozz_mlake/blob/main/README.upstream.md)
