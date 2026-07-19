#!/bin/bash
set -o errexit
set -o pipefail
set -o nounset

: "${EXPO_UPDATES_UPLOAD_URL:?Set EXPO_UPDATES_UPLOAD_URL to a Meadow-owned upload endpoint}"
: "${EXPO_UPDATES_UPLOAD_USERNAME:?Set EXPO_UPDATES_UPLOAD_USERNAME}"
: "${EXPO_UPDATES_UPLOAD_TOKEN:?Set EXPO_UPDATES_UPLOAD_TOKEN}"

rm -rf bundleTempDir
rm -rf bundle.tar.gz

echo "Creating tarball..."
node scripts/bundleUpdate.js

if [ -z "$RUNTIME_VERSION" ]; then
  RUNTIME_VERSION=$(cat package.json | jq '.version' -r)
fi

cd bundleTempDir || exit
BUNDLE_VERSION=$(date +%s)
DEPLOYMENT_URL="$EXPO_UPDATES_UPLOAD_URL?runtime-version=$RUNTIME_VERSION&bundle-version=$BUNDLE_VERSION&channel=$CHANNEL_NAME&ios-build-number=$BSKY_IOS_BUILD_NUMBER&android-build-number=$BSKY_ANDROID_VERSION_CODE"

tar czvf bundle.tar.gz ./*

echo "Deploying to $DEPLOYMENT_URL..."
echo "  runtime-version: $RUNTIME_VERSION"
echo "  bundle-version: $BUNDLE_VERSION"
echo "  channel: $CHANNEL_NAME"
echo "  ios-build-number: $BSKY_IOS_BUILD_NUMBER"
echo "  android-build-number: $BSKY_ANDROID_VERSION_CODE"

curl --fail-with-body -o - --form "bundle=@./bundle.tar.gz" --user "$EXPO_UPDATES_UPLOAD_USERNAME:$EXPO_UPDATES_UPLOAD_TOKEN" --basic "$DEPLOYMENT_URL"

cd ..

rm -rf bundleTempDir
rm -rf bundle.tar.gz
