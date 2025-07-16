import { Position, CompletionList, CompletionItem, CompletionItemKind, TextEdit, InsertTextFormat, Color } from "vscode-languageserver";
import { Element, Name, Namespace, Node, NodeType, Program } from "../parsing/uxmlNodes";
import { Scanner } from "../parsing/uxmlScanner";
import { Range, TextDocument } from "vscode-languageserver-textdocument";
import { off } from "process";
import { Token } from "../parsing/uxmlTokens";

export function doCompletion(document: TextDocument, position: Position, info: (s: string) => void): CompletionList {
    const cmp = new Completion(document, position, info);
    return cmp.getResult();
}

class Completion {
    private document: TextDocument;
    private position: Position;
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

    public constructor(document: TextDocument, position: Position, info: (s: string) => void) {
        this.document = document;
        this.position = position;
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

        info(`${this.offset} ${NodeType[currentNode?.type]} "${this.currentWord}" ${this.program.root !== undefined}`);


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
        } else if (currentNode?.type === undefined) {
            this.inUndefinedCompletion();
        }
    }

    private inNameCompletion() {
        const currentNode = this.currentNode as Name;
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
        } else if (currentWord.length === 0 && offset > 4 && before === '/' && fullText[beforeIndex - 2] !== '<') {
            const startElementEnd = currentNode.startElement.getEnd();
            const lastIndexClose = fullText.lastIndexOf('>', offset);
            const lastIndexOpen = fullText.lastIndexOf('<', lastIndexClose);

            this.info('close tagger ' + fullText.substring(lastIndexOpen, lastIndexClose + 1));

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
        const fullText = this.fullText;
        const offset = this.offset;
        const currentWord = this.currentWord;
        const nsEngine = this.nsEngine;
        const nsEditor = this.nsEditor;

        if (offset > currentWord.length) {
            const beforeIndex = offset - currentWord.length - 1;
            const before = fullText[beforeIndex];
            if (before === '<') {
                this.pushCompletionsAtStartOpenAngle();
            } else if (before === ':') {
                let woah = beforeIndex;
                for (let i = beforeIndex - 1; i >= 0; i--) {
                    if (!fullText[i].match(/[a-zA-Z]/)) {
                        break;
                    }

                    woah = i;
                }

                const ns = woah === beforeIndex
                    ? ''
                    : fullText.substring(woah, beforeIndex);

                if (ns === '') {

                } else if (!!nsEngine && ns === nsEngine) {
                    this.result.items.push(...doElementCompletion(this.range, engineElements));
                } else if (!!nsEditor && ns === nsEditor) {
                    this.result.items.push(...doElementCompletion(this.range, editorElements));
                }
            }
        }
    }

    private pushCompletionsAtStartOpenAngle() {
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