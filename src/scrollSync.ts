import * as vscode from 'vscode';

export function activateScrollSync(context: vscode.ExtensionContext) {
    // This is a workaround for the issue where the markdown preview doesn't scroll to the cursor position
    // when clicking back in the editor.
    // See: https://github.com/microsoft/vscode/issues/146334

    let lastActiveLine = -1;

    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(e => {
        if (e.textEditor.document.languageId === 'markdown') {
            const currentLine = e.selections[0].active.line;
            if (currentLine !== lastActiveLine) {
                lastActiveLine = currentLine;
                // Trigger a sync if possible.
                // Since we don't have access to the internal preview object, we can't call scrollTo().
                // However, we can try to ensure the editor is revealed, which might trigger the preview sync
                // if the preview is listening to scroll events.
                e.textEditor.revealRange(e.selections[0], vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            }
        }
    }));
}
