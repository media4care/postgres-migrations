"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg = require("pg");
const sql_template_strings_1 = require("sql-template-strings");
const files_loader_1 = require("./files-loader");
const run_migration_1 = require("./run-migration");
const with_connection_1 = require("./with-connection");
const with_lock_1 = require("./with-lock");
async function migrate(dbConfig, migrationsDirectory, config = {}) {
    const log = config.logger != null
        ? config.logger
        : () => {
            //
        };
    if (dbConfig == null) {
        throw new Error("No config object");
    }
    if (typeof migrationsDirectory !== "string") {
        throw new Error("Must pass migrations directory as a string");
    }
    const intendedMigrations = await files_loader_1.load(migrationsDirectory, log);
    if ("client" in dbConfig) {
        // we have been given a client to use, it should already be connected
        return with_lock_1.withAdvisoryLock(log, runMigrations(intendedMigrations, log))(dbConfig.client);
    }
    if (typeof dbConfig.database !== "string" ||
        typeof dbConfig.user !== "string" ||
        typeof dbConfig.password !== "string" ||
        typeof dbConfig.host !== "string" ||
        typeof dbConfig.port !== "number") {
        throw new Error("Database config problem");
    }
    const client = new pg.Client(dbConfig);
    client.on("error", (err) => {
        log(`pg client emitted an error: ${err.message}`);
    });
    const runWith = with_connection_1.withConnection(log, with_lock_1.withAdvisoryLock(log, runMigrations(intendedMigrations, log)));
    return runWith(client);
}
exports.migrate = migrate;
function runMigrations(intendedMigrations, log) {
    return async (client) => {
        try {
            const migrationTableName = "migrations";
            log("Starting migrations");
            const appliedMigrations = await fetchAppliedMigrationFromDB(migrationTableName, client, log);
            validateMigrations(intendedMigrations, appliedMigrations);
            const migrationsToRun = filterMigrations(intendedMigrations, appliedMigrations);
            const completedMigrations = [];
            for (const migration of migrationsToRun) {
                log(`Starting migration: ${migration.id} ${migration.name}`);
                const result = await run_migration_1.runMigration(migrationTableName, client, log)(migration);
                log(`Finished migration: ${migration.id} ${migration.name}`);
                completedMigrations.push(result);
            }
            logResult(completedMigrations, log);
            log("Finished migrations");
            return completedMigrations;
        }
        catch (e) {
            const error = new Error(`Migration failed. Reason: ${e.message}`);
            error.cause = e;
            throw error;
        }
    };
}
/** Queries the database for migrations table and retrieve it rows if exists */
async function fetchAppliedMigrationFromDB(migrationTableName, client, log) {
    let appliedMigrations = [];
    if (await doesTableExist(client, migrationTableName)) {
        log(`Migrations table with name '${migrationTableName}' exists, filtering not applied migrations.`);
        const { rows } = await client.query(`SELECT * FROM ${migrationTableName} ORDER BY id`);
        appliedMigrations = rows;
    }
    else {
        log(`Migrations table with name '${migrationTableName}' hasn't been created,
so the database is new and we need to run all migrations.`);
    }
    return appliedMigrations;
}
/** Validates mutation order and hash */
function validateMigrations(migrations, appliedMigrations) {
    const indexNotMatch = (migration, index) => migration.id !== index;
    const invalidHash = (migration) => {
        const appliedMigration = appliedMigrations[migration.id];
        return appliedMigration != null && appliedMigration.hash !== migration.hash;
    };
    // Assert migration IDs are consecutive integers
    const notMatchingId = migrations.find(indexNotMatch);
    if (notMatchingId) {
        throw new Error(`Found a non-consecutive migration ID on file: '${notMatchingId.fileName}'`);
    }
    // Assert migration hashes are still same
    const invalidHashes = migrations.filter(invalidHash);
    if (invalidHashes.length > 0) {
        // Someone has altered one or more migrations which has already run - gasp!
        const invalidFiles = invalidHashes.map(({ fileName }) => fileName);
        throw new Error(`Hashes don't match for migrations '${invalidFiles}'.
This means that the scripts have changed since it was applied.`);
    }
}
/** Work out which migrations to apply */
function filterMigrations(migrations, appliedMigrations) {
    const notAppliedMigration = (migration) => !appliedMigrations[migration.id];
    return migrations.filter(notAppliedMigration);
}
/** Logs the result */
function logResult(completedMigrations, log) {
    if (completedMigrations.length === 0) {
        log("No migrations applied");
    }
    else {
        log(`Successfully applied migrations: ${completedMigrations.map(({ name }) => name)}`);
    }
}
/** Check whether table exists in postgres - http://stackoverflow.com/a/24089729 */
async function doesTableExist(client, tableName, schema = "public") {
    const result = await client.query(sql_template_strings_1.default `SELECT EXISTS (
  SELECT 1
  FROM   pg_catalog.pg_class c
  JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = ${schema}
  AND    c.relname = ${tableName}
  AND    c.relkind = 'r'
);`);
    return result.rows.length > 0 && result.rows[0].exists;
}
