import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { GlHoverProvider } from '../hoverProvider';
import { clearGitRootCache } from '../pathResolver';

describe('GlHoverProvider', () => {
	let tempRoot: string;
	let repoRoot: string;
	let docsDir: string;
	let documentPath: string;
	let readmePath: string;

	const token = {
		isCancellationRequested: false,
		onCancellationRequested: () => ({ dispose() {} })
	} as vscode.CancellationToken;

	beforeEach(() => {
		clearGitRootCache();
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-hover-provider-'));
		repoRoot = path.join(tempRoot, 'repo');
		docsDir = path.join(repoRoot, 'docs');
		fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
		fs.mkdirSync(docsDir, { recursive: true });

		readmePath = path.join(docsDir, 'readme.md');
		documentPath = path.join(docsDir, 'index.md');

		fs.writeFileSync(readmePath, '# Readme');
		fs.writeFileSync(documentPath, ['Intro gl:docs/readme.md#L5 text.', 'Missing gl:docs/missing.md target.', 'Range gl:docs/readme.md#L1-L3 sample.'].join('\n'));
	});

	afterEach(() => {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	it('provides hover information for resolved links', async () => {
		const provider = new GlHoverProvider();
		const document = {
			uri: vscode.Uri.file(documentPath),
			getText: () => fs.readFileSync(documentPath, 'utf8')
		} as unknown as vscode.TextDocument;

		const lineText = 'Intro gl:docs/readme.md#L5 text.';
		const hoverPosition = new vscode.Position(0, lineText.indexOf('gl:docs/readme.md'));
		const hover = await provider.provideHover(document, hoverPosition, token);
		assert.ok(hover);

		const rawContents = hover?.contents;
		assert.ok(rawContents);
		const markdown = Array.isArray(rawContents)
			? (rawContents[0] as vscode.MarkdownString)
			: (rawContents as vscode.MarkdownString);
		assert.ok(markdown instanceof vscode.MarkdownString);
		assert.ok(markdown.value.includes('**Git Link**'));
		assert.ok(markdown.value.includes('docs/readme.md line 5'));

		assert.ok(hover?.range);
		assert.strictEqual(hover?.range.start.line, 0);
	});

	it('notes unresolved targets in hover text', async () => {
		const provider = new GlHoverProvider();
		const document = {
			uri: vscode.Uri.file(documentPath),
			getText: () => fs.readFileSync(documentPath, 'utf8')
		} as unknown as vscode.TextDocument;

		const secondLine = 'Missing gl:docs/missing.md target.';
		const position = new vscode.Position(1, secondLine.indexOf('gl:docs/missing.md'));
		const hover = await provider.provideHover(document, position, token);
		assert.ok(hover);

		const rawContents = hover?.contents;
		assert.ok(rawContents);
		const markdown = Array.isArray(rawContents)
			? (rawContents[0] as vscode.MarkdownString)
			: (rawContents as vscode.MarkdownString);
		assert.ok(markdown.value.includes('**Git Link**'));
		assert.ok(markdown.value.includes('Status: Target missing.'));
		assert.ok(markdown.value.includes('Expected: `docs/missing.md`'));
		assert.ok(markdown.value.includes('Found: not on disk.'));
	});

	it('lists en dash ranges in hover text', async () => {
		const provider = new GlHoverProvider();
		const document = {
			uri: vscode.Uri.file(documentPath),
			getText: () => fs.readFileSync(documentPath, 'utf8')
		} as unknown as vscode.TextDocument;

		const thirdLine = 'Range gl:docs/readme.md#L1-L3 sample.';
		const position = new vscode.Position(2, thirdLine.indexOf('gl:docs/readme.md'));
		const hover = await provider.provideHover(document, position, token);
		assert.ok(hover);

		const rawContents = hover?.contents;
		assert.ok(rawContents);
		const markdown = Array.isArray(rawContents)
			? (rawContents[0] as vscode.MarkdownString)
			: (rawContents as vscode.MarkdownString);
		assert.ok(markdown.value.includes('docs/readme.md lines 1–3'));
	});

	it('indicates when links cannot be resolved', async () => {
		const provider = new GlHoverProvider();
		const docPath = path.join(docsDir, 'escape.md');
		const text = 'Blocked gl:../outside.md link.';
		fs.writeFileSync(docPath, text);
		const document = {
			uri: vscode.Uri.file(docPath),
			getText: () => text
		} as unknown as vscode.TextDocument;

		const position = new vscode.Position(0, text.indexOf('gl:../outside.md'));
		const hover = await provider.provideHover(document, position, token);
		assert.ok(hover);

		const rawContents = hover?.contents;
		assert.ok(rawContents);
		const markdown = Array.isArray(rawContents)
			? (rawContents[0] as vscode.MarkdownString)
			: (rawContents as vscode.MarkdownString);
		assert.ok(markdown.value.includes('**Git Link**'));
		assert.ok(markdown.value.includes('Status: Link resolves outside the repository.'));
		assert.ok(markdown.value.includes('Found: outside repository (`../outside.md`)'));
	});

	it('returns undefined when position is outside a link', async () => {
		const provider = new GlHoverProvider();
		const document = {
			uri: vscode.Uri.file(documentPath),
			getText: () => fs.readFileSync(documentPath, 'utf8')
		} as unknown as vscode.TextDocument;

		const position = new vscode.Position(0, 0);
		const hover = await provider.provideHover(document, position, token);
		assert.strictEqual(hover, undefined);
	});

	it('honors cancellation tokens', async () => {
		const provider = new GlHoverProvider();
		const document = {
			uri: vscode.Uri.file(documentPath),
			getText: () => fs.readFileSync(documentPath, 'utf8')
		} as unknown as vscode.TextDocument;

		const cancelledToken = {
			isCancellationRequested: true,
			onCancellationRequested: () => ({ dispose() {} })
		} as vscode.CancellationToken;

		const position = new vscode.Position(0, 10);
		const hover = await provider.provideHover(document, position, cancelledToken);
		assert.strictEqual(hover, undefined);
	});
});
