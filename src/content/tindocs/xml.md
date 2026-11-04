---
checked: 0.1.0
---

## What it's for

xml reads the XML that cloud APIs answer with: EC2 responses, S3 bucket listings, Azure Blob results. It's a pull parser plus a flat, read-only tree you query by path, like `reservationSet/item/instancesSet/item`. It has no dependencies and no FFI. It's for Mojo clients of those APIs that don't want a C library for one response format. It isn't on mojoshelf yet, and no other tin depends on it so far.

## Install

xml isn't on mojoshelf, so `pixi shelf add` won't find it. Build it from its repository as a pixi git dependency instead:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
```

Then add it to `pixi.toml` and run `pixi install`:

```toml
[dependencies]
xml-mojo = { git = "https://github.com/magmalake/xml.mojo", branch = "main" }
```

Pin a `rev` rather than tracking `main` if you want builds that don't move. You can also skip the package and compile from a checkout with `-I ../xml.mojo/src`.

## Quick start

Page through an S3 `ListObjectsV2` answer:

```mojo
from xml import NO_NODE, Document


def main() raises:
    var body = String(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
        "<Name>lake</Name><IsTruncated>true</IsTruncated>"
        "<Contents><Key>data/a.parquet</Key><Size>1024</Size></Contents>"
        "<Contents><Key>data/b&amp;c.parquet</Key><Size>2048</Size></Contents>"
        "<NextContinuationToken>tok-2</NextContinuationToken>"
        "</ListBucketResult>"
    )
    var doc = Document.parse(body)
    var root = doc.root()
    for c in doc.find_all(root, "Contents"):
        print(doc.child_text(c, "Key"), Int(doc.child_text(c, "Size")))
    if doc.child_text(root, "IsTruncated") == "true":
        print("next:", doc.child_text(root, "NextContinuationToken"))
    print(doc.find(root, "Contents/Owner") == NO_NODE)   # True
```

## API

Everything is exported from `xml`.

**`Document`**: the whole document as a tree. A node is an element, named by an `Int` id; `NO_NODE` (`-1`) means none.

- `Document.parse(doc: String) raises -> Document`: parses the whole document, raising on malformed XML or a missing root.
- `root(self) -> Int`, `parent(self, node: Int) -> Int` and `children(self, node: Int) -> List[Int]`; `len(doc)` is the number of elements.
- `name(self, node: Int) -> String`: the element's name as written, prefix included.
- `text(self, node: Int) -> String`: the element's own text, entity-decoded, without the whitespace between its child elements.
- `attr(self, node: Int, name: String, default: String = "") -> String`: an attribute's value, matched by its full name.
- `child(self, node: Int, name: String) -> Int` and `child_text(self, node: Int, name: String, default: String = "") -> String`: the first child with that local name, or its text.
- `find_all(self, node: Int, path: String) -> List[Int]`: every element reached by the `/`-separated path, in document order. `find(self, node: Int, path: String) -> Int` and `find_text(self, node: Int, path: String, default: String = "") -> String` take the first.

**`XmlReader(doc: String)`**: the pull parser `Document` is built on, holding its own copy of the bytes.

- `next(mut self) raises -> XmlEvent`: the next event. Call it until `kind` is `EVENT_EOF`.
- `depth(self) -> Int`: how many elements are open.
- **`XmlEvent`** has `kind` (`EVENT_START`, `EVENT_END`, `EVENT_TEXT` or `EVENT_EOF`), `name`, `text` and `attrs: List[Attr]`; an **`Attr`** has `name` and `value`. A self-closing tag gives a start and an end.

Also exported: `local_name(name: String) -> String`, which strips a namespace prefix, `is_blank(s: String) -> Bool`, and `decode_entities(raw: Span[UInt8, _]) raises -> String`.

## Errors and limits

- Malformed structure raises `xml: <what> at byte <offset>`: tags that don't nest or close with matching names, more than one root, text or CDATA outside the root, unquoted or unterminated attributes. Entity errors (`xml: unknown entity &foo;`, `xml: unterminated entity reference`, bad or out-of-range character references) carry no offset.
- The five predefined entities and numeric references are decoded; CDATA comes back as text, verbatim. Comments, processing instructions, the XML declaration and `DOCTYPE` are skipped.
- Path segments match local names (`ec2:item` matches `item`) and `*` matches any element. There are no predicates, attribute steps or `//`. `attr` matches the full name, prefix included.
- It isn't validating: DTDs and schemas are ignored, and namespaces are left as written. The whole document is held in memory.
- Node ids aren't checked: pass `NO_NODE` or an out-of-range id to `name`, `text` or `children` and you index past the arrays. Compare with `NO_NODE` first.

## Tests

`pixi run test` (nightly) and `pixi run -e stable test` (Mojo 1.2.0) run `tests/xml_test.mojo`, the tin's own suite. CI runs it on both toolchains on Linux and macOS.
