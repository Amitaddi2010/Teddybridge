import * as schema from "@shared/schema";

// Support both SQLite (development) and PostgreSQL (production)
const isPostgres = process.env.DATABASE_URL?.startsWith("postgresql://") || 
                   process.env.DATABASE_URL?.startsWith("postgres://");

let db: any;

if (isPostgres) {
  // PostgreSQL for production (Render, etc.)
  const { drizzle } = require("drizzle-orm/node-postgres");
  const { Pool } = require("pg");
  
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set for PostgreSQL");
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
} else {
  // SQLite for local development
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const Database = require("better-sqlite3");
  const dbPath = process.env.DATABASE_URL || "./database.sqlite";
  const sqlite = new Database(dbPath);
  db = drizzle(sqlite, { schema });
}

export { db };
