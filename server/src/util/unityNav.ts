import { documents } from "../server";

export namespace Unity {
    export function FindProjectRoot(uri: string): string | null {
        let unityRoot = uri;
        let unityRootLastIndex = uri.lastIndexOf('/');

        while (unityRootLastIndex >= 0) {
            unityRoot = unityRoot.substring(0, unityRootLastIndex);
            const projVersion = documents.keys().includes(`${unityRoot}/ProjectSettings/ProjectVersion.txt`);

            if (projVersion) {
                break;
            }

            unityRootLastIndex = unityRoot.lastIndexOf('/');
        }

        if (!unityRoot) {
            return null;
        }

        return unityRoot;
    }

    export function ListPackages(rootUri: string): string[] {
        const packages: string[] = [];
        const packageLock = documents.get(`${rootUri}/Packages/packages-lock.json`);

        if (!packageLock) {
            return [];
        }

        return Object.keys(JSON.parse(packageLock.getText()).dependencies);
    }
}