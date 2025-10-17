import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	findGitRoot,
	resolveAbsolutePath,
	resolveRelativePath,
	resolveGlPath,
	computeDocumentRelativePath,
	isPathWithinRepository
} from '../pathResolver';
import { ResolutionContext } from '../types';

describe('pathResolver', () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-links-'));
	const repoRoot = path.join(tempRoot, 'repo');
	const docsDir = path.join(repoRoot, 'docs');
	const nestedDir = path.join(repoRoot, 'src', 'components');
	const documentPath = path.join(docsDir, 'guide.md');
	const siblingPath = path.join(docsDir, 'readme.md');
	const ancestorPath = path.join(repoRoot, 'src', 'index.ts');

	before(() => {
		fs.mkdirSync(repoRoot, { recursive: true });
		fs.mkdirSync(path.join(repoRoot, '.git'));
		fs.mkdirSync(docsDir, { recursive: true });
		fs.mkdirSync(nestedDir, { recursive: true });
		fs.writeFileSync(documentPath, '# Guide');
		fs.writeFileSync(siblingPath, '# Readme');
		fs.writeFileSync(ancestorPath, '// entry');
	});

	after(() => {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	it('finds git root from file path', () => {
		const root = findGitRoot(documentPath);
		assert.strictEqual(root, repoRoot);
	});

	it('resolves absolute gl path within repository', () => {
		const absolute = resolveAbsolutePath('docs/readme.md', repoRoot);
		assert.strictEqual(absolute, siblingPath);
	});

	it('resolves relative gl path from document', () => {
		const relative = resolveRelativePath('./readme.md', documentPath, repoRoot);
		assert.strictEqual(relative, siblingPath);
	});

	it('prevents relative paths that escape repository', () => {
		const outside = resolveRelativePath('./../../../../etc/passwd', documentPath, repoRoot);
		assert.strictEqual(outside, null);
	});

	it('resolves gl link using context', () => {
		const context: ResolutionContext = {
			documentPath,
			documentDirectory: path.dirname(documentPath),
			gitRootHint: repoRoot
		};

		const resolved = resolveGlPath('docs/readme.md', context);
		assert.ok(resolved);
		assert.strictEqual(resolved?.absolutePath, siblingPath);
		assert.strictEqual(resolved?.exists, true);
	});

	it('rejects gl link outside repository', () => {
		const context: ResolutionContext = {
			documentPath,
			documentDirectory: path.dirname(documentPath),
			gitRootHint: repoRoot
		};

		const resolved = resolveGlPath('../secret.txt', context);
		assert.strictEqual(resolved, null);
	});

	it('computes document relative path', () => {
		const relative = computeDocumentRelativePath(documentPath, ancestorPath);
		assert.strictEqual(relative, '../src/index.ts');
	});

	it('returns basename when paths match', () => {
		const relative = computeDocumentRelativePath(documentPath, documentPath);
		assert.strictEqual(relative, 'guide.md');
	});

	it('detects paths within repository', () => {
		assert.strictEqual(isPathWithinRepository(ancestorPath, repoRoot), true);
		assert.strictEqual(isPathWithinRepository(path.join(tempRoot, 'elsewhere', 'file.txt'), repoRoot), false);
	});
});
