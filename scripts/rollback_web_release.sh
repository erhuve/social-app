#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
release_root=${MEADOW_RELEASE_ROOT:-$repo_root/releases}
current_link=${MEADOW_CURRENT_LINK:-$repo_root/current}
previous_link=${MEADOW_PREVIOUS_LINK:-$repo_root/previous}

mkdir -p "$release_root"
release_root=$(cd "$release_root" && pwd -P)
switch_journal="$release_root/.switch-journal"
exec 9>"$release_root/.activation.lock"
flock 9

source "$repo_root/scripts/web_release_lib.sh"
recover_switch
if [[ $SWITCH_RECOVERED == 1 && $RECOVERED_OPERATION == rollback ]]; then
  basename "$(readlink -f "$current_link")"
  exit 0
fi

if [[ ! -L "$current_link" || ! -L "$previous_link" ]]; then
  echo "Both current and previous validated releases are required" >&2
  exit 1
fi

current_target=$(readlink -f "$current_link")
previous_target=$(readlink -f "$previous_link")
assert_release_target "$current_target"
assert_release_target "$previous_target"
if [[ "$current_target" == "$previous_target" ]]; then
  echo "Current and previous releases must differ" >&2
  exit 1
fi

perform_switch rollback "$previous_target" "$current_target"
basename "$previous_target"
