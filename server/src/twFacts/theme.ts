export interface StringDict {
    [key: string]: string;
}

export interface FontSize {
    fontSize?: number;
    letterSpacing?: number;
}

export interface FontSizeDict {
    [key: string]: FontSize;
}

export interface NumberDict {
    [key: string]: number;
}


class Theme {
    private _overrides: string[];
    private _spacing?: number;
    private _colors: StringDict;
    private _fonts: StringDict;
    private _texts: FontSizeDict;
    private _trackings: NumberDict;
    private _breakpoints: NumberDict;
    private _radii: NumberDict;
    private _textShadows: StringDict;
    private _general: StringDict;

    public static FromSpan(span: string[]) {
        return new Theme(span);
    }

    public static WithSpanApplied(span: string[], base: Theme) {
        const rtn = new Theme(span);

        if (rtn._overrides.includes('')) {
            return rtn;
        }

        for (const p of Object.entries(base._general)) {
            if (!(p[0] in rtn._general)) {
                rtn._general[p[0]] = p[1];
            }
        }

        if (!rtn._overrides.includes('spacing') && !rtn._spacing) {
            rtn._spacing = base._spacing;
        }

        if (!rtn._overrides.includes('color')) {
            for (const p of Object.entries(base._colors)) {
                if (!(p[0] in rtn._colors)) {
                    rtn._colors[p[0]] = p[1];
                }
            }
        }

        if (!rtn._overrides.includes('font')) {
            for (const p of Object.entries(base._fonts)) {
                if (!(p[0] in rtn._fonts)) {
                    rtn._fonts[p[0]] = p[1];
                }
            }
        }

        if (!rtn._overrides.includes('text')) {
            for (const p of Object.entries(base._texts)) {
                if (!(p[0] in rtn._texts)) {
                    rtn._texts[p[0]] = p[1];
                }
            }
        }

        if (!rtn._overrides.includes('breakpoint')) {
            for (const p of Object.entries(base._breakpoints)) {
                if (!(p[0] in rtn._breakpoints)) {
                    rtn._breakpoints[p[0]] = p[1];
                }
            }
        }

        if (!rtn._overrides.includes('tracking')) {
            for (const p of Object.entries(base._trackings)) {
                if (!(p[0] in rtn._trackings)) {
                    rtn._trackings[p[0]] = p[1];
                }
            }
        }

        if (!rtn._overrides.includes('radius')) {
            for (const p of Object.entries(base._radii)) {
                if (!(p[0] in rtn._radii)) {
                    rtn._radii[p[0]] = p[1];
                }
            }
        }

        if (!rtn._overrides.includes('text-shadow')) {
            for (const p of Object.entries(base._textShadows)) {
                if (!(p[0] in rtn._textShadows)) {
                    rtn._textShadows[p[0]] = p[1];
                }
            }
        }

        return rtn;
    }

    private constructor(span: string[]) {
        this._overrides = [];
        this._spacing = undefined;
        this._colors = {};
        this._fonts = {};
        this._texts = {};
        this._trackings = {};
        this._breakpoints = {};
        this._radii = {};
        this._textShadows = {};
        this._general = {};

        for (const lineRaw of span) {
            if (!lineRaw || lineRaw.match(/^\s*$/)) {
                continue;
            }

            const line = lineRaw.trim();

            let used =
                this.checkOverride(line) ||
                this.checkSpacing(line) ||
                this.checkString("font", this._fonts, line) ||
                this.checkString("text-shadow", this._textShadows, line) ||
                this.checkFloat("breakpoint", this._breakpoints, line) ||
                this.checkFloat("tracking", this._trackings, line) ||
                this.checkFloat("radius", this._radii, line) ||
                this.checkColor(line) ||
                this.checkText(line) ||
                this.checkTextLetterSpacing(line)
                ;

            used = used || this.checkGeneral(line);
        }
    }

    checkFloat(prefix: string, dict: NumberDict, line: string): boolean {
        const match = line.match(new RegExp(`^--${prefix}-(?<term>[a-zA-Z0-9-]+)\s*:\s*(?<value>-?([0-9]*\.)?[0-9]+)px\s*;?$`));

        if (match && match.groups) {
            dict[match.groups["term"]] = parseFloat(match.groups["value"]);
            return true;
        }

        return false;
    }

    checkString(prefix: string, dict: StringDict, line: string): boolean {
        const match = line.match(new RegExp(`^--${prefix}-(?<term>[a-zA-Z0-9-]+)\s*:\s*(?<value>..*?)\s*;?$`));

        if (match && match.groups) {
            dict[match.groups["term"]] = match.groups["value"];
            return true;
        }

        return false;
    }

    checkGeneral(line: string): boolean {
        const match = line.match(/^--(?<term>[a-zA-Z0-9-]+)\s*:\s*(?<value>..*?)\s*;?$/);

        if (match && match.groups) {
            if (!this._general) {
                this._general = {};
            }

            this._general[match.groups["term"]] = match.groups["value"];
            return true;
        }

        return false;
    }

    checkTextLetterSpacing(line: string): boolean {
        const match = line.match(/^--text-(?<term>[a-zA-Z0-9-]+)--letter-spacing\s*:\s*(?<value>([0-9]*\.)?[0-9]+)px\s*;?$/);

        if (match && match.groups) {
            var term = match.groups["term"];
            var value = parseFloat(match.groups["value"]);

            if (!this._texts) {
                this._texts = {};
            }

            if (term in this._texts) {
                var text = this._texts[term];
                text.letterSpacing = value;
                this._texts[term] = text;
            }
            else {
                this._texts[term] = { letterSpacing: value };
            }

            return true;
        }

        return false;
    }

    checkText(line: string): boolean {
        const match = line.match(/^--text-(?<term>[a-zA-Z0-9-]+)\s*:\s*(?<value>([0-9]*\.)?[0-9]+)px\s*;?$/);

        if (match && match.groups) {
            var term = match.groups["term"];
            var value = parseFloat(match.groups["value"]);

            if (!this._texts) {
                this._texts = {};
            }

            if (term in this._texts) {
                var text = this._texts[term];
                text.fontSize = value;
                this._texts[term] = text;
            }
            else {
                this._texts[term] = { fontSize: value };
            }

            return true;
        }

        return false;
    }

    checkColor(line: string): boolean {
        const match = line.match(/^--color-(?<term>[a-zA-Z0-9-]+)\s*:\s*(?<value>..*?)\s*;?$/);

        if (match && match.groups) {
            this._colors![match.groups['term']] = match.groups["value"];
            return true;
        }

        return false;
    }

    checkSpacing(line: string): boolean {
        const match = line.match(/^--spacing\s*:\s*(?<value>([0-9]*\.)?[0-9]+)px\s*;?$/);

        if (match && match.groups) {
            this._spacing = parseFloat(match.groups["value"]);
            return true;
        }

        return false;
    }

    checkOverride(line: string): boolean {
        if (line.match(/^--\*\s*:\s*initial\s*;?$/)) {
            this._overrides.push('');
            return true;
        }

        const match = line.match(/^--(?<prefix>[0-9a-z-]+)-\*\s*:\s*initial\s*;?$/);
        if (match && match.groups) {
            this._overrides.push(match && match.groups["prefix"]);
        }

        return false;
    }

    public get spacing() {
        return this._spacing;
    }
    public get hasSpacing() {
        return !!this._spacing;
    }

    public get colors() {
        return this._colors;
    }
    public get hasColors() {
        return !!this._colors && Object.keys(this._colors).length > 0;
    }

    public get fonts() {
        return this._fonts;
    }
    public get hasFonts() {
        return !!this._fonts && Object.keys(this._fonts).length > 0;
    }

    public get texts() {
        return this._texts;
    }
    public get hasTexts() {
        return !!this._texts && Object.keys(this._texts).length > 0;
    }

    public get breakpoints() {
        return this._breakpoints;
    }
    public get hasBreakpoints() {
        return !!this._breakpoints && Object.keys(this._breakpoints).length > 0;
    }

    public get trackings() {
        return this._trackings;
    }
    public get hasTrackings() {
        return !!this._trackings && Object.keys(this._trackings).length > 0;
    }

    public get radii() {
        return this._radii;
    }
    public get hasRadii() {
        return !!this._radii && Object.keys(this._radii).length > 0;
    }

    public get textShadows() {
        return this._textShadows;
    }
    public get hasTextShadows() {
        return !!this._textShadows && Object.keys(this._textShadows).length > 0;
    }

    public get general() {
        return this._general;
    }
    public get hasGeneral() {
        return !!this._general && Object.keys(this._general).length > 0;
    }
}