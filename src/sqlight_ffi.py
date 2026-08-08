import sqlite3

from gleam_builtins import Error, GleamList, Ok


def open(path: str):
    try:
        db_path = ":memory:" if path == "" else path
        return Ok(sqlite3.connect(db_path, uri=True))
    except Exception as error:
        return _convert_error(error)


def close(connection):
    try:
        connection.close()
        return Ok(None)
    except Exception as error:
        if "not open" in str(error):
            return Ok(None)
        return _convert_error(error)


def coerce_value(value):
    return value


def coerce_blob(value):
    return value


def exec(sql, connection):
    try:
        connection.executescript(sql)
        return Ok(None)
    except Exception as error:
        return _convert_error(error)


def query(sql, connection, parameters):
    try:
        rows = connection.execute(sql, _list_to_python(parameters)).fetchall()
        return Ok(_rows_to_gleam(rows))
    except Exception as error:
        return _convert_error(error)


def null_():
    return None


def _list_to_python(gleam_list):
    result = []
    head = gleam_list
    while head is not None:
        result.append(head.value)
        head = head.tail
    return result


def _list_to_gleam(values):
    result = None
    for value in reversed(values):
        result = GleamList(value, result)
    return result


def _rows_to_gleam(rows):
    return _list_to_gleam([_list_to_gleam(row) for row in rows])


def _convert_error(error):
    from sqlight import SqlightError, error_code_from_int

    code = getattr(error, "sqlite_errorcode", None)
    if not isinstance(code, int):
        code = 1
    return Error(SqlightError(error_code_from_int(code), str(error), -1))
