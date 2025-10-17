import * as path from 'path';
import * as vscode from 'vscode';
import { findAllGlLinks, LinkMatch } from './linkPatterns';
import { findGitRoot, isPathWithinRepository, resolveGlPath } from './pathResolver';
import { ResolutionContext, ResolvedPath } from './types';

export class GlHoverProvider implements vscode.HoverProvider {
	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (!document.uri || document.uri.scheme !== 'file') {
			return undefined;
		}

		// gl:README.md#L13-L13 describes the hover experience mirrored in this provider.
		const fullText = document.getText();
		if (!fullText.includes('gl:')) {
			return undefined;
		}

		const matches = findAllGlLinks(fullText);
		const hoverMatch = findMatchAtPosition(matches, position);
		if (!hoverMatch) {
			return undefined;
		}

		const documentPath = document.uri.fsPath;
		const gitRoot = findGitRoot(documentPath) ?? undefined;
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		const context: ResolutionContext = {
			documentPath,
			documentDirectory: path.dirname(documentPath),
			workspaceFolderPath: workspaceFolder?.uri.fsPath,
			gitRootHint: gitRoot
		};

		const resolved = resolveGlPath(hoverMatch.link.path, context);
		const lines = buildHoverLines(hoverMatch, context, resolved, gitRoot ?? undefined);

		const contents = new vscode.MarkdownString(lines.join('\n\n'));
		return new vscode.Hover(contents, hoverMatch.range);
	}
}

function buildHoverLines(match: LinkMatch, context: ResolutionContext, resolved: ResolvedPath | null, gitRoot: string | undefined): string[] {
	// gl:docs/dev/md-impl.md#L5-L14 explains the tooltip contract mirrored here.
	const lines: string[] = ['**Git Link**'];
	if (resolved && resolved.exists) {
		lines.push(formatResolvedLine(resolved, match));
		return lines;
	}

	if (resolved && !resolved.exists) {
		const expected = formatDisplayPath(resolved.relativePath || path.basename(resolved.absolutePath));
		lines.push('Status: Target missing.');
		lines.push(`Expected: \`${expected}\``);
		lines.push('Found: not on disk.');
		return lines;
	}

	const expected = formatExpectedPath(match, context, gitRoot);
	const unresolved = describeUnresolved(match.link.path, context, gitRoot);
	lines.push(`Status: ${unresolved.status}`);
	if (expected) {
		lines.push(`Expected: \`${expected}\``);
	}
	if (unresolved.found) {
		lines.push(`Found: ${unresolved.found}`);
	}
	return lines;
}

function formatResolvedLine(resolved: ResolvedPath, match: LinkMatch): string {
	const displayPath = formatDisplayPath(resolved.relativePath || path.basename(resolved.absolutePath));
	const fragment = match.link.fragment;
	if (!fragment) {
		return displayPath;
	}

	if (fragment.endLine && fragment.endLine !== fragment.startLine) {
		return `${displayPath} lines ${fragment.startLine}–${fragment.endLine}`;
	}

	return `${displayPath} line ${fragment.startLine}`;
}

function formatDisplayPath(candidate: string): string {
	return candidate.replace(/\\/g, '/');
}

function formatExpectedPath(match: LinkMatch, context: ResolutionContext, gitRoot: string | undefined): string {
	if (!gitRoot) {
		return match.link.path;
	}

	const candidate = computeCandidateAbsolute(match.link.path, context, gitRoot);
	if (!candidate) {
		return match.link.path;
	}

	const relative = path.relative(gitRoot, candidate);
	if (!relative || relative.startsWith('..')) {
		return match.link.path;
	}

	return formatDisplayPath(relative);
}

function computeCandidateAbsolute(linkPath: string, context: ResolutionContext, gitRoot: string | undefined): string | undefined {
	if (linkPath.startsWith('./')) {
		return path.resolve(context.documentDirectory, toFsPath(linkPath));
	}

	if (!gitRoot) {
		return undefined;
	}

	return path.join(gitRoot, toFsPath(linkPath));
}

function toFsPath(linkPath: string): string {
	return linkPath.replace(/\//g, path.sep);
}

function describeUnresolved(linkPath: string, context: ResolutionContext, gitRoot: string | undefined): { status: string; found?: string } {
	if (!gitRoot) {
		return { status: 'Cannot resolve link.', found: 'Repository root not detected.' };
	}

	const candidate = computeCandidateAbsolute(linkPath, context, gitRoot);
	if (!candidate) {
		return { status: 'Cannot resolve link.' };
	}

	const normalized = path.normalize(candidate);
	if (!isPathWithinRepository(normalized, gitRoot)) {
		const relative = formatDisplayPath(path.relative(gitRoot, normalized));
		return { status: 'Link resolves outside the repository.', found: `outside repository (\`${relative}\`)` };
	}

	return { status: 'Cannot resolve target.' };
}

function findMatchAtPosition(matches: LinkMatch[], position: vscode.Position): LinkMatch | undefined {
	for (const match of matches) {
		if (containsPosition(match.range, position)) {
			return match;
		}
	}

	return undefined;
}

function containsPosition(range: vscode.Range, position: vscode.Position): boolean {
	if (position.line < range.start.line || position.line > range.end.line) {
		return false;
	}

	if (position.line === range.start.line && position.character < range.start.character) {
		return false;
	}

	if (position.line === range.end.line && position.character >= range.end.character) {
		return false;
	}

	return true;
}
