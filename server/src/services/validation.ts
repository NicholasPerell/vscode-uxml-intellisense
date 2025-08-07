import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "../parsing/uxmlParser";

export function doValidation(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const parser = new Parser(document);

    const uri = document.uri;
    const lastIndex = uri.lastIndexOf('/');
    const filename = lastIndex < 0 ? uri : uri.substring(lastIndex + 1);
    const extensionIndex = filename.lastIndexOf('.');
    const extension = extensionIndex < 0 ? '' : filename.substring(extensionIndex + 1);

    if (extension !== 'uxml_') {
        parser.checkForUnderscoreWarnings();
    }

    parser.getErrors().forEach(e => {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
                start: document.positionAt(e.startOffset),
                end: document.positionAt(e.endOffset)
            },
            message: e.message,
            source: 'UXML Extension'
        }
        diagnostics.push(diagnostic);
    });

    parser.getWarnings().forEach(w => {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Warning,
            range: {
                start: document.positionAt(w.startOffset),
                end: document.positionAt(w.endOffset)
            },
            message: w.message,
            source: 'UXML Extension',
            data: w.actionData
        }
        diagnostics.push(diagnostic);
    });

    return diagnostics;
}