#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VSCODE_SRC="${ROOT}/../vscode-src"
if [[ ! -d "${VSCODE_SRC}" ]]; then
	echo "Expected vscode-src repository next to vscode-gl-git-links" >&2
	exit 1
fi

echo "\n== Building gl-git-links extension ==" >&2
(
	cd "${ROOT}"
	if [[ ! -d node_modules ]]; then
		npm install
	fi
	npm run compile
)

echo "\n== Building VS Code markdown extension ==" >&2
(
	cd "${VSCODE_SRC}"
	if [[ ! -d node_modules ]]; then
		npm install
	fi
	npm run gulp -- compile-extension:markdown-language-features
)

echo "\n== Launching VS Code dev host ==" >&2
(
	cd "${VSCODE_SRC}"
	./scripts/code.sh "${ROOT}" "${ROOT}/docs/invalid-gl-links.md" "${ROOT}/../gl-git-links/examples/dirA/fileA1.md" --extensionDevelopmentPath "${ROOT}"
)

echo "\n== VS Code exited ==" >&2
