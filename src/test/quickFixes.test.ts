import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { GlDiagnosticCode } from '../diagnostics';
import { GlQuickFixProvider } from '../quickFixes';

function createDocument(lines: string[], filePath: string): vscode.TextDocument {
	const text = lines.join('\n');
	return {
		uri: vscode.Uri.file(filePath),
		getText: (range?: vscode.Range) => {
			if (!range) {
				return text;
			}

			const startOffset = computeOffset(lines, range.start);
			const endOffset = computeOffset(lines, range.end);
			return text.slice(startOffset, endOffset);
		}
	} as unknown as vscode.TextDocument;
}

function computeOffset(lines: string[], position: vscode.Position): number {
	let offset = 0;
	for (let line = 0; line < position.line; line++) {
		offset += lines[line].length + 1; // +1 for newline
	}
	return offset + position.character;
}

describe('GlQuickFixProvider', () => {
	const provider = new GlQuickFixProvider();
	const filePath = path.join('/repo', 'docs', 'index.md');

	function createDiagnostic(range: vscode.Range, code: GlDiagnosticCode): vscode.Diagnostic {
		const diagnostic = new vscode.Diagnostic(range, 'message');
		diagnostic.code = code;
		diagnostic.source = 'gl';
		return diagnostic;
	}

	it('creates edit command to remove leading slash', () => {
		const lines = ['gl:/docs/readme.md'];
		const document = createDocument(lines, filePath);
		const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, lines[0].length));
		const diagnostic = createDiagnostic(range, GlDiagnosticCode.LeadingSlash);
		const context: vscode.CodeActionContext = {
			diagnostics: [diagnostic],
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
			only: undefined
		};

		const actions = provider.provideCodeActions(document, range, context);
		assert.strictEqual(actions.length, 1);

		const action = actions[0];
		assert.strictEqual(action.title, 'Remove leading slash');
		assert.ok(action.isPreferred);
		assert.ok(action.command);
		const args = action.command?.arguments?.[0] as { newText: string; uri: vscode.Uri };
		assert.strictEqual(args.newText, 'gl:docs/readme.md');
		assert.strictEqual(args.uri.fsPath, filePath);
	});

	it('adds ./ prefix for parent traversal', () => {
		const lines = ['gl:../docs/readme.md'];
		const document = createDocument(lines, filePath);
		const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, lines[0].length));
		const diagnostic = createDiagnostic(range, GlDiagnosticCode.MissingDotPrefix);
		const context: vscode.CodeActionContext = {
			diagnostics: [diagnostic],
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
			only: undefined
		};

		const actions = provider.provideCodeActions(document, range, context);
		assert.strictEqual(actions.length, 1);
		const args = actions[0].command?.arguments?.[0] as { newText: string; uri: vscode.Uri };
		assert.strictEqual(args.newText, 'gl:./../docs/readme.md');
		assert.strictEqual(args.uri.fsPath, filePath);
	});

	it('normalizes dot segments in the middle of the path', () => {
		const lines = ['gl:docs/../README.md'];
		const document = createDocument(lines, filePath);
		const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, lines[0].length));
		const diagnostic = createDiagnostic(range, GlDiagnosticCode.DotsInMiddle);
		const context: vscode.CodeActionContext = {
			diagnostics: [diagnostic],
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
			only: undefined
		};

		const actions = provider.provideCodeActions(document, range, context);
		assert.strictEqual(actions.length, 1);
		const args = actions[0].command?.arguments?.[0] as { newText: string; uri: vscode.Uri };
		assert.strictEqual(args.newText, 'gl:README.md');
		assert.strictEqual(args.uri.fsPath, filePath);
	});

	it('creates file quick fix using diagnostic metadata', () => {
		const lines = ['gl:docs/missing.md'];
		const document = createDocument(lines, filePath);
		const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, lines[0].length));
		const diagnostic = createDiagnostic(range, GlDiagnosticCode.MissingFile);
		const targetPath = path.join('/repo', 'docs', 'missing.md');
		(diagnostic as unknown as { glData?: { absolutePath?: string } }).glData = { absolutePath: targetPath };
		const context: vscode.CodeActionContext = {
			diagnostics: [diagnostic],
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
			only: undefined
		};

		const actions = provider.provideCodeActions(document, range, context);
		assert.strictEqual(actions.length, 1);
		const commandArg = actions[0].command?.arguments?.[0] as { kind: string; uri: vscode.Uri; source: vscode.Uri };
		assert.strictEqual(commandArg.kind, 'createFile');
		assert.strictEqual(commandArg.uri.fsPath, targetPath);
		assert.strictEqual(commandArg.source.fsPath, filePath);
	});

	it('ignores diagnostics from other sources', () => {
		const lines = ['gl:/docs/readme.md'];
		const document = createDocument(lines, filePath);
		const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, lines[0].length));
		const diagnostic = new vscode.Diagnostic(range, 'other');
		diagnostic.code = GlDiagnosticCode.LeadingSlash;
		diagnostic.source = 'markdown';
		const context: vscode.CodeActionContext = {
			diagnostics: [diagnostic],
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
			only: undefined
		};

		const actions = provider.provideCodeActions(document, range, context);
		assert.deepStrictEqual(actions, []);
	});
});
