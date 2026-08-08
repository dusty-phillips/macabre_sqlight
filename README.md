# macabre_sqlight

Use [SQLite](https://www.sqlite.org/index.html) from Gleam!

This is a fork of [lpil/sqlight](https://github.com/lpil/sqlight) (Apache-2.0)
that adds Python externals for [macabre](https://github.com/anomalyco/macabre)'s
Python target. The fork preserves the full upstream history. The only Gleam
changes are the added `@external(python, ...)` attributes on the FFI functions;
the Python implementation lives in `src/sqlight_ffi.py` (mirroring
`sqlight_ffi.mjs`) and uses Python's built-in `sqlite3` module.

Because the module is still named `sqlight`, existing code keeps working:

```gleam
import gleam/dynamic/decode
import sqlight

pub fn main() {
  use conn <- sqlight.with_connection(":memory:")

  let sql = "
  create table cats (name text, age int);

  insert into cats (name, age) values 
  ('Nubi', 4),
  ('Biffy', 10),
  ('Ginny', 6);
  "
  let assert Ok(Nil) = sqlight.exec(sql, conn)

  let cat_decoder = {
    use name <- decode.field(0, decode.string)
    use age <- decode.field(1, decode.int)
    decode.success(#(name, age))
  }

  let sql = "
  select name, age from cats
  where age < ?
  "
  let assert Ok([#("Nubi", 4), #("Ginny", 6)]) =
    sqlight.query(sql, on: conn, with: [sqlight.int(7)], expecting: cat_decoder)
}
```

## Using it with macabre

Add the fork to a macabre project (macabre resolves dependencies from git),
along with `macabre_stdlib` (which provides the `gleam/*` modules):

```toml
[dependencies]
macabre_stdlib = { git = "git@github.com:dusty-phillips/macabre_stdlib.git", ref = "main" }
macabre_sqlight = { git = "git@github.com:dusty-phillips/macabre_sqlight.git", ref = "main" }
```

## Implementation

When running on Erlang it is a library wrapper around the excellent Erlang library
[esqlite](https://hex.pm/packages/esqlite), which in turn is a wrapper around
the SQLite C library. It is implemented as a NIF, which means that the SQLite
database engine is linked to the erlang virtual machine.

When running on JavaScript it is a wrapper around the
[`node:sqlite`](https://nodejs.org/api/sqlite.html) module that is built-in to
the most common runtimes.

When running on Python it is a wrapper around Python's built-in `sqlite3`
module. SQLite error codes are mapped to `ErrorCode` values using the extended
error codes exposed by `sqlite3.Error`, matching the Erlang and Node.js
behaviour.

## On using Bool with SQLite

SQLite does not have a native boolean type. Instead, it uses ints, where 0 is
False and 1 is True. Because of this the Gleam stdlib decoder for bools will not
work, instead the `sqlight.decode_bool` function should be used as it supports
both ints and bools.

## Development

Macabre targets Python, so the stock `gleam` compiler (which does not recognise
the `python` external target) cannot check or format this package. `./test.sh`
syntax-checks the Python FFI instead.

## License

Apache-2.0, matching upstream sqlight.
