import { TextDocument } from "vscode-languageserver-textdocument";
import { Lexer } from "./uxmlLexer";
import { ParsingError } from "./uxmlError";
import { Attribute, Node, NodeType, Program } from "./uxmlNodes";
import { Scanner } from "./uxmlScanner";
import { Underscore } from "../util/underscoreEncoding";
import { ParsingUnderscoreWarning, ParsingWarning } from "./uxmlWarning";

export class Parser {
    private readonly lexer = new Lexer();
    private program?: Program;
    private errors: ParsingError[];
    private warnings: ParsingWarning[];
    private scanner: Scanner;


    public constructor(document: TextDocument) {
        this.errors = [];
        this.warnings = [];
        this.scanner = new Scanner(document);

        try {
            this.program = new Program(this.scanner);
        } catch (e) {
            if (e instanceof ParsingError) {
                this.errors.push(e);
            }
        }

        if (this.program) {

        }
    }

    public getProgram() {
        const program = this.program;
        return program;
    }

    public getErrors() {
        if (this.getProgram()) {
            return [...this.errors, ...this.getProgram()!.getErrors()];
        } else {
            return this.errors;
        }
    }

    public getWarnings() {
        if (this.getProgram()) {
            return [...this.warnings, ...this.getProgram()!.getWarnings()];
        } else {
            return this.warnings;
        }
    }

    public getCurrentToken(offset: number) {
        return this.scanner.getCurrentToken(offset);
    }

    public getCurrentWord(offset: number) {
        return this.scanner.getCurrentWord(offset);
    }

    public checkForUnderscoreWarnings() {
        const classAttributeNodes = this.getAllNodes().filter(n => n instanceof Attribute && n.name.text === 'class');

        for (const clsAttrNode of classAttributeNodes) {
            const clsAttr = clsAttrNode as Attribute;
            const str = clsAttr.value.contentText;
            let i = 0;

            while (i >= 0 && i < str.length) {
                const spaceIndex = str.indexOf(' ', i);

                const word = spaceIndex >= 0 ? str.substring(i, spaceIndex) : str.substring(i);

                if (!Underscore.IsEncodingSafe(word, true)) {
                    const start = clsAttr.value.getStart() + 1 + i;
                    this.warnings.push(new ParsingUnderscoreWarning(word, start, start + word.length))
                }

                i = spaceIndex >= 0 ? spaceIndex + 1 : spaceIndex;
            }
        }
    }

    private getAllNodes() {
        let nodes: Node[] = [];

        if (!this.program) {
            return nodes;
        }

        let checking: Node[] = [this.program];

        while (checking.length > 0) {
            const toCheck: Node[] = [];
            while (checking.length > 0) {
                const popped = checking.pop()!;
                nodes.push(popped);
                toCheck.push(...popped.getChildNodes());
            }
            checking.push(...toCheck);
        }

        return nodes;
    }
}