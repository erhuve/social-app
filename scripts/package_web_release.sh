#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

requested_commit=${1:-HEAD}
commit=$(git rev-parse --verify "$requested_commit^{commit}")
head_commit=$(git rev-parse HEAD)
if [[ "$commit" != "$head_commit" ]]; then
  echo "Refusing to package $commit from checkout $head_commit" >&2
  exit 1
fi
source_date_epoch=${SOURCE_DATE_EPOCH:-$(git show -s --format=%ct "$commit")}
artifact_dir=${ARTIFACT_DIR:-artifacts}
archive="$artifact_dir/meadow-web-$commit.tar.gz"

test -f web-build/index.html
mkdir -p "$artifact_dir"

python3 - "$commit" "$source_date_epoch" <<'PY'
import json
import sys
from pathlib import Path

commit, source_date_epoch = sys.argv[1:]
manifest = {
    "commit": commit,
    "sourceDateEpoch": int(source_date_epoch),
    "product": "Meadow",
}
Path("web-build/release.json").write_text(
    json.dumps(manifest, indent=2, sort_keys=True) + "\n"
)
PY

tar \
  --sort=name \
  --mtime="@$source_date_epoch" \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  -czf "$archive" \
  -C web-build .

(cd "$artifact_dir" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
printf '%s\n' "$archive"
