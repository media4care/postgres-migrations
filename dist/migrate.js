"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg = require("pg");
const sql_template_strings_1 = require("sql-template-strings");
const run_migration_1 = require("./run-migration");
const files_loader_1 = require("./files-loader");
async function migrate(dbConfig, migrationsDirectory, config = {}) {
    if (dbConfig == null ||
        typeof dbConfig.database !== "string" ||
        typeof dbConfig.user !== "string" ||
        typeof dbConfig.password !== "string" ||
        typeof dbConfig.host !== "string" ||
        typeof dbConfig.port !== "number") {
        throw new Error("Database config problem");
    }
    if (typeof migrationsDirectory !== "string") {
        throw new Error("Must pass migrations directory as a string");
    }
    const fullConfig = {
        logger: config.logger != null
            ? config.logger
            : () => {
                //
            },
    };
    return loadAndRunMigrations(dbConfig, migrationsDirectory, fullConfig);
}
exports.migrate = migrate;
async function loadAndRunMigrations(dbConfig, migrationsDirectory, config) {
    const { logger: log } = config;
    const intendedMigrations = await files_loader_1.load(migrationsDirectory, log);
    const client = new pg.Client(dbConfig);
    client.on("error", err => {
        log(`pg client emitted an error: ${err.message}`);
    });
    log("Attempting database migration");
    const runWith = withConnection(config, runMigrations(intendedMigrations, config));
    return runWith(client);
}
function runMigrations(intendedMigrations, { logger: log }) {
    return async (client) => {
        try {
            const migrationTableName = "migrations";
            const schema = "public";
            log("Will run migrations...");
            const appliedMigrations = await fetchAppliedMigrationFromDB(migrationTableName, schema, client, log);
            log(appliedMigrations.length.toString());
            validateMigrations(intendedMigrations, appliedMigrations);
            const migrationsToRun = filterMigrations(intendedMigrations, appliedMigrations);
            const completedMigrations = [];
            for (const migration of migrationsToRun) {
                const result = await run_migration_1.runMigration(migrationTableName, client, log)(migration);
                completedMigrations.push(result);
            }
            logResult(completedMigrations, log);
            return completedMigrations;
        }
        catch (e) {
            const error = new Error(`Migration failed. Reason: ${e.message}`);
            error.cause = e;
            throw error;
        }
    };
}
function withConnection({ logger: log }, f) {
    return async (client) => {
        try {
            try {
                await client.connect();
                log("Connected to database");
            }
            catch (e) {
                log(`Error connecting to database: ${e.message}`);
                throw e;
            }
            const result = await f(client);
            return result;
        }
        finally {
            // always try to close the connection
            try {
                await client.end();
            }
            catch (e) {
                log(`Error closing the connection: ${e.message}`);
            }
        }
    };
}
/** Queries the database for migrations table and retrieve it rows if exists */
async function fetchAppliedMigrationFromDB(migrationTableName, schema, client, log) {
    let appliedMigrations = [];
    if (await doesTableExist(client, migrationTableName, schema)) {
        log(`
Migrations table with name '${migrationTableName}' exists,
filtering not applied migrations.`);
        const { rows } = await client.query(`SELECT * FROM ${migrationTableName} ORDER BY id`);
        appliedMigrations = rows;
    }
    else {
        log(`
Migrations table with name '${migrationTableName}' hasn't been created,
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
        throw new Error(`
Hashes don't match for migrations '${invalidFiles}'.
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
async function doesTableExist(client, tableName, schema) {
    const result = await client.query(sql_template_strings_1.default `
      SELECT EXISTS (
        SELECT 1
        FROM   pg_catalog.pg_class c
        JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE  n.nspname = ${schema}
        AND    c.relname = ${tableName}
        AND    c.relkind = 'r'
      );
    `);
    return result.rows.length > 0 && result.rows[0].exists;
}
