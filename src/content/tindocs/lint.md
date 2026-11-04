---
checked: 0.1.4
---

## What it's for

lint is `mojolint`, a linter for origin and threading mistakes the Mojo compiler accepts: an address erased from a local that dies on that line, a destructor running between a field copy and its dereference, and a plain store to state that [threads](/s/threads) tasks share. It reads Mojo as text, and with `--lsp` it asks `mojo-lsp-server`, the compiler's own frontend, for resolved types and name-resolved uses. The magmalake tins run it in CI. It's a proof of concept: three rules, no dataflow.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add lint-mojo       # no other tins; builds the mojolint executable
```

It's a tool, not a library: nothing is imported. `pixi install` builds `mojolint` into the environment's `bin/`. The tin depends on the `mojo` package, so `mojo-lsp-server` lands next to it and `--lsp` uses the compiler your project uses.

## Quick start

Given a task that adds to shared state with a plain store:

```mojo
def task(i: Int, mut t: Totals) -> None:
    t.sum += Int64(i)
```

lint the workspace's `src/` and `tests/`, or the paths you name:

```sh
pixi shelf lint                   # text mode
pixi shelf lint --lsp src         # with mojo-lsp-server behind the rules
```

```text
src/race.mojo:10:5: L003 plain store to `t.sum` from a task that runs on several threads at once; use an atomic, a mutex, or a slot only this task writes
```

It exits 1 on findings, so CI can gate on it. To run it the way the magmalake tins do, as a pixi task that passes your include paths through:

```toml
[tasks]
lint = { cmd = "mojolint --lsp -I src src tests" }
```

A line you've checked is silenced with an allow comment on it or on the line above:

```mojo
    t.sum += Int64(i)  # lint: allow(L003)
```

## Rules

- **L001 untracked-pointer-from-dying-local**: a `var` local is erased to an untracked pointer (`Int(Pointer(to=x))`, `opaque_ptr`, `MutUntrackedOrigin`) on the line of its last use, so it's destroyed before anything reads the pointer. An erased address that is returned fires too. A parameter erased and passed to a call is fine.
- **L002 owning-untracked-field**: a struct with `__deinit__` holds a `Pointer[T, MutUntrackedOrigin]` field, and `local.field[]` is the local's last use, so the destructor runs between the copy and the dereference.
- **L003 plain-store-in-task**: a function shaped like a task, `(i: Int, mut t: T)` or `(i: Int, p: OpaquePtr)`, assigns to its shared state. A subscripted target such as `s.cells[i]` is taken to be a per-task slot.

## Command line and limits

- `mojolint [--lsp] [-I DIR]... PATH...` prints `path:line:col: L00N message` per finding and exits 1 if there were any, 2 on a usage or read error. A directory is walked for `.mojo` files, skipping `.pixi`, `.git`, `build` and `shelf`. Run it with no paths to see the rules.
- `pixi shelf lint [--lsp] [-e ENV] [PATH]...` runs the workspace's `mojolint`, over `src/` and `tests/` by default.
- `-I` takes the same paths as `mojo build`. Without them `--lsp` can't resolve the file's imports: it prints a `note:` saying `mojo-lsp-server` reported parse errors, and the rules fall back to text where a fact is missing.
- `--lsp` costs about half a second per file. It decides "last use" by textual position, which is right in straight-line code but not across loops and branches. The compiler issue [modular/modular#7076](https://github.com/modular/modular/issues/7076) asks for the real diagnostic.
- Text mode misses what the source doesn't spell out: erasure inside a helper, a dereference through a second variable, a store hidden in a method call.

## Tests

`pixi run check` runs the unit tests and the corpus: each program under `tests/corpus/positive` must fire exactly the rules its `# lint-expect:` line names, in text mode and in `--lsp` mode, and each one under `negative` must stay silent. The positives are `threads.example`'s uncaught programs, and the negatives include threads.mojo's own `parallel.mojo` and tests. CI runs it on Mojo 1.2.0 and nightly, and builds the package.
