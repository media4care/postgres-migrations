import { Logger, Migration } from "./types";
export declare const load: (directory: string, log: Logger) => Promise<Migration[]>;
