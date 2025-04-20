import { Scanner, TrimOptions } from "./uxmlScanner";
import { Token, TokenType } from "./uxmlTokens";

export enum NodeType {
    Program,
    Declaration,
    Root,
    Element,
    Content,
    Comment,
    Namespace,
    Name,
    Attribute,
    AttributeName,
    AttributeValue,
    LeafElement,
    StartElement,
    EndElement
}

export abstract class Node {
    public readonly abstract type: NodeType;

    abstract getStart(): number;
    abstract getEnd(): number;
    abstract getChildNodes(): Node[];

    addIfEncasing(offset: number): Node[] {
        const start = this.getStart();
        const end = this.getEnd();
        const children = this.getChildNodes();

        let encasing: Node[] = [];
        if (start <= offset && end >= offset) {
            for (let i = 0; i < children.length; i++) {
                encasing = encasing.concat(children[i].addIfEncasing(offset));
            }

            encasing.push(this);
        }

        return encasing;
    }

    public constructor(scanner: Scanner) {
    }
}

export class Program extends Node {
    type = NodeType.Program;
    declaration?: Declaration;
    root: Element;

    public constructor(scanner: Scanner) {
        super(scanner);

        if (scanner.isAhead(TokenType.DeclarationStart)) {
            this.declaration = new Declaration(scanner);
        }

        this.root = new Element(scanner);
    }

    getStart(): number {
        return this.declaration ? this.declaration.getStart() : this.root.getStart();
    }

    getEnd(): number {
        return this.root.getEnd();
    }

    getChildNodes(): Node[] {
        return this.declaration ? [this.declaration, this.root] : [this.root];
    }
}

export class Declaration extends Node {
    type = NodeType.Declaration;
    open: Token;
    version: Attribute;
    encoding?: Attribute;
    close: Token;

    public constructor(scanner: Scanner) {
        super(scanner);
        this.open = scanner.nextMatch(TokenType.DeclarationStart, TrimOptions.Start);
        let peeked = scanner.aheadTrimmed();
        let version;

        while (peeked.type !== TokenType.DeclarationEnd) {
            scanner.nextMatch(TokenType.Whitespace, TrimOptions.End);
            const attribute = new Attribute(scanner);

            if (attribute.name.text === 'version') {
                version = attribute;
            }
            else if (attribute.name.text === 'encoding') {
                this.encoding = attribute;
            } else {
                scanner.throwParsingErrorBetweenOffsets(`Declarations do not recognize a \'${attribute.name.text}\' attribute.`, attribute.getStart(), attribute.getEnd());
            }

            peeked = scanner.aheadTrimmed();
        }

        this.close = scanner.nextMatch(TokenType.DeclarationEnd, TrimOptions.Start);

        if (!version) {
            scanner.throwParsingErrorBetweenTokens('Declarations require a \'version\' attribute.', this.open, this.close);
            throw 'Declarations require a \'version\' attribute.';
        }

        this.version = version;
    }

    getStart(): number {
        return this.open.offset;
    }

    getEnd(): number {
        return this.close.offset + this.close.length;
    }

    getChildNodes(): Node[] {
        return this.encoding
            ? [this.version, this.encoding]
            : [this.version];
    }
}

export abstract class Content extends Node {
}

export class Element extends Content {
    type = NodeType.Root;
    startElement: StartElement;
    content: Content[] = [];
    endElement: EndElement;

    public constructor(scanner: Scanner) {
        super(scanner);
        this.startElement = new StartElement(scanner);
        let node: Node;

        do {
            node = scanner.tryParse([
                () => new Comment(scanner),
                () => new LeafElement(scanner),
                () => new Element(scanner),
                () => new EndElement(scanner),
            ]);

            if (node instanceof Content) {
                this.content.push(node);
            }
        } while (node instanceof Content);

        this.endElement = node as EndElement;
    }

    getStart(): number {
        return this.startElement.getStart();
    }

    getEnd(): number {
        return this.endElement.getEnd();
    }

    getChildNodes(): Node[] {
        return [this.startElement, ...this.content, this.endElement];
    }
}

export class Comment extends Content {
    type = NodeType.Comment;
    start: Token;
    end: Token;

    public constructor(scanner: Scanner) {
        super(scanner);
        this.start = scanner.nextMatch(TokenType.CommentStart, TrimOptions.Start);

        if (!scanner.isAhead(TokenType.CommentEnd)) {
            const firstToken = scanner.next();
            if (firstToken.type === TokenType.Dash) {
                scanner.throwParsingErrorBetweenTokens('Can not have a dash directly following the Comment Start indicator.', this.start, firstToken);
            }

            let hasDash = false;
            let current: Token;

            while (!scanner.isAhead(TokenType.CommentEnd)) {
                if (scanner.isAhead(TokenType.Dash)) {
                    if (hasDash) {
                        scanner.throwParsingErrorBetweenTokens('\'--\' are not allowed in UXML comments.', current!, scanner.ahead());
                    }
                    else {
                        hasDash = true;
                    }
                }
                else {
                    hasDash = false;
                }

                current = scanner.next();
            }

            if (hasDash) {
                scanner.throwParsingErrorBetweenTokens('Can not have a dash directly before the Comment End indicator.', current!, scanner.ahead());
            }
        }

        this.end = scanner.nextMatch(TokenType.CommentEnd);
    }

    getStart(): number {
        return this.start.offset;
    }

    getEnd(): number {
        return this.end.offset + this.end.length;
    }

    getChildNodes(): Node[] {
        return [];
    }
}

export class Name extends Node {
    type = NodeType.Name;
    namespace?: Namespace;
    contents: Token[];
    name: string;
    text: string;

    public constructor(scanner: Scanner) {
        super(scanner);
        const attrNameStartTokens = [TokenType.Alpha, TokenType.Uxml, TokenType.Version, TokenType.Encoding, TokenType.XmlNameSpace];
        const attrNameTokens = [...attrNameStartTokens, TokenType.Dash, TokenType.Period, TokenType.Colon];
        this.contents = [scanner.nextMatchSome(attrNameStartTokens)];
        const start = this.contents[0];

        while (scanner.isAheadSome(attrNameTokens)) {
            if (scanner.isAhead(TokenType.Colon) && !this.namespace) {
                scanner.next();
                this.namespace = new Namespace(scanner, this.contents);
                this.contents = [scanner.nextMatchSome(attrNameStartTokens)];

                if (!scanner.isAheadSome(attrNameTokens)) {
                    break;
                }
            }

            this.contents.push(scanner.next());
        }

        this.name = scanner.getTextRange(this.contents[0], this.contents[this.contents.length - 1]);
        this.text = scanner.getTextRange(start, this.contents[this.contents.length - 1]);
    }

    getStart(): number {
        return this.namespace ? this.namespace.getStart() : this.contents[0].offset;
    }

    getEnd(): number {
        const last = this.contents[this.contents.length - 1];
        return last.offset + last.length;
    }

    getChildNodes(): Node[] {
        return this.namespace ? [this.namespace] : [];
    }
}

export class Attribute extends Node {
    type = NodeType.Attribute;
    name: Name;
    value: AttributeValue;

    public constructor(scanner: Scanner) {
        super(scanner);
        this.name = new Name(scanner);
        scanner.nextMatch(TokenType.Equals, TrimOptions.Both);
        this.value = new AttributeValue(scanner);
    }

    getStart(): number {
        return this.name.getStart();
    }

    getEnd(): number {
        return this.value.getEnd();
    }

    getChildNodes(): Node[] {
        return [this.name, this.value];
    }
}

export class Namespace extends Node {
    type = NodeType.Namespace;
    contents: Token[];
    text: string;

    public constructor(scanner: Scanner, contents: Token[]) {
        super(scanner);
        this.contents = [...contents];
        this.text = scanner.getTextRange(contents[0], contents[contents.length - 1]);
    }

    getStart(): number {
        return this.contents[0].offset;
    }

    getEnd(): number {
        const last = this.contents[this.contents.length - 1];
        return last.offset + last.length;
    }

    getChildNodes(): Node[] {
        return [];
    }
}

export class AttributeValue extends Node {
    type = NodeType.AttributeValue;
    openQuote: Token;
    content: Token[];
    closeQuote: Token;
    contentText: string;

    public constructor(scanner: Scanner) {
        super(scanner);
        this.openQuote = scanner.nextMatch(TokenType.DoubleQuote);
        this.content = [];
        let peeked = scanner.ahead();

        while (peeked.type !== TokenType.DoubleQuote) {
            this.content.push(scanner.next());

            if (scanner.isEndOfFile()) {
                scanner.throwParsingErrorAtCurrentIndex("Reached end of file while expecting `\"`.");
            }

            peeked = scanner.ahead();
        }

        this.closeQuote = scanner.nextMatch(TokenType.DoubleQuote);
        this.contentText = this.content.length > 0
            ? scanner.getTextRange(this.content[0], this.content[this.content.length - 1])
            : '';
    }

    getStart(): number {
        return this.openQuote.offset;
    }

    getEnd(): number {
        return this.closeQuote.length + this.closeQuote.offset;
    }

    getChildNodes(): Node[] {
        return [];
    }
}

export class LeafElement extends Content {
    type = NodeType.LeafElement;
    start: Token;
    name: Name;
    attributes: Attribute[];
    end: Token;

    public constructor(scanner: Scanner) {
        super(scanner);
        this.start = scanner.nextMatch(TokenType.OpenAngle, TrimOptions.Both);
        this.name = new Name(scanner);
        this.attributes = [];
        let peeked = scanner.aheadTrimmed();

        while (peeked.type !== TokenType.EndCloseAngle) {
            scanner.nextMatch(TokenType.Whitespace, TrimOptions.End);
            this.attributes.push(new Attribute(scanner));
            peeked = scanner.aheadTrimmed();
        }

        this.end = scanner.nextMatch(TokenType.EndCloseAngle, TrimOptions.Both);
    }

    getStart(): number {
        return this.start.offset;
    }

    getEnd(): number {
        return this.end.offset + this.end.length;
    }

    getChildNodes(): Node[] {
        return [this.name, ...this.attributes];
    }
}

export class StartElement extends Node {
    type = NodeType.StartElement;
    start: Token;
    name: Name;
    attributes: Attribute[];
    end: Token;

    public constructor(scanner: Scanner) {
        super(scanner);
        this.start = scanner.nextMatch(TokenType.OpenAngle, TrimOptions.Both);
        this.name = new Name(scanner);
        this.attributes = [];
        let peeked = scanner.aheadTrimmed();

        while (peeked.type !== TokenType.CloseAngle) {
            scanner.nextMatch(TokenType.Whitespace, TrimOptions.End);
            this.attributes.push(new Attribute(scanner));
            peeked = scanner.aheadTrimmed();
        }

        this.end = scanner.nextMatch(TokenType.CloseAngle, TrimOptions.Both);
    }

    getStart(): number {
        return this.start.offset;
    }

    getEnd(): number {
        return this.end.offset + this.end.length;
    }

    getChildNodes(): Node[] {
        return [this.name, ...this.attributes];
    }
}


export class EndElement extends Node {
    type = NodeType.EndElement;
    start: Token;
    name: Name;
    end: Token;

    public constructor(scanner: Scanner) {
        super(scanner);
        this.start = scanner.nextMatch(TokenType.EndOpenAngle, TrimOptions.Both);
        this.name = new Name(scanner);
        this.end = scanner.nextMatch(TokenType.CloseAngle, TrimOptions.Both);
    }

    getStart(): number {
        return this.start.offset;
    }

    getEnd(): number {
        return this.end.offset + this.end.length;
    }

    getChildNodes(): Node[] {
        return [this.name];
    }
}