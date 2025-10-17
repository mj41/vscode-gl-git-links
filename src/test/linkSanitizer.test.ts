import * as assert from 'assert';
import { EXTENDED_AUTOLINK_PATTERN } from '../linkPatterns';
import { sanitizeLink } from '../linkSanitizer';

function exec(pattern: RegExp, text: string): RegExpExecArray {
	pattern.lastIndex = 0;
	const match = pattern.exec(text);
	assert.ok(match, 'Expected pattern to match text');
	return match;
}

describe('linkSanitizer', () => {
	it('trims trailing punctuation and yields expected range', () => {
		const line = 'Intro gl:docs/readme.md?! more';
		const match = exec(EXTENDED_AUTOLINK_PATTERN, line);
		const sanitized = sanitizeLink(line, 0, match, 1);
		assert.ok(sanitized);
		assert.strictEqual(sanitized?.text, 'gl:docs/readme.md');

		const expectedStart = line.indexOf('gl:docs/readme.md');
		assert.strictEqual(sanitized?.linkRange.start.line, 0);
		assert.strictEqual(sanitized?.linkRange.start.character, expectedStart);
		assert.strictEqual(sanitized?.linkRange.end.character, expectedStart + sanitized.text.length);
	});

	it('removes wrapping backticks', () => {
		const line = 'See `gl:docs/readme.md` for details.';
		const backtickPattern = /(`gl:[^`]+`)/g;
		const match = exec(backtickPattern, line);
		const sanitized = sanitizeLink(line, 2, match, 0);
		assert.ok(sanitized);
		assert.strictEqual(sanitized?.text, 'gl:docs/readme.md');

		const expectedStart = line.indexOf('gl:docs/readme.md');
		assert.strictEqual(sanitized?.linkRange.start.line, 2);
		assert.strictEqual(sanitized?.linkRange.start.character, expectedStart);
		assert.strictEqual(sanitized?.linkRange.end.character, expectedStart + sanitized.text.length);
	});

	it('discards unmatched closing parentheses', () => {
		const line = 'Visit gl:docs/readme.md))) soon';
		const match = exec(EXTENDED_AUTOLINK_PATTERN, line);
		const sanitized = sanitizeLink(line, 4, match, 1);
		assert.ok(sanitized);
		assert.strictEqual(sanitized?.text, 'gl:docs/readme.md');

		const expectedStart = line.indexOf('gl:docs/readme.md');
		assert.strictEqual(sanitized?.linkRange.start.line, 4);
		assert.strictEqual(sanitized?.linkRange.start.character, expectedStart);
		assert.strictEqual(sanitized?.linkRange.end.character, expectedStart + sanitized.text.length);
	});

	it('trims trailing quotes', () => {
		const line = 'Broken gl:docs/readme.md." link';
		const match = exec(EXTENDED_AUTOLINK_PATTERN, line);
		const sanitized = sanitizeLink(line, 6, match, 1);
		assert.ok(sanitized);
		assert.strictEqual(sanitized?.text, 'gl:docs/readme.md');

		const expectedStart = line.indexOf('gl:docs/readme.md');
		assert.strictEqual(sanitized?.linkRange.start.line, 6);
		assert.strictEqual(sanitized?.linkRange.start.character, expectedStart);
		assert.strictEqual(sanitized?.linkRange.end.character, expectedStart + sanitized.text.length);
	});
});
