import { title } from "process";
import { /*CodeAction,*/ CodeActionKind, Diagnostic, DiagnosticSeverity, PartialResultParams, Range, RequestMessage, TextDocumentIdentifier, TextEdit, WorkDoneProgressParams, WorkspaceEdit } from "vscode-languageserver";
import { documents } from "../server";

export interface CodeActionParams {
    textDocument: TextDocumentIdentifier;
    range: Range;
    context: CodeActionContext;
}

interface CodeActionContext {
    diagnostics: Diagnostic[];
}

interface CodeAction {
    title: string;
    kind?: 'quickfix';//CodeActionKind;
    edit?: WorkspaceEdit;
    data?: unknown;
}

export const codeAction = (message: CodeActionParams): CodeAction[] | null => {
    const uri = message.textDocument.uri;
    const doc = documents.get(uri);
    const context = message.context;

    if (!doc || !context) {
        return null;
    }

    let actions: CodeAction[] = [];

    for (const diagnostic of message.context.diagnostics) {
        if (diagnostic.source !== 'UXML Extension' || diagnostic.severity !== DiagnosticSeverity.Warning) {
            continue;
        }

        if (
            !!diagnostic.data &&
            'decoded' in diagnostic.data &&
            typeof diagnostic.data.decoded === 'string' &&
            'encoded' in diagnostic.data &&
            typeof diagnostic.data.encoded === 'string'
        ) {
            actions.push({
                title: 'Encode Using Underscores',
                kind: 'quickfix',
                edit: {
                    changes: {
                        [uri]: [TextEdit.replace(diagnostic.range, diagnostic.data.encoded)]
                    }
                }
            });
        }
    }

    return actions;
}