import * as path from 'path';
import { parseGlLink } from './linkPatterns';
import { computeDocumentRelativePath, findGitRoot, resolveGlPath } from './pathResolver';
import { ResolutionContext } from './types';

export function createGlMarkdownItPlugin() {
	// gl:README.md#L14-L15 explains the Markdown preview rewrites and extended autolink support implemented here.
	return (md: any) => {
		md.core.ruler.after('linkify', 'gl-git-links', (state: any) => {
			const env = state.env ?? {};
			for (let index = 0; index < state.tokens.length; index++) {
				const token = state.tokens[index];
				if (!token || token.type !== 'link_open') {
					continue;
				}

				const hrefIndex = token.attrIndex('href');
				if (hrefIndex < 0) {
					continue;
				}

				const href = token.attrs[hrefIndex][1];
				if (typeof href !== 'string' || !href.startsWith('gl:')) {
					continue;
				}

				const rewrite = rewriteGlLink(href, env);
				if (!rewrite) {
					continue;
				}

				const finalHref = rewrite.fragment ? `${rewrite.href}#${rewrite.fragment}` : rewrite.href;
				addAttribute(token, 'href', finalHref);
				addAttribute(token, 'data-gl-original-href', href);
			}
		});
	};
}

interface RewriteResult {
	readonly href: string;
	readonly fragment?: string;
}

function rewriteGlLink(href: string, env: any): RewriteResult | null {
	const documentPath: string | undefined = typeof env.path === 'string' ? env.path : undefined;
	if (!documentPath) {
		return null;
	}

	const glLink = parseGlLink(href);
	if (!glLink) {
		return null;
	}

	const cachedGitRoot: string | undefined = env.__glGitRoot;
	const gitRoot = cachedGitRoot ?? findGitRoot(documentPath);
	env.__glGitRoot = gitRoot;
	if (!gitRoot) {
		return null;
	}

	const context: ResolutionContext = {
		documentPath,
		documentDirectory: path.dirname(documentPath),
		workspaceFolderPath: undefined,
		gitRootHint: gitRoot
	};

	const resolved = resolveGlPath(glLink.path, context);
	if (!resolved || !resolved.exists) {
		return null;
	}

	const relativePath = computeDocumentRelativePath(documentPath, resolved.absolutePath);
	const encodedPath = encodeURI(relativePath);
	const fragment = glLink.fragment ? (glLink.fragment.raw.startsWith('#') ? glLink.fragment.raw.slice(1) : glLink.fragment.raw) : undefined;

	return {
		href: encodedPath,
		fragment
	};
}

function addAttribute(token: any, name: string, value: string): void {
	const index = token.attrIndex(name);
	if (index >= 0) {
		token.attrs[index][1] = value;
		return;
	}

	token.attrs = token.attrs ?? [];
	token.attrs.push([name, value]);
}
