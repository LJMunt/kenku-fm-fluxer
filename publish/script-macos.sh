#!/bin/bash

TOKEN=$2
RELEASE_ID=$3
FILE=$1
FILE_SIZE=$(stat -f%z "$FILE")
FILE_TYPE=$(file -b --mime-type "$FILE")
ASSET_NAME=$4

REPO=${GITHUB_REPOSITORY:-"owlbear-rodeo/kenku-fm"}
curl -X POST \
    -H "Content-Length: $FILE_SIZE" \
    -H "Content-Type: $FILE_TYPE" \
    -T "$FILE" \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    https://uploads.github.com/repos/$REPO/releases/"${RELEASE_ID}"/assets?name="${ASSET_NAME}"