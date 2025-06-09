import { Position, Range, WorkspaceEdit, TextEdit, PrepareRenameParams, RequestHandler, RenameParams, TextDocuments, TextDocumentIdentifier } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "../parsing/uxmlParser";
import { Node } from "../parsing/uxmlNodes";

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

export function doPrepareRename(params: PrepareRenameParams): Range | { range: Range; placeholder: string; } | { defaultBehavior: boolean; } | undefined | null {
    const doc = documents.get(params.textDocument.uri);

    if (!doc) {
        return;
    }

    const highlightNode = getHighlightNode(doc, params.position);

    if (highlightNode) {
        return Range.create(doc.positionAt(highlightNode.getStart()), doc.positionAt(highlightNode.getEnd()));
    } else {
        return;
    }
}

export function doRenameRequest(params: RenameParams): WorkspaceEdit | undefined | null {
    const doc = documents.get(params.textDocument.uri);

    console.log('doRenameRequest');
    if (!doc) {
        console.log('doc not found');
        return;
    }

    const highlightNode = getHighlightNode(doc, params.position);

    if (!highlightNode) {
        return;
    }

    let workspaceEdit: WorkspaceEdit = {
        changes: {
            [params.textDocument.uri]: [{ newText: params.newName, range: Range.create(doc.positionAt(highlightNode.getStart()), doc.positionAt(highlightNode.getEnd())) }]
        },

        documentChanges: [{
            textDocument: { uri: params.textDocument.uri, version: null },
            edits: [{ newText: params.newName, range: Range.create(doc.positionAt(highlightNode.getStart()), doc.positionAt(highlightNode.getEnd())) }]
        }]
    };

    return workspaceEdit;
}

function getHighlightNode(doc: TextDocument, position: Position): Node | undefined {
    const offset = doc.offsetAt(position);
    const parser = new Parser(doc);
    const currentWord = parser.getCurrentWord(offset);
    const currentToken = parser.getCurrentToken(offset);
    const range = { start: doc.positionAt(offset - currentWord.length), end: position };
    const program = parser.getProgram();
    const encases = program?.addIfEncasing(offset) ?? [];

    if (encases.length >= 1) { return encases[0]; }
    return;
}