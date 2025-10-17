import * as fs from 'fs';
import * as path from 'path';
import { ResolutionContext, ResolvedPath } from './types';

const gitRootCache = new Map<string, string | null>();

function canonicalizePath(fsPath: string): string {
	try {
		return fs.realpathSync(fsPath);
	} catch (error) {
		return path.resolve(fsPath);
	}
}

function toNativePath(linkPath: string): string {
	return linkPath.replace(/\//g, path.sep);
}

function isGitDirectory(candidate: string): boolean {
	if (!fs.existsSync(candidate)) {
		return false;
	}

	try {
		const stat = fs.statSync(candidate);
		return stat.isDirectory() || stat.isFile();
	} catch (error) {
		return false;
	}
}

export function getCachedGitRoot(dir: string): string | null {
	const key = canonicalizePath(dir);
	return gitRootCache.get(key) ?? null;
}

function updateCache(visited: string[], root: string | null): void {
	for (const entry of visited) {
		gitRootCache.set(entry, root);
	}
}

export function clearGitRootCache(): void {
	gitRootCache.clear();
}

export function findGitRoot(startPath: string): string | null {
	let current = startPath;

	try {
		const stat = fs.statSync(startPath);
		if (!stat.isDirectory()) {
			current = path.dirname(startPath);
		}
	} catch (error) {
		current = path.dirname(startPath);
	}

	let dir = canonicalizePath(current);
	const visited: string[] = [];

	while (true) {
		visited.push(dir);
		const cached = gitRootCache.get(dir);
		if (cached !== undefined) {
			updateCache(visited, cached);
			return cached;
		}

		const gitCandidate = path.join(dir, '.git');
		if (isGitDirectory(gitCandidate)) {
			gitRootCache.set(dir, dir);
			updateCache(visited, dir);
			return dir;
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			updateCache(visited, null);
			return null;
		}

		dir = canonicalizePath(parent);
	}
}

function normalizeAbsolutePath(fsPathValue: string): string {
	try {
		return fs.realpathSync(fsPathValue);
	} catch (error) {
		return path.normalize(fsPathValue);
	}
}

export function resolveAbsolutePath(linkPath: string, gitRoot: string): string {
	const relative = toNativePath(linkPath);
	return path.normalize(path.join(gitRoot, relative));
}

export function resolveRelativePath(linkPath: string, documentPath: string, gitRoot: string): string | null {
	if (!linkPath.startsWith('./')) {
		return null;
	}

	const nativeLinkPath = toNativePath(linkPath);
	const baseDirectory = path.dirname(documentPath);
	const resolved = path.resolve(baseDirectory, nativeLinkPath);
	if (!isPathWithinRepository(resolved, gitRoot)) {
		return null;
	}

	return path.normalize(resolved);
}

// gl:docs/dev/gl-spec.md#L40-L96 describes the repository-relative resolution we enforce here.
// gl:README.md#L115-L133 explains the user-visible expectations for path resolution this function satisfies.
export function resolveGlPath(linkPath: string, context: ResolutionContext): ResolvedPath | null {
	const documentPath = context.documentPath;
	const gitRoot = context.gitRootHint ?? findGitRoot(documentPath);
	if (!gitRoot) {
		return null;
	}

	let candidate: string | null = null;
	if (linkPath.startsWith('./')) {
		candidate = resolveRelativePath(linkPath, documentPath, gitRoot);
	} else {
		candidate = resolveAbsolutePath(linkPath, gitRoot);
	}

	if (!candidate) {
		return null;
	}

	const normalizedCandidate = normalizeAbsolutePath(candidate);
	if (!isPathWithinRepository(normalizedCandidate, gitRoot)) {
		return null;
	}

	const exists = fs.existsSync(normalizedCandidate);
	const relativePath = path.relative(gitRoot, normalizedCandidate) || path.basename(normalizedCandidate);

	return {
		absolutePath: normalizedCandidate,
		relativePath,
		gitRoot,
		exists
	};
}

export function computeDocumentRelativePath(fromFile: string, toFile: string): string {
	const fromDirectory = path.dirname(fromFile);
	let relative = path.relative(fromDirectory, toFile);
	if (!relative) {
		relative = path.basename(toFile);
	}
	return relative.split(path.sep).join('/');
}

export function isPathWithinRepository(resolvedPath: string, gitRoot: string): boolean {
	const relative = path.relative(gitRoot, resolvedPath);
	if (!relative) {
		return true;
	}

	return !relative.startsWith('..') && !path.isAbsolute(relative);
}
