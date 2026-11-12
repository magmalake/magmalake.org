/**
 * The home page's code tabs (src/components/CodeTabs.astro): one short
 * example per tin, each with a line under it and a link to its page. Cut down
 * from each tin's quick start (src/content/tindocs/).
 */
export type Example = { id: string; label: string; code: string; note: string; href: string };

export const examples: Example[] = [
  {
    id: "parquet",
    label: "Parquet",
    code: `from parquet import OP_GE, OP_LT, ParquetReader, Predicate, ScalarValue

def main() raises:
    var r = ParquetReader.open("prune.parquet")
    r.select_columns(["k"])
    var preds: List[Predicate] = [
        Predicate("k", OP_GE, ScalarValue.of_int(250)),
        Predicate("k", OP_LT, ScalarValue.of_int(260)),
    ]
    print(r.prune_row_groups(preds), "row groups left")
    var t = r.read_table()
    var k = t.column_i64(0)                 # (values, validity)`,
    note: `Footer, page headers, levels and values decoded in Mojo; the rows come back as Arrow arrays.`,
    href: "/s/parquet",
  },
  {
    id: "iceberg",
    label: "Iceberg",
    code: `from iceberg import Catalog

var table = Catalog.rest("https://polaris.example/api/catalog").load("db.events")
var rows = table.scan().filter('["=", "region", "eu"]').select(["id", "amount"]).to_table()`,
    note: `Metadata, manifests, scan planning, Parquet decode, deletes and deletion vectors, S3 IO and the REST catalog — all of it Mojo.`,
    href: "/s/iceberg",
  },
  {
    id: "objectstore",
    label: "Object storage",
    code: `from objectstore import FileIOResolver

def main() raises:
    var io = FileIOResolver()
    var loc = "file:///tmp/objectstore-demo/data/part-0.bin"
    io.write(loc, "hello, object store".as_bytes())   # makes the directories

    var f = io.new_input(loc)
    print(f.length(), "bytes")
    var tail = f.read_range(-5, 5)                    # the last 5 bytes`,
    note: `One resolver for file://, http(s)://, s3://, gs:// and abfss://, with ranged reads and SigV4 signing.`,
    href: "/s/objectstore",
  },
];
