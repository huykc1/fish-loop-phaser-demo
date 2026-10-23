#!/usr/bin/env bash
# Assembles the GitHub Pages site: landing page at /, game at /demo/, docs at /docs/,
# and (latest only) the level editor at /editor/. Versioned snapshots do not include the editor.
set -euo pipefail

rm -rf _site
npm run build
npm run docs:build

mkdir -p _site
cp site/index.html _site/
cp -R dist _site/demo
cp -R docs/.vitepress/dist _site/docs

if [[ "${SITE_VERSION:-latest}" == latest ]]; then
    npm run build:editor
    cp -R dist-editor _site/editor
fi
