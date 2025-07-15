import { error } from "console";
import { ParsingError } from "./uxmlError";
import { Scanner, TrimOptions } from "./uxmlScanner";
import { Token, TokenType } from "./uxmlTokens";

export enum NodeType {
    Program,
    Declaration,
    Element,
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
    protected errors: ParsingError[] = [];

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

    getErrors(): ParsingError[] {
        const childNodes = this.getChildNodes().filter(n => !!n && n instanceof Node);
        const errors = childNodes.length > 0 ? childNodes.flatMap(n => n.getErrors()) : [];
        return [...this.errors, ...errors];
    }

    tryConstruct<Type extends Node>(ctor: new (arg0: Scanner) => Type, scanner: Scanner, panicModeResumers: { tokenType: TokenType, peeking: boolean }[]): Type | undefined {
        const result = scanner.tryParseOrPanicRecovery<Type>(() => new ctor(scanner), panicModeResumers);
        if (result instanceof ParsingError) {
            this.errors.push(result);
        } else {
            return result;
        }
    }

    public constructor(scanner: Scanner) {
    }
}

export class Program extends Node {
    type = NodeType.Program;
    declaration?: Declaration;
    root?: Element;
    nsEngine?: string;
    nsEngineNodes: Node[] = [];
    nsEditor?: string;

    public constructor(scanner: Scanner) {
        super(scanner);

        if (scanner.isAhead(TokenType.DeclarationStart)) {
            this.declaration = this.tryConstruct(Declaration, scanner, [
                { tokenType: TokenType.DeclarationEnd, peeking: false },
                { tokenType: TokenType.OpenAngle, peeking: true }
            ]);
        }

        this.root = this.tryConstruct(Element, scanner, []);
        this.evaluateRoot();
    }

    private evaluateRoot() {
        if (!this.root) {
            return;
        }

        const startElement = this.root.startElement;

        const rootName = startElement.name;
        const uxmlName = rootName.name;
        const uxmlNameSpace = rootName.namespace?.text ?? '';

        if (uxmlName !== 'UXML') {
            this.errors.push(new ParsingError('Root element must be a UXML', rootName.getStart(), rootName.getEnd()));
            return;
        }

        const attributes = startElement.attributes;
        const xmlns = attributes.filter(a => (a.name.namespace?.text === 'xmlns') || (!a.name.namespace && a.name.name === 'xmlns'));
        const engineNameSpaceAttribute = xmlns.find(a => a.value.contentText === 'UnityEngine.UIElements');
        if (!engineNameSpaceAttribute) {
            this.errors.push(new ParsingError('Can not find namespace for UnityEngine.UIElements', startElement.getEnd(), startElement.getEnd()));
            return;
        }
        const editorNameSpaceAttribute = xmlns.find(a => a.value.contentText === 'UnityEditor.UIElements');
        if (!editorNameSpaceAttribute) {
            this.errors.push(new ParsingError('Can not find namespace for UnityEditor.UIElements', startElement.getEnd(), startElement.getEnd()));
            return;
        }
        const schemaInstanceNameSpaceAttribute = xmlns.find(a => a.value.contentText === 'http://www.w3.org/2001/XMLSchema-instance');

        const engineNameSpace = engineNameSpaceAttribute?.name.namespace ? engineNameSpaceAttribute?.name.name : '';
        const editorNameSpace = editorNameSpaceAttribute?.name.namespace ? editorNameSpaceAttribute?.name.name : '';

        this.nsEngine = engineNameSpace;
        this.nsEditor = editorNameSpace;

        if (uxmlNameSpace !== engineNameSpace) {
            const node = rootName.namespace ?? rootName;
            this.errors.push(new ParsingError('UXML root does not have the correct namespace', node.getStart(), node.getEnd()))
            return;
        }

    }

    getStart(): number {
        return this.declaration?.getStart() ?? this.root?.getStart() ?? 0;
    }

    getEnd(): number {
        return this.root?.getEnd() ?? 0;
    }

    getChildNodes(): Node[] {
        return [this.declaration, this.root].filter(n => n !== undefined).map(n => n as Node);
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
            const matchError = scanner.tryOrPanicRecovery(() => scanner.nextMatch(TokenType.Whitespace, TrimOptions.End), [
                { tokenType: TokenType.Whitespace, peeking: false },
                { tokenType: TokenType.DeclarationEnd, peeking: true },
                { tokenType: TokenType.OpenAngle, peeking: true }
            ])

            if (matchError) {
                this.errors.push(matchError);
            }

            const attribute = this.tryConstruct(Attribute, scanner, [
                { tokenType: TokenType.Whitespace, peeking: false },
                { tokenType: TokenType.DeclarationEnd, peeking: true },
                { tokenType: TokenType.OpenAngle, peeking: true }
            ]);

            if (!attribute) {

            } else if (attribute.name.text === 'version') {
                version = attribute;
            } else if (attribute.name.text === 'encoding') {
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
    type = NodeType.Element;
    startElement: StartElement;
    content: Content[] = [];
    endElement: EndElement;

    public constructor(scanner: Scanner) {
        super(scanner);
        this.startElement = new StartElement(scanner);
        let node: Node | ParsingError | undefined;

        let unknownStart: Token | undefined;
        let unknownEnd: Token | undefined;

        do {
            if (scanner.isAheadSomeTrimmed([TokenType.CommentStart, TokenType.OpenAngle, TokenType.EndOpenAngle])) {
                if (unknownStart) {
                    node = scanner.getParsingErrorBetweenTokens('Unknown Contents', unknownStart, unknownEnd!);
                    this.errors.push(node);
                    unknownStart = undefined;
                    unknownEnd = undefined;
                }

                const peek = scanner.aheadTrimmed();
                scanner.trim();

                switch (peek.type) {
                    case TokenType.CommentStart:
                        node = scanner.tryParseOrPanicRecovery(() => new Comment(scanner), [
                            { tokenType: TokenType.CommentEnd, peeking: false }
                        ]);
                        break;
                    case TokenType.OpenAngle:
                        node = scanner.tryParsersOrPanicRecovery([() => new LeafElement(scanner), () => new Element(scanner)], [
                            { tokenType: TokenType.CommentStart, peeking: true },
                            { tokenType: TokenType.CloseAngle, peeking: false },
                            { tokenType: TokenType.EndOpenAngle, peeking: true },
                            { tokenType: TokenType.OpenAngle, peeking: true }
                        ]);
                        if (node instanceof ParsingError) {
                            scanner.retreatTo(scanner.current());
                        }
                        break;
                    case TokenType.EndOpenAngle:
                        node = scanner.tryParseOrPanicRecovery(() => new EndElement(scanner), [
                            { tokenType: TokenType.CommentStart, peeking: true },
                            { tokenType: TokenType.EndOpenAngle, peeking: true },
                            { tokenType: TokenType.OpenAngle, peeking: true }
                        ]);
                        break;
                }

                if (node instanceof Content) {
                    this.content.push(node);
                } else if (node instanceof ParsingError) {
                    this.errors.push(node)
                }
            } else {
                if (!unknownStart) {
                    unknownStart = scanner.aheadTrimmed();
                }
                unknownEnd = scanner.aheadTrimmed();
                const t = scanner.next();
            }
        } while ((!node || node instanceof ParsingError || node instanceof Content) && !scanner.isEndOfFile());


        if (node instanceof EndElement) {
            this.endElement = node as EndElement;
            if (this.endElement.name.text !== this.startElement.name.text) {
                scanner.retreatTo(this.endElement.start);
                scanner.throwParsingErrorBetweenOffsets(`Expected EndElement for ${this.startElement.name.text}.`, this.endElement.name.getStart(), this.endElement.name.getEnd());
            }
        } else {
            throw scanner.getParsingErrorAtCurrentIndex(`EndElement for ${this.startElement.name.text} not found.`);
        }
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
            const matchError = scanner.tryOrPanicRecovery(() => scanner.nextMatch(TokenType.Whitespace, TrimOptions.End), [
                { tokenType: TokenType.Whitespace, peeking: false },
                { tokenType: TokenType.EndCloseAngle, peeking: true },
                { tokenType: TokenType.EndOpenAngle, peeking: true },
                { tokenType: TokenType.OpenAngle, peeking: true }
            ])

            if (matchError) {
                this.errors.push(matchError);
                if (scanner.isAheadSome([TokenType.OpenAngle, TokenType.EndOpenAngle])) {
                    scanner.throwParsingErrorAtToken('LeafElement can not handle an open angle bracket inside its scope.', scanner.ahead());
                }
            }

            const attribute = this.tryConstruct(Attribute, scanner, [
                { tokenType: TokenType.Whitespace, peeking: true },
                { tokenType: TokenType.EndCloseAngle, peeking: true },
                { tokenType: TokenType.EndOpenAngle, peeking: true },
                { tokenType: TokenType.OpenAngle, peeking: true }
            ]);
            if (attribute) {
                this.attributes.push(attribute);
            } else if (scanner.isAheadSome([TokenType.OpenAngle, TokenType.EndOpenAngle])) {
                scanner.throwParsingErrorAtToken('LeafElement can not handle an open angle bracket inside its scope.', scanner.ahead());
            }
            scanner.nextMatch(TokenType.Whitespace, TrimOptions.End);
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
            const matchError = scanner.tryOrPanicRecovery(() => scanner.nextMatch(TokenType.Whitespace, TrimOptions.End), [
                { tokenType: TokenType.Whitespace, peeking: false },
                { tokenType: TokenType.CloseAngle, peeking: true },
                { tokenType: TokenType.EndOpenAngle, peeking: true },
                { tokenType: TokenType.OpenAngle, peeking: true }
            ])

            if (matchError) {
                if (scanner.isAheadSome([TokenType.OpenAngle, TokenType.EndOpenAngle])) {
                    scanner.throwParsingErrorAtToken('StartElement can not handle an open angle bracket inside its scope.', scanner.ahead());
                }
                this.errors.push(matchError);
            }

            const attribute = this.tryConstruct(Attribute, scanner, [
                { tokenType: TokenType.Whitespace, peeking: false },
                { tokenType: TokenType.CloseAngle, peeking: true },
                { tokenType: TokenType.EndOpenAngle, peeking: true },
                { tokenType: TokenType.OpenAngle, peeking: true }
            ]);

            if (attribute) {
                this.attributes.push(attribute);
            } else if (scanner.isAheadSome([TokenType.OpenAngle, TokenType.EndOpenAngle])) {
                scanner.throwParsingErrorAtToken('StartElement can not handle an open angle bracket inside its scope.', scanner.ahead());
            }

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