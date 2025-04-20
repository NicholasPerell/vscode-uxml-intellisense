export enum TokenType {
    NotDefined,
    DeclarationStart,
    DeclarationEnd,
    OpenAngle,
    CloseAngle,
    EndOpenAngle,
    EndCloseAngle,
    Alpha,
    Colon,
    Whitespace,
    Period,
    Equals,
    DoubleQuote,
    CanceledDoubleQuote,
    Slash,
    BackSlash,
    SlashDegage,
    Dash,
    CommentStart,
    CommentEnd,
    Version,
    Encoding,
    XmlNameSpace,
    Uxml,
}

export class TokenDef {
    private type: TokenType;
    private regex: RegExp;
    private precedence: number;

    public constructor(type: TokenType, regex: RegExp, precedence: number) {
        this.type = type;
        this.regex = new RegExp(regex, "y");
        this.precedence = precedence;
    }

    public GetType() {
        return this.type;
    }

    public GetPrecedence() {
        return this.precedence;
    }

    public TryMatch(content: string, index: number): Token | undefined {
        this.regex.lastIndex = index;

        const result = this.regex.exec(content);

        if (result) {
            return {
                type: this.type,
                offset: index,
                length: result[0].length,
                precedence: this.precedence
            };
        }
    }
}

export interface Token {
    type: TokenType;
    offset: number;
    length: number;
    precedence: number;
}