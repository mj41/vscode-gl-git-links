
// @ts-nocheck

const Module = require('module');

class Position {
	constructor(line, character) {
		this.line = line;
		this.character = character;
	}
}

class Range {
	constructor(start, end) {
		this.start = start;
		this.end = end;
	}
}

const DiagnosticSeverity = {
	Error: 0,
	Warning: 1,
	Information: 2,
	Hint: 3
};

class Diagnostic {
	constructor(range, message, severity = DiagnosticSeverity.Error) {
		this.range = range;
		this.message = message;
		this.severity = severity;
		this.code = undefined;
		this.source = undefined;
	}
}

class CodeActionKind {
	constructor(value) {
		this.value = value;
	}

	append(part) {
		return new CodeActionKind(`${this.value}.${part}`);
	}
}

CodeActionKind.Empty = new CodeActionKind('');
CodeActionKind.QuickFix = new CodeActionKind('quickfix');

class CodeAction {
	constructor(title, kind = CodeActionKind.Empty) {
		this.title = title;
		this.kind = kind;
		this.command = undefined;
		this.diagnostics = undefined;
		this.isPreferred = false;
	}
}

const CodeActionTriggerKind = {
	Invoke: 1,
	Automatic: 2
};

class Uri {
	constructor(fsPath, fragment = '') {
		this.scheme = 'file';
		this.fsPath = fsPath;
		this.fragment = fragment;
	}

	static file(fsPath) {
		return new Uri(fsPath);
	}

	with(options) {
		const nextFragment = Object.prototype.hasOwnProperty.call(options, 'fragment') ? options.fragment : this.fragment;
		return new Uri(this.fsPath, nextFragment);
	}

	toString() {
		return this.fragment ? `${this.fsPath}#${this.fragment}` : this.fsPath;
	}
}

class DocumentLink {
	constructor(range, target) {
		this.range = range;
		this.target = target;
		this.tooltip = undefined;
	}
}

class WorkspaceEdit {
	constructor() {
		this.edits = [];
	}

	replace(uri, range, newText) {
		this.edits.push({ uri, range, newText });
	}

	createFile(uri, options) {
		this.edits.push({ uri, options, type: 'createFile' });
	}

	insert(uri, position, newText) {
		this.edits.push({ uri, position, newText, type: 'insert' });
	}
}
 
class EventEmitter {
	constructor() {
		this.listeners = [];
	}

	event(listener) {
		this.listeners.push(listener);
		return new Disposable(() => {
			this.listeners = this.listeners.filter(entry => entry !== listener);
		});
	}

	fire(data) {
		for (const listener of [...this.listeners]) {
			try {
				listener(data);
			} catch (error) {
				// ignore listener failures in mock
			}
		}
	}

	dispose() {
		this.listeners = [];
	}
}

class MarkdownString {
	constructor(value = '') {
		this.value = value;
	}
}

class Hover {
	constructor(contents, range) {
		this.contents = Array.isArray(contents) ? contents : [contents];
		this.range = range;
	}
}

class Disposable {
	constructor(callback = undefined) {
		this.callback = callback;
	}

	dispose() {
		if (this.callback) {
			this.callback();
			this.callback = undefined;
		}
	}
}

const vscodeMock = {
	Position,
	Range,
	Uri,
	DocumentLink,
	MarkdownString,
	Hover,
	Diagnostic,
	DiagnosticSeverity,
	CodeAction,
	CodeActionKind,
	CodeActionTriggerKind,
	EventEmitter,
	WorkspaceEdit,
	Selection: class Selection extends Range {},
	TextEditorRevealType: {
		InCenterIfOutsideViewport: 0
	},
	workspace: {
		getWorkspaceFolder: () => undefined,
		onDidOpenTextDocument: () => ({ dispose() {} }),
		applyEdit: () => Promise.resolve(true),
		fs: {
			createDirectory: () => Promise.resolve(),
			writeFile: () => Promise.resolve()
		}
	},
	languages: {
		registerDocumentLinkProvider: () => ({ dispose() {} }),
		registerHoverProvider: () => ({ dispose() {} }),
		registerCodeActionsProvider: () => ({ dispose() {} }),
		createDiagnosticCollection: () => ({
			set() {},
			delete() {},
			clear() {},
			dispose() {}
		})
	},
	commands: {
		registerCommand: () => ({ dispose() {} }),
		executeCommand: () => Promise.resolve()
	},
	window: {
		activeTextEditor: undefined,
		visibleTextEditors: [],
		onDidChangeActiveTextEditor: () => ({ dispose() {} })
	},
	Disposable
};

const originalLoad = Module._load;

Module._load = function(request, parent, isMain) {
	if (request === 'vscode') {
		return vscodeMock;
	}

	return originalLoad.call(this, request, parent, isMain);
};
