# gl: git-links specification

Version: 25.10.171
Status: draft

## 1. Overview

The `gl:` URI scheme provides a standardized way to reference files and line
numbers within git repositories. This specification defines:

1. The `gl:` URI scheme syntax and semantics
2. Integration with CommonMark and GitHub Flavored Markdown
3. Recognition in plain text and programming language comments

## 2. URI scheme syntax and semantics

### 2.1 Scheme

The scheme is `gl:` (lowercase, case-sensitive).

### 2.2 Syntax

```
gl-uri = "gl:" path ["#L" line-spec]
path = absolute-path / relative-path
absolute-path = file-path
relative-path = "./" *("../") relative-file-path
line-spec = line-number ["-L" line-number]
line-number = 1*DIGIT
```

Where:
- `*` = zero or more repetitions (ABNF notation)
- `1*` = one or more repetitions (ABNF notation)
- `file-path` and `relative-file-path` follow CommonMark's link destination rules (§6.6)
  - May contain any sequence of zero or more characters between `<` and `>` that contains no line endings or unescaped `<` or `>` characters
  - Or, may consist of a nonempty sequence of characters that does not start with `<`, does not include ASCII control characters or space character, and includes parentheses only if (a) they are backslash-escaped or (b) they are unescaped and balanced
- `DIGIT` = ASCII digit (U+0030-U+0039)

### 2.3 Path resolution

All paths are resolved relative to the directory containing the `.git` folder
(repository root).

**Absolute paths** start from repository root:
```
gl:readme.md
gl:docs/api/spec.md
gl:src/main.go
```

**Relative paths** start from the current file's directory:
```
gl:./sister.go           (same directory)
gl:./../uncle/cousin.py  (parent directory, then subdirectory)
gl:./../../other.md      (two levels up)
```

### 2.4 Line number fragments

Line numbers use the `#L` prefix followed by decimal digits. The `L` must be uppercase (case-sensitive).

**Single line:**
```
gl:file.go#L42
gl:./relative.md#L123
```

**Line range:**
```
gl:file.go#L123-L456
```

Line ranges follow GitHub's syntax pattern, using a dash (`-`) to separate the start and end lines, with both lines prefixed by uppercase `L`.

**Semantics:**
- Line numbers are 1-indexed
- The `L` prefix must be uppercase (case-sensitive)
- Missing line number means: maintain current line if file is already open,
  otherwise default to line 1
- Invalid line numbers (beyond file length) should navigate to last line or show
  an error
- Line ranges are reserved for future specification (see §8)

### 2.5 Special characters

When used in contexts that require escaping (Markdown link destinations,
programming language strings), special characters follow the escaping rules of
that context:

- Markdown: backslash escapes or `<...>` wrapping (see §3)
- Programming languages: string literal escaping rules
- Plain text: no escaping needed

### 2.6 Restrictions

- Cross-repository links are not supported
- The scheme requires a `.git` directory in parent path
- Empty paths are invalid: `gl:` alone is not valid
- Fragments other than `#L[1-9][0-9]*(-L[1-9][0-9]*)?` are reserved for future use

## 3. Mardown integration

Integration was designed for CommonMark v0.31.2 and GitHub Flavored Markdown 0.29-gfm and is expected to work well with future versions of these Markdown files.

### 3.1 Base specification

The `gl:` scheme works with all standard CommonMark link forms.

#### 3.1.1 Inline links

Standard Markdown link syntax:

```markdown
[docs](gl:docs/some-file.md)
```

Paths with special characters wrapped in `<...>`:

```markdown
[docs](<gl:docs/some file.md>)
[api](<gl:docs/file(v2).md>)
```

Backslash escapes in destinations:

```markdown
[docs](gl:docs\,v1.md)
```

#### 3.1.2 Autolinks

Wrapped in angle brackets:

```markdown
<gl:docs/file.md>
<gl:file.md#L42>
```

#### 3.1.3 Reference links

All three forms supported:

```markdown
[docs][ref]
[ref]: gl:docs/spec.md "Documentation"

[docs][]
[docs]: gl:file.md

[docs]
[docs]: gl:file.md
```

#### 3.1.4 Code exclusions

URIs inside inline code spans and fenced code blocks are not processed:

```markdown
Use `gl:file.md` to link.

\`\`\`
gl:example.md
\`\`\`
```

### 3.2 Extension specification (GFM-style)

The `gl:` extension follows the structure of the [GitHub Flavored Markdown autolinks extension](https://github.github.com/gfm/#autolinks-extension-) while tightening the scheme-specific rules defined in this document. For the purposes of §6.9 “Autolinks (extension)” in the GFM specification, `gl:` is treated as an allowed scheme in the same manner as `http:`, `https:`, or `mailto:`.

#### 3.2.1 GFM autolinks extension recap

These rules are copy/pasted from the GFM specification for reference.

##### Punctuation characters

An ASCII punctuation character is `!`, `"`, `#`, `$`, `%`, `&`, `'`, `(`, `)`, `*`, `+`, `,`, `-`, `.`, `/` (U+0021–2F), `:`, `;`, `<`, `=`, `>`, `?`, `@` (U+003A–0040), `[`, `\`, `]`, `^`, `_`, `` ` `` (U+005B–0060), `{`, `|`, `}`, or `~` (U+007B–007E).

A punctuation character is an ASCII punctuation character or anything in the general Unicode categories `Pc`, `Pd`, `Pe`, `Pf`, `Pi`, `Po`, or `Ps`.

##### Basic recognition

Autolinks can also be constructed without requiring the use of `<` and to `>` to delimit them, although they will be recognized under a smaller set of circumstances. All such recognized autolinks can only come at the beginning of a line, after whitespace, or any of the delimiting characters `*`, `_`, `~`, and `(`.

##### Trailing punctuation and balancing

Trailing punctuation (specifically, `?`, `!`, `.`, `,`, `:`, `*`, `_`, `~`, `'`, and `"`) will not be considered part of the autolink, though they may be included in the interior of the link.

The parser also strips a terminal `;` when it completes an apparent HTML entity (for example, `&amp;`), mirroring the GitHub Flavored Markdown autolink rules.

When an autolink ends in `)`, we scan the entire autolink for the total number of parentheses. If there is a greater number of closing parentheses than opening ones, we don’t consider the unmatched trailing parentheses part of the autolink, in order to facilitate including an autolink inside a parenthesis. This check is only done when the link ends in a closing parentheses `)`, so if the only parentheses are in the interior of the autolink, no special rules are applied.

If an autolink ends in a semicolon (`;`), we check to see if it appears to resemble an entity reference; if the preceding text is & followed by one or more alphanumeric characters. If so, it is excluded from the autolink.

`<` immediately ends an autolink.

#### 3.2.2 Extended gl autolink

An **extended gl autolink** is recognized when all of the following conditions hold:

1. The character sequence starts with the literal `gl:` (lowercase, case-sensitive).
2. The characters following `gl:` form either:
  - a *valid root git path*, meaning a path relative to the repository root (the parent directory of the `.git` folder); or
  - a *relative path*, starting with `./`, optionally followed by zero or more `../` segments, and then the remainder of the path resolved from the current document directory.
3. The path MAY include a fragment that satisfies the line number grammar in §2.4 (for example `#L42` or `#L12-L20`).
4. The sequence terminates before any disallowed trailing punctuation defined in §3.2.2.

Paths MUST conform to the CommonMark link destination character and balancing rules in §2.2. Implementations MUST reject sequences that fail any of the steps above.

#### 3.2.3 Examples

```markdown
see gl:docs/details.md#L42 for details
```
should produce a `gl:docs/details.md#L42` link.

## 4. Plain text and programming language comments

### 4.1 Recognition pattern

In plain text files and programming language comments, `gl:` URIs are recognized using the same rules as **extended gl autolinks** defined in §3.2.2 and §3.2.1.

The recognition pattern:
1. Must satisfy all conditions in §3.2.2 (extended gl autolink)
2. Applies trailing punctuation and balancing rules from §3.2.1 (GFM autolinks extension)
3. Works in any text context (not limited to Markdown)

### 4.2 Examples by language

**Go:**
```go
// See gl:docs/api.md for details.
// Link: gl:pkg/utils.go#L42
/* Block comment: gl:readme.md */
```

**Python:**
```python
# See gl:docs/api.md for details.
# Link: gl:src/utils.py#L42
print("Check gl:readme.md")  # also works in strings
```

**JavaScript:**
```javascript
// See gl:docs/api.md for details.
// Link: gl:src/utils.js#L42
/* Multi-line comment with gl:config/setup.md link */
```

### 4.3 Plain text files

In `.txt`, `.log`, or similar files:

```
See the documentation at gl:docs/readme.md for more info.
Error on line gl:src/main.go#L127 needs fixing.
Related: gl:docs/troubleshooting.md.
```

### 4.4 Implementation notes

- Recognition should work in single-line (`//`, `#`) and multi-line (`/* */`, `""" """`) comments
- String literals may also contain `gl:` links (tool-dependent)
- Language-specific comment syntax detection is outside this spec's scope

## 5. Security considerations

- Tools should validate that paths resolve within the repository
- Path traversal attempts (`../../outside-repo`) should be rejected or sandboxed
- Line numbers should be validated against file length
- Tools should handle malformed URIs gracefully

## 6. Notes

The two slashes after the scheme and leading slash for the repo root path (as in the case of `file:///path/to/file`) are omitted for brevity and readability, resulting in syntax like `gl:path/to/file` instead of `gl:///path/to/file`.

## References

- CommonMark Specification v0.31.2: <https://spec.commonmark.org/0.31.2/>
- GitHub Flavored Markdown Specification 0.29-gfm (2019-04-06): <https://github.github.com/gfm/>
- RFC 3986 (URI Generic Syntax): <https://tools.ietf.org/html/rfc3986>
