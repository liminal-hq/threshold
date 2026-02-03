#!/usr/bin/env bash
# Lint Mermaid diagrams in docs/, excluding archived files.
# Exits 0 if no errors (warnings are allowed).
set -euo pipefail

output=$(npx @probelabs/maid docs/ -E '**/archive/**' -f json)
errors=$(echo "$output" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const errs = d.files.flatMap(f =>
    (f.diagnostics || []).filter(d => d.severity === 'error')
  );
  errs.forEach(e => console.error(e.file + ':' + e.line + ' ' + e.message));
  console.log(errs.length + ' error(s)');
  process.exit(errs.length ? 1 : 0);
")
echo "$errors"
