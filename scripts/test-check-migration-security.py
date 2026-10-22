#!/usr/bin/env python3
"""Checks that check-migration-security.py flags new functions left open to
signed-out visitors, and doesn't flag a function an earlier migration already
created or renamed into place (replacing one keeps its revokes). Also checks
it flags a new public table or sequence that no grant or revoke names, since
Supabase stopped granting new tables to the app on 30 October 2026. Run by CI."""

import importlib.util
import sys
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'check_migration_security', Path(__file__).parent / 'check-migration-security.py'
)
cms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cms)

FN = """create or replace function public.{name}() returns void language sql
security definer set search_path = '' as $$ select $$;
"""
REVOKE = 'revoke execute on function public.{name}() from public, anon;\n'

failed = 0


def expect(label: str, migrations: dict[str, str], last: str, flagged: list[str]) -> None:
    global failed
    with tempfile.TemporaryDirectory() as folder:
        for name, sql in migrations.items():
            Path(folder, name).write_text(sql, encoding='utf-8')
        found = [why for _, why in cms.check(Path(folder, last))]
    got = sorted(w.split(' is ')[0] for w in found if 'not revoked' in w)
    if got == sorted(flagged):
        print(f'PASS {label}')
    else:
        failed += 1
        print(f'FAIL {label}: flagged {got}, expected {flagged}')


expect('a new function without a revoke is flagged',
       {'1_a.sql': FN.format(name='f')}, '1_a.sql', ['f'])
expect('a new function with a revoke passes',
       {'1_a.sql': FN.format(name='f') + REVOKE.format(name='f')}, '1_a.sql', [])
expect('replacing a function an earlier migration created passes',
       {'1_a.sql': FN.format(name='f') + REVOKE.format(name='f'), '2_b.sql': FN.format(name='f')},
       '2_b.sql', [])
expect('replacing a function an earlier migration renamed into place passes',
       {'1_a.sql': FN.format(name='f') + REVOKE.format(name='f'),
        '2_b.sql': 'alter function public.f() rename to f_base;\n',
        '3_c.sql': FN.format(name='f_base')},
       '3_c.sql', [])
expect('a rename in a later migration doesn\'t count',
       {'1_a.sql': FN.format(name='g'), '3_c.sql': 'alter function public.f() rename to g;\n'},
       '1_a.sql', ['g'])

TABLE = """create table public.{name} (id uuid primary key);
alter table public.{name} enable row level security;
"""


def expect_tables(label: str, sql: str, flagged: list[str]) -> None:
    global failed
    with tempfile.TemporaryDirectory() as folder:
        Path(folder, '1_a.sql').write_text(sql, encoding='utf-8')
        found = [why for _, why in cms.check(Path(folder, '1_a.sql'))]
    got = sorted(w.split(' has ')[0] for w in found if 'no grant or revoke' in w)
    if got == sorted(flagged):
        print(f'PASS {label}')
    else:
        failed += 1
        print(f'FAIL {label}: flagged {got}, expected {flagged}')


expect_tables('a new table without a grant is flagged', TABLE.format(name='t'), ['t'])
expect_tables('a new table granted to authenticated passes',
              TABLE.format(name='t') + 'grant select, insert on table public.t to authenticated;\n', [])
expect_tables('a table named in a grant list passes',
              TABLE.format(name='t') + TABLE.format(name='u')
              + 'grant select on public.u, public.t to authenticated, service_role;\n', [])
expect_tables('a column grant passes',
              TABLE.format(name='t') + 'grant update (id) on public.t to authenticated;\n', [])
expect_tables('a new table revoked on purpose passes',
              TABLE.format(name='t') + 'revoke all on public.t from public, anon, authenticated;\n', [])
expect_tables('a partial revoke without a grant is flagged',
              TABLE.format(name='t') + 'revoke insert, update, delete on public.t from anon, authenticated;\n', ['t'])
expect_tables('a grant on a longer table name doesn\'t count',
              TABLE.format(name='t') + TABLE.format(name='t_notes')
              + 'grant select on public.t_notes to authenticated;\n', ['t'])
expect_tables('a grant in a comment doesn\'t count',
              TABLE.format(name='t') + '-- grant select on public.t to authenticated;\n', ['t'])
expect_tables('a grant on another table doesn\'t count',
              TABLE.format(name='t') + 'grant select on public.other to authenticated;\n', ['t'])
SERIAL = """create table public.t (id bigserial primary key, x int);
alter table public.t enable row level security;
grant select, insert on public.t to authenticated;
"""
expect_tables('a serial column on a granted table needs its sequence granted', SERIAL, ['t_id_seq'])
expect_tables('a granted serial sequence passes',
              SERIAL + 'grant usage on sequence public.t_id_seq to authenticated;\n', [])
expect_tables('a serial column on a table reached through functions needs no grant',
              SERIAL.replace('grant select, insert on public.t to authenticated;',
                             'revoke all on public.t from public, anon, authenticated;'), [])
expect_tables('an identity column needs no sequence grant',
              SERIAL.replace('bigserial', 'bigint generated always as identity'), [])
expect_tables('a new sequence needs a grant', 'create sequence public.s;\n', ['s'])
expect_tables('a granted new sequence passes',
              'create sequence public.s;\ngrant usage on sequence public.s to authenticated;\n', [])
expect_tables('a table outside public needs no grant',
              'create table private.t (id uuid primary key);\n', [])

sys.exit(1 if failed else 0)
