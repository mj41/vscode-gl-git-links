import * as assert from 'assert';
import { findAllGlLinks, parseFragment, parseGlLink } from '../linkPatterns';

describe('linkPatterns', () => {
	describe('parseFragment', () => {
		it('parses single line fragment', () => {
			const fragment = parseFragment('#L42');
			assert.ok(fragment);
			assert.strictEqual(fragment?.startLine, 42);
			assert.strictEqual(fragment?.endLine, undefined);
		});

		it('parses line range fragment', () => {
			const fragment = parseFragment('#L10-L20');
			assert.ok(fragment);
			assert.strictEqual(fragment?.startLine, 10);
			assert.strictEqual(fragment?.endLine, 20);
		});

		it('rejects invalid fragment', () => {
			const fragment = parseFragment('#l42');
			assert.strictEqual(fragment, null);
		});
	});

	describe('parseGlLink', () => {
		it('parses link with fragment', () => {
			const link = parseGlLink('gl:docs/readme.md#L5');
			assert.ok(link);
			assert.strictEqual(link?.path, 'docs/readme.md');
			assert.strictEqual(link?.fragment?.startLine, 5);
		});

		it('rejects non gl link', () => {
			const link = parseGlLink('http://example.com');
			assert.strictEqual(link, null);
		});
	});

	describe('findAllGlLinks', () => {
		it('detects all markdown link patterns', () => {
			const sample = [
				'Intro gl:docs/readme.md#L10.',
				'[inline](gl:docs/guide.md#L5)',
				'<gl:docs/auto.md#L3>',
				'',
				'[ref]: gl:docs/ref.md#L8',
				'Use [text][ref].'
			].join('\n');

			const matches = findAllGlLinks(sample);
			assert.strictEqual(matches.length, 5);

			const extended = matches.find(match => match.patternType === 'extended');
			assert.ok(extended);
			assert.strictEqual(extended?.link.path, 'docs/readme.md');
			assert.strictEqual(extended?.link.fragment?.startLine, 10);

			const inline = matches.find(match => match.patternType === 'inline');
			assert.ok(inline);
			assert.strictEqual(inline?.link.path, 'docs/guide.md');
			assert.strictEqual(inline?.link.fragment?.startLine, 5);

			const autolink = matches.find(match => match.patternType === 'autolink');
			assert.ok(autolink);
			assert.strictEqual(autolink?.link.path, 'docs/auto.md');
			assert.strictEqual(autolink?.link.fragment?.startLine, 3);

			const definition = matches.find(match => match.referenceKind === 'definition');
			assert.ok(definition);
			assert.strictEqual(definition?.link.path, 'docs/ref.md');
			assert.strictEqual(definition?.link.fragment?.startLine, 8);

			const usage = matches.find(match => match.referenceKind === 'usage');
			assert.ok(usage);
			assert.strictEqual(usage?.link.path, 'docs/ref.md');
			assert.strictEqual(usage?.referenceLabel, 'ref');
		});

			it('ignores links inside inline code spans', () => {
				const sample = 'Use `gl:docs/readme.md#L10` to reference.';
				const matches = findAllGlLinks(sample);
				assert.strictEqual(matches.length, 0);
			});

			it('ignores links inside fenced code blocks', () => {
				const sample = [
					'```',
					'gl:docs/ignore.md',
					'```',
					'',
					'gl:docs/keep.md'
				].join('\n');
				const matches = findAllGlLinks(sample);
				assert.strictEqual(matches.length, 1);
				assert.strictEqual(matches[0]?.link.path, 'docs/keep.md');
			});
	});
});
