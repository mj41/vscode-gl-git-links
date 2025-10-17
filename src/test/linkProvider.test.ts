import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { GlLinkProvider } from '../linkProvider';
import { clearGitRootCache } from '../pathResolver';

describe('GlLinkProvider', () => {
	let tempRoot: string;
	let repoRoot: string;
	let docsDir: string;
	let srcDir: string;
	let documentPath: string;
	let readmePath: string;
	let guidePath: string;
	let utilPath: string;

	const token = {
		isCancellationRequested: false,
		onCancellationRequested: () => ({ dispose() {} })
	} as vscode.CancellationToken;

	beforeEach(() => {
		clearGitRootCache();
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-link-provider-'));
		repoRoot = path.join(tempRoot, 'repo');
		docsDir = path.join(repoRoot, 'docs');
		srcDir = path.join(repoRoot, 'src');
		fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
		fs.mkdirSync(docsDir, { recursive: true });
		fs.mkdirSync(srcDir, { recursive: true });

		readmePath = path.join(docsDir, 'readme.md');
		guidePath = path.join(docsDir, 'guide.md');
		utilPath = path.join(srcDir, 'util.ts');
		documentPath = path.join(docsDir, 'index.md');

		fs.writeFileSync(readmePath, '# Readme');
		fs.writeFileSync(guidePath, '# Guide');
		fs.writeFileSync(utilPath, '// util');
		fs.writeFileSync(documentPath, '# Index');
	});

	afterEach(() => {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	it('creates document links for resolvable gl paths', async () => {
		const sampleLines = [
			'Intro gl:docs/readme.md#L5 text.',
			'Another [example](gl:docs/guide.md).',
			'Relative gl:./../src/util.ts#L12 path.',
			'Omit gl:../src/skip.ts target.'
		];
		const sample = sampleLines.join('\n');

		const document = {
			uri: vscode.Uri.file(documentPath),
			getText: () => sample
		} as unknown as vscode.TextDocument;

		const workspace = vscode.workspace as unknown as { getWorkspaceFolder: undefined | ((uri: vscode.Uri) => vscode.WorkspaceFolder | undefined) };
		const originalGetWorkspaceFolder = workspace.getWorkspaceFolder;
		workspace.getWorkspaceFolder = () => ({
			uri: vscode.Uri.file(repoRoot),
			name: 'repo',
			index: 0
		} as vscode.WorkspaceFolder);

		try {
			const provider = new GlLinkProvider();
			const links = await provider.provideDocumentLinks(document, token);
			assert.strictEqual(links.length, 3);

			const byFsPath = new Map<string, vscode.DocumentLink>();
			for (const link of links) {
				assert.ok(link.target);
				byFsPath.set(`${link.target.fsPath}#${link.target.fragment ?? ''}`, link);
			}

			const readmeLink = byFsPath.get(`${readmePath}#L5`);
			assert.ok(readmeLink, 'Expected readme link');
			assert.strictEqual(readmeLink?.range.start.line, 0);
			assert.strictEqual(readmeLink?.range.start.character, sampleLines[0].indexOf('gl:docs/readme.md'));
			const readmeSlice = sampleLines[0].slice(readmeLink!.range.start.character, readmeLink!.range.end.character);
			assert.strictEqual(readmeSlice, 'gl:docs/readme.md#L5');
			assert.strictEqual(readmeLink?.target?.fragment, 'L5');
			assert.strictEqual(readmeLink?.tooltip, 'Open docs/readme.md#L5');

			const guideLink = byFsPath.get(`${guidePath}#`);
			assert.ok(guideLink, 'Expected guide link');
			assert.strictEqual(guideLink?.range.start.line, 1);
			assert.strictEqual(guideLink?.range.start.character, sampleLines[1].indexOf('gl:docs/guide.md'));
			const guideSlice = sampleLines[1].slice(guideLink!.range.start.character, guideLink!.range.end.character);
			assert.strictEqual(guideSlice, 'gl:docs/guide.md');
			assert.strictEqual(guideLink?.target?.fragment, '');
			assert.strictEqual(guideLink?.tooltip, 'Open docs/guide.md');

			const utilLink = byFsPath.get(`${utilPath}#L12`);
			assert.ok(utilLink, 'Expected util link');
			assert.strictEqual(utilLink?.range.start.line, 2);
			assert.strictEqual(utilLink?.range.start.character, sampleLines[2].indexOf('gl:./../src/util.ts'));
			const utilSlice = sampleLines[2].slice(utilLink!.range.start.character, utilLink!.range.end.character);
			assert.strictEqual(utilSlice, 'gl:./../src/util.ts#L12');
			assert.strictEqual(utilLink?.target?.fragment, 'L12');
			assert.strictEqual(utilLink?.tooltip, 'Open ./../src/util.ts#L12');

			for (const link of links) {
				assert.notStrictEqual(link.target?.fsPath, path.join(repoRoot, 'src', 'skip.ts'));
			}
		} finally {
			workspace.getWorkspaceFolder = originalGetWorkspaceFolder;
		}
	});

	it('skips document links when target file is missing', async () => {
		const sample = 'Missing gl:docs/missing.md link.';
		const document = {
			uri: vscode.Uri.file(documentPath),
			getText: () => sample
		} as unknown as vscode.TextDocument;

		const workspace = vscode.workspace as unknown as { getWorkspaceFolder: undefined | ((uri: vscode.Uri) => vscode.WorkspaceFolder | undefined) };
		const originalGetWorkspaceFolder = workspace.getWorkspaceFolder;
		workspace.getWorkspaceFolder = () => ({
			uri: vscode.Uri.file(repoRoot),
			name: 'repo',
			index: 0
		} as vscode.WorkspaceFolder);

		try {
			const provider = new GlLinkProvider();
			const links = await provider.provideDocumentLinks(document, token);
			assert.strictEqual(links.length, 0);
		} finally {
			workspace.getWorkspaceFolder = originalGetWorkspaceFolder;
		}
	});

	it('skips document links for invalid syntax', async () => {
		const sample = 'Invalid gl://docs/readme.md link.';
		const document = {
			uri: vscode.Uri.file(documentPath),
			getText: () => sample
		} as unknown as vscode.TextDocument;

		const workspace = vscode.workspace as unknown as { getWorkspaceFolder: undefined | ((uri: vscode.Uri) => vscode.WorkspaceFolder | undefined) };
		const originalGetWorkspaceFolder = workspace.getWorkspaceFolder;
		workspace.getWorkspaceFolder = () => ({
			uri: vscode.Uri.file(repoRoot),
			name: 'repo',
			index: 0
		} as vscode.WorkspaceFolder);

		try {
			const provider = new GlLinkProvider();
			const links = await provider.provideDocumentLinks(document, token);
			assert.strictEqual(links.length, 0);
		} finally {
			workspace.getWorkspaceFolder = originalGetWorkspaceFolder;
		}
	});

	it('returns empty array when cancelled', async () => {
		const provider = new GlLinkProvider();
		const document = {
			uri: vscode.Uri.file(documentPath),
			getText: () => ''
		} as unknown as vscode.TextDocument;

		const cancelledToken = {
			isCancellationRequested: true,
			onCancellationRequested: () => ({ dispose() {} })
		} as vscode.CancellationToken;

		const links = await provider.provideDocumentLinks(document, cancelledToken);
		assert.deepStrictEqual(links, []);
	});
});
