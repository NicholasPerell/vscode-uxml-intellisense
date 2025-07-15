import { Position, CompletionList, CompletionItem, CompletionItemKind, TextEdit, InsertTextFormat, Color } from "vscode-languageserver";
import { Element, NodeType, Program } from "../parsing/uxmlNodes";
import { Scanner } from "../parsing/uxmlScanner";
import { Range, TextDocument } from "vscode-languageserver-textdocument";
import { off } from "process";

export function doCompletion(document: TextDocument, position: Position, info: (s: string) => void): CompletionList {
    const scanner = new Scanner(document);
    const program = new Program(scanner);
    const offset = document.offsetAt(position);
    const currentWord = scanner.getCurrentWord(offset);
    const currentToken = scanner.getCurrentToken(offset);
    const range = { start: document.positionAt(offset - currentWord.length), end: position };
    const encases = program.addIfEncasing(offset);
    const currentNode = encases[0];

    const result: CompletionList = {
        isIncomplete: false,
        itemDefaults: {
            editRange: {
                start: { line: position.line, character: position.character - currentWord.length },
                end: position
            }
        },
        items: []
    };

    info(`${offset} ${NodeType[currentNode?.type]} "${currentWord}" ${program.root !== undefined}`);


    const nsEngine = program.nsEngine;
    const nsEditor = program.nsEditor;

    if (currentNode?.type === NodeType.Name) {

    } else if (currentNode?.type === NodeType.Namespace) {

    } else if (currentNode instanceof Element) {

        const fullText = document.getText();

        if (offset > currentWord.length && currentWord.length > 0) {
            const beforeIndex = offset - currentWord.length - 1;
            const before = fullText[beforeIndex];
            if (before === '<') {
                if (!!nsEngine && nsEngine !== '') {
                    result.items.push(doNameSpaceCompletion(range, nsEngine));
                } else {
                    result.items.push(...doElementCompletion(range, engineElements));
                }

                if (!!nsEditor && nsEditor !== '') {
                    result.items.push(doNameSpaceCompletion(range, nsEditor));
                } else {
                    result.items.push(...doElementCompletion(range, editorElements));
                }
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
                    result.items.push(...doElementCompletion(range, engineElements));
                } else if (!!nsEngine && ns === nsEditor) {
                    result.items.push(...doElementCompletion(range, editorElements));
                }
            }
        } else if (offset > 1 && fullText[offset - 1] === '>' && fullText[offset - 2] !== '/') {

            const startElementEnd = currentNode.startElement.getEnd();

            const lastIndexOpen = fullText.lastIndexOf('<', offset);

            if (
                lastIndexOpen !== startElementEnd &&
                fullText[lastIndexOpen + 1].match(/[a-zA-Z]/) &&
                program.addIfEncasing(lastIndexOpen)[0] === currentNode
            ) {
                const after = fullText.substring(lastIndexOpen + 1);

                const elementName = after.match(/[a-zA-Z]+(:[a-zA-Z]+)?/)![0];
                const name = `</${elementName} >`
                info(name);
                result.items.push({
                    label: name,
                    kind: CompletionItemKind.Reference,
                    insertTextFormat: InsertTextFormat.PlainText,
                    textEdit: TextEdit.replace(range, name)
                });
            }

        }

    } else if (currentNode?.type === NodeType.LeafElement || currentNode?.type === NodeType.StartElement) {
        // const rulesStored = currentNode.getChildNodes();
        // let start = currentNode.getStart();
        // let end = currentNode.getEnd();

        // rulesStored.forEach(element => {
        //     const ruleStart = element.getStart();
        //     const ruleEnd = element.getEnd();

        //     if (offset < ruleStart && ruleStart < end) {
        //         end = ruleStart;
        //     } else if (offset > ruleEnd && ruleEnd > start) {
        //         start = ruleEnd;
        //     }
        // });

        // const fullText = document.getText();
        // let indexColon = fullText.indexOf(':', start);

        // if (indexColon < offset && indexColon > start) {
        //     const identifier = fullText.substring(indexColon, start).trim();

        //     let keywords = getKeywordsForProperty(identifier);

        //     if (keywords.values.length == 0 && keywords.methods.length == 0) {
        //         keywords = { values: [...valueKeywords, ...colorKeywords], methods: [] };
        //     }

        //     result.items = turnKeywordsToCompletions(range, keywords);
        // } else {
        //     result.items = doPropertyNameCompletion(range, indexColon < end);
        // }
    } else if (currentNode?.type === undefined) {
        const fullText = document.getText();
        if (offset > currentWord.length) {
            const beforeIndex = offset - currentWord.length - 1;
            const before = fullText[beforeIndex];
            if (before === '<') {
                if (!!nsEngine && nsEngine !== '') {
                    result.items.push(doNameSpaceCompletion(range, nsEngine));
                } else {
                    result.items.push(...doElementCompletion(range, engineElements));
                }

                if (!!nsEditor && nsEditor !== '') {
                    result.items.push(doNameSpaceCompletion(range, nsEditor));
                } else {
                    result.items.push(...doElementCompletion(range, editorElements));
                }
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
                    result.items.push(...doElementCompletion(range, engineElements));
                } else if (!!nsEngine && ns === nsEditor) {
                    result.items.push(...doElementCompletion(range, editorElements));
                }
            }
        }
    }


    return result;
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