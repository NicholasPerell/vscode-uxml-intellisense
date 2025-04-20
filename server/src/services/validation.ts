import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "../parsing/uxmlParser";

export function doValidation(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const parser = new Parser(document);

    parser.getErrors().forEach(e => {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
                start: document.positionAt(e.startOffset),
                end: document.positionAt(e.endOffset)
            },
            message: e.message,
            source: 'vm uss extension'
        }
        diagnostics.push(diagnostic);
    });

    return diagnostics;
}