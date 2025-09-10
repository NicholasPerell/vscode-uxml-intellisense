export namespace Underscore {
    export function Encode(decoded: string) {
        let encoded: string = '';

        for (let i = 0; i < decoded.length; i++) {
            const char = decoded.charAt(i);
            if (char.match(/[A-Za-z0-9-]|\s/)) {
                encoded += char;
            }
            else {
                encoded += `_${char.charCodeAt(0).toString(16).toUpperCase()}`;
            }
        }

        return encoded;
    }

    export function Decode(encoded: string) {
        let decoded: string = '';

        for (let i = 0; i < encoded.length; i++) {
            const char = encoded.charAt(i);

            if (i < encoded.length - 2 &&
                char === '_' &&
                encoded.substring(i + 1, i + 3).match(/[A-Fa-f0-9]{2}/)) {
                const code = parseInt(encoded.substring(i + 1, i + 3), 16);
                decoded += String.fromCharCode(code);
                i += 2;
            }
            else {
                decoded += char;
            }
        }

        return decoded;
    }

    export function IsEncodingSafe(str: string, allowStrayUnderscores: boolean) {
        if (allowStrayUnderscores) {
            return !!str.match(/^([A-Za-z0-9-_]|\s)+$/);
        }

        if (!!str.match(/^([A-Za-z0-9-]|\s)+$/)) {
            return true;
        }

        for (let i = 0; i < str.length; i++) {
            const char = str.charAt(i);

            if (char.match(/[A-Za-z0-9-]|\s/)) {
                continue;
            }

            if (char !== '_') {
                return false;
            }

            if (i >= str.length - 2) {
                return false;
            }

            if (!str.substring(i + 1, i + 3).match(/[A-Fa-f0-9]{2}/)) {
                return false;
            }
        }

        return true;
    }
}