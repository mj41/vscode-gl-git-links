# Markdown Implementation Snapshot

_Last updated: 2025-10-18_

## Implemented Features
- Document link provider ([src/linkProvider.ts](gl:src/linkProvider.ts)) scans documents with `findAllGlLinks` and resolves targets through `resolveGlPath`; works for inline, autolink, extended, and reference Markdown patterns.
- Hover provider ([src/hoverProvider.ts](gl:src/hoverProvider.ts)) emits a compact `Git Link` tooltip that shows the repository-relative path plus the requested line or range, and supplies status/expected/found guidance for unresolved or missing targets.
- Markdown preview plugin ([src/markdownItPlugin.ts](gl:src/markdownItPlugin.ts)) rewrites `gl:` hrefs to document-relative paths and preserves line fragments so preview clicks open the same targets as the editor.
- Diagnostics manager ([src/diagnostics.ts](gl:src/diagnostics.ts)) registers a diagnostic collection, classifies common specification violations, and reuses the path resolver to flag missing or out-of-repo targets.
- Quick fix provider ([src/quickFixes.ts](gl:src/quickFixes.ts)) surfaces lightbulb actions for leading slashes, missing `./` prefixes, mid-path `..` segments, and scaffolding missing files, and refreshes diagnostics after applying edits.
- [src/test/hoverProvider.test.ts](gl:src/test/hoverProvider.test.ts) validates hover text for resolved and unresolved targets, as well as cancellation handling.
- Path resolution utilities ([src/pathResolver.ts](gl:src/pathResolver.ts)) locate the git root, resolve absolute and `./`-prefixed relative paths, enforce repository boundaries, and cache git root lookups.
- Link parsing and sanitization ([src/linkPatterns.ts](gl:src/linkPatterns.ts), [src/linkSanitizer.ts](gl:src/linkSanitizer.ts)) trim trailing punctuation, skip inline/fenced code, parse `#L` fragments, and normalise reference definitions/usages.
- Fragment navigation ([src/extension.ts](gl:src/extension.ts)) reveals `#L123` and `#L10-L20` ranges when files are opened with fragments.

## Test Coverage
- [src/test/linkSanitizer.test.ts](gl:src/test/linkSanitizer.test.ts) covers punctuation/backtick/parenthesis trimming and ensures editor ranges align with sanitized text.
- [src/test/linkProvider.test.ts](gl:src/test/linkProvider.test.ts) verifies Markdown and plain text matches resolve to on-disk targets, enforces `./`-prefixed parent traversals, and respects cancellation.
- [src/test/markdownItPlugin.test.ts](gl:src/test/markdownItPlugin.test.ts) ensures Markdown preview rewrites align with document-relative expectations and that unresolved links stay untouched.
- [src/test/diagnostics.test.ts](gl:src/test/diagnostics.test.ts) validates diagnostic classification for the key rule set (leading slash, missing prefix, parent traversal, missing files, git root missing).
- [src/test/quickFixes.test.ts](gl:src/test/quickFixes.test.ts) verifies each quick fix command wiring, emitted arguments, and guardrails for non-`gl` diagnostics.
- [src/test/pathResolver.test.ts](gl:src/test/pathResolver.test.ts) exercises git-root discovery, absolute/relative resolution, repository boundary checks, and document-relative path computation.
- [src/test/linkPatterns.test.ts](gl:src/test/linkPatterns.test.ts) validates fragment parsing, generic `gl:` parsing, reference definition/usage wiring, and ignores inline code and fenced blocks.
- Test runner wired through `npm test` (Mocha + ts-node); see [package.json](gl:package.json#L24-L33) for the script wiring. No other automated suites yet.

## Known Gaps
- For the actionable task list, defer to [wip/phase1-markdown-implementation.md](gl:wip/phase1-markdown-implementation.md).

## Related Notes
- Development links live in [docs/dev/links.md](gl:docs/dev/links.md).
- Manual smoke scripts live in [docs/dev/md-smoke.md](gl:docs/dev/md-smoke.md).
- Work-in-progress planning continues under [wip/](gl:wip/).
