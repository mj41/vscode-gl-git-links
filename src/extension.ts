import * as vscode from 'vscode';
import { registerGlDiagnostics } from './diagnostics';
import { GlHoverProvider } from './hoverProvider';
import { GlLinkProvider, glLinkProviderChangeEmitter } from './linkProvider';
import { createGlMarkdownItPlugin } from './markdownItPlugin';
import { registerGlQuickFixes } from './quickFixes';
import { activateScrollSync } from './scrollSync';

export function activate(context: vscode.ExtensionContext) {
	console.log('gl-git-links extension activating');

	const selector: vscode.DocumentSelector = [
		{ scheme: 'file' },
		{ scheme: 'untitled' }
	];

	// gl:README.md#L17-L23 documents the activation workflow users follow in Quick Start.
	const linkProvider = new GlLinkProvider();
	const linkRegistration = vscode.languages.registerDocumentLinkProvider(selector, linkProvider);
	context.subscriptions.push(linkRegistration);
 	context.subscriptions.push(glLinkProviderChangeEmitter);

	const hoverProvider = new GlHoverProvider();
	const hoverRegistration = vscode.languages.registerHoverProvider(selector, hoverProvider);
	context.subscriptions.push(hoverRegistration);

	registerGlDiagnostics(context);
	registerGlQuickFixes(context);
    activateScrollSync(context);

	// gl:docs/dev/md-smoke.md#L1-L32 lists the manual validation flow that exercises the activation wiring below.
	setupFragmentNavigation(context);

	return {
		extendMarkdownIt(md: any) {
			return md.use(createGlMarkdownItPlugin());
		}
	};
}

function setupFragmentNavigation(context: vscode.ExtensionContext): void {
	const processed = new Set<string>();

	const revealFragment = (editor: vscode.TextEditor | undefined) => {
		if (!editor) {
			return;
		}

		const uri = editor.document.uri;
		const fragment = uri.fragment;
		if (!fragment || processed.has(uri.toString())) {
			return;
		}

		const match = fragment.match(/^L(\d+)(?:-L(\d+))?$/);
		if (!match) {
			processed.add(uri.toString());
			return;
		}

		const startLine = Math.max(0, Number(match[1]) - 1);
		const endLineCandidate = match[2] ? Number(match[2]) - 1 : startLine;
		const documentEndLine = editor.document.lineCount - 1;
		const endLine = Math.min(Math.max(startLine, endLineCandidate), documentEndLine);

		const startPosition = new vscode.Position(startLine, 0);
		const endPosition = new vscode.Position(endLine, editor.document.lineAt(endLine).range.end.character);
		const range = new vscode.Range(startPosition, endPosition);

		editor.selection = new vscode.Selection(startPosition, startPosition);
		editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		processed.add(uri.toString());
	};

	revealFragment(vscode.window.activeTextEditor);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => revealFragment(editor))
	);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
			const editor = vscode.window.visibleTextEditors.find((candidate: vscode.TextEditor) => candidate.document === document);
			revealFragment(editor);
		})
	);
}

export function deactivate() {
	console.log('gl-git-links extension deactivating');
}
