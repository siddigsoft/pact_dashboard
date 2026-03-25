const fs = require('fs');
const path = require('path');

const marker = '@/integrations/supabase/client';
const roots = [path.join('src', 'pages'), path.join('src', 'components')];

const results = [];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p);
      continue;
    }
    if (!ent.isFile()) continue;
    if (!p.endsWith('.tsx')) continue;
    const txt = fs.readFileSync(p, 'utf8');
    if (!txt.includes(marker)) continue;
    const lines = txt.split(/\r?\n/).length;
    results.push({ p, lines });
  }
}

for (const r of roots) {
  if (!fs.existsSync(r)) continue;
  walk(r);
}

results.sort((a, b) => b.lines - a.lines);

for (const x of results.slice(0, 30)) {
  const rel = x.p.replace(/^src[\\/]/, '');
  console.log(`${x.lines}\t${rel}`);
}

console.log(`\ncount\t${results.length}`);
