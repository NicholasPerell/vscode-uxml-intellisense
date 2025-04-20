export class ParsingError extends Error {
    public startOffset: number;
    public endOffset: number;

    constructor(message: string, start: number, end: number) {
        super(message);
        this.startOffset = start;
        this.endOffset = end;
    }
}