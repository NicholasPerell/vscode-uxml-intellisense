import { FoldingRange } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Comment, Element, Node, Program } from "../parsing/uxmlNodes";
import { Scanner } from "../parsing/uxmlScanner";


export function getFoldingRanges(document: TextDocument): FoldingRange[] {
    const scanner = new Scanner(document);
    const program = new Program(scanner);

    return checkForFolds(program, document);
}

function checkForFolds(node: Node, document: TextDocument): FoldingRange[] {
    const folds: FoldingRange[] = [];

    if (node instanceof Element) {
        const startOffset = node.startElement.getEnd();
        const startPos = document.positionAt(startOffset);
        const endOffset = node.endElement.getStart();
        const endPos = document.positionAt(endOffset);
        folds.push({
            startLine: startPos.line,
            startCharacter: startPos.character,
            endLine: endPos.line,
            endCharacter: endPos.character,
            kind: 'region',
            collapsedText: document.getText({
                start: endPos,
                end: document.positionAt(node.endElement.getEnd())
            })
        });
    } else if (node instanceof Comment) {
        const startOffset = node.getStart() + 4;
        const startPos = document.positionAt(startOffset);
        const endOffset = node.getEnd() - 3;
        const endPos = document.positionAt(endOffset);
        folds.push({
            startLine: startPos.line,
            startCharacter: startPos.character,
            endLine: endPos.line,
            endCharacter: endPos.character,
            kind: 'comment',
            collapsedText: '-->'
        });
    }

    for (let child of node.getChildNodes()) {
        folds.push(...checkForFolds(child, document));
    }

    return folds;
}