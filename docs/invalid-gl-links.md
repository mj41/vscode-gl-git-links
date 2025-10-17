# Invalid `gl:` Link Patterns (Diagnostics Reference)

The extension flags these syntax issues before they resolve to files. Invalid `gl:` links no longer produce clickable navigation or markdown rewrites, so fix the diagnostics before the link can be used. Each entry lists the diagnostic message you will see today along with the quick fix that can resolve it when available.

## Summary

### Common Problems

| Issue | Example | Fix |
|-------|---------|-----|
| Single slash | gl:/README.md | Use gl:README.md (no slash) |
| Double slash | gl://README.md | Use gl:README.md (no slash) |
| Triple slash | gl:///README.md | Use gl:README.md (no slash) |
| Invalid line format | gl:README.md#123 | Use gl:README.md#L123 format |

### Path Issues

| Issue | Example | Fix |
|-------|---------|-----|
| Missing ./ prefix | gl:../README.md | Use gl:./../README.md |
| Dots in middle | gl:docs/../README.md | Use gl:README.md |
| Cross-repo | gl:../gl-git-links/README.md | Not supported (error) |
| Missing file | gl:missing.md | Create file (quick fix) |
| Missing directories | gl:newdir/more/newfile.md | Create directories and file (quick fix) |

## Examples of Invalid gl Links

### Common Problems

#### Invalid: Single slash

gl:/single-slash.md

Error: "Use gl: (no slash) instead of gl:/ (single slash)."

Quick fix: gl:README.md

#### Invalid: Double slash

gl://README.md

Error: "Use gl: (no slash) instead of gl:// (double slash)."

Quick fix: gl:README.md

#### Invalid: Triple slash

gl:///README.md

Error: "Use gl: (no slash) instead of gl:/// (triple slash)."

Quick fix: gl:README.md

#### Invalid: Line number format

gl:README.md#123

Error: "Use gl:README.md#L123 (#L) instead of simple (#) for line number reference."

Quick fix: gl:README.md#L123

### Path Issues

#### Invalid: Missing ./ prefix

gl:../README.md

Error: "Relative navigation requires ./ prefix. Use gl:./../README.md instead."

Quick fix: gl:./../README.md

#### Invalid: Two dots in the middle

gl:docs/../README.md in README.md file

Error: "Use gl:README.md instead of gl:docs/../README.md."

Quick fix: gl:README.md

#### Invalid: Cross-repo links

gl:./../../gl-git-links/readme.md

Error: "Cross-repo gl: links are not supported."

#### Invalid: Missing file

gl:docs/missing.md

Error: "gl: target file 'docs/missing.md' does not exist."

Quick fix: Create file (creates empty docs/missing.md file)

#### Invalid: Missing directories

gl:newdir/more/newfile.md

Error: "gl: target file 'newdir/more/newfile.md' does not exist."

Quick fix: Create directories and file (creates newdir/more/newfile.md with missing directories)

