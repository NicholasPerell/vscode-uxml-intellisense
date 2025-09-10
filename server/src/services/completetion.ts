import { Position, CompletionList, CompletionItem, CompletionItemKind, TextEdit, InsertTextFormat, Color, CompletionContext } from "vscode-languageserver";
import { Attribute, AttributeValue, Element, EndElement, LeafElement, Name, Node, NodeType, Program, StartElement } from "../parsing/uxmlNodes";
import { Scanner } from "../parsing/uxmlScanner";
import { Range, TextDocument } from "vscode-languageserver-textdocument";
import { Token } from "../parsing/uxmlTokens";
import { documents } from "../server";
import { defaultTheme, StringDict, ThemeRenameRecs, NestedStringDict, FontSizeDict } from "../twFacts/themeAutoCompletes";
import { Unity } from "../util/unityNav";

export function doCompletion(document: TextDocument, position: Position, context: CompletionContext, info: (s: string) => void): CompletionList {
    const cmp = new Completion(document, position, context, info);
    return cmp.getResult();
}

class Completion {
    private document: TextDocument;
    private position: Position;
    private context: CompletionContext;
    private info: (s: string) => void;
    private scanner: Scanner;
    private program: Program;
    private offset: number;
    private currentWord: string;
    private nsEngine?: string;
    private nsEditor?: string;
    private currentToken?: Token;
    private range: Range;
    private encases: Node[];
    private currentNode: Node;
    private result: CompletionList;
    private fullText: string;
    private underScoreEncoding: boolean;
    private hasTwStyle: boolean;
    private unityRoot?: string;
    private theme?: any;

    public constructor(document: TextDocument, position: Position, context: CompletionContext, info: (s: string) => void) {
        this.document = document;
        this.position = position;
        this.context = context;
        this.info = info;

        this.scanner = new Scanner(document);
        this.program = new Program(this.scanner);
        this.offset = document.offsetAt(position);
        this.fullText = document.getText();
        this.currentWord = this.scanner.getCurrentWord(this.offset);
        this.currentToken = this.scanner.getCurrentToken(this.offset);
        this.range = { start: document.positionAt(this.offset - this.currentWord.length), end: position };
        this.encases = this.program.addIfEncasing(this.offset);
        this.currentNode = this.encases[0];
        const currentNode = this.currentNode;

        this.result = {
            isIncomplete: false,
            itemDefaults: {
                editRange: {
                    start: { line: position.line, character: position.character - this.currentWord.length },
                    end: position
                }
            },
            items: []
        };

        this.underScoreEncoding = false;
        this.hasTwStyle = false;
        this.determineTwUsage();

        this.nsEngine = this.program.nsEngine;
        this.nsEditor = this.program.nsEditor;

        if (currentNode?.type === NodeType.Name) {
            this.inNameCompletion();
        } else if (currentNode?.type === NodeType.Namespace) {
            this.inNamespaceCompletion();
        } else if (currentNode instanceof Element) {
            this.inElementCompletion();
        } else if (currentNode?.type === NodeType.LeafElement || currentNode?.type === NodeType.StartElement) {
            this.inLeafStartElementCompletion();
        } else if (currentNode?.type === NodeType.AttributeValue) {
            this.inAttributeValueCompletion();
        } else if (currentNode?.type === undefined) {
            this.inUndefinedCompletion();
        }
    }

    private determineTwUsage() {
        const uri = this.document.uri;
        const lastIndex = uri.lastIndexOf('/');
        const filename = lastIndex < 0 ? uri : uri.substring(lastIndex + 1);
        const extensionIndex = filename.lastIndexOf('.');
        const name = extensionIndex < 0 ? filename : filename.substring(0, extensionIndex);
        const extension = extensionIndex < 0 ? '' : filename.substring(extensionIndex + 1);

        this.underScoreEncoding = extension.toLowerCase() === 'uxml_';
        this.hasTwStyle = false;

        if (!this.program.root) {
            return;
        }

        for (let child of this.program.root.getChildNodes()) {
            if (child instanceof LeafElement && child.name.text === style) {
                if (child.attributes.some(att => att.name.text === 'src' && att.value.contentText.includes(`${name}.tw.uss`))) {
                    this.hasTwStyle = true;
                    break;
                }
            } else if (child instanceof Element && child.startElement.name.text === style) {
                if (child.startElement.attributes.some(att => att.name.text === 'src' && att.value.contentText.includes(`${name}.tw.uss`))) {
                    this.hasTwStyle = true;
                    break;
                }
            }
        }

        if (!this.hasTwStyle) {
            return;
        }

        const root = Unity.FindProjectRoot(uri);

        if (!root) {
            return;
        }

        const packages = Unity.ListPackages(root);

        if (!packages || !packages.includes('com.virtualmaker.tailwinduss')) {
            return;
        }


    }

    private configTheme(key: string, value: any, extend: boolean) {
        if (extend) {
            if (typeof value === "string") {
                this.theme[key] = value;
            } else {
                for (let [subKey, subValue] of value.entries) {
                    if (typeof subValue === "string") {
                        this.theme[key][subKey] = subValue;
                    } else {
                        for (let [subsubKey, subsubValue] of subValue.entries) {
                            this.theme[key][subKey][subsubKey] = subsubValue;
                        }
                    }
                }
            }
        } else {
            this.theme[key] = value;
        }
    }

    private inNameCompletion() {
        const currentNode = this.currentNode as Name;

        if (!(this.encases[1] instanceof StartElement || this.encases[1] instanceof LeafElement || this.encases[1] instanceof EndElement)) {
            return;
        }

        const nsEngine = this.nsEngine;
        const nsEditor = this.nsEditor;

        if (currentNode.namespace) {
            const ns = currentNode.namespace.text;

            if (!!nsEngine && ns === nsEngine) {
                this.result.items.push(...doElementCompletion(this.range, engineElements));
            } else if (!!nsEditor && ns === nsEditor) {
                this.result.items.push(...doElementCompletion(this.range, editorElements));
            }
        } else {
            this.pushCompletionsAtStartOpenAngle();
        }
    }

    private inNamespaceCompletion() {
        if (!(this.encases[1] instanceof StartElement || this.encases[1] instanceof LeafElement || this.encases[1] instanceof EndElement)) {
            return;
        }

        const nsEngine = this.nsEngine;
        const nsEditor = this.nsEditor;

        if (nsEngine) {
            this.result.items.push(doNameSpaceCompletion(this.range, nsEngine));
        }

        if (nsEditor) {
            this.result.items.push(doNameSpaceCompletion(this.range, nsEditor));
        }
    }

    private inElementCompletion() {
        const offset = this.offset;
        const currentWord = this.currentWord;

        if (
            offset <= currentWord.length ||
            offset < 1
        ) {
            return;
        }

        const fullText = this.fullText;
        const currentNode = this.currentNode as Element;
        const nsEngine = this.nsEngine;
        const nsEditor = this.nsEditor;
        const range = this.range;

        const beforeIndex = offset - currentWord.length - 1;
        const before = fullText[beforeIndex];

        if (before === '<') {
            this.pushCompletionsAtStartOpenAngle();
        } else if (before === ':') {
            let nsStartIndex = beforeIndex;

            while (nsStartIndex > 0 && fullText[nsStartIndex - 1].match(/[a-zA-Z]/)) {
                nsStartIndex--;
            }

            if (
                nsStartIndex === beforeIndex ||
                fullText[nsStartIndex - 1] !== '<'
            ) {
                return;
            }

            const ns = fullText.substring(nsStartIndex, beforeIndex);

            if (!!nsEngine && ns === nsEngine) {
                this.result.items.push(...doElementCompletion(range, engineElements));
            } else if (!!nsEditor && ns === nsEditor) {
                this.result.items.push(...doElementCompletion(range, editorElements));
            }
        } else if (offset > 1 && before === '>' && fullText[beforeIndex - 2] !== '/') {
            const startElementEnd = currentNode.startElement.getEnd();
            const lastIndexOpen = fullText.lastIndexOf('<', offset);

            if (
                lastIndexOpen > startElementEnd &&
                fullText[lastIndexOpen + 1].match(/[a-zA-Z]/) &&
                this.program.addIfEncasing(lastIndexOpen)[0] === currentNode
            ) {
                const after = fullText.substring(lastIndexOpen + 1);
                const elementName = after.match(/[a-zA-Z]+(:[a-zA-Z]+)?/)![0];
                const name = `</${elementName} >`
                this.info(name);
                this.result.items.push({
                    label: name,
                    kind: CompletionItemKind.Reference,
                    insertTextFormat: InsertTextFormat.PlainText,
                    textEdit: TextEdit.replace(range, name)
                });
            }
        } else if (currentWord.length === 0 && offset > 4 && before === '/' && fullText[beforeIndex - 1] === '<') {
            const startElementEnd = currentNode.startElement.getEnd();
            const lastIndexClose = fullText.lastIndexOf('>', offset);
            const lastIndexOpen = fullText.lastIndexOf('<', lastIndexClose);

            if (
                lastIndexOpen > startElementEnd &&
                fullText[lastIndexClose - 1] !== '/' &&
                fullText[lastIndexOpen + 1].match(/[a-zA-Z]/) &&
                this.program.addIfEncasing(lastIndexOpen)[0] === currentNode &&
                this.program.addIfEncasing(lastIndexClose)[0] === currentNode
            ) {
                const after = fullText.substring(lastIndexOpen + 1);
                const elementName = after.match(/[a-zA-Z]+(:[a-zA-Z]+)?/)![0];
                const name = `${elementName} >`;
                const label = `</${name}`;
                this.info(name);
                this.result.items.push({
                    label: label,
                    kind: CompletionItemKind.Reference,
                    insertTextFormat: InsertTextFormat.PlainText,
                    textEdit: TextEdit.replace(range, name)
                });
            }
        }
    }

    private inLeafStartElementCompletion() {

    }

    private inUndefinedCompletion() {
        const offset = this.offset;
        const currentWord = this.currentWord;

        if (
            offset <= currentWord.length ||
            offset < 1
        ) {
            return;
        }

        const fullText = this.fullText;
        const nsEngine = this.nsEngine;
        const nsEditor = this.nsEditor;
        const range = this.range;

        const beforeIndex = offset - currentWord.length - 1;
        const before = fullText[beforeIndex];
        if (before === '<') {
            this.pushCompletionsAtStartOpenAngle();
        } else if (before === ':') {
            let nsStartIndex = beforeIndex;

            while (nsStartIndex > 0 && fullText[nsStartIndex - 1].match(/[a-zA-Z]/)) {
                nsStartIndex--;
            }

            if (
                nsStartIndex === beforeIndex ||
                fullText[nsStartIndex - 1] !== '<'
            ) {
                return;
            }

            const ns = fullText.substring(nsStartIndex, beforeIndex);

            if (!!nsEngine && ns === nsEngine) {
                this.result.items.push(...doElementCompletion(range, engineElements));
            } else if (!!nsEditor && ns === nsEditor) {
                this.result.items.push(...doElementCompletion(range, editorElements));
            }
        } else if (offset > 1 && before === '>' && fullText[beforeIndex - 1] !== '/') {
            const lastIndexOpen = fullText.lastIndexOf('<', beforeIndex);

            if (
                lastIndexOpen >= 0 &&
                fullText[lastIndexOpen + 1].match(/[a-zA-Z]/) &&
                this.program.addIfEncasing(lastIndexOpen).length === 1
            ) {
                const after = fullText.substring(lastIndexOpen + 1);
                const elementName = after.match(/[a-zA-Z]+(:[a-zA-Z]+)?/)![0];
                const name = `</${elementName} >`
                this.info(name);
                this.result.items.push({
                    label: name,
                    kind: CompletionItemKind.Reference,
                    insertTextFormat: InsertTextFormat.PlainText,
                    textEdit: TextEdit.replace(range, name)
                });
            }
        } else if (currentWord.length === 0 && offset > 4 && before === '/' && fullText[beforeIndex - 1] === '<') {
            const lastIndexClose = fullText.lastIndexOf('>', offset);

            if (lastIndexClose < 0) {
                return;
            }

            const lastIndexOpen = fullText.lastIndexOf('<', lastIndexClose);

            if (
                lastIndexOpen >= 0 &&
                fullText[lastIndexClose - 1] !== '/' &&
                fullText[lastIndexOpen + 1].match(/[a-zA-Z]/) &&
                this.program.addIfEncasing(lastIndexOpen).length === 1 &&
                this.program.addIfEncasing(lastIndexClose).length === 1
            ) {
                const after = fullText.substring(lastIndexOpen + 1);
                const elementName = after.match(/[a-zA-Z]+(:[a-zA-Z]+)?/)![0];
                const name = `${elementName} >`;
                const label = `</${name}`;
                this.info(name);
                this.result.items.push({
                    label: label,
                    kind: CompletionItemKind.Reference,
                    insertTextFormat: InsertTextFormat.PlainText,
                    textEdit: TextEdit.replace(range, name)
                });
            }
        }
    }

    private inAttributeValueCompletion() {
        if (!this.hasTwStyle) { return; }

        const attribute = this.encases[1] as Attribute;

        if (attribute.name.text !== 'class') {
            return;
        }

        const value = this.currentNode as AttributeValue;

        this.result.items.push(...doTwClassCompletion(this.range, ['flex', 'hover', 'bg-red-500']));
        this.result.items.push(...doTwClassCompletion(this.range, this.buildStrings(this.theme)));
    }

    private buildStrings(theme: ThemeRenameRecs) {
        const strs: string[] = [];

        for (let [category, data] of Object.entries(theme.strings)) {
            let prefix = `${category}`;

            if (prefix) {
                prefix += '-';
            }

            for (let key of Object.keys(data)) {
                strs.push(`${prefix}${key}`);
            }
        }

        for (let key of Object.keys(theme.fontSize)) {
            strs.push(`font-${key}`);
        }

        for (let [category, data] of Object.entries(theme.nests)) {
            let prefix = `${category}`;

            if (prefix) {
                prefix += '-';
            }

            for (let [group, groupData] of Object.entries(data)) {
                for (let key of Object.keys(groupData)) {
                    if (key === 'DEFAULT') {
                        strs.push(`${prefix}${group}`);
                    } else {
                        strs.push(`${prefix}${group}-${key}`);
                    }
                }
            }
        }

        return strs;
    }

    private pushCompletionsAtStartOpenAngle() {
        this.result.items.push(...doElementCompletion(this.range, [style]));

        if (!!this.nsEngine && this.nsEngine !== '') {
            this.result.items.push(doNameSpaceCompletion(this.range, this.nsEngine));
        } else {
            this.result.items.push(...doElementCompletion(this.range, engineElements));
        }

        if (!!this.nsEditor && this.nsEditor !== '') {
            this.result.items.push(doNameSpaceCompletion(this.range, this.nsEditor));
        } else {
            this.result.items.push(...doElementCompletion(this.range, editorElements));
        }
    }

    public getResult() {
        return this.result;
    }
}

export function doCompletionResolve(item: CompletionItem) {
    return item;
}

function doNameSpaceCompletion(range: Range, namespace: string) {
    const item: CompletionItem = {
        label: namespace,
        kind: CompletionItemKind.Reference,
        insertTextFormat: InsertTextFormat.PlainText,
        textEdit: TextEdit.replace(range, namespace + ':'),
        command: {
            title: 'Suggest',
            command: 'editor.action.triggerSuggest'
        }
    }
    return item;
}

function doElementCompletion(range: Range, elements: string[]) {
    return elements.map(name => {
        const item: CompletionItem = {
            label: name,
            kind: CompletionItemKind.Reference,
            insertTextFormat: InsertTextFormat.PlainText,
            textEdit: TextEdit.replace(range, name)
        }
        return item;
    });
}

function doTwClassCompletion(range: Range, elements: string[]) {
    return elements.map(name => {
        const item: CompletionItem = {
            label: name,
            kind: CompletionItemKind.Constant,
            insertTextFormat: InsertTextFormat.PlainText,
            textEdit: TextEdit.replace(range, name)
        }
        return item;
    });
}

const engineElements = [
    'BindableElement',
    'VisualElement',
    'BoundsField',
    'Box',
    'Button',
    'DoubleField',
    'EnumField',
    'FloatField',
    'Foldout',
    'GroupBox',
    'Hash128Field',
    'HelpBox',
    'IMGUIContainer',
    'Image',
    'IntegerField',
    'Label',
    'ListView',
    'LongField',
    'MinMaxSlider',
    'MultiColumnListView',
    'MultiColumnTreeView',
    'PopupWindow',
    'ProgressBar',
    'RadioButton',
    'RadioButtonGroup',
    'RectField',
    'RectIntField',
    'RepeatButton',
    'ScrollView',
    'Scroller',
    'Slider',
    'SliderInt',
    'Tab',
    'TabView',
    'TemplateContainer',
    'TextElement',
    'TextField',
    'Toggle',
    'ToggleButtonGroup',
    'TreeView',
    'TwoPaneSplitView',
    'UnsignedIntegerField',
    'UnsignedLongField',
    'Vector2Field',
    'Vector2IntField',
    'Vector3Field',
    'Vector3IntField',
    'Vector4'
];

const editorElements = [
    'ColorField',
    'CurveField',
    'EnumFlagsField',
    'GradientField',
    'InspectorElement',
    'LayerField',
    'LayerMaskField',
    'Mask64Field',
    'MaskField',
    'ObjectField',
    'PropertyField',
    'RenderingLayerMaskField',
    'TagField',
    'Toolbar',
    'ToolbarBreadcrumbs',
    'ToolbarButton',
    'ToolbarMenu',
    'ToolbarPopupSearchField',
    'ToolbarSearchField',
    'ToolbarSpacer',
    'ToolbarToggle'
];

const template = 'Template';
const instance = 'Instance';
const columns = 'Columns';
const column = 'Column';
const style = 'Style';