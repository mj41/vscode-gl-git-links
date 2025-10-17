# Markdown Smoke Scripts

These repeatable scripts cover high-value editor and Markdown preview scenarios for the `gl:` link experience. Run them after sizeable changes or before release milestones.
They exercise the navigation stack in [src/linkProvider.ts](gl:src/linkProvider.ts) and the preview rewriter in [src/markdownItPlugin.ts](gl:src/markdownItPlugin.ts).

## Prerequisites
- Workspace opened at the repository root (contains the `.git` folder).
- Extension compiled (`npm run compile`) or launched under the VS Code extension host (F5).
- Markdown sample files available from this repo (no extra fixtures required).

## Editor Smoke
1. Open [examples/dirA/fileA1.md](gl:examples/dirA/fileA1.md) in the text editor.
2. Hover the inline link `gl:dad/sister.go#L7`; verify the tooltip begins with **Git Link** and the next line lists the repository-relative path with the line number (for example, `dad/sister.go line 7`) before the standard Open action.
3. Cmd/Ctrl+Click the inline link from step 2; confirm the editor opens [examples/dirA/fileA2.txt](gl:examples/dirA/fileA2.txt) at line 7 equivalent (falls back if file shorter) and the caret is placed accordingly.
4. With [examples/dirA/fileA1.md](gl:examples/dirA/fileA1.md) still active, hover the extended autolink `gl:./../dirB/dirBC/fileCBy.txt#L22` and ensure the tooltip lists the repository-relative target with the requested line (for example, `examples/dirB/dirBC/fileCBy.txt line 22`) while retaining the **Git Link** heading.
5. Cmd/Ctrl+Click the autolink from step 4; verify the target opens and the selection begins at the requested line number for [examples/dirB/dirBC/fileCBy.txt](gl:examples/dirB/dirBC/fileCBy.txt).
6. Insert a line such as `gl:../bad/path.md` (missing the required `./` prefix) near the bottom of the file; confirm an error diagnostic appears with the message "Relative navigation requires ./ prefix. Use gl:./../bad/path.md instead." and that Cmd/Ctrl+Click does not navigate. Hover the link to see the error tooltip list the expected path and that the found location is outside the repository.
7. Invoke the quick fix (Ctrl+. / Cmd+.) on the diagnostic from step 6; verify the link rewrites to `gl:./../bad/path.md` and the diagnostic clears.
8. Undo the test edit from step 7.

## Markdown Preview Smoke
1. Re-open [examples/dirA/fileA1.md](gl:examples/dirA/fileA1.md) and toggle the Markdown preview (Cmd/Ctrl+K, V or the toolbar button).
2. In the preview, click the rendered link for `gl:dad/sister.go#L7`; ensure a new editor tab opens at the expected target and fragment selection.
3. Click the preview link for `gl:./../dirB/dirBC/fileCBy.txt#L22`; confirm navigation succeeds to [examples/dirB/dirBC/fileCBy.txt](gl:examples/dirB/dirBC/fileCBy.txt) and the `./`-prefixed parent traversal works the same way as the editor link.
4. Locate the `gl:./../../readme.md` link in the preview; check that the status bar shows a file URL with the segment `../../readme.md`, indicating the plugin emitted a document-relative href.
5. In the source editor, temporarily change the link from step 4 to `gl:../readme.md` (missing `./`), switch back to the preview, and verify the link now renders as literal text (no href rewrite) signalling the plugin refused the invalid traversal. Revert the change afterward.
6. Add `gl:docs/brand-new.md` to the source, trigger the "Create file on disk" quick fix, and confirm the file appears on disk and the preview link becomes active. Remove the file and revert the link when finished.
7. Close the preview and confirm no dirty editors remain.

## Wrap-Up
- Restore any edits created during the smoke check (discard or undo).
- Record pass/fail results alongside the commit under validation.
