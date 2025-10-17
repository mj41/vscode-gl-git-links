import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeLink, GlDiagnosticCode } from '../diagnostics';
import { findAllGlLinks } from '../linkPatterns';
import { clearGitRootCache } from '../pathResolver';
import { ResolutionContext } from '../types';

describe('diagnostics', () => {
	let tempRoot: string;
	let repoRoot: string;
	let docsDir: string;
	let documentPath: string;

	beforeEach(() => {
		clearGitRootCache();
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-diagnostics-'));
		repoRoot = path.join(tempRoot, 'repo');
		docsDir = path.join(repoRoot, 'docs');
		fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
		fs.mkdirSync(docsDir, { recursive: true });

		documentPath = path.join(docsDir, 'readme.md');
		fs.writeFileSync(documentPath, 'content');
	});

	afterEach(() => {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	function getContext(customDocumentPath: string = documentPath): ResolutionContext {
		return {
			documentPath: customDocumentPath,
			documentDirectory: path.dirname(customDocumentPath),
			workspaceFolderPath: repoRoot,
			gitRootHint: repoRoot
		};
	}

	function evaluateSample(sample: string, index = 0, context = getContext()) {
		const matches = findAllGlLinks(sample);
		assert.ok(matches.length > index, 'Expected at least one gl: link');
		return analyzeLink(matches[index], context, context.gitRootHint);
	}

	it('flags leading slash', () => {
		const issue = evaluateSample('gl:/README.md');
		assert.ok(issue);
		assert.strictEqual(issue?.code, GlDiagnosticCode.LeadingSlash);
		assert.ok(issue?.message.includes('Remove leading slash'));
	});

	it('flags missing ./ prefix', () => {
		const issue = evaluateSample('gl:../docs/readme.md');
		assert.ok(issue);
		assert.strictEqual(issue?.code, GlDiagnosticCode.MissingDotPrefix);
	});

	it('flags dots in the middle of the path', () => {
		const issue = evaluateSample('gl:docs/../README.md');
		assert.ok(issue);
		assert.strictEqual(issue?.code, GlDiagnosticCode.DotsInMiddle);
	});

	it('flags cross-repo traversal', () => {
		const rootDocumentPath = path.join(repoRoot, 'README.md');
		fs.writeFileSync(rootDocumentPath, 'root readme');
		const context = getContext(rootDocumentPath);
		const issue = evaluateSample('gl:./../other-repo/README.md', 0, context);
		assert.ok(issue);
		assert.strictEqual(issue?.code, GlDiagnosticCode.OutsideRepository);
		assert.ok(issue?.message.includes('Cross-repository'));
	});

	it('warns when file is missing', () => {
		const issue = evaluateSample('gl:docs/missing.md');
		assert.ok(issue);
		assert.strictEqual(issue?.code, GlDiagnosticCode.MissingFile);
		assert.strictEqual(issue?.severity, 'warning');
	});

	it('returns null for resolvable paths', () => {
		const existingPath = path.join(docsDir, 'guide.md');
		fs.writeFileSync(existingPath, 'guide');
		const issue = evaluateSample('gl:docs/guide.md');
		assert.strictEqual(issue, null);
	});

	it('warns when git root cannot be found', () => {
		const matches = findAllGlLinks('gl:docs/readme.md');
		assert.strictEqual(matches.length, 1);
		const context: ResolutionContext = {
			documentPath,
			documentDirectory: path.dirname(documentPath),
			workspaceFolderPath: undefined,
			gitRootHint: undefined
		};
		const issue = analyzeLink(matches[0], context, undefined);
		assert.ok(issue);
		assert.strictEqual(issue?.code, GlDiagnosticCode.MissingGitRoot);
		assert.strictEqual(issue?.severity, 'warning');
	});
});
