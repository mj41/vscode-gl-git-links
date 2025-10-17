import * as vscode from 'vscode';
import { GlLink, LineFragment } from './types';
import { SanitizedLink, sanitizeLink } from './linkSanitizer';

// gl:docs/dev/gl-spec.md#L59-L88 defines the fragment grammar enforced below.
// gl:docs/dev/gl-spec.md#L106-L214 outlines the Markdown patterns we mirror here.
const FRAGMENT_PATTERN = /^#?L([1-9]\d*)(?:-L([1-9]\d*))?$/;

export function parseFragment(fragment: string): LineFragment | null {
	const trimmed = fragment.trim();
	if (!trimmed.length) {
		return null;
	}

	const match = FRAGMENT_PATTERN.exec(trimmed);
	if (!match) {
		return null;
	}

	const startLine = Number(match[1]);
	const endLine = match[2] ? Number(match[2]) : undefined;
	if (endLine !== undefined && endLine < startLine) {
		return null;
	}

	return {
		raw: trimmed.startsWith('#') ? trimmed : `#${trimmed}`,
		startLine,
		endLine
	};
}

export function parseGlLink(linkText: string): GlLink | null {
	// gl:docs/dev/gl-spec.md#L21-L104 governs the scheme syntax, path semantics, and restrictions enforced here.
	// gl:README.md#L27-L45 illustrates the user-facing forms this parser accepts.
	const trimmed = linkText.trim();
	if (!trimmed.startsWith('gl:')) {
		return null;
	}

	const content = trimmed.slice(3);
	if (!content.length) {
		return null;
	}

	const hashIndex = content.indexOf('#');
	const pathPart = hashIndex >= 0 ? content.slice(0, hashIndex) : content;
	if (!pathPart.length) {
		return null;
	}

	let fragment: LineFragment | undefined;
	if (hashIndex >= 0) {
		const fragmentText = content.slice(hashIndex + 1);
		const parsedFragment = parseFragment(`#${fragmentText}`);
		if (!parsedFragment) {
			return null;
		}
		fragment = parsedFragment;
	}

	return {
		rawText: trimmed,
		path: pathPart,
		fragment
	};
}

export const INLINE_LINK_PATTERN = /\[([^\]]+)\]\((<?)gl:([^\)\s]+)(>?)\)/g;
export const AUTOLINK_PATTERN = /<gl:([^>\s]+)>/g;
export const EXTENDED_AUTOLINK_PATTERN = /(?:^|[\s*_~(])(?!<)(gl:[^\s<]+)/g;
export const REFERENCE_LINK_PATTERN = /^\[([^\]]+)\]:\s*(?:<(gl:[^>]+)>|(gl:[^\s]+))\s*(?:("[^"]*")|('[^']*')|\([^\)]*\))?\s*$/g;
export const REFERENCE_USE_PATTERN = /\[([^\]]*)\]\s*\[([^\]]*)\]/g;
const FENCE_PATTERN = /^ {0,3}(```+|~~~+)(.*)$/;

function computeInlineCodeRanges(line: string, lineNumber: number): vscode.Range[] {
	const ranges: vscode.Range[] = [];
	let index = 0;
	while (index < line.length) {
		if (line.charAt(index) !== '`') {
			index++;
			continue;
		}

		let tickCount = 1;
		while (index + tickCount < line.length && line.charAt(index + tickCount) === '`') {
			tickCount++;
		}

		const closingSequence = '`'.repeat(tickCount);
		let searchIndex = index + tickCount;
		let closingIndex = -1;
		while (searchIndex < line.length) {
			const candidate = line.indexOf(closingSequence, searchIndex);
			if (candidate === -1) {
				break;
			}

			const precedingChar = candidate === 0 ? undefined : line.charAt(candidate - 1);
			if (precedingChar !== '`') {
				closingIndex = candidate;
				break;
			}

			searchIndex = candidate + 1;
		}

		if (closingIndex === -1) {
			break;
		}

		const range = new vscode.Range(
			new vscode.Position(lineNumber, index),
			new vscode.Position(lineNumber, closingIndex + tickCount)
		);
		ranges.push(range);
		index = closingIndex + tickCount;
	}

	return ranges;
}

function isRangeWithin(target: vscode.Range, containers: vscode.Range[]): boolean {
	for (const container of containers) {
		if (target.start.line !== container.start.line || target.end.line !== container.end.line) {
			continue;
		}

		if (
			target.start.character >= container.start.character &&
			target.end.character <= container.end.character
		) {
			return true;
		}
	}

	return false;
}

export interface LinkMatch {
	readonly linkText: string;
	readonly link: GlLink;
	readonly range: vscode.Range;
	readonly patternType: 'inline' | 'autolink' | 'extended' | 'reference';
	readonly referenceKind?: 'definition' | 'usage';
	readonly referenceLabel?: string;
}

interface ReferenceDefinitionInfo {
	readonly label: string;
	readonly link: GlLink;
	readonly sanitized: SanitizedLink;
}

function normalizeReferenceLabel(label: string): string {
	return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findAllGlLinks(text: string): LinkMatch[] {
	// gl:docs/dev/md-impl.md#L5-L14 summarises the parsing responsibilities we cover here.
	// gl:docs/dev/md-smoke.md#L11-L28 drives manual checks that stress these extraction patterns.
	// gl:docs/dev/gl-spec.md#L106-L214 lays out the Markdown link forms recognised below.
	// gl:README.md#L23-L67 enumerates the link syntax patterns the extension recognises.
	const results: LinkMatch[] = [];
	const lines = text.split(/\r?\n/);
	const definitionMap = new Map<string, ReferenceDefinitionInfo>();
	const definitionsByLine = new Map<number, ReferenceDefinitionInfo[]>();
	const seenRanges = new Set<string>();
	let definitionFence: { marker: string; length: number } | null = null;
	let activeFence: { marker: string; length: number } | null = null;

	const rangeKey = (range: vscode.Range): string => {
		const start = range.start;
		const end = range.end;
		return `${start.line}:${start.character}-${end.line}:${end.character}`;
	};

	const pushMatch = (entry: LinkMatch) => {
		const key = rangeKey(entry.range);
		if (seenRanges.has(key)) {
			return;
		}

		seenRanges.add(key);
		results.push(entry);
	};

	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
		const line = lines[lineNumber];

		if (definitionFence) {
			const trimmed = line.trimStart();
			if (trimmed.length) {
				const fenceChar = definitionFence.marker;
				let count = 0;
				while (count < trimmed.length && trimmed.charAt(count) === fenceChar) {
					count++;
				}
				if (count >= definitionFence.length) {
					definitionFence = null;
				}
			}
			continue;
		}

		const fenceMatch = line.match(FENCE_PATTERN);
		if (fenceMatch) {
			const markerSequence = fenceMatch[1];
			definitionFence = { marker: markerSequence.charAt(0), length: markerSequence.length };
			continue;
		}

		const inlineCodeRanges = computeInlineCodeRanges(line, lineNumber);
		REFERENCE_LINK_PATTERN.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = REFERENCE_LINK_PATTERN.exec(line)) !== null) {
			const linkGroupIndex = match[2] ? 2 : 3;
			const sanitized = sanitizeLink(line, lineNumber, match, linkGroupIndex);
			if (!sanitized) {
				continue;
			}

			const glLink = parseGlLink(sanitized.text);
			if (!glLink) {
				continue;
			}

			if (isRangeWithin(sanitized.linkRange, inlineCodeRanges)) {
				continue;
			}

			const normalizedLabel = normalizeReferenceLabel(match[1]);
			if (!normalizedLabel || definitionMap.has(normalizedLabel)) {
				continue;
			}

			const info: ReferenceDefinitionInfo = {
				label: normalizedLabel,
				link: glLink,
				sanitized
			};

			definitionMap.set(normalizedLabel, info);
			const perLine = definitionsByLine.get(lineNumber) ?? [];
			perLine.push(info);
			definitionsByLine.set(lineNumber, perLine);
		}
	}

	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
		const line = lines[lineNumber];

		if (activeFence) {
			const trimmed = line.trimStart();
			if (trimmed.length) {
				const fenceChar = activeFence.marker;
				let count = 0;
				while (count < trimmed.length && trimmed.charAt(count) === fenceChar) {
					count++;
				}
				if (count >= activeFence.length) {
					activeFence = null;
				}
			}
			continue;
		}

		const fenceMatch = line.match(FENCE_PATTERN);
		if (fenceMatch) {
			const markerSequence = fenceMatch[1];
			activeFence = { marker: markerSequence.charAt(0), length: markerSequence.length };
			continue;
		}

		const inlineCodeRanges = computeInlineCodeRanges(line, lineNumber);

		const definitionEntries = definitionsByLine.get(lineNumber);
		if (definitionEntries) {
			for (const entry of definitionEntries) {
				if (isRangeWithin(entry.sanitized.linkRange, inlineCodeRanges)) {
					continue;
				}
				pushMatch({
					linkText: entry.sanitized.text,
					link: entry.link,
					range: entry.sanitized.linkRange,
					patternType: 'reference',
					referenceKind: 'definition',
					referenceLabel: entry.label
				});
			}
		}

		INLINE_LINK_PATTERN.lastIndex = 0;
		let inlineMatch: RegExpExecArray | null;
		while ((inlineMatch = INLINE_LINK_PATTERN.exec(line)) !== null) {
			const sanitized = sanitizeLink(line, lineNumber, inlineMatch, 3);
			if (!sanitized) {
				continue;
			}

			const glLink = parseGlLink(`gl:${sanitized.text}`);
			if (!glLink) {
				continue;
			}

			const schemeLength = 'gl:'.length;
			const startColumn = Math.max(0, sanitized.linkRange.start.character - schemeLength);
			const start = new vscode.Position(lineNumber, startColumn);
			const range = new vscode.Range(start, sanitized.linkRange.end);
			if (isRangeWithin(range, inlineCodeRanges)) {
				continue;
			}

			pushMatch({
				linkText: glLink.rawText,
				link: glLink,
				range,
				patternType: 'inline'
			});
		}

		AUTOLINK_PATTERN.lastIndex = 0;
		let autoMatch: RegExpExecArray | null;
		while ((autoMatch = AUTOLINK_PATTERN.exec(line)) !== null) {
			const sanitized = sanitizeLink(line, lineNumber, autoMatch, 1);
			if (!sanitized) {
				continue;
			}

			const glLink = parseGlLink(`gl:${sanitized.text}`);
			if (!glLink) {
				continue;
			}

			const schemeLength = 'gl:'.length;
			const startColumn = Math.max(0, sanitized.linkRange.start.character - schemeLength);
			const start = new vscode.Position(lineNumber, startColumn);
			const range = new vscode.Range(start, sanitized.linkRange.end);
			if (isRangeWithin(range, inlineCodeRanges)) {
				continue;
			}

			pushMatch({
				linkText: glLink.rawText,
				link: glLink,
				range,
				patternType: 'autolink'
			});
		}

		EXTENDED_AUTOLINK_PATTERN.lastIndex = 0;
		let extendedMatch: RegExpExecArray | null;
		while ((extendedMatch = EXTENDED_AUTOLINK_PATTERN.exec(line)) !== null) {
			const sanitized = sanitizeLink(line, lineNumber, extendedMatch, 1);
			if (!sanitized) {
				continue;
			}

			const glLink = parseGlLink(sanitized.text);
			if (!glLink) {
				continue;
			}

			if (isRangeWithin(sanitized.linkRange, inlineCodeRanges)) {
				continue;
			}

			pushMatch({
				linkText: glLink.rawText,
				link: glLink,
				range: sanitized.linkRange,
				patternType: 'extended'
			});
		}

		REFERENCE_USE_PATTERN.lastIndex = 0;
		let usageMatch: RegExpExecArray | null;
		while ((usageMatch = REFERENCE_USE_PATTERN.exec(line)) !== null) {
			const explicitLabel = usageMatch[2]?.trim();
			const fallbackLabel = usageMatch[1]?.trim();
			const label = explicitLabel?.length ? explicitLabel : fallbackLabel;
			if (!label) {
				continue;
			}

			const normalized = normalizeReferenceLabel(label);
			const definition = definitionMap.get(normalized);
			if (!definition) {
				continue;
			}

			const matchStart = usageMatch.index ?? 0;
			const matchEnd = matchStart + usageMatch[0].length;
			const range = new vscode.Range(
				new vscode.Position(lineNumber, matchStart),
				new vscode.Position(lineNumber, matchEnd)
			);
			if (isRangeWithin(range, inlineCodeRanges)) {
				continue;
			}

			pushMatch({
				linkText: definition.link.rawText,
				link: definition.link,
				range,
				patternType: 'reference',
				referenceKind: 'usage',
				referenceLabel: definition.label
			});
		}
	}

	return results;
}

export function offsetToPosition(text: string, offset: number): vscode.Position {
	const clampedOffset = Math.max(0, Math.min(offset, text.length));
	const preceding = text.slice(0, clampedOffset);
	const lineBreaks = preceding.match(/\r?\n/g);
	const line = lineBreaks ? lineBreaks.length : 0;
	const lastLineBreakIndex = Math.max(preceding.lastIndexOf('\n'), preceding.lastIndexOf('\r'));
	const character = lastLineBreakIndex >= 0 ? clampedOffset - lastLineBreakIndex - 1 : clampedOffset;
	return new vscode.Position(line, character);
}
