import { DatabaseSync } from "node:sqlite";
import { List, Ok, Error as GlError, BitArray } from "./gleam.mjs";
import { SqlightError, error_code_from_int } from "./sqlight.mjs";

export function open(path) {
  try {
    // Empty path should open in-memory database
    const dbPath = path === "" ? ":memory:" : path;
    return new Ok(new DatabaseSync(dbPath));
  } catch (error) {
    return convert_error(error);
  }
}

export function close(connection) {
  try {
    connection.close();
    return new Ok(undefined);
  } catch (error) {
    // Ignore "database is not open" error on multiple close calls
    if (error.message && error.message.includes("database is not open")) {
      return new Ok(undefined);
    }
    return convert_error(error);
  }
}

export function coerce_value(value) {
  return value;
}

export function coerce_blob(value) {
  // Convert BitArray to Uint8Array/Buffer for Node.js/Deno sqlite
  if (value instanceof BitArray) {
    // For Deno, Buffer may not be available, use Uint8Array
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value.rawBuffer);
    } else {
      // Deno: return Uint8Array directly
      return value.rawBuffer;
    }
  }
  return value;
}

export function status(connection) {
  throw new Error("status");
}

export function exec(sql, connection) {
  try {
    connection.exec(sql);
    return new Ok(undefined);
  } catch (error) {
    return convert_error(error);
  }
}

export function query(sql, connection, parameters) {
  let rows;
  try {
    const paramsArray = parameters.toArray().map(p => p === undefined ? null : p);

    const stmt = connection.prepare(sql);
    // Use all() to get query results, not run()
    rows = stmt.all(...paramsArray);

    // Convert rows from object format to indexed format for Gleam decoder
    // Gleam expects {0: val1, 1: val2, ...} but Node.js gives {col1: val1, col2: val2, ...}
    const indexedRows = rows.map(row => {
      const values = Object.values(row);
      const indexed = {};
      values.forEach((val, idx) => {
        // Convert null to undefined for Gleam's optional decoder
        if (val === null) {
          indexed[idx] = undefined;
        }
        // Convert Uint8Array (BLOB) to BitArray
        else if (val instanceof Uint8Array) {
          indexed[idx] = new BitArray(val);
        }
        else {
          indexed[idx] = val;
        }
      });
      return indexed;
    });

    return new Ok(List.fromArray(indexedRows));
  } catch (error) {
    return convert_error(error);
  }
}

export function null_() {
  // Node.js SQLite expects null, but Gleam uses undefined internally
  // The query function will convert undefined to null when binding
  return undefined;
}

function convert_error(error) {
  // Node.js sqlite errors use errcode (numeric) instead of code (string)
  // Deno's node:sqlite compatibility layer doesn't provide errcode
  let code;

  if (error.errcode !== undefined && typeof error.errcode === 'number') {
    // Node.js: Use the extended error code
    code = error.errcode;
  } else {
    // Deno: Infer basic error code from message
    const message = error.message || '';

    if (message.includes('FOREIGN KEY')) {
      code = 787; // ConstraintForeignkey
    } else if (message.includes('NOT NULL')) {
      code = 1299; // ConstraintNotnull
    } else if (message.includes('UNIQUE')) {
      code = 2067; // ConstraintUnique
    } else if (message.includes('CHECK')) {
      code = 275; // ConstraintCheck
    } else if (message.includes('constraint')) {
      code = 19; // Constraint (generic)
    } else if (message.includes('incomplete input') || message.includes('syntax error')) {
      code = 1; // GenericError
    } else {
      code = 1; // GenericError (fallback)
    }
  }

  const errorCode = error_code_from_int(code);
  return new GlError(
    new SqlightError(
      errorCode,
      error.message || String(error),
      error.offset !== undefined ? error.offset : -1
    )
  );
}
