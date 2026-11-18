## What it checks

customs reads a Mojo project as text and checks six rules, in two groups. Each finding names the file and line, says what to change, and ends with its rule's name in brackets. A rule is `deny` (reported, and the run fails) unless the project [configures](#configuration) it otherwise.

| Group | Rule | In short |
| --- | --- | --- |
| `imports` | [`import-cycle`](#import-cycle) | no two modules import each other, directly or through others |
| `imports` | [`import-through-reexport`](#import-through-reexport) | a name is imported from the module that defines it |
| `imports` | [`unused-import`](#unused-import) | every name a file imports is used in it |
| `tests` | [`functions-in-imported-module`](#functions-in-imported-module) | a file that calls `__functions_in_module()` isn't imported |
| `tests` | [`mojo-run-per-test`](#mojo-run-per-test-and-mojo-build-per-test) | no command runs `mojo run` on more than 3 test files |
| `tests` | [`mojo-build-per-test`](#mojo-run-per-test-and-mojo-build-per-test) | no command builds more than 3 test files one by one |

A project's modules are the `.mojo` files under `src/` (or the project itself, without a `src/`), named as `mojo build -I src` names them: `src/a/b.mojo` is `a.b`, `src/a/__init__.mojo` the package `a`. A file is a module only inside packages, every directory above it having an `__init__.mojo`. The project's other `.mojo` files (tests, examples, binaries) are checked as importers.

## Run it

In GitHub Actions, as a job the required check waits for:

```yaml
  customs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: magmalake/customs@v0.4.0
```

The action downloads the release of its own tag for the runner (Linux x64 or arm64, macOS) and runs it on the checkout. Findings show as annotations on the pull request.

On your machine, take the binary for your platform from the [releases](https://github.com/magmalake/customs/releases): one file, no dependencies.

```sh
curl -fsSL https://github.com/magmalake/customs/releases/latest/download/customs-aarch64-apple-darwin.tar.gz | tar -xz
./customs path/to/project
```

The other builds are `x86_64-apple-darwin`, `x86_64-unknown-linux-musl` and `aarch64-unknown-linux-musl`. It exits 1 when a `deny` rule finds anything and 2 on a usage or configuration error; `customs --help` lists the options.

## The imports rules

### import-cycle

Mojo compiles two modules that import each other, so the compiler won't catch a cycle. customs reports each group of modules that do, with the shortest cycle through it:

```text
src/postgres/connection.mojo:103: import cycle: postgres.connection -> postgres.copy -> postgres.connection [import-cycle]
    src/postgres/connection.mojo:103: from .copy import CopyIn
    src/postgres/copy.mojo:60: from .connection import _ConnCell
```

Every import counts: one inside a function, and an import of a package's `__init__.mojo` (a module of `pkg` doing `from pkg import x`, while `pkg/__init__.mojo` imports that module, is a cycle). The fix is to move what both need into a module below both, or to pass it in from the caller.

### import-through-reexport

`from m import x`, and `m.x` after `import m`, name the module where `x` is defined, not one that imports it and passes it on:

```text
src/morca/_internal/usage.mojo:46: from morca._internal.store import Usage: `Usage` is defined in morca._internal.db.run_rows, and morca._internal.store only re-exports it; import it from morca._internal.db.run_rows [import-through-reexport]
```

A package's `__init__.mojo` is the one place a re-export may be imported from. When a module passes names on for its users (a public module over private ones, a compatibility shim after a move), make it a package: `shim.mojo` becomes `shim/__init__.mojo`, and the import path stays the same.

### unused-import

Every name a file imports is used somewhere else in it:

```text
src/iceberg/expressions.mojo:37: from .transforms import T_UNKNOWN: `T_UNKNOWN` isn't used in this file; remove it, or keep it with `# noqa: unused-import` [unused-import]
```

A name counts as used when it appears as a name, not as an attribute after a `.`, and not only in a string, a docstring or a comment. For `import a.b`, the name is `a`, as in Python. A package's `__init__.mojo` is exempt, since its imports are what it re-exports. Mojo reads every module a file imports, used or not, so an unused import is a dependency the program doesn't need: it can pull a library into a build that's meant to go without it.

To keep an import anyway, the two ways Python's tools accept work here too:

- **A redundant alias**, `from m import x as x` or `import m as m`. It's the typing convention ([PEP 484](https://peps.python.org/pep-0484/#stub-files)) for a name imported on purpose.
- **`# noqa: unused-import`** on the import, as below.

A module that only passes names on (a shim) is better made a package, as above: its imports are then allowed re-exports.

## `# noqa`

A `# noqa` comment on an import's line allows what customs would report there, as [flake8](https://flake8.pycqa.org/en/latest/user/violations.html#in-line-ignoring-errors) and [ruff](https://docs.astral.sh/ruff/linters/#error-suppression) read one:

```mojo
from .copy import CopyIn                 # noqa: unused-import
from arrow_mlake.arrow import (          # noqa: unused-import
    bit_get,
    bit_set,
)
from .internal import (
    Slots,
    Row,  # noqa: import-through-reexport
)
```

- `# noqa` alone allows every rule on the line; `# noqa: NAME, NAME` only the rules or groups named (`unused-import`, `imports`).
- It's found anywhere in the comment (`# kept for users # noqa: unused-import`), in any case.
- On the first line of an import it covers all of the import's names; on a name's own line, that name.
- It works for `unused-import`, `import-through-reexport` and `functions-in-imported-module`. It doesn't for `import-cycle`: fix a cycle, or allow the rule for the whole project.
- flake8's codes (`F401`) aren't customs's names: `# noqa: F401` allows nothing.

## The tests rules

### functions-in-imported-module

In Mojo 1.2.0, the list `__functions_in_module()` returns is incomplete when its file is imported rather than built as the main file. A test file whose `main` is `TestSuite.discover_tests[__functions_in_module()]().run()`, imported and run by another file to build every test into one binary, can run some of its tests or none, and still exit 0. customs reports the importing line. Import the tests by name instead, as [census's `scripts/test.sh`](https://github.com/morca-dev/census/blob/main/scripts/test.sh) does.

### mojo-run-per-test and mojo-build-per-test

Each `mojo run` (or `mojo build`) of a test file compiles the library code the tests share again. In [census](https://github.com/morca-dev/census/issues/207), 35 `mojo run -I src tests/test_*.mojo` took 665 s on a 16-core machine, and one binary of every test about 210 s. customs reads the project's pixi tasks, the `run:` steps of its workflows and the scripts they call, and reports a task, step or script that runs or builds more than 3 test files, with the files it runs. A loop over a glob counts each file, and so does a wrapper that passes its arguments on to `mojo build`. Where it can't tell what a command runs, it doesn't report.

## Configuration

In the project's `pixi.toml`, after clippy's style: a level per rule or group, and each rule's numbers as flat keys.

```toml
[tool.customs]
mojo-run-per-test-threshold = 3
mojo-build-per-test-threshold = 3

[tool.customs.lints]
imports = "deny"            # import-cycle, import-through-reexport, unused-import
tests = "deny"              # functions-in-imported-module, mojo-run-per-test, mojo-build-per-test
unused-import = "warn"      # a rule's own level wins over its group's
```

- Levels: `deny` reports and fails, `warn` reports and passes, `allow` doesn't check.
- On the command line, `-A`, `-W` and `-D` NAME set a rule's or a group's level over the file's.
- An unknown option, rule or level is an error, so a misspelt one doesn't go unnoticed. pixi ignores the `[tool]` table.

## How it reads Mojo

It's a scanner, not a parser. Strings and comments are blanked first, so an import in a docstring doesn't count, then `from … import …` (with parentheses or backslashes over lines) and `import …` statements are read wherever they are. A module's names are what it defines at column 0 with `def`, `fn`, `struct`, `trait`, `comptime`, `alias` or `var`. A name it can't place is a note (with `-v`), never a finding.

The magmalake tins and the [morca](https://morca.dev) repositories run it on every pull request. Its source, and the full list of what it reads, is in [the README](https://github.com/magmalake/customs#readme).
