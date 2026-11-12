---
checked: 0.4.1
---

## What it's for

objectstore is where magmalake's bytes come from and go to. One `FileIOResolver` picks a backend by URI scheme (`file://` or a bare path, `http(s)://`, `s3://`, `gs://`, `abfss://`) and gives you files with `length`, `read_all`, `read_range` and writes. [iceberg](/s/iceberg), [Morca](https://morca.dev) and [Dista](https://morca.dev/dista/) read tables through it, and its `HttpClient` is the HTTPS transport the Iceberg REST catalog uses. It also ships an `objectstore-mojo` CLI (`ls`, `cat`, `head`, `get`, `put`, `rm`, `stat`, `presign`).

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add objectstore-mojo   # no other tins; brings libcurl and a small C shim over it
```

libcurl comes from conda-forge with TLS and a CA bundle. The shim is found in `$CONDA_PREFIX/lib`, next to the executable, or through the binary's rpath, so a program built with `pixi run mojo build` also runs from a plain shell.

## Quick start

Write a local file, read its tail back, and presign an S3 URL (signing needs no server):

```mojo
from objectstore import FileIOResolver, S3Client, S3Config, S3Credentials


def main() raises:
    var io = FileIOResolver()
    var loc = "file:///tmp/objectstore-demo/data/part-0.bin"
    io.write(loc, "hello, object store".as_bytes())   # makes the directories

    var f = io.new_input(loc)
    print(f.length(), "bytes")
    var tail = f.read_range(-5, 5)                    # the last 5 bytes
    print(String(unsafe_from_utf8=tail))

    # Signing needs no server: a presigned URL for someone without credentials.
    var s3 = S3Client(
        S3Config(
            "http://127.0.0.1:9000",                   # MinIO; "" means AWS
            "us-east-1",
            path_style=True,
            credentials=S3Credentials("minioadmin", "minioadmin", ""),
        )
    )
    print(s3.presign_get("warehouse", "db/t/data/f.parquet", 900))
```

For S3 through the resolver, set Iceberg properties (`io.set("s3.region", "us-east-1")`) or the `AWS_*` variables, then use `s3://bucket/key` locations the same way.

## API

Everything below is exported from `objectstore`.

**`FileIOResolver()`** or **`FileIOResolver(var properties: Dict[String, String])`**: the scheme dispatcher, configured with Iceberg property names.

- `set(mut self, var key: String, var value: String)`: sets one property, such as `s3.endpoint` or `s3.access-key-id`.
- `add_storage_credential(mut self, var prefix: String, var config: Dict[String, String])`: a REST catalog's vended credentials for one prefix; the longest matching prefix wins.
- `rebase(mut self, var old_prefix: String, var new_prefix: String)`: redirects every location under `old_prefix`, first match wins.
- `new_input(self, location: String) raises -> AnyInputFile` and `new_output(self, location: String) raises -> AnyOutputFile`: a file on whichever backend the scheme names.
- `read_all(self, location: String) raises -> List[UInt8]`, `read_range(self, location: String, offset: Int, length: Int) raises -> List[UInt8]` and `read_text(self, location: String) raises -> String`: one-call reads.
- `read_ranges(self, location: String, ranges: List[ByteRange]) raises -> List[List[UInt8]]`: several ranges of one object, coalesced into fewer requests.
- `read_all_many(self, locations: List[String]) raises -> List[List[UInt8]]` and `read_ranges_many(self, locations: List[String], ranges: List[List[ByteRange]]) raises -> List[List[List[UInt8]]]`: many files at once; the S3 ones go out as one parallel batch.
- `write(self, location: String, data: Span[UInt8, _]) raises`, `delete(self, location: String) raises`, `list(self, prefix: String) raises -> List[String]` and `exists(self, location: String) -> Bool`.

**`AnyInputFile`**: `location()`, `exists()`, `length()`, `read_all()`, `read_range(offset, length)` and `read_ranges(ranges)`. A negative `offset` counts back from the end, the way a Parquet reader asks for its footer. **`AnyOutputFile`**: `create(data)` raises if the file exists; `overwrite(data)` doesn't. Both conform to the `InputFile` and `OutputFile` traits, so generic code can take either the union or a concrete backend.

**`ByteRange(offset: Int, length: Int)`**: one span to read.

**`S3Config`**: `S3Config.from_env() raises -> Self` reads the `AWS_*` variables (and the instance role, if there are no keys and no custom endpoint); `S3Config.from_properties(props: Dict[String, String]) raises -> Self` reads Iceberg names on top of that. Fields include `endpoint`, `region`, `path_style`, `credentials`, `sign_payload`, `anonymous`, `multipart_threshold` and `multipart_part_size`.

**`S3Client(var config: S3Config)`**:

- `get_object(self, bucket: String, key: String, range_start: Int = -1, range_end: Int = -1) raises -> List[UInt8]`: the object, or the inclusive range.
- `put_object(self, bucket: String, key: String, body: Span[UInt8, _], content_type: String = "") raises`: one `PUT`, or a multipart upload above `multipart_threshold` (8 MiB).
- `head_object(self, bucket: String, key: String) raises -> Response`, `object_length(...) raises -> Int`, `object_exists(...) raises -> Bool` and `delete_object(...) raises`.
- `list_objects_v2(self, bucket: String, prefix: String = "", delimiter: String = "", max_keys: Int = 0, continuation_token: String = "") raises -> ListResult` is one page; `list_all(self, bucket: String, prefix: String = "", delimiter: String = "") raises -> ListResult` follows every page.
- `presign_get(self, bucket: String, key: String, expires_seconds: Int = 3600) raises -> String`: a URL that anyone can `GET` with no credentials.
- `set_max_retries(mut self, n: Int)`: retries per request; 3 by default.

**`HttpClient()`**: `get(url, headers, range_start, range_end)`, `head`, `put(url, body, headers)`, `post(url, body, headers)`, `delete` and the general `request(self, method: String, url: String, headers: List[Header] = List[Header](), body: Span[UInt8, _] = Span[UInt8, ImmUntrackedOrigin](), range_start: Int = -1, range_end: Int = -1) raises -> Response`. Its fields are `timeout_ms` (30 s), `follow_redirects` (off), `verify_tls` (on), `pool` and `retry`. **`Response`** has `status`, `headers` and `body`, plus `ok()`, `header(name)`, `text()` and `raise_for_status(what)`. **`Header(name, value)`** is one request header.

Also exported: `sha256`, `sha256_hex`, `hmac_sha256` and `Sha256` (pure Mojo, on the ARMv8 and SHA-NI hardware paths), `sign_request` and `presign_query` for SigV4, `parse_uri`, `join`, `parent` and `basename`, and `GcsClient` and `AzureClient`.

## Errors and limits

- `HttpClient` raises only when the transport fails. A 404 or 500 comes back as a `Response`; `raise_for_status` turns it into `<what>: HTTP <code> <first 256 bytes of the body>`.
- S3 calls raise `s3: GET <bucket>/<key>: HTTP <code> <Code>: <Message>`, with S3's own error code. Deleting a missing key isn't an error. An unknown scheme raises `objectstore: no implementation for scheme '<s>' in <location>`. HTTP locations can't be listed or deleted.
- Retries: 3 by default, 100 ms doubling to 20 s, on transport failures, 429, 5xx, and S3's `SlowDown` and `RequestTimeout`. A `POST` is retried only when it carries an `Idempotency-Key` header. `RetryPolicy.none()` turns retries off.
- Setting `s3.endpoint` or `AWS_ENDPOINT_URL[_S3]` switches to path-style addressing (MinIO, R2, Ceph); `s3.path-style-access = false` overrides that. `s3.unsigned-payload` sends `UNSIGNED-PAYLOAD` instead of the body hash; it is off by default.
- GCS takes a bearer token you already have (`gcs.oauth2.token`) and Azure takes a SAS token (`adls.sas-token`). Service-account JWTs, Azure SharedKey and Entra ID aren't implemented, and neither is REST remote signing (`s3.signer`). Multipart parts go up one at a time from memory.
- Connections are pooled per thread and reused. A private pool from `new_connection_pool()` is yours to `free_connection_pool`.

## Tests

`pixi run test` starts a local HTTP server and MinIO (from conda-forge's `minio-server`), then runs the suite: SHA-256 and HMAC against FIPS 180-4 and RFC 4231 and 1000 random buffers cross-checked against OpenSSL, all 37 usable cases of the AWS SigV4 test suite at every stage, connection reuse counted from both ends, and S3 end to end against MinIO. It also checks that the shim loads with `CONDA_PREFIX` unset. CI runs `pixi run check` (tests plus the CLI build) on Linux and macOS, on the stable and nightly toolchains.
