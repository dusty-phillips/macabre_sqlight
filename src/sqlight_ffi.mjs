import { DatabaseSync } from "node:sqlite";
import { toList, Result$Ok, Result$Error, BitArray$BitArray, BitArray$isBitArray, BitArray$BitArray$data } from "./gleam.mjs";
import { Error$SqlightError, error_code_from_int } from "./sqlight.mjs";

export function open(path) {
  try {
    // Empty path should open in-memory database
    const dbPath = path === "" ? ":memory:" : path;
    return Result$Ok(new DatabaseSync(dbPath));
  } catch (error) {
    return convert_error(error);
  }
}

export function close(connection) {
  try {
    connection.close();
    return Result$Ok(undefined);
  } catch (error) {
    // Ignore "database is not open" error on multiple close calls
    if (error.message && error.message.includes("database is not open")) {
      return Result$Ok(undefined);
    }
    return convert_error(error);
  }
}

export function coerce_value(value) {
  return value;
}

export function coerce_blob(value) {
  // Convert BitArray to Uint8Array/Buffer for Node.js/Deno sqlite
  if (BitArray$isBitArray(value)) {
    const data = BitArray$BitArray$data(value);
    // Convert DataView to Uint8Array
    const uint8Array = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    // For Deno, Buffer may not be available, use Uint8Array
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(uint8Array);
    } else {
      // Deno: return Uint8Array directly
      return uint8Array;
    }
  }
  return value;
}

export function exec(sql, connection) {
  try {
    connection.exec(sql);
    return Result$Ok(undefined);
  } catch (error) {
    return convert_error(error);
  }
}

export function query(sql, connection, parameters) {
  let rows;
  try {
    const paramsArray = parameters.toArray();

    const stmt = connection.prepare(sql);
    rows = stmt.all(...paramsArray);

    const indexedRows = rows.map(row => {
      const result = [];
      for (const val of Object.values(row)) {
        if (val === null) {
          result.push(undefined);
        } else if (val instanceof Uint8Array) {
          result.push(BitArray$BitArray(val));
        } else {
          result.push(val);
        }
      }
      return result;
    });

    return Result$Ok(toList(indexedRows));
  } catch (error) {
    return convert_error(error);
  }
}

export function null_() {
  return null;
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
  return Result$Error(
    Error$SqlightError(
      errorCode,
      error.message || String(error),
      error.offset !== undefined ? error.offset : -1
    )
  );
}
