export interface Migration {
    readonly id: number;
    readonly name: string;
    readonly contents: string;
    readonly fileName: string;
    readonly hash: string;
    readonly sql: string;
}
export interface BaseDBConfig {
    readonly user: string;
    readonly password: string;
    readonly host: string;
    readonly port: number;
}
export interface CreateDBConfig extends BaseDBConfig {
    readonly defaultDatabase?: string;
}
export interface MigrateDBConfig extends BaseDBConfig {
    readonly database: string;
}
export declare type Logger = (msg: string) => void;
export declare type Config = Partial<FullConfig>;
export interface FullConfig {
    readonly logger: Logger;
}
export declare class MigrationError extends Error {
    cause?: string;
}
export declare type FileType = "sql" | "js";
