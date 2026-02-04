#!/usr/bin/env bash
# Lint Mermaid diagrams in docs/, excluding archived files.
# Emits GitHub Actions annotations for inline PR comments.
# Exits 0 if no errors (warnings are allowed).
set -euo pipefail

output=$(npx @probelabs/maid docs/ -E '**/archive/**' -f json)
echo "$output" | node -e "
  const path = require('path');
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const cwd = process.cwd();
  let errorCount = 0;

  for (const f of d.files) {
    const rel = path.relative(cwd, f.file);

    for (const w of (f.warnings || [])) {
      const loc = 'file=' + rel + ',line=' + w.line + ',col=' + w.column;
      console.log('::warning ' + loc + '::' + w.message);
    }

    for (const e of (f.errors || [])) {
      const loc = 'file=' + rel + ',line=' + e.line + ',col=' + e.column;
      console.log('::error ' + loc + '::' + e.message);
      errorCount++;
    }
  }

  console.log(errorCount + ' error(s)');
  process.exit(errorCount ? 1 : 0);
"
