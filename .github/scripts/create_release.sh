#!/usr/bin/env bash
set -euo pipefail

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN is required"
  exit 1
fi

PAYLOAD=$(python3 - <<PY
import os, json
print(json.dumps({
  "tag_name": os.getenv('TAG_NAME',''),
  "name": os.getenv('RELEASE_NAME',''),
  "body": os.getenv('RELEASE_BODY',''),
  "draft": False,
  "prerelease": False
}))
PY
)

RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/releases")

echo "Release create response: $RESPONSE"

UPLOAD_URL=$(echo "$RESPONSE" | python3 -c 'import sys,json; resp=json.load(sys.stdin); print(resp.get("upload_url",""))')

if [ -z "$UPLOAD_URL" ]; then
  echo "Failed to obtain upload_url from release response"
  exit 1
fi

echo "upload_url=$UPLOAD_URL" >> "$GITHUB_OUTPUT"

echo "Release created, upload_url set."
