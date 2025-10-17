import { Position, Range } from 'vscode';

// gl:docs/dev/gl-spec.md#L187-L196 enumerates the trailing punctuation and entity rules this regex enforces.
const TRAILING_PUNCTUATION = /[?!.,:*_~"']+$/;

export interface SanitizedLink {
	readonly originalText: string;
	readonly text: string;
	readonly linkRange: Range;
}

function countOccurrences(value: string, char: string): number {
	return value.split(char).length - 1;
}

function determineGroupOffset(match: RegExpExecArray, groupIndex: number): number {
	const groupText = match[groupIndex];
	if (groupText === undefined) {
		return -1;
	}

	let searchStart = 0;
	for (let index = 1; index < groupIndex; index++) {
		const previous = match[index];
		if (!previous) {
			continue;
		}

		const hit = match[0].indexOf(previous, searchStart);
		if (hit >= 0) {
			searchStart = hit + previous.length;
		}
	}

	const localOffset = match[0].indexOf(groupText, searchStart);
	if (localOffset >= 0) {
		return localOffset;
	}

	return match[0].lastIndexOf(groupText);
}

function trimTrailingPunctuation(value: string): { trimmed: number; result: string } {
	const match = value.match(TRAILING_PUNCTUATION);
	if (!match) {
		return { trimmed: 0, result: value };
	}

	return {
		trimmed: match[0].length,
		result: value.slice(0, -match[0].length)
	};
}

function trimUnbalancedClosingParentheses(value: string): { trimmed: number; result: string } {
	let trimmed = 0;
	let current = value;

	while (current.endsWith(')')) {
		const opening = countOccurrences(current, '(');
		const closing = countOccurrences(current, ')');
		if (closing <= opening) {
			break;
		}

		current = current.slice(0, -1);
		trimmed++;
	}

	return { trimmed, result: current };
}

export function sanitizeLink(
	fullLineText: string,
	lineNumber: number,
	match: RegExpExecArray,
	linkGroupIndex: number
): SanitizedLink | null {
	const matchStart = match.index ?? -1;
	const groupText = match[linkGroupIndex];
	if (matchStart < 0 || !groupText) {
		return null;
	}

	const groupOffset = determineGroupOffset(match, linkGroupIndex);
	if (groupOffset < 0) {
		return null;
	}

	let cleaned = groupText;
	let leadingTrim = 0;
	let trailingTrim = 0;

	if (cleaned.startsWith('`') && cleaned.endsWith('`') && cleaned.length > 2) {
		cleaned = cleaned.slice(1, -1);
		leadingTrim++;
		trailingTrim++;
	}

	const punctuationResult = trimTrailingPunctuation(cleaned);
	cleaned = punctuationResult.result;
	trailingTrim += punctuationResult.trimmed;

	const parenthesisResult = trimUnbalancedClosingParentheses(cleaned);
	cleaned = parenthesisResult.result;
	trailingTrim += parenthesisResult.trimmed;

	if (!cleaned.length) {
		return null;
	}

	const groupStartColumn = matchStart + groupOffset;
	const sanitizedStartColumn = groupStartColumn + leadingTrim;
	const sanitizedEndColumn = groupStartColumn + groupText.length - trailingTrim;

	const lineLength = fullLineText.length;
	const startColumn = Math.min(sanitizedStartColumn, lineLength);
	const endColumn = Math.min(Math.max(sanitizedEndColumn, startColumn), lineLength);

	const start = new Position(lineNumber, startColumn);
	const end = new Position(lineNumber, endColumn);

	return {
		originalText: groupText,
		text: cleaned,
		linkRange: new Range(start, end)
	};
}
