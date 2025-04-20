import { TextDocument } from "vscode-languageserver-textdocument";
import { Token, TokenDef, TokenType } from "./uxmlTokens";

export class Lexer {
    private readonly tokenDefs: TokenDef[] = [
        new TokenDef(TokenType.DeclarationStart, /<\?xml\b/, 0),
        new TokenDef(TokenType.DeclarationEnd, /\?>/, 0),
        new TokenDef(TokenType.OpenAngle, /</, 0),
        new TokenDef(TokenType.CloseAngle, />/, 0),
        new TokenDef(TokenType.EndOpenAngle, /<\//, 0),
        new TokenDef(TokenType.EndCloseAngle, /\/>/, 0),
        new TokenDef(TokenType.Alpha, /[a-zA-Z]+/, 0),
        new TokenDef(TokenType.Colon, /:/, 0),
        new TokenDef(TokenType.Whitespace, /\s+/, 0),
        new TokenDef(TokenType.Period, /\./, 0),
        new TokenDef(TokenType.Equals, /=/, 0),
        new TokenDef(TokenType.DoubleQuote, /"/, 0),
        new TokenDef(TokenType.CanceledDoubleQuote, /\\"/, 0),
        new TokenDef(TokenType.Slash, /\//, 0),
        new TokenDef(TokenType.BackSlash, /\\/, 0),
        new TokenDef(TokenType.SlashDegage, /\\\\/, 0),
        new TokenDef(TokenType.Dash, /-/, 0),
        new TokenDef(TokenType.CommentStart, /<!--/, 0),
        new TokenDef(TokenType.CommentEnd, /-->/, 0),
        new TokenDef(TokenType.Version, /\bversion\b/, 1),
        new TokenDef(TokenType.Encoding, /\bencoding\b/, 1),
        new TokenDef(TokenType.XmlNameSpace, /\bxmlns\b/, 1),
        new TokenDef(TokenType.Uxml, /\bUXML\b/, 1),
    ]

    public tokenize(document: TextDocument) {
        const content = document.getText();
        const length = content.length;

        let tokens: Token[] = [];

        let index = 0;
        let offsetStartUnrecognized = 0;

        while (index < length) {
            let token: Token | undefined;

            for (let defIndex = 0; defIndex < this.tokenDefs.length; defIndex++) {
                if (token && token.precedence > this.tokenDefs[defIndex].GetPrecedence()) {
                    break;
                }

                const match = this.tokenDefs[defIndex].TryMatch(content, index);

                if (match) {
                    if (!token || token.precedence < match.precedence || token.length < match.length) {
                        token = match;
                    }
                }
            }

            if (token) {
                if (index > offsetStartUnrecognized) {
                    tokens.push({
                        type: TokenType.NotDefined,
                        offset: offsetStartUnrecognized,
                        length: index - offsetStartUnrecognized,
                        precedence: 0
                    });
                }

                tokens.push(token);
                index += Math.max(token.length, 1);
                offsetStartUnrecognized = index;
            } else {
                index++;
            }
        }

        if (index > offsetStartUnrecognized) {
            tokens.push({
                type: TokenType.NotDefined,
                offset: offsetStartUnrecognized,
                length: index - offsetStartUnrecognized,
                precedence: 0
            });
        }

        return tokens;
    }
}