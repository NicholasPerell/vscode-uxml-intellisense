import { TextDocument } from "vscode-languageserver-textdocument";
import { Lexer } from "./uxmlLexer";
import { Token, TokenType } from "./uxmlTokens";
import { Range } from "vscode-languageserver";
import { ParsingError } from "./uxmlError";
import { Node } from "./uxmlNodes";

export enum TrimOptions {
    None,
    Start,
    End,
    Both
}

export class Scanner {
    private readonly lexer = new Lexer();
    private tokens: Token[] = [];
    private document: TextDocument;
    private index = 0;
    private last;

    public retreatTo(token: Token) {
        const findIndex = this.tokens.indexOf(token);
        if (findIndex >= 0) {
            this.index = findIndex;
        }
    }

    public isEndOfFile() {
        return this.index >= this.tokens.length
            || this.tokens.slice(this.index, this.tokens.length).every(t => t.type === TokenType.Whitespace);
    }

    public trim() {
        while (this.index < this.tokens.length && this.ahead().type == TokenType.Whitespace) {
            this.index++;
        }
    }

    public ahead() {
        if (this.index >= this.tokens.length) {
            this.throwParsingErrorAtCurrentIndex("Reached end of file while expecting another token ahead");
        }

        return this.tokens[this.index];
    }

    public current() {
        if (this.index - 1 >= this.tokens.length) {
            this.throwParsingErrorAtCurrentIndex("Reached end of file while expecting another token ahead");
        }

        return this.tokens[this.index - 1];
    }

    public aheadTrimmed() {
        const index = this.index;

        while (this.isAhead(TokenType.Whitespace)) {
            this.next();
        }

        const result = this.ahead();
        this.index = index;
        return result;
    }

    public isAhead(type: TokenType) {
        return this.ahead().type === type;
    }

    public isAheadTrimmed(type: TokenType) {
        return this.aheadTrimmed().type === type;
    }

    public isAheadSome(types: TokenType[]) {
        const aheadType = this.ahead().type;
        return types.some(t => t === aheadType);
    }

    public isAheadSomeTrimmed(types: TokenType[]) {
        const aheadType = this.aheadTrimmed().type;
        return types.some(t => t === aheadType);
    }

    public next() {
        if (this.index >= this.tokens.length) {
            this.throwParsingErrorAtCurrentIndex("Reached end of file while expecting another token next");
        }

        const prev = this.tokens[this.index];
        this.index++;
        return prev;
    }

    public nextMatch(type: TokenType, trim?: TrimOptions) {
        if (trim === TrimOptions.Both || trim === TrimOptions.Start) {
            this.trim();
        }

        if (this.index >= this.tokens.length) {
            this.throwParsingErrorAtCurrentIndex(`Reached end of file while expecting another token next ${TokenType[type]}`);
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

    public nextMatchSome(types: TokenType[]) {
        if (this.index >= this.tokens.length) {
            this.throwParsingErrorAtCurrentIndex(`Reached end of file while expecting another token next [${types.map(t => TokenType[t]).join(', ')}]`);
        }

        const prev = this.tokens[this.index];

        if (!types.some(t => t === prev.type)) {
            this.throwParsingErrorAtToken(`Token type not found! Was expecting any of [${types.map(t => TokenType[t]).join(', ')}] but found ${TokenType[prev.type]} in '${this.getTokenText(prev)}' instead.`, prev);
        }

        this.index++;
        return prev;
    }

    public constructor(document: TextDocument) {
        this.document = document;
        this.tokens = this.lexer.tokenize(document);
        this.last = document.getText().length - 1;
    }

    public tryParse(parsers: Array<() => Node>): Node {
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

    public tryParsersOrPanicRecovery(parsers: Array<() => Node>, panicModeResumers: { tokenType: TokenType, peeking: boolean }[]): Node | ParsingError {
        const mark = this.index;

        let parsingErrorRtn: ParsingError | undefined;
        let continueFrom: number | undefined;

        for (const parse of parsers) {
            const result = this.tryParseOrPanicRecovery(parse, panicModeResumers);

            if (result instanceof Node) {
                return result;
            } else if (!continueFrom || continueFrom >= this.index) {
                parsingErrorRtn = result;
                continueFrom = this.index;
            }

            this.index = mark;
        }

        if (parsingErrorRtn && continueFrom) {
            this.index = continueFrom;
            return parsingErrorRtn;
        }

        throw 'Unexpected ending to tryParsersOrPanicRecovery reached!';
    }

    public tryParseOrPanicRecovery<T extends Node>(parse: () => T, panicModeResumers: { tokenType: TokenType, peeking: boolean }[]): T | ParsingError {
        try {
            return parse();
        } catch (error) {
            let parsingError: ParsingError;

            if (error instanceof ParsingError) {
                parsingError = error;
            } else {
                const current = this.tokens[this.index];
                const pos = this.document!.positionAt(current.offset);
                const message = `[Unexpected] (Ln ${pos.line + 1}, Col ${pos.character + 1}) ${error} ${(error as Error)?.stack}`;
                parsingError = new ParsingError(message, current.offset, current.offset + current.length);
            }

            while (!this.isEndOfFile()) {
                const peeked = this.ahead();
                const resumer = panicModeResumers.find(resumer => resumer.tokenType === peeked.type);

                if (!resumer || !resumer.peeking) {
                    this.next();
                }

                if (resumer) {
                    break;
                }
            }

            return parsingError;
        }
    }

    public tryOrPanicRecovery(func: () => void, panicModeResumers: { tokenType: TokenType, peeking: boolean }[]): undefined | ParsingError {
        try {
            func();
        } catch (error) {
            let parsingError: ParsingError;

            if (error instanceof ParsingError) {
                parsingError = error;
            } else {
                const current = this.tokens[this.index];
                const pos = this.document!.positionAt(current.offset);
                const message = `[Unexpected] (Ln ${pos.line + 1}, Col ${pos.character + 1}) ${error} ${(error as Error)?.stack}`;
                parsingError = new ParsingError(message, current.offset, current.offset + current.length);
            }

            while (!this.isEndOfFile()) {
                const peeked = this.ahead();
                const resumer = panicModeResumers.find(resumer => resumer.tokenType === peeked.type);

                if (!resumer || !resumer.peeking) {
                    this.next();
                }

                if (resumer) {
                    break;
                }
            }

            return parsingError;
        }
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

    public getTextRange(startToken: Token, endToken: Token) {
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

    public throwParsingErrorBetweenTokens(message: string, startToken: Token, endToken: Token) {
        throw this.getParsingErrorBetweenTokens(message, startToken, endToken);
    }

    public getParsingErrorBetweenTokens(message: string, startToken: Token, endToken: Token) {
        const pos = this.document!.positionAt(startToken.offset);
        message = `(Ln ${pos.line + 1}, Col ${pos.character + 1}) ${message}`;
        return new ParsingError(message, startToken.offset, endToken.offset + endToken.length);
    }

    public throwParsingErrorAtToken(message: string, token: Token) {
        const pos = this.document!.positionAt(token.offset);
        message = `(Ln ${pos.line + 1}, Col ${pos.character + 1}) ${message}`;
        throw new ParsingError(message, token.offset, token.offset + token.length);
    }

    public throwParsingErrorAtCurrentIndex(message: string) {
        throw this.getParsingErrorAtCurrentIndex(message);
    }

    public getParsingErrorAtCurrentIndex(message: string) {
        const offset = this.index < this.tokens.length
            ? this.tokens[this.index].offset
            : this.last;

        const pos = this.document!.positionAt(offset);
        message = `(Ln ${pos.line + 1}, Col ${pos.character + 1}) ${message}`;
        throw new ParsingError(message, offset, offset);
    }

    public throwParsingErrorBetweenOffsets(message: string, start: number, end: number) {
        throw this.getParsingErrorBetweenOffsets(message, start, end);
    }

    public getParsingErrorBetweenOffsets(message: string, start: number, end: number) {
        const pos = this.document!.positionAt(start);
        message = `(Ln ${pos.line + 1}, Col ${pos.character + 1}) ${message}`;
        return new ParsingError(message, start, end);
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