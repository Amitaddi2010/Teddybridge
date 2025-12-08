import * as schema from "@shared/schema";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

// Support both SQLite (development) and PostgreSQL (production)
const isPostgres = process.env.DATABASE_URL?.startsWith("postgresql://") || 
                   process.env.DATABASE_URL?.startsWith("postgres://");

let db: any;

if (isPostgres) {
  // PostgreSQL for production (Render, etc.)
  // Note: This requires async initialization, so we'll handle it differently
  throw new Error("PostgreSQL support requires async initialization. Please use SQLite for local development or implement proper async DB initialization.");
} else {
  // SQLite for local development - synchronous
  const dbPath = process.env.DATABASE_URL || "./database.sqlite";
  try {
    const sqlite = new Database(dbPath);
    db = drizzleSqlite(sqlite, { schema });
    console.log(`✓ SQLite database connected: ${dbPath}`);
  } catch (error) {
    console.error(`✗ Failed to connect to SQLite database: ${error}`);
    throw error;
  }
}

export { db };
