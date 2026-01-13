import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";
import { hashPassword } from "./auth";
import bcryptjs from "bcryptjs";
import pg from "pg";

// modify the interface with any CRUD methods you might need
export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers?(): Promise<User[]>;
}

// PostgreSQL storage (production)
export class PostgresStorage implements IStorage {
  private pool: pg.Pool;

  constructor() {
    this.pool = new pg.Pool({
      host: process.env.DATABASE_HOST || "localhost",
      port: parseInt(process.env.DATABASE_PORT || "5432"),
      database: process.env.DATABASE_NAME || "boq",
      user: process.env.DATABASE_USER || "boq_user",
      password: process.env.DATABASE_PASSWORD || "boq_password",
    });

    this.seedDemoUsers();
  }

  private async seedDemoUsers(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[storage] Initializing PostgreSQL with demo users...");

    const demoUsers: Array<InsertUser> = [
      { username: "admin@example.com", password: "DemoPass123!", role: "admin" },
      { username: "software@example.com", password: "DemoPass123!", role: "software_team" },
      { username: "purchase@example.com", password: "DemoPass123!", role: "purchase_team" },
      { username: "user@example.com", password: "DemoPass123!", role: "user" },
      { username: "supplier@example.com", password: "DemoPass123!", role: "supplier" },
    ];

    let seededCount = 0;
    for (const u of demoUsers) {
      try {
        const existing = await this.getUserByUsername(u.username);
        if (!existing) {
          await this.createUser(u);
          seededCount++;
          // eslint-disable-next-line no-console
          console.log(`[storage] Seeded user: ${u.username} (role: ${u.role})`);
        }
      } catch (err: unknown) {
        // eslint-disable-next-line no-console
        console.warn(`[storage] Failed to seed ${u.username}:`, err as any);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[storage] Demo users initialized. Seeded ${seededCount} users.`);
  }

  async getUser(id: string): Promise<User | undefined> {
    try {
      const result = await this.pool.query("SELECT * FROM users WHERE id = $1", [id]);
      return result.rows[0];
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error("Error fetching user:", err as any);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const result = await this.pool.query("SELECT * FROM users WHERE username = $1", [username]);
      return result.rows[0];
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error("Error fetching user by username:", err as any);
      return undefined;
    }
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const hashedPassword = await hashPassword(user.password);
    try {
      await this.pool.query(
        "INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)",
        [id, user.username, hashedPassword, user.role || "user"]
      );
      return {
        id,
        username: user.username,
        password: hashedPassword,
        role: user.role || "user",
      };
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error("Error creating user:", err as any);
      throw err as any;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const result = await this.pool.query("SELECT * FROM users");
      return result.rows;
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error("Error fetching all users:", err as any);
      return [];
    }
  }
}

// In-memory storage (fallback / dev)
export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
    this.seedDemoUsers();
  }

  private seedDemoUsers(): void {
    // eslint-disable-next-line no-console
    console.log("[storage] Initializing with demo users...");

    const demoUsers: Array<InsertUser> = [
      { username: "admin@example.com", password: "DemoPass123!", role: "admin" },
      { username: "software@example.com", password: "DemoPass123!", role: "software_team" },
      { username: "purchase@example.com", password: "DemoPass123!", role: "purchase_team" },
      { username: "user@example.com", password: "DemoPass123!", role: "user" },
      { username: "supplier@example.com", password: "DemoPass123!", role: "supplier" },
    ];

    let seededCount = 0;
    for (const u of demoUsers) {
      try {
        const existing = Array.from(this.users.values()).find(
          (user) => user.username === u.username
        );
        if (!existing) {
          const salt = bcryptjs.genSaltSync(10);
          const hashedPassword = bcryptjs.hashSync(u.password, salt);
          const id = randomUUID();
          const user: User = {
            id,
            username: u.username,
            password: hashedPassword,
            role: u.role || "user",
          };
          this.users.set(id, user);
          seededCount++;
          // eslint-disable-next-line no-console
          console.log(`[storage] Seeded user: ${u.username} (role: ${u.role})`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[storage] Failed to seed ${u.username}:`, err);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[storage] Demo users initialized. Seeded ${seededCount} users.`);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const hashedPassword = await hashPassword(insertUser.password);
    const user: User = {
      id,
      username: insertUser.username,
      password: hashedPassword,
      role: insertUser.role || "user",
    };
    this.users.set(id, user);
    return user;
  }
}

const storageKind = process.env.STORAGE || "postgres";
let storageImpl: IStorage;

if (storageKind === "postgres" || storageKind === "pg") {
  storageImpl = new PostgresStorage();
  // eslint-disable-next-line no-console
  console.log("[storage] Using PostgresStorage");
} else {
  storageImpl = new MemStorage();
  // eslint-disable-next-line no-console
  console.log("[storage] Using MemStorage (in-memory)");
}

export const storage = storageImpl;
