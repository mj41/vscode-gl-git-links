import * as path from 'path';
import * as vscode from 'vscode';
import { findAllGlLinks, LinkMatch } from './linkPatterns';
import { findGitRoot, resolveGlPath } from './pathResolver';
import { ResolutionContext, ResolvedPath } from './types';

const DIAGNOSTIC_COLLECTION = 'gl-git-links';
const DIAGNOSTIC_SOURCE = 'gl';

export const enum GlDiagnosticCode {
	LeadingSlash = 'gl-leading-slash',
	MissingDotPrefix = 'gl-missing-dot-prefix',
	DotsInMiddle = 'gl-dots-in-middle',
	MissingGitRoot = 'gl-missing-git-root',
	OutsideRepository = 'gl-outside-repo',
	MissingFile = 'gl-missing-file'
}

export type LinkIssueSeverity = 'error' | 'warning';

export interface LinkIssue {
	readonly message: string;
	readonly severity: LinkIssueSeverity;
	readonly code: GlDiagnosticCode;
	readonly resolvedPath?: ResolvedPath;
}

export interface GlDiagnosticMetadata {
	readonly absolutePath?: string;
	readonly gitRoot?: string;
}

interface GlDiagnosticCarrier extends vscode.Diagnostic {
	glData?: GlDiagnosticMetadata;
}

let refreshListener: ((uri: vscode.Uri) => void) | undefined;

export function refreshGlDiagnosticsForDocument(uri: vscode.Uri): void {
	refreshListener?.(uri);
}

export function analyzeLink(match: LinkMatch, context: ResolutionContext, gitRoot: string | undefined): LinkIssue | null {
	// gl:docs/invalid-gl-links.md#L10-L101 enumerates the scenarios mapped below.
	// gl:docs/dev/gl-spec.md#L95-L104 codifies the scheme restrictions enforced in these diagnostics.
	// gl:README.md#L151-L165 summarises the real-time validation behaviour these diagnostics surface.
	const linkPath = match.link.path;
	let leadingSlashCount = 0;
	while (leadingSlashCount < linkPath.length && linkPath.charAt(leadingSlashCount) === '/') {
		leadingSlashCount++;
	}
	if (leadingSlashCount > 0) {
		const withoutSlashes = linkPath.slice(leadingSlashCount);
		const suggestion = withoutSlashes.length ? `gl:${withoutSlashes}` : 'gl:<path>';
		return {
			message: `Remove leading slash: use ${suggestion}.`,
			severity: 'error',
			code: GlDiagnosticCode.LeadingSlash
		};
	}

	if (linkPath.startsWith('../')) {
		return {
			message: `Relative navigation requires ./ prefix. Use gl:./${linkPath} instead.`,
			severity: 'error',
			code: GlDiagnosticCode.MissingDotPrefix
		};
	}

	if (/(^|[^.])\/\.\.\//.test(linkPath)) {
		const normalized = path.posix.normalize(linkPath);
		return {
			message: `Remove '..' segments from the middle of the path (e.g. gl:${linkPath} -> gl:${normalized}).`,
			severity: 'error',
			code: GlDiagnosticCode.DotsInMiddle
		};
	}

	if (!gitRoot) {
		return {
			message: 'Unable to locate repository root for gl: links.',
			severity: 'warning',
			code: GlDiagnosticCode.MissingGitRoot
		};
	}

	const resolved = resolveGlPath(linkPath, context);
	if (!resolved) {
		if (linkPath.startsWith('./../')) {
			return {
				message: 'Cross-repository gl: links are not supported.',
				severity: 'error',
				code: GlDiagnosticCode.OutsideRepository
			};
		}

		return {
			message: 'Target cannot be resolved within the current repository.',
			severity: 'error',
			code: GlDiagnosticCode.OutsideRepository
		};
	}

	if (!resolved.exists) {
		const displayPath = resolved.relativePath || linkPath;
		return {
			message: `gl: target file '${displayPath}' does not exist.`,
			severity: 'warning',
			code: GlDiagnosticCode.MissingFile,
			resolvedPath: resolved
		};
	}

	return null;
}

export function registerGlDiagnostics(context: vscode.ExtensionContext): void {
	const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION);
	context.subscriptions.push(collection);

	const refresh = (document: vscode.TextDocument) => {
		if (document.uri.scheme !== 'file') {
			collection.delete(document.uri);
			return;
		}

		const text = document.getText();
		if (!text.includes('gl:')) {
			collection.delete(document.uri);
			return;
		}

		const documentPath = document.uri.fsPath;
		const gitRoot = findGitRoot(documentPath) ?? undefined;
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		const resolutionContext: ResolutionContext = {
			documentPath,
			documentDirectory: path.dirname(documentPath),
			workspaceFolderPath: workspaceFolder?.uri.fsPath,
			gitRootHint: gitRoot
		};

		const matches = findAllGlLinks(text);
		const diagnostics: vscode.Diagnostic[] = [];
		for (const match of matches) {
			const issue = analyzeLink(match, resolutionContext, gitRoot);
			if (!issue) {
				continue;
			}

			const severity = issue.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
			const diagnostic = new vscode.Diagnostic(match.range, issue.message, severity);
			diagnostic.code = issue.code;
			diagnostic.source = DIAGNOSTIC_SOURCE;
			const carrier = diagnostic as GlDiagnosticCarrier;
			carrier.glData = {
				absolutePath: issue.resolvedPath?.absolutePath,
				gitRoot
			};
			diagnostics.push(diagnostic);
		}

		collection.set(document.uri, diagnostics);
	};

	const localListener = (uri: vscode.Uri) => {
		const existing = vscode.workspace.textDocuments.find(candidate => candidate.uri.toString() === uri.toString());
		if (existing) {
			refresh(existing);
			return;
		}

		vscode.workspace.openTextDocument(uri).then(document => {
			refresh(document);
		}, () => {
			// ignore if document cannot be opened
		});
	};

	refreshListener = localListener;
	context.subscriptions.push({
		dispose: () => {
			if (refreshListener === localListener) {
				refreshListener = undefined;
			}
		}
	});

	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => refresh(document)));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => refresh(event.document)));
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => collection.delete(document.uri)));

	for (const document of vscode.workspace.textDocuments) {
		refresh(document);
	}
}
