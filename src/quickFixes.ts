import * as vscode from 'vscode';
import * as path from 'path';
import { GlDiagnosticCode, GlDiagnosticMetadata, refreshGlDiagnosticsForDocument } from './diagnostics';
import { refreshGlDocumentLinks } from './linkProvider';

const COMMAND_ID = 'glGitLinks.applyQuickFix';
const QUICK_FIX_SELECTOR: vscode.DocumentSelector = [{ scheme: 'file' }, { scheme: 'untitled' }];

export function registerGlQuickFixes(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_ID, applyQuickFix));

	const provider = new GlQuickFixProvider();
	context.subscriptions.push(vscode.languages.registerCodeActionsProvider(QUICK_FIX_SELECTOR, provider, {
		providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
	}));
}

async function applyQuickFix(args: QuickFixCommandArgs): Promise<void> {
	if (args.kind === 'edit') {
		const edit = new vscode.WorkspaceEdit();
		edit.replace(args.uri, args.range, args.newText);
		await vscode.workspace.applyEdit(edit);
		await refreshDocumentState(args.uri);
		return;
	}

	if (args.kind === 'createFile') {
		const targetUri = args.uri;
		const directory = path.dirname(targetUri.fsPath);
		await vscode.workspace.fs.createDirectory(vscode.Uri.file(directory));
		await vscode.workspace.fs.writeFile(targetUri, args.initialContent ?? new Uint8Array());
		try {
			await vscode.workspace.fs.stat(targetUri);
		} catch (error) {
			// ignore stat failures; diagnostic refresh will catch missing targets
		}
		await refreshDocumentState(args.source);
	}
}

type QuickFixCommandArgs =
	| { readonly kind: 'edit'; readonly uri: vscode.Uri; readonly range: vscode.Range; readonly newText: string }
	| { readonly kind: 'createFile'; readonly uri: vscode.Uri; readonly source: vscode.Uri; readonly initialContent?: Uint8Array };

async function refreshDocumentState(uri: vscode.Uri): Promise<void> {
	// Re-run diagnostics so the updated link becomes clickable again.
	refreshGlDiagnosticsForDocument(uri);
	refreshGlDocumentLinks(uri);
	try {
		await vscode.commands.executeCommand('vscode.executeDocumentLinkProvider', uri);
	} catch (error) {
		// ignore command failures in older hosts
	}

	const editor = vscode.window.visibleTextEditors.find(candidate => candidate.document.uri.toString() === uri.toString());
	if (editor) {
		await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: true });
	}
}

interface GlDiagnosticCarrier extends vscode.Diagnostic {
	glData?: GlDiagnosticMetadata;
}

export class GlQuickFixProvider implements vscode.CodeActionProvider {
	provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];
		// gl:docs/invalid-gl-links.md#L10-L101 documents the error/quick-fix pairing mirrored in this switch.
		// gl:docs/dev/gl-spec.md#L95-L104 records the underlying scheme restrictions these fixes address.
		// gl:README.md#L167-L187 lists the user-facing quick fixes exposed here.
		for (const diagnostic of context.diagnostics) {
			if (diagnostic.source !== 'gl') {
				continue;
			}

			switch (diagnostic.code) {
				case GlDiagnosticCode.LeadingSlash: {
					const text = document.getText(diagnostic.range);
					const cleaned = text.replace(/^gl:\/+/, 'gl:');
					const action = this.createEditAction('Remove leading slash', diagnostic, cleaned, diagnostic.range, document.uri);
					actions.push(action);
					break;
				}
				case GlDiagnosticCode.MissingDotPrefix: {
					const text = document.getText(diagnostic.range);
					if (!text.startsWith('gl:../')) {
						break;
					}
					const action = this.createEditAction('Add ./ prefix', diagnostic, text.replace('gl:../', 'gl:./../'), diagnostic.range, document.uri);
					actions.push(action);
					break;
				}
				case GlDiagnosticCode.DotsInMiddle: {
					const text = document.getText(diagnostic.range);
					const normalized = this.normalizeDots(text);
					if (normalized !== text) {
						const action = this.createEditAction('Normalize path segments', diagnostic, normalized, diagnostic.range, document.uri);
						actions.push(action);
					}
					break;
				}
				case GlDiagnosticCode.MissingFile: {
					const target = this.resolveTargetUri(document, diagnostic.range, diagnostic);
					if (!target) {
						break;
					}
					const action = new vscode.CodeAction('Create file on disk', vscode.CodeActionKind.QuickFix);
					action.command = {
						title: 'Create file',
						command: COMMAND_ID,
						arguments: [{ kind: 'createFile', uri: target, source: document.uri } satisfies QuickFixCommandArgs]
					};
					action.diagnostics = [diagnostic];
					action.isPreferred = true;
					actions.push(action);
					break;
				}
				default:
					break;
			}
		}

		return actions;
	}

	private createEditAction(title: string, diagnostic: vscode.Diagnostic, newText: string, range: vscode.Range, uri: vscode.Uri): vscode.CodeAction {
		const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
		action.command = {
			title: title,
			command: COMMAND_ID,
			arguments: [{ kind: 'edit', uri, range, newText } satisfies QuickFixCommandArgs]
		};
		action.diagnostics = [diagnostic];
		action.isPreferred = true;
		return action;
	}

	private normalizeDots(original: string): string {
		const prefixMatch = original.match(/^gl:/);
		if (!prefixMatch) {
			return original;
		}

		const pathPart = original.slice(prefixMatch[0].length);
		const normalized = path.posix.normalize(pathPart);
		const hasDotPrefix = pathPart.startsWith('./') && !normalized.startsWith('./');
		const finalPath = hasDotPrefix ? `./${normalized}` : normalized;
		return `gl:${finalPath}`;
	}

	private resolveTargetUri(document: vscode.TextDocument, range: vscode.Range, diagnostic: vscode.Diagnostic): vscode.Uri | undefined {
		const text = document.getText(range);
		const match = /^gl:([^#]+)(?:#.*)?$/.exec(text.trim());
		if (!match) {
			return undefined;
		}

		const targetPath = match[1];
		const data = (diagnostic as GlDiagnosticCarrier).glData;
		if (data?.absolutePath) {
			return vscode.Uri.file(data.absolutePath);
		}

		const gitRoot = data?.gitRoot;
		const documentDir = path.dirname(document.uri.fsPath);
		const absolute = targetPath.startsWith('./')
			? path.resolve(documentDir, targetPath)
			: gitRoot ? path.resolve(gitRoot, targetPath) : path.resolve(documentDir, targetPath);

		return vscode.Uri.file(absolute);
	}
}
