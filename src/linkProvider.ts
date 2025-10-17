import * as path from 'path';
import * as vscode from 'vscode';
import { analyzeLink } from './diagnostics';
import { findAllGlLinks, LinkMatch } from './linkPatterns';
import { findGitRoot, resolveGlPath } from './pathResolver';
import { LineFragment, ResolutionContext } from './types';

export const glLinkProviderChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

export function refreshGlDocumentLinks(uri: vscode.Uri): void {
	glLinkProviderChangeEmitter.fire(uri);
}

export class GlLinkProvider implements vscode.DocumentLinkProvider {
	// gl:README.md#L7-L15 highlights clickable link behaviour surfaced by this provider.
	readonly onDidChange?: vscode.Event<vscode.Uri> = glLinkProviderChangeEmitter.event;
	async provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentLink[]> {
		if (token.isCancellationRequested) {
			return [];
		}

		const text = document.getText();
		if (!text.includes('gl:')) {
			return [];
		}

		const documentPath = document.uri.fsPath;
		const gitRoot = findGitRoot(documentPath);
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		const context: ResolutionContext = {
			documentPath,
			documentDirectory: path.dirname(documentPath),
			workspaceFolderPath: workspaceFolder?.uri.fsPath,
			gitRootHint: gitRoot ?? undefined
		};

		const matches = findAllGlLinks(text);
		const links: vscode.DocumentLink[] = [];

		for (const match of matches) {
			if (token.isCancellationRequested) {
				return links;
			}

 			const issue = analyzeLink(match, context, gitRoot ?? undefined);
 			if (issue) {
 				continue;
 			}

			const resolved = resolveGlPath(match.link.path, context);
			if (!resolved || !resolved.exists) {
				continue;
			}

			const target = createFileUri(resolved.absolutePath, match.link.fragment);
			const documentLink = new vscode.DocumentLink(match.range, target);
			documentLink.tooltip = match.link.fragment ? `Open ${match.link.path}${match.link.fragment.raw}` : `Open ${match.link.path}`;
			links.push(documentLink);
		}

		return links;
	}
}

function createFileUri(filePath: string, fragment: LineFragment | undefined): vscode.Uri {
	const uri = vscode.Uri.file(filePath);
	if (!fragment) {
		return uri;
	}

	const fragmentValue = fragment.raw.startsWith('#') ? fragment.raw.slice(1) : fragment.raw;
	return uri.with({ fragment: fragmentValue });
}
