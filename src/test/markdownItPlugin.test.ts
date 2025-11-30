import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createGlMarkdownItPlugin } from '../markdownItPlugin';
import { clearGitRootCache } from '../pathResolver';

interface MarkdownItLikeToken {
	type: string;
	attrs: [string, string][];
	attrIndex(name: string): number;
}

function createLinkToken(href: string): MarkdownItLikeToken {
	return {
		type: 'link_open',
		attrs: [['href', href]],
		attrIndex(this: MarkdownItLikeToken, name: string): number {
			if (!this.attrs) {
				return -1;
			}

			return this.attrs.findIndex(entry => entry[0] === name);
		}
	};
}

interface LinkifyMock {
	schemes: Map<string, { validate: (text: string, pos: number, self: any) => number; normalize: (match: any) => void }>;
	add(scheme: string, options: { validate: (text: string, pos: number, self: any) => number; normalize: (match: any) => void }): void;
}

function createLinkifyMock(): LinkifyMock {
	const schemes = new Map<string, { validate: (text: string, pos: number, self: any) => number; normalize: (match: any) => void }>();
	return {
		schemes,
		add(scheme: string, options: { validate: (text: string, pos: number, self: any) => number; normalize: (match: any) => void }) {
			schemes.set(scheme, options);
		}
	};
}

function runPlugin(tokens: MarkdownItLikeToken[], env: any): void {
	const handlers: Array<(state: { tokens: MarkdownItLikeToken[]; env: any }) => void> = [];
	const md = {
		linkify: createLinkifyMock(),
		core: {
			ruler: {
				after: (_before: string, _name: string, fn: (state: { tokens: MarkdownItLikeToken[]; env: any }) => void) => {
					handlers.push(fn);
				}
			}
		}
	};

	const plugin = createGlMarkdownItPlugin();
	plugin(md);
	assert.strictEqual(handlers.length, 1);
	const state = { tokens, env };
	handlers[0](state);
}

describe('markdownItPlugin', () => {
	let tempRoot: string;
	let repoRoot: string;
	let docsDir: string;
	let srcDir: string;
	let documentPath: string;
	let readmePath: string;
	let utilPath: string;

	beforeEach(() => {
		clearGitRootCache();
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-md-plugin-'));
		repoRoot = path.join(tempRoot, 'repo');
		docsDir = path.join(repoRoot, 'docs');
		srcDir = path.join(repoRoot, 'src');
		fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
		fs.mkdirSync(docsDir, { recursive: true });
		fs.mkdirSync(srcDir, { recursive: true });

		readmePath = path.join(docsDir, 'readme.md');
		utilPath = path.join(srcDir, 'util.ts');
		documentPath = path.join(docsDir, 'index.md');

		fs.writeFileSync(readmePath, '# Readme');
		fs.writeFileSync(utilPath, '// util');
		fs.writeFileSync(documentPath, '# Index');
	});

	afterEach(() => {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	it('rewrites gl links to document-relative hrefs', () => {
		const token = createLinkToken('gl:docs/readme.md#L5');
		const env: { path: string; __glGitRoot?: string } = { path: documentPath };

		runPlugin([token], env);

		const hrefEntry = token.attrs.find(entry => entry[0] === 'href');
		assert.ok(hrefEntry);
		assert.strictEqual(hrefEntry?.[1], 'readme.md#L5');

		const dataEntry = token.attrs.find(entry => entry[0] === 'data-gl-original-href');
		assert.ok(dataEntry);
		assert.strictEqual(dataEntry?.[1], 'gl:docs/readme.md#L5');
		assert.strictEqual(env.__glGitRoot, repoRoot);
	});

	it('preserves dot-prefixed parent traversals', () => {
		const token = createLinkToken('gl:./../src/util.ts#L12');
		const env: { path: string; __glGitRoot?: string } = { path: documentPath };

		runPlugin([token], env);

		const hrefEntry = token.attrs.find(entry => entry[0] === 'href');
		assert.ok(hrefEntry);
		assert.strictEqual(hrefEntry?.[1], '../src/util.ts#L12');

		const dataEntry = token.attrs.find(entry => entry[0] === 'data-gl-original-href');
		assert.ok(dataEntry);
		assert.strictEqual(dataEntry?.[1], 'gl:./../src/util.ts#L12');
	});

	it('leaves unresolved gl links untouched', () => {
		const token = createLinkToken('gl:../outside.md');
		const env: { path: string; __glGitRoot?: string } = { path: documentPath };

		runPlugin([token], env);

		const hrefEntry = token.attrs.find(entry => entry[0] === 'href');
		assert.ok(hrefEntry);
		assert.strictEqual(hrefEntry?.[1], 'gl:../outside.md');

		const dataEntry = token.attrs.find(entry => entry[0] === 'data-gl-original-href');
		assert.strictEqual(dataEntry, undefined);
	});

	it('leaves missing target gl links untouched', () => {
		const token = createLinkToken('gl:docs/missing.md');
		const env: { path: string; __glGitRoot?: string } = { path: documentPath };

		runPlugin([token], env);

		const hrefEntry = token.attrs.find(entry => entry[0] === 'href');
		assert.ok(hrefEntry);
		assert.strictEqual(hrefEntry?.[1], 'gl:docs/missing.md');

		const dataEntry = token.attrs.find(entry => entry[0] === 'data-gl-original-href');
		assert.strictEqual(dataEntry, undefined);
	});

	it('registers gl: scheme with linkify for extended autolinks', () => {
		const linkifyMock = createLinkifyMock();
		const md = {
			linkify: linkifyMock,
			core: {
				ruler: {
					after: () => { }
				}
			}
		};

		const plugin = createGlMarkdownItPlugin();
		plugin(md);

		assert.ok(linkifyMock.schemes.has('gl:'), 'gl: scheme should be registered');
	});

	it('linkify validate function matches gl paths correctly', () => {
		const linkifyMock = createLinkifyMock();
		const md = {
			linkify: linkifyMock,
			core: {
				ruler: {
					after: () => { }
				}
			}
		};

		const plugin = createGlMarkdownItPlugin();
		plugin(md);

		const glScheme = linkifyMock.schemes.get('gl:');
		assert.ok(glScheme);

		const self = { re: {} as Record<string, RegExp> };

		// Test: simple path
		assert.strictEqual(glScheme.validate('readme.md for details', 0, self), 9);

		// Test: path with fragment
		assert.strictEqual(glScheme.validate('docs/file.md#L42 end', 0, self), 16);

		// Test: path ending with punctuation should stop before it
		assert.strictEqual(glScheme.validate('readme.md. more text', 0, self), 9);

		// Test: path with line range
		assert.strictEqual(glScheme.validate('file.go#L10-L20 end', 0, self), 15);
	});

	it('linkify normalize function adds gl: prefix', () => {
		const linkifyMock = createLinkifyMock();
		const md = {
			linkify: linkifyMock,
			core: {
				ruler: {
					after: () => { }
				}
			}
		};

		const plugin = createGlMarkdownItPlugin();
		plugin(md);

		const glScheme = linkifyMock.schemes.get('gl:');
		assert.ok(glScheme);

		const match = { url: 'readme.md#L5' };
		glScheme.normalize(match);
		assert.strictEqual(match.url, 'gl:readme.md#L5');
	});
});
