export declare const load: (filePath: string) => Promise<{
    id: number;
    name: string;
    contents: string;
    fileName: string;
    hash: string;
    sql: string;
}>;
