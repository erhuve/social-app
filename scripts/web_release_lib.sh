#!/usr/bin/env bash

atomic_link() {
  local target=$1 link=$2 temporary
  temporary="$link.tmp.$$"
  rm -f "$temporary"
  ln -s "$target" "$temporary"
  mv -Tf "$temporary" "$link"
}

fsync_directory() {
  python3 - "$1" <<'PY'
import os
import sys

directory_fd = os.open(sys.argv[1], os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
PY
}

validate_release() {
  python3 - "$1" "$2" <<'PY'
import html.parser
import json
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

root = Path(sys.argv[1]).resolve()
expected = sys.argv[2]
if not (root / "index.html").is_file():
    raise SystemExit("release is missing index.html")
manifest_path = root / "release.json"
if not manifest_path.is_file():
    raise SystemExit("release is missing release.json")
manifest = json.loads(manifest_path.read_text())
if manifest.get("product") != "Meadow" or manifest.get("commit") != expected:
    raise SystemExit("release manifest does not match requested commit")

for path in root.rglob("*"):
    if path.is_symlink() or not (path.is_dir() or path.is_file()):
        raise SystemExit(f"unsupported installed release entry: {path.relative_to(root)}")

class AssetParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = set()

    def handle_starttag(self, _tag, attrs):
        for key, value in attrs:
            if key not in {"href", "src"} or not value:
                continue
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc or value.startswith(("data:", "#")):
                continue
            candidate = unquote(parsed.path).lstrip("/")
            if candidate:
                self.assets.add(candidate)

parser = AssetParser()
parser.feed((root / "index.html").read_text())
for asset in parser.assets:
    target = (root / asset).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise SystemExit(f"release is missing referenced asset: {asset}")
PY
}

assert_release_target() {
  local target=$1 expected
  case "$target" in
    "$release_root"/*) ;;
    *) echo "Release target is outside $release_root" >&2; return 1 ;;
  esac
  if [[ "$(dirname "$target")" != "$release_root" || -L "$target" || ! -d "$target" ]]; then
    echo "Invalid release target: $target" >&2
    return 1
  fi
  expected=$(basename "$target")
  if [[ ! "$expected" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Invalid release directory name: $expected" >&2
    return 1
  fi
  validate_release "$target" "$expected"
}

write_switch_journal() {
  local operation=$1 desired_current=$2 desired_previous=$3
  python3 - "$switch_journal" "$operation" "$desired_current" "$desired_previous" <<'PY'
import os
import sys
from pathlib import Path

journal = Path(sys.argv[1])
temporary = journal.with_name(journal.name + f".tmp.{os.getpid()}")
data = f"{sys.argv[2]}\n{sys.argv[3]}\n{sys.argv[4]}\n".encode()
fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    os.write(fd, data)
    os.fsync(fd)
finally:
    os.close(fd)
os.replace(temporary, journal)
directory_fd = os.open(journal.parent, os.O_RDONLY)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
PY
}

finish_switch() {
  local desired_current=$1 desired_previous=$2
  assert_release_target "$desired_current"
  if [[ -n "$desired_previous" ]]; then
    assert_release_target "$desired_previous"
  fi
  if [[ -n "$desired_previous" ]]; then
    atomic_link "$desired_previous" "$previous_link"
  else
    rm -f "$previous_link"
  fi
  if [[ ${MEADOW_RELEASE_FAIL_BEFORE_CURRENT:-0} == 1 ]]; then
    echo "Injected failure before current release switch" >&2
    return 1
  fi
  atomic_link "$desired_current" "$current_link"
  fsync_directory "$(dirname "$current_link")"
  if [[ $(dirname "$previous_link") != $(dirname "$current_link") ]]; then
    fsync_directory "$(dirname "$previous_link")"
  fi
  rm -f "$switch_journal"
  fsync_directory "$(dirname "$switch_journal")"
}

recover_switch() {
  local entries=()
  SWITCH_RECOVERED=0
  RECOVERED_OPERATION=""
  if [[ ! -e "$switch_journal" ]]; then
    return
  fi
  if [[ -L "$switch_journal" || ! -f "$switch_journal" ]]; then
    echo "Invalid release switch journal" >&2
    return 1
  fi
  mapfile -t entries < "$switch_journal"
  if [[ ${#entries[@]} -ne 3 || \
    (${entries[0]} != activate && ${entries[0]} != rollback) ]]; then
    echo "Invalid release switch journal" >&2
    return 1
  fi
  RECOVERED_OPERATION=${entries[0]}
  MEADOW_RELEASE_FAIL_BEFORE_CURRENT=0 finish_switch "${entries[1]}" "${entries[2]}"
  SWITCH_RECOVERED=1
}

perform_switch() {
  local operation=$1 desired_current=$2 desired_previous=$3
  write_switch_journal "$operation" "$desired_current" "$desired_previous"
  finish_switch "$desired_current" "$desired_previous"
}
