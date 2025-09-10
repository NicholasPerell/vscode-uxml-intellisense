interface StringDict {
    [key: string]: string;
}

export class RootVariants {
    private readonly Pattern: RegExp = /^\s*(?<prefix>[0-9a-z-]+):\s*(?<class>[0-9a-z-]+)\s*;?\s*$/;

    private _dict: StringDict;

    public HasModifier(modifier: string): boolean {
        return Object.keys(this._dict).includes(modifier);
    }

    public Get(modifier: string) {
        return this._dict[modifier];
    }

    public GetSuggestions(typed: string): string[] {
        return Object.keys(this._dict).filter(k => k.startsWith(typed));
    }

    public static FromSpan(span: string[]) {
        return new RootVariants(span, undefined);
    }

    public static WithSpanApplied(span: string[], base: RootVariants) {
        return new RootVariants(span, { ...base._dict });
    }

    private constructor(span: string[], dict?: StringDict) {
        this._dict = dict ?? {};

        for (const line of span) {
            if (!line) {
                continue;
            }

            const match = line.match(this.Pattern);

            if (match && match.groups) {
                this._dict[match.groups["prefix"]] = match.groups["class"];
            }
        }
    }
}