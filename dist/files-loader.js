"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const util_1 = require("util");
const migration_file_1 = require("./migration-file");
const readDir = util_1.promisify(fs.readdir);
const isValidFile = (fileName) => /.(sql|js)$/gi.test(fileName);
exports.load = async (directory, log) => {
    log(`Loading migrations from: ${directory}`);
    const fileNames = await readDir(directory);
    log(`Found migration files: ${fileNames}`);
    if (fileNames != null) {
        const migrationFiles = [
            path.join(__dirname, "migrations/0_create-migrations-table.sql"),
            ...fileNames.map(fileName => path.resolve(directory, fileName)),
        ].filter(isValidFile);
        const unorderedMigrations = await Promise.all(migrationFiles.map(migration_file_1.load));
        // Arrange in ID order
        return unorderedMigrations.sort((a, b) => a.id - b.id);
    }
    return [];
};
