import { Config, MigrateDBConfig, Migration } from "./types";
export declare function migrate(dbConfig: MigrateDBConfig, migrationsDirectory: string, config?: Config): Promise<Array<Migration>>;
