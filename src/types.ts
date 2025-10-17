export interface LineFragment {
	readonly raw: string;
	readonly startLine: number;
	readonly endLine?: number;
}

export interface GlLink {
	readonly rawText: string;
	readonly path: string;
	readonly fragment?: LineFragment;
}

export interface ResolvedPath {
	readonly absolutePath: string;
	readonly relativePath: string;
	readonly gitRoot: string;
	readonly exists: boolean;
}

export interface ResolutionContext {
	readonly documentPath: string;
	readonly documentDirectory: string;
	readonly workspaceFolderPath?: string;
	readonly gitRootHint?: string;
}
