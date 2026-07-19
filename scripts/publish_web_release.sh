#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

requested_commit=${1:?usage: publish_web_release.sh FULL_COMMIT_SHA}
commit=$(git rev-parse --verify "$requested_commit^{commit}")
if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full commit SHA is required" >&2
  exit 1
fi

repo=${GH_REPO:-${GITHUB_REPOSITORY:-erhuve/social-app}}
artifact_dir=${ARTIFACT_DIR:-artifacts}
archive="$artifact_dir/meadow-web-$commit.tar.gz"
checksum="$archive.sha256"
tag="meadow-web-$commit"

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

verify_checksum "$archive" "$checksum"

verify_release_assets() {
  local download_dir
  download_dir=$(mktemp -d)
  trap 'rm -rf "$download_dir"' RETURN
  gh release download "$tag" \
    --repo "$repo" \
    --dir "$download_dir" \
    --pattern "$(basename "$archive")" \
    --pattern "$(basename "$checksum")"
  verify_checksum \
    "$download_dir/$(basename "$archive")" \
    "$download_dir/$(basename "$checksum")"
  cmp "$archive" "$download_dir/$(basename "$archive")"
  cmp "$checksum" "$download_dir/$(basename "$checksum")"
  rm -rf "$download_dir"
  trap - RETURN
}

verify_release_metadata() {
  local release_json=$1
  if [[ $(jq -r .tagName <<<"$release_json") != "$tag" || \
    $(jq -r .targetCommitish <<<"$release_json") != "$commit" ]]; then
    echo "Release metadata does not target $commit" >&2
    exit 1
  fi
}

verify_tag() {
  local ref_type ref_sha
  read -r ref_sha ref_type < <(
    gh api "repos/$repo/git/ref/tags/$tag" --jq '.object.sha + " " + .object.type'
  )
  if [[ "$ref_type" != "commit" || "$ref_sha" != "$commit" ]]; then
    echo "Release tag $tag does not resolve directly to $commit" >&2
    exit 1
  fi
}

if release_json=$(
  gh release view "$tag" \
    --repo "$repo" \
    --json isDraft,tagName,targetCommitish 2>/dev/null
); then
  verify_release_metadata "$release_json"
  if [[ $(jq -r .isDraft <<<"$release_json") == true ]]; then
    gh release upload "$tag" \
      "$archive" \
      "$checksum" \
      --repo "$repo" \
      --clobber
    verify_release_assets
    gh release edit "$tag" --repo "$repo" --draft=false
    verify_tag
    echo "Recovered and published verified draft release $tag"
    exit 0
  fi
  verify_release_assets
  verify_tag
  echo "Verified existing durable release $tag"
  exit 0
fi

if gh api "repos/$repo/git/ref/tags/$tag" >/dev/null 2>&1; then
  echo "Tag $tag exists without a release; refusing to reuse it" >&2
  exit 1
fi

gh release create "$tag" \
  "$archive" \
  "$checksum" \
  --repo "$repo" \
  --target "$commit" \
  --title "Meadow web $commit" \
  --notes "Commit-addressed Meadow web release for $commit." \
  --draft
release_json=$(
  gh release view "$tag" \
    --repo "$repo" \
    --json isDraft,tagName,targetCommitish
)
verify_release_metadata "$release_json"
verify_release_assets
gh release edit "$tag" --repo "$repo" --draft=false
verify_tag
echo "Published durable release $tag"
