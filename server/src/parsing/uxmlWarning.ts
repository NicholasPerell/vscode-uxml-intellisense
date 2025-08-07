import { Underscore } from "../util/underscoreEncoding";

export class ParsingWarning {
    public message: string;
    public startOffset: number;
    public endOffset: number;
    public actionData?: any;

    constructor(message: string, start: number, end: number, action?: any) {
        this.message = message;
        this.startOffset = start;
        this.endOffset = end;
        this.actionData = action;
    }
}

export class ParsingUnderscoreWarning extends ParsingWarning {
    constructor(className: string, start: number, end: number) {
        super('Class names in UXML may only consist of A-Z, a-z, 0-9, -, and _.', start, end, { decoded: className, encoded: Underscore.Encode(className) });
    }
}