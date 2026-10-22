#!/usr/bin/env python3
"""Flags migration statements that could expose data to the wrong people.

Usage: check-migration-security.py [FILE...]  (default: every migration)

Checks each new migration for:
- a new table in public without row level security turned on in the same file
- a new table in public that the same file neither grants nor revokes
  entirely (`revoke all`)
  (Supabase stopped granting new tables to the app's roles on 30 October
  2026, so a table nobody grants can't be reached from the app)
- a new sequence in public, made by `create sequence` or a serial column,
  that no grant or revoke names, on a table the migration grants (inserts
  that need it would fail; identity columns need no grant)
- row level security being turned off
- tables, functions or policies opened to anon or public (signed-out visitors)
- a security definer function without `set search_path`
- a new function that isn't revoked from public and anon in the same file
  (Supabase lets signed-out visitors call new functions otherwise)

Copied from FirstPass HQ (scripts/check-migration-security.py); keep the two
in step. There is no label to skip this check: anything it finds should be
fixed.
Exits with status 1 when anything is found.
"""

import re
import sys
from pathlib import Path

# Comments, strings and function bodies are blanked before checking, keeping
# line numbers. Copied from FirstPass HQ's scripts/check-migrations.py.
FUNCTION_HEADER = re.compile(r'\bcreate\s+(or\s+replace\s+)?(function|procedure)\b', re.I)


def blank_text(text: str) -> str:
    return re.sub(r'[^\n]', ' ', text)


def strip(sql: str) -> str:
    # Keep line numbers by replacing skipped text with the same newlines.
    blank = lambda m: blank_text(m.group(0))
    sql = strip_function_bodies(sql)
    sql = re.sub(r'--[^\n]*', blank, sql)
    sql = re.sub(r'/\*.*?\*/', blank, sql, flags=re.S)
    sql = re.sub(r"'(?:[^']|'')*'", blank, sql)
    return sql


def strip_function_bodies(sql: str) -> str:
    """Blanks the $$ bodies of create function and create procedure only."""
    out = []
    last = 0
    for match in re.finditer(r'\$(\w*)\$.*?\$\1\$', sql, flags=re.S):
        before = sql[last:match.start()]
        statement = before.rsplit(';', 1)[-1]
        out.append(before)
        if FUNCTION_HEADER.search(statement):
            out.append(blank_text(match.group(0)))
        else:
            # A do block (or similar) runs now: keep its contents, drop the quotes.
            tag = len(match.group(1)) + 2
            out.append(' ' * tag + match.group(0)[tag:-tag] + ' ' * tag)
        last = match.end()
    out.append(sql[last:])
    return ''.join(out)

MIGRATIONS = Path(__file__).parent.parent / 'supabase' / 'migrations'

NAME = r'(?:"?\w+"?\.)?"?(\w+)"?'

RULES = [
    (r'\bdisable\s+row\s+level\s+security\b', 'turns off row level security'),
    (
        r'\bgrant\b[^;]*\bto\b[^;]*\b(anon|public)\b(?!\.)',
        'grants access to signed-out visitors',
    ),
    (
        r'\bcreate\s+policy\b[^;]*\bto\s+[^;]*\b(anon|public)\b(?!\.)',
        'a policy for signed-out visitors',
    ),
]


def line_of(sql: str, pos: int) -> int:
    return sql.count('\n', 0, pos) + 1


def revokes_from_public_and_anon(statement: str) -> bool:
    grantees = re.split(r'\bfrom\b', statement)[-1]
    return bool(re.search(r'\bpublic\b', grantees)) and bool(re.search(r'\banon\b', grantees))


def states_access(sql: str, table: str) -> bool:
    """Whether the migration grants this public table, or revokes all of it
    because the app reaches it only through functions. A partial revoke
    (say of insert, update and delete) doesn't count: it assumes the old
    automatic grants, so on a new project the table would have no access."""
    return grants_table(sql, table) or bool(re.search(
        r'\brevoke\s+all\b[^;]*?\bon\s+(table\s+)?[^;]*?(public\.|"public"\.)"?'
        + re.escape(table) + r'"?(?!\w)[^;]*;',
        sql,
    ))


def states_sequence_access(sql: str, sequence: str) -> bool:
    """Whether a grant or revoke in the migration names this public sequence."""
    return bool(re.search(
        r'\b(grant|revoke)\b[^;]*?\bon\s+sequence\s+[^;]*?(public\.|"public"\.)"?'
        + re.escape(sequence) + r'"?(?!\w)[^;]*;',
        sql,
    ))


def grants_table(sql: str, table: str) -> bool:
    return bool(re.search(
        r'\bgrant\b[^;]*?\bon\s+(table\s+)?[^;]*?(public\.|"public"\.)"?'
        + re.escape(table) + r'"?(?!\w)[^;]*;',
        sql,
    ))


def earlier_functions(path: Path, folder: Path = MIGRATIONS) -> set[str]:
    """Functions created, or renamed into place, by migrations that sort
    before this one. Replacing one keeps the grants and revokes it already has."""
    names: set[str] = set()
    for other in sorted(folder.glob('*.sql')):
        if other.name >= path.name:
            break
        sql = strip(other.read_text(encoding='utf-8')).lower()
        names.update(
            m.group(2)
            for m in re.finditer(r'\bcreate\s+(or\s+replace\s+)?function\s+' + NAME, sql)
        )
        names.update(
            m.group(1)
            for m in re.finditer(r'\balter\s+function\b[^;]*?\brename\s+to\s+"?(\w+)"?', sql)
        )
    return names


def check(path: Path) -> list[tuple[int, str]]:
    original = path.read_text(encoding='utf-8')
    sql = strip(original).lower()
    found = []

    for pattern, why in RULES:
        for match in re.finditer(pattern, sql):
            found.append((line_of(sql, match.start()), why))

    for match in re.finditer(r'\bcreate\s+table\s+(if\s+not\s+exists\s+)?' + NAME, sql):
        table = match.group(2)
        statement_start = sql.rfind(';', 0, match.start()) + 1
        if not re.match(r'\s*create\s+table\s+(if\s+not\s+exists\s+)?(public\.|"public"\.)', sql[statement_start:]):
            continue
        enabled = re.search(
            r'\balter\s+table\s+(if\s+exists\s+)?(only\s+)?(public\.|"public"\.)"?'
            + re.escape(table)
            + r'"?\s+enable\s+row\s+level\s+security\b',
            sql,
        )
        if not enabled:
            found.append((line_of(sql, match.start()), f'{table} has no row level security'))
        if not states_access(sql, table):
            found.append((line_of(sql, match.start()), f'{table} has no grant or revoke'))
        end = sql.find(';', match.end())
        body = sql[match.end():end if end != -1 else len(sql)]
        if grants_table(sql, table):
            for column in re.finditer(r'[(,]\s*"?(\w+)"?\s+(small|big)?serial\b', body):
                sequence = f'{table}_{column.group(1)}_seq'
                if not states_sequence_access(sql, sequence):
                    found.append((line_of(sql, match.start()), f'{sequence} has no grant or revoke'))

    for match in re.finditer(
        r'\bcreate\s+sequence\s+(if\s+not\s+exists\s+)?(public\.|"public"\.)"?(\w+)"?', sql
    ):
        if not states_sequence_access(sql, match.group(3)):
            found.append((line_of(sql, match.start()), f'{match.group(3)} has no grant or revoke'))

    existing = earlier_functions(path, path.parent)
    for match in re.finditer(r'\bcreate\s+(or\s+replace\s+)?function\s+' + NAME, sql):
        name = match.group(2)
        end = sql.find(';', match.end())
        header = sql[match.start():end if end != -1 else len(sql)]
        line = line_of(sql, match.start())
        if 'security definer' in header and not re.search(r'\bset\s+search_path\b', header):
            found.append((line, f'{name} is security definer without set search_path'))
        if re.search(r'\breturns\s+trigger\b', header) or name in existing:
            continue
        revokes = [
            m.group(0)
            for m in re.finditer(
                r'\brevoke\s+(execute|all)\b[^;]*\bfunction\s+(public\.)?"?' + re.escape(name)
                + r'\b[^;]*;',
                sql,
            )
        ]
        if not any(revokes_from_public_and_anon(r) for r in revokes):
            found.append((line, f'{name} is not revoked from public and anon'))

    return sorted(found)


def main(paths: list[str]) -> int:
    paths = paths or [str(p) for p in sorted(MIGRATIONS.glob('*.sql'))]
    count = 0
    for name in paths:
        path = Path(name)
        lines = path.read_text(encoding='utf-8').splitlines()
        for line, why in check(path):
            print(f'{path}:{line}: {why}: {lines[line - 1].strip()}')
            count += 1
    if count:
        print(f'\n{count} statement(s) above could expose data. Fix them before merging.')
        return 1
    print('No security problems found.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
