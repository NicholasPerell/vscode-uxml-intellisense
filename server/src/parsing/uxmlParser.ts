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
    private tokens: Token[] = [];
    private document: TextDocument;
    private index = 0;
    private program: Program;
    private errors: ParsingError[];

    private isEndOfFile() {
        return this.index >= this.tokens.length
            || this.tokens.slice(this.index, this.tokens.length).every(t => t.type === TokenType.Whitespace);
    }

    private trim() {
        while (this.index < this.tokens.length && this.ahead().type == TokenType.Whitespace) {
            this.index++;
        }
    }

    private ahead() {
        if (this.index >= this.tokens.length) {
            this.throwParsingErrorAtCurrentIndex("Reached end of file while expecting another token ahead");
        }

        return this.tokens[this.index];
    }

    private isAhead(type: TokenType) {
        return this.ahead().type === type;
    }

    private isAheadSome(types: TokenType[]) {
        const aheadType = this.ahead().type;
        return types.some(t => t === aheadType);
    }

    private next() {
        if (this.index >= this.tokens.length) {
            this.throwParsingErrorAtCurrentIndex("Reached end of file while expecting another token next");
        }

        const prev = this.tokens[this.index];
        this.index++;
        return prev;
    }

    private nextMatch(type: TokenType, trim?: TrimOptions) {
        if (trim === TrimOptions.Both || trim === TrimOptions.Start) {
            this.trim();
        }

        const prev = this.next();

        if (prev.type !== type) {
            this.throwParsingErrorAtToken(`Token type not found! Was expecting ${TokenType[type]} but found ${TokenType[prev.type]} in '${this.getTokenText(prev)}' instead.`, prev);
        }

        if (trim === TrimOptions.Both || trim === TrimOptions.End) {
            this.trim();
        }

        return prev;
    }

    private nextMatchSome(types: TokenType[]) {
        const prev = this.tokens[this.index];

        if (!types.some(t => t === prev.type)) {
            this.throwParsingErrorAtToken(`Token type not found! Was expecting any of [${types.map(t => TokenType[t]).join(', ')}] but found ${TokenType[prev.type]} in '${this.getTokenText(prev)}' instead.`, prev);
        }

        this.index++;
        return prev;
    }

    public constructor(document: TextDocument) {
        this.document = document;
        this.errors = [];
        this.tokens = this.lexer.tokenize(document);

        this.program = new Program(new Scanner(document));
    }

    public getProgram() {
        const program = this.program;
        return program;
    }

    public getErrors() {
        const errors = this.errors;
        return errors;
    }



    private tryParse(parsers: Array<() => Node>): Node {
        const mark = this.index;

        let parsingError: ParsingError | undefined;

        for (const parse of parsers) {
            try {
                return parse();
            } catch (error) {
                if (error instanceof ParsingError) {
                    if (parsingError === undefined ||
                        parsingError.startOffset < error.startOffset
                    ) {
                        parsingError = error;
                    }
                } else {
                    const current = this.tokens[this.index];

                    if (parsingError === undefined ||
                        parsingError.startOffset < current.offset
                    ) {
                        const pos = this.document!.positionAt(current.offset);
                        const message = `[Unexpected] (Ln ${pos.line + 1}, Col ${pos.character + 1}) ${error} ${(error as Error)?.stack}`;
                        parsingError = new ParsingError(message, current.offset, current.offset + current.length);
                    }
                }

                this.index = mark;
            }
        }

        throw parsingError;
    }

    public getTokenText(token: Token) {
        try {
            const startPos = this.document!.positionAt(token.offset);
            const endPos = this.document!.positionAt(token.offset + token.length);
            const range: Range = { start: startPos, end: endPos };

            return this.document!.getText(range);
        } catch {
            this.throwParsingErrorAtCurrentIndex("getText failed");
            return "";
        }
    }

    private getTextRange(startToken: Token, endToken: Token) {
        try {
            const startPos = this.document!.positionAt(startToken.offset);
            const endPos = this.document!.positionAt(endToken.offset + endToken.length);
            const range: Range = { start: startPos, end: endPos };

            return this.document!.getText(range);
        }
        catch {
            this.throwParsingErrorAtCurrentIndex("getTextRange failed");
            return "";
        }
    }

    public getNodeRange(node: Node): Range {
        const startPos = this.document!.positionAt(node.getStart());
        const endPos = this.document!.positionAt(node.getEnd());
        return { start: startPos, end: endPos };
    }

    public getNodeText(node: Node) {
        return this.document!.getText(this.getNodeRange(node));
    }

    private throwParsingErrorBetweenTokens(message: string, startToken: Token, endToken: Token) {
        const pos = this.document!.positionAt(startToken.offset);
        message = `(Ln ${pos.line + 1}, Col ${pos.character + 1}) ${message}`;
        throw new ParsingError(message, startToken.offset, endToken.offset + endToken.length);
    }

    private throwParsingErrorAtToken(message: string, token: Token) {
        const pos = this.document!.positionAt(token.offset);
        message = `(Ln ${pos.line + 1}, Col ${pos.character + 1}) ${message}`;
        throw new ParsingError(message, token.offset, token.offset + token.length);
    }

    private throwParsingErrorAtCurrentIndex(message: string) {
        const offset = this.index < this.tokens.length
            ? this.tokens[this.index].offset
            : this.tokens[this.tokens.length - 1].offset + this.tokens.length - 1;

        const pos = this.document!.positionAt(offset);
        message = `(Ln ${pos.line + 1}, Col ${pos.character + 1}) ${message}`;
        throw new ParsingError(message, offset, offset);
    }

    public getCurrentToken(offset: number) {
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            if (token.offset <= offset && token.offset + token.length > offset) {
                return token;
            }
        }
    }

    public getCurrentWord(offset: number) {
        const text = this.document.getText();

        let i = offset - 1;
        while (i >= 0 && i < text.length && text.charAt(i).match(/[a-zA-Z0-9-_]/)) {
            i--;
        }

        return text.substring(i + 1, offset);
    }
}