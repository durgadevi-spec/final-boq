import pg from "pg";
import path from "path";
import dotenv from "dotenv";

/**
 * Load .env ONLY for local development
 * Render / Vercel already inject env vars
 */
if (process.env.NODE_ENV !== "production") {
  const envPath = path.resolve(process.cwd(), ".env");
  console.log("[db-client] Loading local .env from:", envPath);
  dotenv.config({ path: envPath });
}

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://boq_admin:boq_admin_pass@localhost:5432/boq";

console.log(
  "[db-client] Connecting to:",
  connectionString.includes("supabase") ? "SUPABASE ✓" : "LOCAL ✓"
);

const poolConfig: pg.PoolConfig = {
  connectionString,
};

/**
 * Supabase / hosted Postgres requires SSL
 */
if (connectionString.includes("supabase")) {
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
}

export const pool = new pg.Pool(poolConfig);

pool.on("error", (err) => {
  console.error("[db-pool] Unexpected error:", err);
});

// Non-blocking test connection
pool
  .connect()
  .then((client) => {
    console.log("[db-pool] ✓ Database connected");
    client.release();
  })
  .catch((err) => {
    console.error("[db-pool] ✗ Database connection failed:", err.message);
  });

export async function query<T = any>(text: string, params: any[] = []) {
  return pool.query<T>(text, params);
}

export default { pool, query };
