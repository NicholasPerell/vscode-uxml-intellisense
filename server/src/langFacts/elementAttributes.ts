import { Attribute } from "../parsing/uxmlNodes";

interface StringKeyDict<T> {
    [key: string]: T;
}

interface StringDict extends StringKeyDict<string> {

}

const Attributes: StringKeyDict<string[]> = {
    'VisualElement': ['content-container', 'data-source', 'data-source-path', 'data-source-type', 'language-direction', 'name', 'class' /*Not listed?*/, 'picking-mode', 'style', 'tooltip', 'usage-hints', 'view-data-key', 'focusable', 'tabindex'],
}

interface Focusable {
    focusable: boolean;
    tabindex: number;
}

interface VisualElement extends Focusable {
    'content-container': string,
    'data-source': any,
    'data-source-path': string,
    'data-source-type': string,
    'language-direction': string,
    'name': string, 'class': string/*Not listed?*/,
    'picking-mode': string,
    'style': string,
    'tooltip': string,
    'usage-hints': string,
    'view-data-key': string
}

interface BindableElement extends VisualElement {
    'binding-path': string,
}

interface BoundsField extends BaseField<any> {
}

interface BoundsIntField extends BaseField<any> {
}

interface Box extends VisualElement {
}

interface BaseField<T> extends BindableElement {
    'label': string,
    'value': T,
}

interface TextInputBaseField<T> extends BaseField<T> {
    'auto-correction': boolean,
    'hide-mobile-input': boolean,
    'is-delayed': boolean,
    'keyboard-type': string,
    'max-length': number,
    'select-all-on-focus': boolean,
    'select-all-on-mouse-up': boolean,
    'vertical-scroller-visibility': string,
}

interface PopupField<T> extends BaseField<T> {
    choices: any[];
}

interface DropdownField extends PopupField<number> {
}

interface EnumField extends BaseField<string> {

}

interface EnumFlagsField extends BaseField<string> {

}

interface TextValueField<T> extends TextInputBaseField<T> {

}

interface TextElement extends BindableElement {
    'display-tooltip-when-elided': boolean,
    'emoji-fallback-support': boolean,
    'enable-rich-text': boolean,
    'parse-escape-sequences': boolean,
    'text': string,
}

interface Button extends TextElement {
    'icon-image': any,
}

interface ColorField extends BaseField<any> {
    'hdr': boolean,
    'show-alpha': boolean,
    'show-eye-dropper': boolean
}

interface CurveField extends BaseField<any> {
}

interface DoubleField extends TextValueField<number> {
}

interface FloatField extends TextValueField<number> {
}

interface Foldout extends BindableElement {
    text: string,
    'toggle-on-label-click': boolean,
    'value': boolean
}

interface GradientField extends BaseField<any> {

}

interface GroupBox extends BindableElement {
    text: string
}

interface Hash128Field extends TextInputBaseField<any> {

}
interface HelpBox extends VisualElement {
    'message-type': any,
    'text': string
}

interface IMGUIContainer extends VisualElement {
}

interface Image {

}

interface InspectorElement {

}

interface IntegerField {

}

interface Label {

}

interface LayerField {

}

interface LayerMaskField {

}

interface LongField {

}

interface ListView {

}

interface MaskField {

}

interface Mask64Field {

}