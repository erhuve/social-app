#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
commit=${1:?usage: activate_web_release.sh FULL_COMMIT_SHA}
if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full lowercase commit SHA is required" >&2
  exit 1
fi

repo=${GH_REPO:-erhuve/social-app}
release_root=${MEADOW_RELEASE_ROOT:-$repo_root/releases}
current_link=${MEADOW_CURRENT_LINK:-$repo_root/current}
previous_link=${MEADOW_PREVIOUS_LINK:-$repo_root/previous}
archive_name="meadow-web-$commit.tar.gz"
checksum_name="$archive_name.sha256"

mkdir -p "$release_root"
release_root=$(cd "$release_root" && pwd -P)
release_dir="$release_root/$commit"
switch_journal="$release_root/.switch-journal"
mkdir -p "$(dirname "$current_link")" "$(dirname "$previous_link")"
exec 9>"$release_root/.activation.lock"
flock 9

source "$repo_root/scripts/web_release_lib.sh"

for link in "$current_link" "$previous_link"; do
  if [[ -e "$link" && ! -L "$link" ]]; then
    echo "$link exists and is not a symbolic link" >&2
    exit 1
  fi
done
recover_switch
if [[ $SWITCH_RECOVERED == 1 && $RECOVERED_OPERATION == activate && \
  $(readlink -f "$current_link") == "$release_dir" ]]; then
  basename "$(readlink -f "$current_link")"
  exit 0
fi

verify_checksum() {
  local checked_archive=$1 checked_checksum=$2 digest expected actual
  digest=$(sha256sum "$checked_archive" | awk '{print $1}')
  expected="$digest  $(basename "$checked_archive")"
  actual=$(cat "$checked_checksum")
  if [[ "$actual" != "$expected" ]]; then
    echo "Checksum does not exactly cover $(basename "$checked_archive")" >&2
    exit 1
  fi
}

verify_tag() {
  local ref_sha ref_type
  read -r ref_sha ref_type < <(
    gh api "repos/$repo/git/ref/tags/meadow-web-$commit" --jq '.object.sha + " " + .object.type'
  )
  if [[ "$ref_type" != "commit" || "$ref_sha" != "$commit" ]]; then
    echo "Release tag does not resolve directly to $commit" >&2
    exit 1
  fi
}

install_root=$(mktemp -d "$release_root/.install-$commit.XXXXXX")
trap 'rm -rf "$install_root"' EXIT
mkdir -p "$install_root/download" "$install_root/extract"

verify_tag
gh release download "meadow-web-$commit" \
  --repo "$repo" \
  --dir "$install_root/download" \
  --pattern "$archive_name" \
  --pattern "$checksum_name"

archive="$install_root/download/$archive_name"
checksum="$install_root/download/$checksum_name"
verify_checksum "$archive" "$checksum"
gh attestation verify "$archive" \
  --repo "$repo" \
  --signer-workflow "$repo/.github/workflows/meadow-web-release.yml" \
  --source-digest "$commit" \
  --source-ref refs/heads/main \
  --deny-self-hosted-runners >/dev/null

python3 - "$archive" "$install_root/extract" <<'PY'
import sys
import tarfile
from pathlib import Path

archive = Path(sys.argv[1])
destination = Path(sys.argv[2]).resolve()
with tarfile.open(archive, "r:gz") as source:
    members = source.getmembers()
    if len(members) > 50_000 or sum(member.size for member in members) > 1_000_000_000:
        raise SystemExit("release archive exceeds safety limits")
    for member in members:
        target = (destination / member.name).resolve()
        if not target.is_relative_to(destination):
            raise SystemExit(f"unsafe archive path: {member.name}")
        if not (member.isdir() or member.isfile()):
            raise SystemExit(f"unsupported archive entry: {member.name}")
    source.extractall(destination, members, filter="data")
PY
validate_release "$install_root/extract" "$commit"

if [[ -e "$release_dir" || -L "$release_dir" ]]; then
  if [[ -L "$release_dir" || ! -d "$release_dir" ]]; then
    echo "Existing release path is not a regular directory" >&2
    exit 1
  fi
  assert_release_target "$release_dir"
  diff -qr --no-dereference "$install_root/extract" "$release_dir" >/dev/null || {
    echo "Existing release content does not match the attested artifact" >&2
    exit 1
  }
  chmod -R a-w "$release_dir"
else
  mv -T "$install_root/extract" "$release_dir"
  chmod -R a-w "$release_dir"
fi

old_target=""
if [[ -L "$current_link" ]]; then
  old_target=$(readlink -f "$current_link")
  assert_release_target "$old_target"
fi
if [[ "$old_target" == "$release_dir" ]]; then
  echo "$commit"
  exit 0
fi

perform_switch activate "$release_dir" "$old_target"
echo "$commit"
