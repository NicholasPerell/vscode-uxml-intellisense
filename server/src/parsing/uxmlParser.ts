import { TextDocument } from "vscode-languageserver-textdocument";
import { Lexer } from "./uxmlLexer";
import { Token, TokenType } from "./uxmlTokens";
import { Range } from "vscode-languageserver";
import { ParsingError } from "./uxmlError";
import { Attribute, AttributeValue, Declaration, Node, Program } from "./uxmlNodes";
import { Scanner } from "./uxmlScanner";

enum TrimOptions {
    None,
    Start,
    End,
    Both
}

export class Parser {
    private readonly lexer = new Lexer();
    private program?: Program;
    private errors: ParsingError[];

    public constructor(document: TextDocument) {
        this.errors = [];
        const scanner = new Scanner(document);

        try {
            this.program = new Program(scanner);
        } catch (e) {
            if (e instanceof ParsingError)
                this.errors = [e];
        }
    }

    public getProgram() {
        const program = this.program;
        return program;
    }

    public getErrors() {
        const errors = this.errors;
        return errors;
    }
}