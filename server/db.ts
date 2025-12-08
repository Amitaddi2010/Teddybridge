import * as schema from "@shared/schema";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

// Support both SQLite (development) and PostgreSQL (production)
const isPostgres = process.env.DATABASE_URL?.startsWith("postgresql://") || 
                   process.env.DATABASE_URL?.startsWith("postgres://");

let db: any;

if (isPostgres) {
  // PostgreSQL for production (Render, etc.) - initialize synchronously with top-level await
  // We'll use a promise-based approach that resolves before server starts
  const initDb = (async () => {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must be set for PostgreSQL");
    }
    
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const pgDb = drizzle(pool, { schema });
    console.log("✓ PostgreSQL database connected");
    return pgDb;
  })();
  
  // Export a promise that resolves to the db
  // This will be awaited in server/index.ts before starting the server
  db = initDb;
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

// Export db - for SQLite it's the db object, for PostgreSQL it's a promise
export { db };

// Helper to get the actual db (awaits if it's a promise)
export async function getDb() {
  if (db instanceof Promise) {
    return await db;
  }
  return db;
}
