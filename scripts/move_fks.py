#!/usr/bin/env python3
"""
move_fks.py

Takes an input SQL file with CREATE TABLE blocks that include inline FOREIGN KEY constraints,
removes those inline FK constraint lines from the CREATE TABLE bodies and emits equivalent
ALTER TABLE ... ADD CONSTRAINT ... statements at the end of the file.

Usage:
  python3 scripts/move_fks.py scripts/target_ready.sql scripts/target_ready_no_fks.sql

Notes:
 - This is a simple parser intended for the style produced by pg_dump / hand-written SQL where
   each inline constraint is on its own line and looks like:
     CONSTRAINT name FOREIGN KEY (col) REFERENCES schema.table(col),
   and may include trailing actions like ON DELETE CASCADE.
 - Always review the generated file before applying it to your DB.
"""
import re
import sys

if len(sys.argv) != 3:
    print("Usage: move_fks.py <input.sql> <output.sql>")
    sys.exit(2)

in_path = sys.argv[1]
out_path = sys.argv[2]

with open(in_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

out_lines = []
alter_statements = []

in_create = False
current_table = None
create_block = []

# regex to detect start of CREATE TABLE and capture schema.table and table name
create_re = re.compile(r'^\s*CREATE\s+TABLE\s+([^\s(]+)\s*\(', re.IGNORECASE)
# regex to match inline FK constraint (captures name, cols, ref, refcols, rest)
fk_re = re.compile(
    r"^\s*CONSTRAINT\s+([\w_]+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)(.*)$",
    re.IGNORECASE
)

for idx, line in enumerate(lines):
    if not in_create:
        m = create_re.match(line)
        if m:
            in_create = True
            current_table = m.group(1)  # might be public.table or schema.table
            create_block = [line]
        else:
            out_lines.append(line)
    else:
        # We are inside a CREATE TABLE block; collect lines until we find the closing ');'
        if line.strip().startswith(');') or re.match(r'^\s*\)\s*;\s*$', line):
            # process create_block + current line
            # filter out FK lines
            filtered_block = []
            for cl in create_block[1:]:  # skip the first line (CREATE TABLE ...()
                fk_match = fk_re.match(cl.strip().rstrip(','))
                if fk_match:
                    # capture info to create ALTER TABLE later
                    cname = fk_match.group(1)
                    cols = fk_match.group(2).strip()
                    ref = fk_match.group(3).strip()
                    refcols = fk_match.group(4).strip()
                    rest = fk_match.group(5).strip()
                    # build alter statement
                    alter = f"ALTER TABLE {current_table} ADD CONSTRAINT {cname} FOREIGN KEY ({cols}) REFERENCES {ref} ({refcols})"
                    if rest:
                        # rest may start with ON DELETE/ON UPDATE ...
                        alter += ' ' + rest
                    alter += ';\n'
                    alter_statements.append(alter)
                    # do not include this line in filtered_block (effectively removing it)
                else:
                    filtered_block.append(cl)

            # Ensure the last non-empty line in the filtered block does not end with a trailing comma
            # (this can happen when the removed FK was the final item and left a trailing comma on the previous line)
            for i in range(len(filtered_block) - 1, -1, -1):
                if filtered_block[i].strip() == '':
                    continue
                # preserve indentation while removing a trailing comma if present
                leading_ws = re.match(r'^(\s*)', filtered_block[i]).group(1)
                stripped = filtered_block[i].strip()
                if stripped.endswith(','):
                    stripped = stripped[:-1]
                    filtered_block[i] = leading_ws + stripped + '\n'
                break
            # write the CREATE TABLE first line
            out_lines.append(create_block[0])
            # write filtered body
            for fb in filtered_block:
                out_lines.append(fb)
            # write the closing line
            out_lines.append(line)
            # reset state
            in_create = False
            current_table = None
            create_block = []
        else:
            create_block.append(line)

# append ALTER TABLE statements at the end
out_lines.append('\n-- Re-attached foreign key constraints moved out of CREATE TABLE bodies\n')
for stmt in alter_statements:
    out_lines.append(stmt)

with open(out_path, 'w', encoding='utf-8') as f:
    f.writelines(out_lines)

print(f'Wrote {out_path} with {len(alter_statements)} FK constraints moved to ALTER TABLE statements.')
