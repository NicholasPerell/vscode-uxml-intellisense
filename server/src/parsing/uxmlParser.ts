import { TextDocument } from "vscode-languageserver-textdocument";
import { Lexer } from "./uxmlLexer";
import { Token, TokenType } from "./uxmlTokens";
import { Range } from "vscode-languageserver";
import { ParsingError } from "./uxmlError";
import { Program } from "./uxmlNodes";
import { Scanner } from "./uxmlScanner";
import { off } from "process";

export class Parser {
    private readonly lexer = new Lexer();
    private program?: Program;
    private errors: ParsingError[];
    private scanner: Scanner;


    public constructor(document: TextDocument) {
        this.errors = [];
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

    public getCurrentToken(offset: number) {
        return this.scanner.getCurrentToken(offset);
    }

    public getCurrentWord(offset: number) {
        return this.scanner.getCurrentWord(offset);
    }
}