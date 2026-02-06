import pg from "pg";
import type { QueryResultRow } from "pg";
import fs from "fs";
import path from "path";

// Load .env file BEFORE creating the pool
// In production, DATABASE_URL should be set via environment
// In development, try to load from .env file
let envPath: string | null = null;

// Try to determine the env file location
try {
  // When running from dist/index.cjs, __dirname would be the dist folder
  // Go up one level to the root directory where .env is located
  if (typeof __dirname !== "undefined") {
    envPath = path.join(__dirname, "..", ".env");
  }
} catch {
  // If __dirname is not available, try module.filename
  try {
    if (typeof module !== "undefined" && module.filename) {
      envPath = path.join(path.dirname(module.filename), "..", "..", ".env");
    }
  } catch {
    // Ignore and rely on process.env.DATABASE_URL
  }
}

console.log("[db-client] Loading .env from:", envPath);
console.log("[db-client] .env exists:", envPath && fs.existsSync(envPath));

if (envPath && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  console.log("[db-client] .env content length:", envContent.length);
  
  // Try multiple ways to extract the URL
  let dbUrl = process.env.DATABASE_URL;
  
  // Method 1: quoted string
  const match1 = envContent.match(/DATABASE_URL="([^"]+)"/);
  if (match1 && match1[1]) {
    dbUrl = match1[1];
    console.log("[db-client] ✓ Extracted DATABASE_URL from quoted string");
  }
  
  // Method 2: unquoted string
  if (!dbUrl) {
    const match2 = envContent.match(/DATABASE_URL=(.+)$/m);
    if (match2 && match2[1]) {
      dbUrl = match2[1].trim();
      console.log("[db-client] ✓ Extracted DATABASE_URL from unquoted string");
    }
  }
  
  if (dbUrl) {
    process.env.DATABASE_URL = dbUrl;
    console.log("[db-client] ✓ Set DATABASE_URL to Supabase");
    console.log("[db-client] URL preview:", dbUrl.substring(0, 50) + "...");
  } else {
    console.log("[db-client] ⚠ Could not extract DATABASE_URL from .env");
  }
}

const connectionString = process.env.DATABASE_URL || "postgres://boq_admin:boq_admin_pass@localhost:5432/boq";
console.log("[db-client] Connecting to:", connectionString.includes("supabase") ? "SUPABASE ✓" : "LOCAL ✗");

// For Supabase connections, we need to accept self-signed certificates
const poolConfig: any = { 
  connectionString
};

if (connectionString.includes("supabase")) {
  // Use environment variable to disable cert validation
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  poolConfig.ssl = "require";
}

export const pool = new pg.Pool(poolConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error("[db-pool] Unexpected error on idle client", err);
});

// Test the connection asynchronously (don't block startup)
pool.connect()
  .then((client) => {
    console.log("[db-pool] ✓ Successfully connected to database");
    client.release();
  })
  .catch((err: any) => {
    console.error("[db-pool] ✗ Failed to connect to database:", err.message);
  });

export async function query<T extends QueryResultRow = any>(text: string, params: any[] = []) {
  return pool.query<T>(text, params);
}

export default { pool, query };
