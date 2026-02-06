import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { comparePasswords, generateToken } from "./auth";
import { authMiddleware, requireRole } from "./middleware";
import { randomUUID } from "crypto";
import { query } from "./db/client";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Seed default material templates on startup (best-effort)
  try {
    // dynamic import to avoid circular deps during startup
    const { seedMaterialTemplates } = await import("./seed-templates");
    await seedMaterialTemplates();
  } catch (err: unknown) {
    console.warn(
      "[seed] Could not run material template seed:",
      (err as any)?.message || err,
    );
  }

  // Seed category and subcategory tables on startup
  try {
    const { seedMaterialCategories } = await import("./seed-categories");
    await seedMaterialCategories();
  } catch (err: unknown) {
    console.warn(
      "[seed] Could not run category seed:",
      (err as any)?.message || err,
    );
  }

  // Ensure messages table exists (create if missing) to avoid runtime errors in dev
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_name TEXT NOT NULL,
        sender_email TEXT,
        sender_role TEXT,
        message TEXT NOT NULL,
        info TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMPTZ DEFAULT now(),
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_messages_sender_role ON messages (sender_role)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at)`,
    );
  } catch (err: unknown) {
    console.warn(
      "[migrations] ensure messages table failed (continuing):",
      (err as any)?.message || err,
    );
  }

  // Ensure accumulated_products table exists
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS accumulated_products (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        estimator_type VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_accumulated_products_user_estimator ON accumulated_products(user_id, estimator_type)`,
    );
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create accumulated_products table:",
      (err as any)?.message || err,
    );
  }

  // Ensure estimator tables exist
  try {
    // Create estimator_step9_cart table (Add to BOQ) - only if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS estimator_step9_cart (
        id SERIAL PRIMARY KEY,
        estimator VARCHAR(50) NOT NULL,
        bill_no VARCHAR(100) NOT NULL,
        s_no INTEGER,
        item VARCHAR(255),
        description TEXT,
        unit VARCHAR(50),
        qty DECIMAL,
        rate DECIMAL,
        amount DECIMAL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create estimator_step11_finalize_boq table (Finalize BOQ) - only if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS estimator_step11_finalize_boq (
        id SERIAL PRIMARY KEY,
        estimator VARCHAR(50) NOT NULL,
        bill_no VARCHAR(100) NOT NULL,
        s_no INTEGER,
        item VARCHAR(255),
        location VARCHAR(255),
        description TEXT,
        unit VARCHAR(50),
        qty DECIMAL,
        supply_rate DECIMAL,
        install_rate DECIMAL,
        supply_amount DECIMAL,
        install_amount DECIMAL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create estimator_step12_qa_boq table (QA BOQ) - only if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS estimator_step12_qa_boq (
        id SERIAL PRIMARY KEY,
        estimator VARCHAR(50) NOT NULL,
        bill_no VARCHAR(100) NOT NULL,
        s_no INTEGER,
        item VARCHAR(255),
        location VARCHAR(255),
        description TEXT,
        unit VARCHAR(50),
        qty DECIMAL,
        supply_rate DECIMAL,
        install_rate DECIMAL,
        supply_amount DECIMAL,
        install_amount DECIMAL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step9_cart_bill_no ON estimator_step9_cart(bill_no)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step9_cart_estimator ON estimator_step9_cart(estimator)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step11_finalize_boq_bill_no ON estimator_step11_finalize_boq(bill_no)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step11_finalize_boq_estimator ON estimator_step11_finalize_boq(estimator)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step12_qa_boq_bill_no ON estimator_step12_qa_boq(bill_no)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step12_qa_boq_estimator ON estimator_step12_qa_boq(estimator)`,
    );

    console.log(
      "[db] Estimator tables verified/created with correct structure",
    );
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create estimator tables:",
      (err as any)?.message || err,
    );
  }

  // Ensure material_submissions table has required columns
  try {
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(36)`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT NOW()`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS dimensions VARCHAR(255)`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS finishtype VARCHAR(255)`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS metaltype VARCHAR(255)`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS product VARCHAR(255)`,
    );
  } catch (err: unknown) {
    console.warn(
      "[migrations] ensure material_submissions columns failed (continuing):",
      (err as any)?.message || err,
    );
  }

  // Ensure boq_projects table exists (stores BOQ projects)
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS boq_projects (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        client VARCHAR(255),
        budget VARCHAR(100),
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_projects_created_at ON boq_projects(created_at)`,
    );
    console.log("[db] boq_projects table verified/created");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create boq_projects table:",
      (err as any)?.message || err,
    );
  }

  // Ensure boq_items table exists (stores BOQ line items captured from estimators)
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS boq_items (
        id VARCHAR(100) PRIMARY KEY,
        project_id VARCHAR(100) NOT NULL,
        estimator VARCHAR(50) NOT NULL,
        table_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES boq_projects(id) ON DELETE CASCADE
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_items_project_id ON boq_items(project_id)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_items_estimator ON boq_items(estimator)`,
    );
    console.log("[db] boq_items table verified/created");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create boq_items table:",
      (err as any)?.message || err,
    );
  }

  // Ensure boq_versions table exists (stores BOQ versions)
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS boq_versions (
        id VARCHAR(100) PRIMARY KEY,
        project_id VARCHAR(100) NOT NULL,
        project_name VARCHAR(255),
        project_client VARCHAR(255),
        version_number INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES boq_projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, version_number)
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_versions_project_id ON boq_versions(project_id)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_versions_status ON boq_versions(status)`,
    );
    console.log("[db] boq_versions table verified/created");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create boq_versions table:",
      (err as any)?.message || err,
    );
  }

  // Ensure new columns exist on existing installations and populate them
  try {
    await query(`ALTER TABLE boq_versions ADD COLUMN IF NOT EXISTS project_name VARCHAR(255)`);
    await query(`ALTER TABLE boq_versions ADD COLUMN IF NOT EXISTS project_client VARCHAR(255)`);

    // Populate project_name and project_client from boq_projects where missing
    await query(`
      UPDATE boq_versions v
      SET project_name = p.name, project_client = p.client
      FROM boq_projects p
      WHERE v.project_id = p.id
        AND (v.project_name IS NULL OR v.project_client IS NULL)
    `);

    console.log("[db] boq_versions project_name and project_client populated");
  } catch (err: unknown) {
    console.warn("[db] Could not ensure/populate boq_versions project columns:", (err as any)?.message || err);
  }

  // Migrate boq_items to support version_id
  try {
    await query(
      `ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS version_id VARCHAR(100)`,
    );
    console.log("[db] boq_items version_id column ensured");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not add version_id column to boq_items:",
      (err as any)?.message || err,
    );
  }

  // Add foreign key constraint (ignore error if it already exists)
  try {
    await query(
      `ALTER TABLE boq_items ADD CONSTRAINT fk_boq_items_version FOREIGN KEY (version_id) REFERENCES boq_versions(id) ON DELETE CASCADE`,
    );
    console.log("[db] boq_items foreign key constraint added");
  } catch (err: unknown) {
    // Constraint might already exist, which is fine
    const errorMsg = (err as any)?.message || "";
    if (!errorMsg.includes("already exists")) {
      console.warn("[db] Warning adding foreign key constraint:", errorMsg);
    }
  }

  // Ensure boq_items has a user_added flag (only items explicitly saved via Add Product)
  try {
    await query(
      `ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS user_added BOOLEAN DEFAULT true`,
    );
    console.log("[db] boq_items user_added column ensured");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not ensure user_added column on boq_items:",
      (err as any)?.message || err,
    );
  }

  // In-memory fallback storage for messages when DB is unreachable (development only)
  let inMemoryMessages: any[] = [];
  let inMemoryMessagesEnabled = false;

  // ====== PUBLIC AUTH ROUTES ======

  // POST /api/auth/signup - Register a new user
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const {
        username,
        password,
        role,
        fullName,
        mobileNumber,
        department,
        employeeCode,
        companyName,
        gstNumber,
        businessAddress,
      } = req.body;

      console.log("[signup] Received signup request:", {
        username,
        role,
        hasPassword: !!password,
        hasFullName: !!fullName,
        hasMobileNumber: !!mobileNumber,
      });

      if (!username || !password) {
        res.status(400).json({ message: "Username and password are required" });
        return;
      }

      if (!role) {
        res.status(400).json({ message: "Role is required" });
        return;
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        console.log("[signup] User already exists:", username);
        res.status(409).json({ message: "User already exists" });
        return;
      }

      // Create new user - pre_sales and contractor don't need extra fields
      console.log("[signup] Creating user with role:", role);
      const user = await storage.createUser({
        username,
        password,
        role: role || "user",
        fullName,
        mobileNumber,
        department: role === "pre_sales" || role === "contractor" ? null : department,
        employeeCode: role === "pre_sales" || role === "contractor" ? null : employeeCode,
        companyName: role === "supplier" ? companyName : null,
        gstNumber: role === "supplier" ? gstNumber : null,
        businessAddress: role === "supplier" ? businessAddress : null,
      });

      console.log("[signup] User created successfully:", user.id);

      // ✅ NEW: ensure approval columns exist + mark supplier as pending (DB controls approval)
      try {
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const approvedValue = role === "supplier" ? "pending" : "approved";
        await query(`UPDATE users SET approved = $2 WHERE id = $1`, [
          user.id,
          approvedValue,
        ]);
        console.log(`[signup] User ${user.id} approved status set to: ${approvedValue}`);
      } catch (err: unknown) {
        console.warn(
          "[signup] could not set approval status (continuing):",
          (err as any)?.message || err,
        );
      }

      // TODO: Store additional profile information in a separate table
      // For now, just log the additional data
      console.log(`New user registered:`, {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName,
        mobileNumber,
        department,
        employeeCode,
        companyName,
        gstNumber,
        businessAddress,
      });

      // Return user without password (NO AUTO-LOGIN, NO TOKEN)
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json({
        message: "User created successfully",
        user: userWithoutPassword,
      });
    } catch (error: any) {
      console.error("[signup] Error:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        fullError: error,
      });
      
      // Provide more specific error messages
      if (error.code === "23505") {
        // Unique constraint violation
        res.status(409).json({ message: "Username already exists" });
      } else if (error.message?.includes("not null")) {
        res.status(400).json({ message: "Missing required field: " + error.message });
      } else {
        res.status(500).json({ message: "Signup failed: " + (error?.message || "Unknown error") });
      }
    }
  });

  // POST /api/auth/login - Login user
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ message: "Username and password are required" });
        return;
      }

      // Find user by username
      const user = await storage.getUserByUsername(username);
      // Debug logging
      // eslint-disable-next-line no-console
      console.log(
        `[auth] login attempt for username=${username} found=${!!user}`,
      );

      if (!user) {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }

      // Check approval status for suppliers
      if (user.role === "supplier" && user.approved !== "approved") {
        if (user.approved === "pending") {
          res.status(403).json({
            message: "Account is under review. Please wait for approval.",
          });
          return;
        } else if (user.approved === "rejected") {
          res.status(403).json({
            message: `Account rejected: ${
              user.approvalReason || "No reason provided"
            }`,
          });
          return;
        }
      }

      // Compare password
      const isPasswordValid = await comparePasswords(password, user.password);
      // eslint-disable-next-line no-console
      console.log(
        `[auth] password valid=${isPasswordValid} for username=${username}`,
      );
      if (!isPasswordValid) {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }

      // Generate token
      const token = generateToken(user);

      // Return user WITHOUT password
      const { password: _, ...userWithoutPassword } = user;

      res.json({
        message: "Login successful",
        user: userWithoutPassword,
        token,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/auth/forgot-password - Request password reset
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ message: "Email is required" });
        return;
      }

      // Check if user exists
      const user = await storage.getUserByUsername(email);
      if (!user) {
        // Don't reveal if email exists or not for security
        res.status(200).json({
          message: "If the email exists, a reset link has been sent",
        });
        return;
      }

      // TODO: Implement actual password reset logic
      // - Generate reset token
      // - Store token with expiry
      // - Send email with reset link

      // For now, just return success
      console.log(`Password reset requested for: ${email}`);
      res
        .status(200)
        .json({ message: "Password reset link sent to your email" });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ====== PROTECTED ROUTES ======

  // DEV-ONLY: list all in-memory users (no passwords) for debugging
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/debug/users", async (_req, res) => {
      try {
        // storage.getAllUsers returns users with hashed passwords; omit password
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const all = (await (storage as any).getAllUsers()) as any[];
        const sanitized = all.map((u) => {
          const { password: _pw, ...rest } = u;
          return rest;
        });
        res.json({ users: sanitized });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("/api/debug/users failed", err);
        res.status(500).json({ message: "debug endpoint error" });
      }
    });
  }

  // GET /api/auth/me - Get current user profile
  app.get(
    "/api/auth/me",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          res.status(401).json({ message: "Unauthorized" });
          return;
        }

        const user = await storage.getUser(req.user.id);
        if (!user) {
          res.status(404).json({ message: "User not found" });
          return;
        }

        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // ======================================================================
  // ✅ SUPPLIER APPROVAL ROUTES (ADMIN ONLY)
  // ======================================================================

  // GET /api/suppliers-pending-approval - list suppliers pending/rejected (not approved)
  app.get(
    "/api/suppliers-pending-approval",
    authMiddleware,
    requireRole("admin"),
    async (_req: Request, res: Response) => {
      try {
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `SELECT id, username, role, approved, approval_reason
           FROM users
           WHERE role = 'supplier' AND approved IS DISTINCT FROM 'approved'
           ORDER BY username ASC`,
        );

        res.json({ suppliers: result.rows });
      } catch (err: any) {
        console.error("/api/suppliers-pending-approval error", err);
        res.status(500).json({ message: "failed to list pending suppliers" });
      }
    },
  );

  // POST /api/suppliers/:id/approve - approve supplier
  app.post(
    "/api/suppliers/:id/approve",
    authMiddleware,
    requireRole("admin"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;

        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `UPDATE users
           SET approved = 'approved', approval_reason = NULL
           WHERE id = $1 AND role = 'supplier'
           RETURNING id, username, role, approved, approval_reason`,
          [id],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Supplier not found" });
          return;
        }

        res.json({ supplier: result.rows[0] });
      } catch (err: any) {
        console.error("/api/suppliers/:id/approve error", err);
        res.status(500).json({ message: "failed to approve supplier" });
      }
    },
  );

  // POST /api/suppliers/:id/reject - reject supplier with reason
  app.post(
    "/api/suppliers/:id/reject",
    authMiddleware,
    requireRole("admin"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        const reason = req.body?.reason || null;

        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `UPDATE users
           SET approved = 'rejected', approval_reason = $2
           WHERE id = $1 AND role = 'supplier'
           RETURNING id, username, role, approved, approval_reason`,
          [id, reason],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Supplier not found" });
          return;
        }

        res.json({ supplier: result.rows[0] });
      } catch (err: any) {
        console.error("/api/suppliers/:id/reject error", err);
        res.status(500).json({ message: "failed to reject supplier" });
      }
    },
  );

  // ======================================================================
  // ✅ ADDED: UI COMPAT ROUTES (YOUR FRONTEND CALLS /api/admin/...)
  // ======================================================================

  // GET /api/admin/pending-suppliers (frontend expects this)
  app.get(
    "/api/admin/pending-suppliers",
    authMiddleware,
    requireRole("admin"),
    async (_req: Request, res: Response) => {
      try {
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        // Only PENDING suppliers (so the page won't show approved ones)
        const result = await query(
          `SELECT id, username, role, approved, approval_reason, created_at
           FROM users
           WHERE role = 'supplier' AND approved = 'pending'
           ORDER BY created_at DESC`,
        );

        res.json({ suppliers: result.rows });
      } catch (err: any) {
        console.error("/api/admin/pending-suppliers error", err);
        res.status(500).json({ message: "failed to list pending suppliers" });
      }
    },
  );

  // POST /api/admin/suppliers/:id/approve (frontend expects this)
  app.post(
    "/api/admin/suppliers/:id/approve",
    authMiddleware,
    requireRole("admin"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;

        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `UPDATE users
           SET approved = 'approved', approval_reason = NULL
           WHERE id = $1 AND role = 'supplier'
           RETURNING id, username, role, approved, approval_reason`,
          [id],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Supplier not found" });
          return;
        }

        res.json({ supplier: result.rows[0] });
      } catch (err: any) {
        console.error("/api/admin/suppliers/:id/approve error", err);
        res.status(500).json({ message: "failed to approve supplier" });
      }
    },
  );

  // POST /api/admin/suppliers/:id/reject (frontend expects this)
  app.post(
    "/api/admin/suppliers/:id/reject",
    authMiddleware,
    requireRole("admin"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        const reason = req.body?.reason || null;

        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `UPDATE users
           SET approved = 'rejected', approval_reason = $2
           WHERE id = $1 AND role = 'supplier'
           RETURNING id, username, role, approved, approval_reason`,
          [id, reason],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Supplier not found" });
          return;
        }

        res.json({ supplier: result.rows[0] });
      } catch (err: any) {
        console.error("/api/admin/suppliers/:id/reject error", err);
        res.status(500).json({ message: "failed to reject supplier" });
      }
    },
  );

  // ====== SHOPS & MATERIALS API ======

  // GET /api/shops - list shops
  app.get("/api/shops", async (_req, res) => {
    try {
      // Only return shops that are approved for public listing
      const result = await query(
        "SELECT * FROM shops WHERE approved IS TRUE ORDER BY created_at DESC",
      );
      res.json({ shops: result.rows });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/shops error", err);
      res.status(500).json({ message: "failed to list shops" });
    }
  });

  // POST /api/shops - create shop (authenticated)
  app.post(
    "/api/shops",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          res
            .status(401)
            .json({ message: "Unauthorized: user not authenticated" });
          return;
        }

        const body = req.body || {};
        const id = randomUUID();
        const categories = Array.isArray(body.categories)
          ? body.categories
          : [];

        // eslint-disable-next-line no-console
        console.log(
          `[POST /api/shops] inserting shop: name=${body.name}, owner_id=${req.user.id}`,
        );

        const result = await query(
          `INSERT INTO shops (id, name, location, phoneCountryCode, contactNumber, city, state, country, pincode, image, rating, categories, gstno, owner_id, approved, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now()) RETURNING *`,
          [
            id,
            body.name || null,
            body.location || null,
            body.phoneCountryCode || null,
            body.contactNumber || null,
            body.city || null,
            body.state || null,
            body.country || null,
            body.pincode || null,
            body.image || null,
            body.rating || null,
            JSON.stringify(categories),
            body.gstNo || null,
            req.user.id,
            false,
          ],
        );

        if (!result.rows || result.rows.length === 0) {
          res
            .status(500)
            .json({ message: "failed to create shop - no rows returned" });
          return;
        }

        res.status(201).json({ shop: result.rows[0] });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("create shop error", err);
        const errMessage = err instanceof Error ? err.message : String(err);
        res
          .status(500)
          .json({ message: "failed to create shop", error: errMessage });
      }
    },
  );

  // GET /api/materials - list materials
  app.get("/api/materials", async (_req, res) => {
    try {
      // Only return materials that are approved for public listing
      const result = await query(
        "SELECT * FROM materials WHERE approved IS TRUE ORDER BY created_at DESC",
      );
      res.json({ materials: result.rows });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/materials error", err);
      res.status(500).json({ message: "failed to list materials" });
    }
  });

  // POST /api/materials - create material (authenticated)
  app.post(
    "/api/materials",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          res
            .status(401)
            .json({ message: "Unauthorized: user not authenticated" });
          return;
        }

        const body = req.body || {};
        const id = randomUUID();
        const attributes =
          typeof body.attributes === "object" ? body.attributes : {};

        // eslint-disable-next-line no-console
        console.log(
          `[POST /api/materials] inserting material: name=${body.name}, shop_id=${body.shopId}`,
        );

        const result = await query(
          `INSERT INTO materials (id, name, code, rate, shop_id, unit, category, brandname, modelnumber, subcategory, product, technicalspecification, image, attributes, master_material_id, approved, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now()) RETURNING *`,
          [
            id,
            body.name || null,
            body.code || null,
            body.rate || 0,
            body.shopId || null,
            body.unit || null,
            body.category || null,
            body.brandName || null,
            body.modelNumber || null,
            body.subCategory || null,
            body.product || null,
            body.technicalSpecification || null,
            body.image || null,
            JSON.stringify(attributes || {}),
            body.masterMaterialId || null,
            false,
          ],
        );

        if (!result.rows || result.rows.length === 0) {
          res
            .status(500)
            .json({ message: "failed to create material - no rows returned" });
          return;
        }

        res.status(201).json({ material: result.rows[0] });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("create material error", err);
        const errMessage = err instanceof Error ? err.message : String(err);
        res
          .status(500)
          .json({ message: "failed to create material", error: errMessage });
      }
    },
  );

  // GET /api/shops/:id
  app.get("/api/shops/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await query("SELECT * FROM shops WHERE id = $1", [id]);
      if (result.rowCount === 0)
        return res.status(404).json({ message: "not found" });
      res.json({ shop: result.rows[0] });
    } catch (err: unknown) {
      console.error(err as any);
      res.status(500).json({ message: "error" });
    }
  });

  // PUT /api/shops/:id
  app.put("/api/shops/:id", authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body || {};
      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const k of [
        "name",
        "location",
        "phoneCountryCode",
        "contactNumber",
        "city",
        "state",
        "country",
        "pincode",
        "image",
        "rating",
        "gstNo",
      ]) {
        if (body[k] !== undefined) {
          fields.push(`${k} = $${idx++}`);
          vals.push(body[k]);
        }
      }
      if (body.categories !== undefined) {
        fields.push(`categories = $${idx++}`);
        vals.push(JSON.stringify(body.categories));
      }
      if (fields.length === 0)
        return res.status(400).json({ message: "no fields" });
      vals.push(id);
      const q = `UPDATE shops SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
      const result = await query(q, vals);
      res.json({ shop: result.rows[0] });
    } catch (err: unknown) {
      console.error(err as any);
      res.status(500).json({ message: "error" });
    }
  });

  // DELETE /api/shops/:id
  app.delete(
    "/api/shops/:id",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        await query("DELETE FROM materials WHERE shop_id = $1", [id]);
        await query("DELETE FROM shops WHERE id = $1", [id]);
        res.json({ message: "deleted" });
      } catch (err: unknown) {
        console.error(err as any);
        res.status(500).json({ message: "error" });
      }
    },
  );

  // Approve / reject shop
  app.post(
    "/api/shops/:id/approve",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        // ensure approved column exists
        await query(
          "ALTER TABLE shops ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true",
        );
        await query(
          "ALTER TABLE shops ADD COLUMN IF NOT EXISTS approval_reason text",
        );
        const result = await query(
          "UPDATE shops SET approved = true, approval_reason = NULL WHERE id = $1 RETURNING *",
          [id],
        );
        res.json({ shop: result.rows[0] });
      } catch (err: unknown) {
        console.error(err as any);
        res.status(500).json({ message: "error" });
      }
    },
  );

  app.post(
    "/api/shops/:id/reject",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        const reason = req.body?.reason || null;
        await query(
          "ALTER TABLE shops ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true",
        );
        await query(
          "ALTER TABLE shops ADD COLUMN IF NOT EXISTS approval_reason text",
        );
        const result = await query(
          "UPDATE shops SET approved = false, approval_reason = $2 WHERE id = $1 RETURNING *",
          [id, reason],
        );
        res.json({ shop: result.rows[0] });
      } catch (err: unknown) {
        console.error(err as any);
        res.status(500).json({ message: "error" });
      }
    },
  );

  // MATERIAL endpoints: GET by id, PUT, DELETE, approve/reject
  app.get("/api/materials/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await query("SELECT * FROM materials WHERE id = $1", [id]);
      if (result.rowCount === 0)
        return res.status(404).json({ message: "not found" });
      res.json({ material: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "error" });
    }
  });

  app.put("/api/materials/:id", authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body || {};
      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const k of [
        "name",
        "code",
        "rate",
        "shop_id",
        "unit",
        "category",
        "brandname",
        "modelnumber",
        "subcategory",
        "product",
        "technicalspecification",
        "image",
      ]) {
        if (body[k] !== undefined) {
          fields.push(`${k} = $${idx++}`);
          vals.push(body[k]);
        }
      }
      if (body.attributes !== undefined) {
        fields.push(`attributes = $${idx++}`);
        vals.push(JSON.stringify(body.attributes));
      }
      if (fields.length === 0)
        return res.status(400).json({ message: "no fields" });
      vals.push(id);
      const q = `UPDATE materials SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
      console.log('[PUT /api/materials/:id] body:', body);
      console.log('[PUT /api/materials/:id] query:', q);
      console.log('[PUT /api/materials/:id] vals:', vals);
      const result = await query(q, vals);
      res.json({ material: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "error" });
    }
  });

  app.delete(
    "/api/materials/:id",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        await query("DELETE FROM materials WHERE id = $1", [id]);
        res.json({ message: "deleted" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "error" });
      }
    },
  );

  app.post(
    "/api/materials/:id/approve",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        await query(
          "ALTER TABLE materials ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true",
        );
        await query(
          "ALTER TABLE materials ADD COLUMN IF NOT EXISTS approval_reason text",
        );
        const result = await query(
          "UPDATE materials SET approved = true, approval_reason = NULL WHERE id = $1 RETURNING *",
          [id],
        );
        res.json({ material: result.rows[0] });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "error" });
      }
    },
  );

  app.post(
    "/api/materials/:id/reject",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        const reason = req.body?.reason || null;
        await query(
          "ALTER TABLE materials ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true",
        );
        await query(
          "ALTER TABLE materials ADD COLUMN IF NOT EXISTS approval_reason text",
        );
        const result = await query(
          "UPDATE materials SET approved = false, approval_reason = $2 WHERE id = $1 RETURNING *",
          [id, reason],
        );
        res.json({ material: result.rows[0] });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "error" });
      }
    },
  );

  // GET pending approvals for materials and shops
  app.get("/api/materials-pending-approval", async (_req, res) => {
    try {
      // materials pending approval are those where approved is not true (NULL or false)
      const result = await query(
        "SELECT * FROM materials WHERE approved IS NOT TRUE ORDER BY created_at DESC",
      );
      const requests = result.rows.map((r: any) => ({
        id: r.id,
        status: "pending",
        material: r,
      }));
      res.json({ materials: requests });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/materials-pending-approval error", err);
      res.status(500).json({ message: "failed to list pending materials" });
    }
  });

  app.get("/api/shops-pending-approval", async (_req, res) => {
    try {
      const result = await query(
        "SELECT * FROM shops WHERE approved IS NOT TRUE ORDER BY created_at DESC",
      );
      const requests = result.rows.map((r: any) => ({
        id: r.id,
        status: "pending",
        shop: r,
      }));
      res.json({ shops: requests });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/shops-pending-approval error", err);
      res.status(500).json({ message: "failed to list pending shops" });
    }
  });

  // ====== MATERIAL TEMPLATES ROUTES (Admin/Software Team only) ======

  // GET /api/material-templates - List all material templates
  app.get("/api/material-templates", async (_req, res) => {
    try {
      const result = await query(
        "SELECT * FROM material_templates ORDER BY created_at DESC",
      );
      res.json({ templates: result.rows });
    } catch (err) {
      console.error("/api/material-templates error", err);
      res.status(500).json({ message: "failed to list material templates" });
    }
  });

  // POST /api/material-templates - Create a new material template
  app.post(
    "/api/material-templates",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { name, code, category } = req.body;

        if (!name || !name.trim()) {
          res.status(400).json({ message: "Template name is required" });
          return;
        }

        if (!code || !code.trim()) {
          res.status(400).json({ message: "Template code is required" });
          return;
        }

        const id = randomUUID();
        const result = await query(
          `INSERT INTO material_templates (id, name, code, category, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, NOW(), NOW()) 
         RETURNING *`,
          [id, name.trim(), code.trim(), category || null],
        );

        res.status(201).json({ template: result.rows[0] });
      } catch (err) {
        console.error("/api/material-templates POST error", err);
        res.status(500).json({ message: "failed to create material template" });
      }
    },
  );

  // PUT /api/material-templates/:id - Update a material template
  app.put(
    "/api/material-templates/:id",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        console.log('[PUT /api/material-templates/:id] user:', (req as any).user);
        console.log('[PUT /api/material-templates/:id] params.id:', req.params.id);
        console.log('[PUT /api/material-templates/:id] body:', req.body);
        const { name, code, category } = req.body;

        // Only update fields that are provided
        const fields: string[] = [];
        const vals: any[] = [];
        let idx = 1;

        if (name !== undefined) {
          fields.push(`name = $${idx++}`);
          vals.push(name?.trim() || null);
        }
        if (code !== undefined) {
          fields.push(`code = $${idx++}`);
          vals.push(code?.trim() || null);
        }
        if (category !== undefined) {
          fields.push(`category = $${idx++}`);
          vals.push(category || null);
        }

        if (fields.length === 0) {
          res.status(400).json({ message: "No fields to update" });
          return;
        }

        fields.push(`updated_at = $${idx++}`);
        vals.push(new Date());
        vals.push(id);

        const q = `UPDATE material_templates SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
        console.log('[material-templates PUT] query:', q, 'vals:', vals);
        const result = await query(q, vals);

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Template not found" });
          return;
        }

        res.json({ template: result.rows[0] });
      } catch (err) {
        console.error("/api/material-templates PUT error", err);
        res.status(500).json({ message: "failed to update material template" });
      }
    },
  );

  // DELETE /api/material-templates/:id - Delete a material template
  app.delete(
    "/api/material-templates/:id",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        console.log(
          "[DELETE /material-templates/:id] Attempting to delete template:",
          id,
        );

        // First, check if template exists
        const checkResult = await query(
          "SELECT id FROM material_templates WHERE id = $1",
          [id],
        );
        console.log("[DELETE] Template exists?", checkResult.rows.length > 0);

        if (checkResult.rows.length === 0) {
          console.log("[DELETE] Template not found");
          res.status(404).json({ message: "Template not found" });
          return;
        }

        // Perform dependent deletes inside a transaction to avoid FK violations
        console.log(
          "[DELETE] Beginning transaction to remove dependent rows for template_id =",
          id,
        );
        await query("BEGIN");
        try {
          // Remove any material_submissions that reference this template
          console.log(
            "[DELETE] Deleting material_submissions with template_id =",
            id,
          );
          const subsRes = await query(
            "DELETE FROM material_submissions WHERE template_id = $1",
            [id],
          );
          console.log(
            "[DELETE] Deleted material_submissions:",
            subsRes.rowCount,
          );

          // Also delete any materials that reference this template
          console.log("[DELETE] Deleting materials with template_id =", id);
          const matsResult = await query(
            "DELETE FROM materials WHERE template_id = $1",
            [id],
          );
          console.log("[DELETE] Deleted materials:", matsResult.rowCount);

          // Delete the template itself
          console.log("[DELETE] Deleting material_template with id =", id);
          const result = await query(
            "DELETE FROM material_templates WHERE id = $1 RETURNING id",
            [id],
          );
          console.log(
            "[DELETE] Delete result rows:",
            result.rows.length,
            "rowCount:",
            result.rowCount,
          );

          await query("COMMIT");

          if (result.rows.length === 0) {
            console.log("[DELETE] No rows deleted");
            res.status(404).json({ message: "Template not found" });
            return;
          }

          console.log(
            "[DELETE] Successfully deleted template and dependents:",
            id,
          );
          res.json({ message: "Template deleted successfully" });
          return;
        } catch (innerErr) {
          console.error("[DELETE] Transaction failed, rolling back", innerErr);
          try {
            await query("ROLLBACK");
          } catch (rbErr) {
            console.error("ROLLBACK failed", rbErr);
          }
          throw innerErr;
        }

        if (result.rows.length === 0) {
          console.log("[DELETE] No rows deleted");
          res.status(404).json({ message: "Template not found" });
          return;
        }

        console.log("[DELETE] Successfully deleted template:", id);
        res.json({ message: "Template deleted successfully" });
      } catch (err) {
        console.error("/api/material-templates DELETE error", err);
        res.status(500).json({
          message: "failed to delete material template",
          error: String(err),
        });
      }
    },
  );

  // GET /api/material-categories - List categories created by admin/software_team/purchase_team
  app.get("/api/material-categories", async (_req, res) => {
    try {
      // Return all categories (including seeded ones)
      const result = await query(`
        SELECT DISTINCT name FROM material_categories
        ORDER BY name ASC
      `);
      const categories = result.rows.map((row) => row.name).filter(Boolean);
      res.json({ categories });
    } catch (err) {
      console.error("/api/material-categories error", err);
      res.status(500).json({ message: "failed to list categories" });
    }
  });

  // GET /api/material-subcategories/:category - List subcategories created by admin/software_team/purchase_team
  app.get(
    "/api/material-subcategories/:category",
    async (req: Request, res: Response) => {
      try {
        const { category } = req.params;
        // Return all subcategories for a category (including seeded ones)
        const result = await query(
          `
        SELECT DISTINCT name FROM material_subcategories 
        WHERE category = $1
        ORDER BY name ASC
      `,
          [category],
        );
        const subcategories = result.rows
          .map((row) => row.name)
          .filter(Boolean);
        res.json({ subcategories });
      } catch (err) {
        console.error("/api/material-subcategories error", err);
        res.status(500).json({ message: "failed to list subcategories" });
      }
    },
  );

  // POST /api/categories - Create a new category (Admin/Software Team/Purchase Team)
  app.post(
    "/api/categories",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { name } = req.body;

        if (!name || !name.trim()) {
          res.status(400).json({ message: "Category name is required" });
          return;
        }

        const id = randomUUID();
        const userId = (req as any).user?.id;
        const result = await query(
          `INSERT INTO material_categories (id, name, created_by) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
          [id, name.trim(), userId || null],
        );

        res.status(201).json({ category: result.rows[0] });
      } catch (err: any) {
        console.error("/api/categories error", err as any);
        if (err.code === "23505") {
          res.status(409).json({ message: "Category already exists" });
        } else {
          res.status(500).json({
            message: "failed to create category",
            error: err.message,
          });
        }
      }
    },
  );

  // POST /api/subcategories - Create a new subcategory (Admin/Software Team/Purchase Team)
  app.post(
    "/api/subcategories",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { name, category } = req.body;

        if (!name || !name.trim() || !category || !category.trim()) {
          res.status(400).json({
            message: "Subcategory name and parent category are required",
          });
          return;
        }

        const id = randomUUID();
        const userId = (req as any).user?.id;
        const result = await query(
          `INSERT INTO material_subcategories (id, name, category, created_by) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id::text, name, category, created_at, created_by`,
          [id, name.trim(), category.trim(), userId || null],
        );

        res.status(201).json({ subcategory: result.rows[0] });
      } catch (err: any) {
        console.error("/api/subcategories error", err as any);
        if (err.code === "23505") {
          res.status(409).json({
            message: "Subcategory already exists for this category",
          });
        } else {
          res.status(500).json({
            message: "failed to create subcategory",
            error: err.message,
          });
        }
      }
    },
  );

  // PUT /api/categories/:name - Update a category name
  app.put(
    "/api/categories/:name",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { name: oldName } = req.params;
        const { name: newName } = req.body;

        if (!newName || !newName.trim()) {
          res.status(400).json({ message: "Category name is required" });
          return;
        }

        // Update the category
        const result = await query(
          `UPDATE material_categories SET name = $1 WHERE name = $2 RETURNING *`,
          [newName.trim(), decodeURIComponent(oldName)],
        );

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Category not found" });
          return;
        }

        // Update all subcategories that reference this category
        await query(
          `UPDATE material_subcategories SET category = $1 WHERE category = $2`,
          [newName.trim(), decodeURIComponent(oldName)],
        );

        res.json({ category: result.rows[0] });
      } catch (err: any) {
        console.error("/api/categories PUT error", err);
        if (err.code === "23505") {
          res.status(409).json({ message: "Category already exists" });
        } else {
          res.status(500).json({ message: "failed to update category", error: err.message });
        }
      }
    },
  );

  // PUT /api/subcategories/:id - Update a subcategory name
  app.put(
    "/api/subcategories/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { name: newName, category } = req.body;

        if (!newName || !newName.trim()) {
          res.status(400).json({ message: "Subcategory name is required" });
          return;
        }

        // Update the subcategory
        const result = await query(
          `UPDATE material_subcategories SET name = $1, category = $2 WHERE id = $3 RETURNING id::text, name, category, created_at, created_by`,
          [newName.trim(), category, id],
        );

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Subcategory not found" });
          return;
        }

        res.json({ subcategory: result.rows[0] });
      } catch (err: any) {
        console.error("/api/subcategories PUT error", err);
        if (err.code === "23505") {
          res.status(409).json({ message: "Subcategory already exists" });
        } else {
          res.status(500).json({ message: "failed to update subcategory", error: err.message });
        }
      }
    },
  );

  // DELETE /api/subcategories/:id - Delete a subcategory (Admin/Software Team/Purchase Team)
  app.delete(
    "/api/subcategories/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        
        // Simply delete the subcategory
        // Note: CASCADE DELETE should be handled at the database level
        // OR we trust that products are orphaned (which is acceptable for now)
        const result = await query(
          "DELETE FROM material_subcategories WHERE id = $1 RETURNING id",
          [id],
        );
        
        if (result.rowCount === 0) {
          res.status(404).json({ message: "Subcategory not found" });
          return;
        }
        
        res.json({ message: "Subcategory deleted successfully" });
      } catch (err: any) {
        console.error("/api/subcategories DELETE error:", {
          message: err.message,
          code: err.code,
          detail: err.detail
        });
        res.status(500).json({ 
          message: "failed to delete subcategory", 
          error: err.message
        });
      }
    },
  );

  // GET /api/categories - List all categories created by admin (including seeded ones)
  app.get("/api/categories", async (_req, res) => {
    try {
      const result = await query(`
        SELECT * FROM material_categories 
        ORDER BY created_at DESC
      `);

      res.json({ categories: result.rows.map((r) => r.name) });
    } catch (err: unknown) {
      console.error("/api/categories error", err as any);
      res.status(500).json({ message: "failed to list categories" });
    }
  });

  // DELETE /api/categories/:name - Delete a category and its subcategories (Admin/Software Team only)
  app.delete(
    "/api/categories/:name",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req: Request, res: Response) => {
      try {
        const name = req.params.name;
        console.log("DELETE category request for:", name);
        if (!name)
          return res.status(400).json({ message: "category name required" });

        // Delete materials that reference templates in this category
        console.log("Deleting materials for category:", name);
        const materialsResult = await query(
          "DELETE FROM materials WHERE template_id IN (SELECT id FROM material_templates WHERE category = $1)",
          [name],
        );
        console.log("Deleted materials:", materialsResult.rowCount);

        // Delete material_templates that reference this category
        console.log("Deleting material templates for category:", name);
        const templatesResult = await query(
          "DELETE FROM material_templates WHERE category = $1",
          [name],
        );
        console.log("Deleted templates:", templatesResult.rowCount);

        // Delete subcategories for this category
        console.log("Deleting subcategories for category:", name);
        const subcatsResult = await query(
          "DELETE FROM material_subcategories WHERE category = $1",
          [name],
        );
        console.log("Deleted subcategories:", subcatsResult.rowCount);

        // Delete the category itself
        console.log("Deleting category:", name);
        const result = await query(
          "DELETE FROM material_categories WHERE name = $1 RETURNING *",
          [name],
        );
        console.log(
          "Deleted category result:",
          result.rowCount,
          result.rows[0],
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ message: "Category not found" });
        }

        res.json({ message: "Category deleted", category: result.rows[0] });
      } catch (err) {
        console.error("/api/categories/:name DELETE error", err);
        res.status(500).json({ message: "failed to delete category" });
      }
    },
  );

  // GET /api/subcategories-admin - List all subcategories for admin (from DB)
  app.get("/api/subcategories-admin", async (_req, res) => {
    try {
      const result = await query(`
        SELECT id::text, name, category, created_at, created_by 
        FROM material_subcategories 
        ORDER BY category ASC, name ASC
      `);

      res.json({ subcategories: result.rows });
    } catch (err) {
      console.error("/api/subcategories-admin error", err);
      res.status(500).json({ message: "failed to list subcategories" });
    }
  });

  // GET /api/sidebar-subcategories - List all subcategories for sidebar (predefined + database)
  app.get("/api/sidebar-subcategories", async (_req, res) => {
    try {
      // Predefined subcategories with their routes and icons
      const predefinedSubcategories = [
        { id: "1", name: "Civil", href: "/estimators/civil-wall", icon: "BrickWall", category: "Estimators" },
        { id: "2", name: "Doors", href: "/estimators/doors", icon: "DoorOpen", category: "Estimators" },
        { id: "3", name: "False Ceiling", href: "/estimators/false-ceiling", icon: "Cloud", category: "Estimators" },
        { id: "4", name: "Flooring", href: "/estimators/flooring", icon: "Layers", category: "Estimators" },
        { id: "5", name: "Painting", href: "/estimators/painting", icon: "PaintBucket", category: "Estimators" },
        { id: "6", name: "Blinds", href: "/estimators/blinds", icon: "Blinds", category: "Estimators" },
        { id: "7", name: "Electrical", href: "/estimators/electrical", icon: "Zap", category: "Estimators" },
        { id: "8", name: "Plumbing", href: "/estimators/plumbing", icon: "Droplets", category: "Estimators" },
      ];

      // Get database subcategories (with trimming)
      const dbResult = await query(`
        SELECT DISTINCT TRIM(name) as name FROM material_subcategories 
        WHERE TRIM(name) != ''
        ORDER BY name ASC
      `);
      
      const dbSubcategoryNames = dbResult.rows.map((row) => row.name);

      // Create a set of predefined names (normalized for comparison)
      const predefinedNamesSet = new Set(
        predefinedSubcategories.map((p) => p.name.toLowerCase().trim())
      );

      // Filter out database entries that match predefined ones (case-insensitive and space-trim)
      const uniqueDbNames = dbSubcategoryNames.filter((dbName) => {
        const normalizedDbName = dbName.toLowerCase().trim();
        return !predefinedNamesSet.has(normalizedDbName);
      });

      // Combine: predefined first, then unique database entries
      const allSubcategories = [
        ...predefinedSubcategories,
        ...uniqueDbNames.map((name, idx) => ({
          id: `db_${idx}`,
          name: name,
          href: null,
          icon: "Layers",
          category: "Database",
        })),
      ];

      res.json({ subcategories: allSubcategories });
    } catch (err) {
      console.error("/api/sidebar-subcategories error", err);
      res.status(500).json({ message: "failed to list sidebar subcategories" });
    }
  });

  // ====== PRODUCTS CRUD ======

  // POST /api/products - Create a new product (Admin/Software Team/Purchase Team)
  app.post(
    "/api/products",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { name, subcategory } = req.body;

        if (!name) {
          res.status(400).json({ message: "Product name is required" });
          return;
        }

        if (!subcategory) {
          res.status(400).json({ message: "Subcategory is required" });
          return;
        }

        const result = await query(
          `
        INSERT INTO products (name, subcategory, created_by)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
          [name, subcategory || null, req.user?.username || "unknown"],
        );

        res.status(201).json({ product: result.rows[0] });
      } catch (err: any) {
        console.error("/api/products POST error", err);
        if (err.code === "23505") {
          // unique violation
          res.status(409).json({ message: "Product name already exists" });
        } else {
          res.status(500).json({ message: "Failed to create product" });
        }
      }
    },
  );

  // GET /api/products - List all products
  app.get("/api/products", async (_req, res) => {
    try {
      const result = await query(`
        SELECT
          p.*,
          s.name as subcategory_name,
          c.name as category_name
        FROM products p
        LEFT JOIN material_subcategories s ON LOWER(TRIM(p.subcategory)) = LOWER(TRIM(s.name))
        LEFT JOIN material_categories c ON LOWER(TRIM(s.category)) = LOWER(TRIM(c.name))
        ORDER BY p.created_at DESC
      `);

      res.json({ products: result.rows });
    } catch (err) {
      console.error("/api/products GET error", err);
      res.status(500).json({ message: "Failed to list products" });
    }
  });

  // PUT /api/products/:id - Update a product
  app.put(
    "/api/products/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { name, subcategory } = req.body;

        if (!name) {
          res.status(400).json({ message: "Product name is required" });
          return;
        }

        if (!subcategory) {
          res.status(400).json({ message: "Subcategory is required" });
          return;
        }

        const result = await query(
          `
        UPDATE products 
        SET name = $1, subcategory = $2
        WHERE id = $3
        RETURNING *
      `,
          [name, subcategory, id],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Product not found" });
          return;
        }

        res.json({ product: result.rows[0] });
      } catch (err: any) {
        console.error("/api/products PUT error", err);
        if (err.code === "23505") {
          res.status(409).json({ message: "Product name already exists" });
        } else {
          res.status(500).json({ message: "Failed to update product" });
        }
      }
    },
  );

  // DELETE /api/products/:id - Delete a product
  app.delete(
    "/api/products/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const result = await query(
          "DELETE FROM products WHERE id = $1 RETURNING *",
          [id],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Product not found" });
          return;
        }

        res.json({ message: "Product deleted", product: result.rows[0] });
      } catch (err) {
        console.error("/api/products DELETE error", err);
        res.status(500).json({ message: "Failed to delete product" });
      }
    },
  );

  // GET /api/products/:id - Get a single product by ID
  app.get("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await query(
        `
        SELECT
          p.*,
          s.name as subcategory_name,
          c.name as category_name
        FROM products p
        LEFT JOIN material_subcategories s ON p.subcategory = s.name
        LEFT JOIN material_categories c ON s.category = c.name
        WHERE p.id = $1
      `,
        [id],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ message: "Product not found" });
        return;
      }

      res.json({ product: result.rows[0] });
    } catch (err) {
      console.error("/api/products/:id GET error", err);
      res.status(500).json({ message: "Failed to get product" });
    }
  });

  // ====== MATERIAL SUBMISSIONS ======

  // POST /api/material-submissions - Submit a material for approval
  app.post(
    "/api/material-submissions",
    authMiddleware,
    requireRole("supplier", "purchase_team", "admin"),
    async (req: Request, res: Response) => {
      try {
        const {
          template_id,
          shop_id,
          rate,
          unit,
          brandname,
          modelnumber,
          subcategory,
          product,
          technicalspecification,
          dimensions,
          finishtype,
          metaltype,
        } = req.body;

        if (!template_id || !shop_id) {
          res
            .status(400)
            .json({ message: "template_id and shop_id are required" });
          return;
        }

        const id = randomUUID();
        const result = await query(
          `INSERT INTO material_submissions (id, template_id, shop_id, rate, unit, brandname, modelnumber, subcategory, product, technicalspecification, dimensions, finishtype, metaltype, submitted_by, submitted_at, approved)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NULL)
           RETURNING *`,
          [
            id,
            template_id,
            shop_id,
            rate,
            unit,
            brandname || null,
            modelnumber || null,
            subcategory || null,
            product || null,
            technicalspecification || null,
            dimensions || null,
            finishtype || null,
            metaltype || null,
            (req as any).user?.id,
          ],
        );

        res.status(201).json({ submission: result.rows[0] });
      } catch (err: any) {
        console.error("/api/material-submissions POST error", err);
        res.status(500).json({ message: "failed to submit material" });
      }
    },
  );

  // GET /api/supplier/my-submissions - Get submissions for the current supplier/purchase_team/admin user
  app.get(
    "/api/supplier/my-submissions",
    authMiddleware,
    requireRole("supplier", "purchase_team", "admin"),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        console.log(
          "[supplier/my-submissions] fetching shops for user:",
          userId,
        );

        // Get shops owned by this user
        const shopsResult = await query(
          "SELECT id as shop_id FROM shops WHERE owner_id = $1",
          [userId],
        );
        const shopIds = shopsResult.rows.map((row: any) => row.shop_id);

        if (shopIds.length === 0) {
          return res.json({ submissions: [] });
        }

        // Get submissions for these shops
        const result = await query(
          `SELECT ms.*, mt.name as template_name, mt.code as template_code, mt.category, s.name as shop_name
           FROM material_submissions ms
           JOIN material_templates mt ON ms.template_id = mt.id
           JOIN shops s ON ms.shop_id = s.id
           WHERE ms.shop_id = ANY($1)
           ORDER BY ms.submitted_at DESC`,
          [shopIds],
        );

        const submissions = result.rows.map((row: any) => ({
          id: row.id,
          status:
            row.approved === true
              ? "approved"
              : row.approved === false
                ? "rejected"
                : "pending",
          submission: row,
        }));

        res.json({ submissions });
      } catch (err: any) {
        console.error("/api/supplier/my-submissions error", err);
        res.status(500).json({ message: "failed to get submissions" });
      }
    },
  );

  // GET /api/material-submissions-pending-approval - List pending material submissions (Admin/Software/Purchase)
  app.get(
    "/api/material-submissions-pending-approval",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (_req, res) => {
      try {
        const result = await query(`
          SELECT ms.*, mt.name as template_name, mt.code as template_code, mt.category, s.name as shop_name, u.username as submitted_by_username
          FROM material_submissions ms
          JOIN material_templates mt ON ms.template_id = mt.id
          JOIN shops s ON ms.shop_id = s.id
          LEFT JOIN users u ON ms.submitted_by = u.id
          WHERE ms.approved IS NULL
          ORDER BY ms.submitted_at DESC
        `);

        const submissions = result.rows.map((row: any) => ({
          id: row.id,
          status: "pending",
          submission: row,
        }));

        res.json({ submissions });
      } catch (err) {
        console.error("/api/material-submissions-pending-approval error", err);
        res
          .status(500)
          .json({ message: "failed to list pending material submissions" });
      }
    },
  );

  // POST /api/material-submissions/:id/approve - Approve a material submission
  app.post(
    "/api/material-submissions/:id/approve",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const submissionResult = await query(
          "SELECT * FROM material_submissions WHERE id = $1",
          [id],
        );

        if (submissionResult.rows.length === 0) {
          res.status(404).json({ message: "Submission not found" });
          return;
        }

        const submission = submissionResult.rows[0];
        const templateResult = await query(
          "SELECT * FROM material_templates WHERE id = $1",
          [submission.template_id],
        );
        const template = templateResult.rows[0];

        const materialId = randomUUID();
        await query(
          `INSERT INTO materials (id, name, code, rate, shop_id, unit, category, brandname, modelnumber, subcategory, product, technicalspecification, template_id, approved)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)`,
          [
            materialId,
            template.name,
            template.code,
            submission.rate,
            submission.shop_id,
            submission.unit,
            template.category,
            submission.brandname,
            submission.modelnumber,
            submission.subcategory,
            submission.product,
            submission.technicalspecification,
            submission.template_id,
          ],
        );

        const updateResult = await query(
          "UPDATE material_submissions SET approved = true WHERE id = $1 RETURNING *",
          [id],
        );

        res.json({
          submission: updateResult.rows[0],
          material: { id: materialId },
        });
      } catch (err: any) {
        console.error("/api/material-submissions/:id/approve error", err);
        res
          .status(500)
          .json({ message: "failed to approve material submission" });
      }
    },
  );

  // POST /api/material-submissions/:id/reject - Reject a material submission
  app.post(
    "/api/material-submissions/:id/reject",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const reason = req.body?.reason || null;

        const result = await query(
          "UPDATE material_submissions SET approved = false, approval_reason = $2 WHERE id = $1 RETURNING *",
          [id, reason],
        );

        res.json({ submission: result.rows[0] });
      } catch (err: any) {
        console.error("/api/material-submissions/:id/reject error", err);
        res
          .status(500)
          .json({ message: "failed to reject material submission" });
      }
    },
  );

  // GET /api/accumulated-products/:estimator_type - Get accumulated products for user and estimator
  app.get(
    "/api/accumulated-products/:estimator_type",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { estimator_type } = req.params;
        const userId = req.user.id;

        const result = await query(
          "SELECT data FROM accumulated_products WHERE user_id = $1 AND estimator_type = $2 ORDER BY created_at DESC LIMIT 1",
          [userId, estimator_type],
        );

        if (result.rows.length === 0) {
          res.json({ data: [] });
          return;
        }

        res.json({ data: result.rows[0].data });
      } catch (err) {
        console.error("GET /api/accumulated-products error", err);
        res.status(500).json({ message: "Failed to get accumulated products" });
      }
    },
  );

  // POST /api/accumulated-products/:estimator_type - Save accumulated products
  app.post(
    "/api/accumulated-products/:estimator_type",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { estimator_type } = req.params;
        const userId = req.user.id;
        const data = req.body.data;

        // Upsert: delete existing and insert new
        await query(
          "DELETE FROM accumulated_products WHERE user_id = $1 AND estimator_type = $2",
          [userId, estimator_type],
        );
        await query(
          "INSERT INTO accumulated_products (user_id, estimator_type, data) VALUES ($1, $2, $3)",
          [userId, estimator_type, JSON.stringify(data)],
        );

        res.json({ message: "Accumulated products saved" });
      } catch (err) {
        console.error("POST /api/accumulated-products error", err);
        res
          .status(500)
          .json({ message: "Failed to save accumulated products" });
      }
    },
  );

  // ====== BOQ PROJECTS ROUTES ======

  // POST /api/boq-projects - Create a new BOQ project
  app.post(
    "/api/boq-projects",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { name, client, budget } = req.body;

        if (!name || !name.trim()) {
          res.status(400).json({ message: "Project name is required" });
          return;
        }

        const projectId = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        await query(
          `INSERT INTO boq_projects (id, name, client, budget, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [projectId, name.trim(), client || "", budget || "", "draft"],
        );

        res.json({
          id: projectId,
          name: name.trim(),
          client: client || "",
          budget: budget || "",
          status: "draft",
        });
      } catch (err) {
        console.error("POST /api/boq-projects error", err);
        res.status(500).json({ message: "Failed to create project" });
      }
    },
  );

  // GET /api/boq-projects - List all BOQ projects
  app.get(
    "/api/boq-projects",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const result = await query(
          `SELECT id, name, client, budget, status, created_at, updated_at FROM boq_projects ORDER BY created_at DESC`,
        );

        res.json({ projects: result.rows || [] });
      } catch (err) {
        console.error("GET /api/boq-projects error", err);
        res.status(500).json({ message: "Failed to fetch projects" });
      }
    },
  );

  // GET /api/boq-projects/:projectId - Get a specific project
  app.get(
    "/api/boq-projects/:projectId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;

        const result = await query(
          `SELECT id, name, client, budget, status, created_at, updated_at FROM boq_projects WHERE id = $1`,
          [projectId],
        );

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Project not found" });
          return;
        }

        res.json(result.rows[0]);
      } catch (err) {
        console.error("GET /api/boq-projects/:projectId error", err);
        res.status(500).json({ message: "Failed to fetch project" });
      }
    },
  );

  // PUT /api/boq-projects/:projectId - Update project status
  app.put(
    "/api/boq-projects/:projectId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;
        const { status } = req.body;

        if (!status || !["draft", "submitted", "finalized"].includes(status)) {
          res.status(400).json({ message: "Invalid status" });
          return;
        }

        await query(
          `UPDATE boq_projects SET status = $1, updated_at = NOW() WHERE id = $2`,
          [status, projectId],
        );

        res.json({ message: "Project updated" });
      } catch (err) {
        console.error("PUT /api/boq-projects/:projectId error", err);
        res.status(500).json({ message: "Failed to update project" });
      }
    },
  );

  // DELETE /api/boq-projects/:projectId - Delete a project
  app.delete(
    "/api/boq-projects/:projectId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;

        // First, delete all items related to this project
        await query(`DELETE FROM boq_items WHERE project_id = $1`, [projectId]);

        // Then delete all versions related to this project
        await query(`DELETE FROM boq_versions WHERE project_id = $1`, [projectId]);

        // Finally delete the project itself
        const result = await query(
          `DELETE FROM boq_projects WHERE id = $1`,
          [projectId],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Project not found" });
          return;
        }

        res.json({ message: "Project deleted successfully" });
      } catch (err) {
        console.error("DELETE /api/boq-projects/:projectId error", err);
        res.status(500).json({ message: "Failed to delete project" });
      }
    },
  );

  // ====== BOQ VERSIONS ROUTES ======

  // GET /api/boq-versions/:projectId - List all versions of a project
  app.get(
    "/api/boq-versions/:projectId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;

        const result = await query(
          `SELECT id, project_id, version_number, status, created_at, updated_at 
           FROM boq_versions 
           WHERE project_id = $1 
           ORDER BY version_number DESC`,
          [projectId],
        );

        res.json({ versions: result.rows || [] });
      } catch (err) {
        console.error("GET /api/boq-versions error", err);
        res.status(500).json({ message: "Failed to fetch versions" });
      }
    },
  );

  // POST /api/boq-versions - Create a new version
  app.post(
    "/api/boq-versions",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { project_id, copy_from_version } = req.body;

        if (!project_id) {
          res.status(400).json({ message: "project_id is required" });
          return;
        }

        // Get next version number
        const versionResult = await query(
          `SELECT MAX(version_number) as max_version FROM boq_versions WHERE project_id = $1`,
          [project_id],
        );

        const nextVersion = (versionResult.rows[0]?.max_version || 0) + 1;
        const versionId = `ver-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Fetch project name/client so we can store them on the version
        let projectName: string | null = null;
        let projectClient: string | null = null;
        try {
          const proj = await query(`SELECT name, client FROM boq_projects WHERE id = $1`, [project_id]);
          projectName = proj.rows[0]?.name ?? null;
          projectClient = proj.rows[0]?.client ?? null;
        } catch (err) {
          // non-fatal: proceed with nulls if lookup fails
          console.warn("[db] Could not fetch project name/client:", (err as any)?.message || err);
        }

        // Create new version (store project name and client for easier querying/version display)
        await query(
          `INSERT INTO boq_versions (id, project_id, project_name, project_client, version_number, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [versionId, project_id, projectName, projectClient, nextVersion, "draft"],
        );

        // Copy items from previous version if requested
        if (copy_from_version) {
          const itemsResult = await query(
            `SELECT * FROM boq_items WHERE version_id = $1`,
            [copy_from_version],
          );

          for (const item of itemsResult.rows) {
            const newItemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await query(
              `INSERT INTO boq_items (id, project_id, estimator, table_data, version_id, created_at)
               VALUES ($1, $2, $3, $4, $5, NOW())`,
              [
                newItemId,
                project_id,
                item.estimator,
                item.table_data,
                versionId,
              ],
            );
          }
        }

        res.json({
          id: versionId,
          project_id,
          version_number: nextVersion,
          status: "draft",
        });
      } catch (err) {
        console.error("POST /api/boq-versions error", err);
        res.status(500).json({ message: "Failed to create version" });
      }
    },
  );

  // PUT /api/boq-versions/:versionId - Update version status (lock/submit)
  app.put(
    "/api/boq-versions/:versionId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { versionId } = req.params;
        const { status } = req.body;

        if (!status || !["draft", "submitted"].includes(status)) {
          res.status(400).json({ message: "Invalid status" });
          return;
        }

        await query(
          `UPDATE boq_versions SET status = $1, updated_at = NOW() WHERE id = $2`,
          [status, versionId],
        );

        res.json({ message: "Version updated" });
      } catch (err) {
        console.error("PUT /api/boq-versions error", err);
        res.status(500).json({ message: "Failed to update version" });
      }
    },
  );

  // DELETE /api/boq-versions/:versionId - Delete a version and its items
  app.delete(
    "/api/boq-versions/:versionId",
    authMiddleware,
    async (req: Request, res: Response) => {
      const client = await (query as any).client?.connect?.();
      const { versionId } = req.params;

      try {
        // Use transaction to ensure both deletes succeed together
        await query("BEGIN");

        // Delete BOQ items tied to this version
        await query(`DELETE FROM boq_items WHERE version_id = $1`, [versionId]);

        // Delete the version itself
        await query(`DELETE FROM boq_versions WHERE id = $1`, [versionId]);

        await query("COMMIT");

        res.json({ message: "Version and its items deleted" });
      } catch (err) {
        try {
          await query("ROLLBACK");
        } catch (e) {
          // ignore
        }
        console.error("DELETE /api/boq-versions error", err);
        res.status(500).json({ message: "Failed to delete version" });
      } finally {
        if (client && typeof client.release === "function") client.release();
      }
    },
  );

  // ====== BOQ ITEMS ROUTES ======

  // POST /api/boq-items - Save a new BOQ item (captured from estimator Step 9)
  app.post(
    "/api/boq-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { project_id, version_id, estimator, table_data } = req.body;
        console.log("POST /api/boq-items received:", {
          project_id,
          version_id,
          estimator,
          table_data_keys: table_data ? Object.keys(table_data) : null,
        });

        if (!project_id || !estimator || !table_data) {
          console.error("Missing required fields:", {
            has_project_id: !!project_id,
            has_estimator: !!estimator,
            has_table_data: !!table_data,
          });
          res.status(400).json({
            message: "project_id, estimator, and table_data are required",
          });
          return;
        }

        const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log("Creating BOQ item with ID:", itemId);

        await query(
          `INSERT INTO boq_items (id, project_id, estimator, table_data, version_id, user_added, created_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW())`,
          [
            itemId,
            project_id,
            estimator,
            JSON.stringify(table_data),
            version_id || null,
          ],
        );

        // Confirm row persisted by selecting it back
        try {
          const check = await query(
            `SELECT id, project_id, version_id, estimator, table_data, user_added, created_at FROM boq_items WHERE id = $1`,
            [itemId],
          );
          const inserted = check.rows[0];
          console.log("BOQ item created successfully (db):", {
            id: inserted?.id,
            project_id: inserted?.project_id,
            version_id: inserted?.version_id,
            estimator: inserted?.estimator,
            user_added: inserted?.user_added,
            created_at: inserted?.created_at,
          });
        } catch (e) {
          console.warn("Could not verify inserted BOQ item:", e);
        }

        const responseData = {
          id: itemId,
          project_id,
          version_id,
          estimator,
          table_data,
        };

        res.json(responseData);
      } catch (err) {
        console.error("POST /api/boq-items error", err);
        console.error("Error details:", {
          message: (err as any)?.message,
          code: (err as any)?.code,
          detail: (err as any)?.detail,
          stack: (err as any)?.stack,
        });
        res.status(500).json({ 
          message: "Failed to save BOQ item",
          error: (err as any)?.message
        });
      }
    },
  );

  // GET /api/boq-items/version/:versionId - Fetch BOQ items for a specific version
  app.get(
    "/api/boq-items/version/:versionId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { versionId } = req.params;

        const result = await query(
          `SELECT id, project_id, version_id, estimator, table_data, created_at FROM boq_items 
         WHERE version_id = $1 AND user_added = true ORDER BY created_at ASC`,
          [versionId],
        );

          try {
            const ids = result.rows.map((r: any) => r.id).slice(0, 20);
            console.log(`GET /api/boq-items/version/${versionId} -> ${result.rows.length} items. ids(first20):`, ids);
          } catch (e) {
            // ignore logging errors
          }

        const items = result.rows.map((row: any) => ({
          id: row.id,
          project_id: row.project_id,
          version_id: row.version_id,
          estimator: row.estimator,
          table_data:
            typeof row.table_data === "string"
              ? JSON.parse(row.table_data)
              : row.table_data,
          created_at: row.created_at,
        }));

        res.json({ items });
      } catch (err) {
        console.error("GET /api/boq-items/version error", err);
        res.status(500).json({ message: "Failed to fetch BOQ items" });
      }
    },
  );

  // GET /api/boq-items - Fetch BOQ items for a project (legacy, all versions)
  app.get(
    "/api/boq-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { project_id } = req.query;

        if (!project_id) {
          res
            .status(400)
            .json({ message: "project_id query parameter is required" });
          return;
        }

        const result = await query(
          `SELECT id, project_id, version_id, estimator, table_data, created_at FROM boq_items 
         WHERE project_id = $1 AND user_added = true ORDER BY created_at ASC`,
          [project_id],
        );

        const items = result.rows.map((row: any) => ({
          id: row.id,
          project_id: row.project_id,
          version_id: row.version_id,
          estimator: row.estimator,
          table_data:
            typeof row.table_data === "string"
              ? JSON.parse(row.table_data)
              : row.table_data,
          created_at: row.created_at,
        }));

        res.json({ items });
      } catch (err) {
        console.error("GET /api/boq-items error", err);
        res.status(500).json({ message: "Failed to fetch BOQ items" });
      }
    },
  );

  // PUT /api/boq-items/:itemId - Update a BOQ item's table_data
  app.put(
    "/api/boq-items/:itemId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { itemId } = req.params;
        const { table_data } = req.body;

        if (!table_data) {
          res.status(400).json({ message: "table_data is required" });
          return;
        }

        await query(
          `UPDATE boq_items SET table_data = $1, created_at = NOW() WHERE id = $2`,
          [JSON.stringify(table_data), itemId],
        );

        res.json({ message: "BOQ item updated" });
      } catch (err) {
        console.error("PUT /api/boq-items/:itemId error", err);
        res.status(500).json({ message: "Failed to update BOQ item" });
      }
    },
  );

  // DELETE /api/boq-items/:itemId - Delete a BOQ item
  app.delete(
    "/api/boq-items/:itemId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { itemId } = req.params;

        await query(`DELETE FROM boq_items WHERE id = $1`, [itemId]);

        res.json({ message: "BOQ item deleted" });
      } catch (err) {
        console.error("DELETE /api/boq-items/:itemId error", err);
        res.status(500).json({ message: "Failed to delete BOQ item" });
      }
    },
  );

  // Estimator Step Data Storage Routes
  app.post(
    "/api/estimator-step9-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { estimator, session_id, items, replace } = req.body;
        const userId = (req as any).user?.id;

        if (!items || !Array.isArray(items)) {
          return res.status(400).json({ message: "Items array is required" });
        }

        // Ensure table exists
        await query(`
        CREATE TABLE IF NOT EXISTS estimator_step9_cart (
          id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
          estimator TEXT NOT NULL,
          bill_no TEXT NOT NULL,
          s_no INTEGER,
          item TEXT,
          description TEXT,
          unit TEXT,
          qty DECIMAL(10,2),
          rate DECIMAL(10,2),
          amount DECIMAL(10,2),
          material_id UUID,
          batch_id TEXT,
          row_id TEXT,
          shop_id UUID,
          supply_rate DECIMAL(10,2),
          install_rate DECIMAL(10,2),
          door_type TEXT,
          panel_type TEXT,
          sub_option TEXT,
          glazing_type TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);

        // If replace is true, delete existing items for this session first
        if (replace) {
          await query(
            `
          DELETE FROM estimator_step9_cart
          WHERE estimator = $1 AND bill_no = $2
        `,
            [estimator, session_id],
          );
        }

        for (const item of items) {
          await query(
            `
          INSERT INTO estimator_step9_cart (
            estimator, bill_no, s_no, item, description, unit, qty, rate, amount,
            material_id, batch_id, row_id, shop_id, supply_rate, install_rate,
            door_type, panel_type, sub_option, glazing_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `,
            [
              estimator,
              session_id,
              item.s_no,
              item.name || item.item,
              item.description,
              item.unit,
              item.quantity || item.qty,
              (item.supply_rate || 0) + (item.install_rate || 0),
              (item.quantity || item.qty || 0) *
                ((item.supply_rate || 0) + (item.install_rate || 0)),
              item.material_id,
              item.batch_id,
              item.row_id,
              item.shop_id,
              item.supply_rate,
              item.install_rate,
              item.door_type,
              item.panel_type,
              item.sub_option,
              item.glazing_type,
            ],
          );
        }

        res.json({ message: "Step 9 items saved successfully" });
      } catch (err) {
        console.error("POST /api/estimator-step9-items error", err);
        res.status(500).json({ message: "Failed to save step 9 items" });
      }
    },
  );

  app.get(
    "/api/estimator-step9-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator } = req.query;

        // Ensure table exists
        await query(`
        CREATE TABLE IF NOT EXISTS estimator_step9_cart (
          id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
          estimator TEXT NOT NULL,
          bill_no TEXT NOT NULL,
          s_no INTEGER,
          item TEXT,
          description TEXT,
          unit TEXT,
          qty DECIMAL(10,2),
          rate DECIMAL(10,2),
          amount DECIMAL(10,2),
          material_id UUID,
          batch_id TEXT,
          row_id TEXT,
          shop_id UUID,
          supply_rate DECIMAL(10,2),
          install_rate DECIMAL(10,2),
          door_type TEXT,
          panel_type TEXT,
          sub_option TEXT,
          glazing_type TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);

        let queryStr =
          "SELECT * FROM estimator_step9_cart WHERE estimator = $1";
        const params: any[] = [estimator];

        // If session_id is provided, filter by it; otherwise fetch all for that estimator
        if (session_id) {
          queryStr += " AND bill_no = $2";
          params.push(session_id);
        }

        queryStr += " ORDER BY created_at DESC";

        const result = await query(queryStr, params);

        // Transform the data to match frontend expectations
        const transformedItems = result.rows.map((row) => ({
          id: row.material_id,
          session_id: row.bill_no,
          rowId: row.row_id,
          batchId: row.batch_id,
          name: row.item,
          unit: row.unit,
          quantity: parseFloat(row.qty || 0),
          rate: parseFloat(row.rate || 0),
          supplyRate: parseFloat(row.supply_rate || 0),
          installRate: parseFloat(row.install_rate || 0),
          shopId: row.shop_id,
          material_name: row.item,
          shop_name: row.shop_name || "",
          description: row.description || "",
          location: row.location || "",
          doorType: row.door_type,
          panelType: row.panel_type,
          subOption: row.sub_option,
          glazingType: row.glazing_type,
          isSaved: true, // Mark as saved since it's from DB
          // Include database ID for deletion
          dbId: row.id,
        }));

        res.json({ items: transformedItems });
      } catch (err) {
        console.error("GET /api/estimator-step9-items error", err);
        res.status(500).json({ message: "Failed to load step 9 items" });
      }
    },
  );

  app.post(
    "/api/estimator-step11-groups",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { groups } = req.body;

        if (!groups || !Array.isArray(groups)) {
          return res.status(400).json({ message: "Groups array is required" });
        }

        for (const group of groups) {
          await query(
            `
          INSERT INTO estimator_step11_finalize_boq (
            estimator, bill_no, s_no, item, location, description, unit, qty,
            supply_rate, install_rate, supply_amount, install_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
            [
              group.estimator,
              group.session_id,
              group.s_no || null,
              group.item_name || group.item,
              group.location,
              group.description,
              group.unit,
              group.quantity || group.qty,
              group.supply_rate,
              group.install_rate,
              group.supply_amount,
              group.install_amount,
            ],
          );
        }

        res.json({ message: "Step 11 groups saved successfully" });
      } catch (err) {
        console.error("POST /api/estimator-step11-groups error", err);
        res.status(500).json({ message: "Failed to save step 11 groups" });
      }
    },
  );

  app.post(
    "/api/estimator-step12-qa-selection",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { estimator, session_id, items } = req.body;

        if (!items || !Array.isArray(items)) {
          return res.status(400).json({ message: "Items array is required" });
        }

        for (const item of items) {
          await query(
            `
          INSERT INTO estimator_step12_qa_boq (
            estimator, bill_no, s_no, item, location, description, unit, qty,
            supply_rate, install_rate, supply_amount, install_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
            [
              estimator,
              session_id,
              item.s_no,
              item.item,
              item.location,
              item.description,
              item.unit,
              item.qty,
              item.supply_rate,
              item.install_rate,
              item.supply_amount,
              item.install_amount,
            ],
          );
        }

        res.json({ message: "Step 12 QA items saved successfully" });
      } catch (err) {
        console.error("POST /api/estimator-step12-qa-selection error", err);
        res.status(500).json({ message: "Failed to save step 12 QA items" });
      }
    },
  );

  app.get(
    "/api/estimator-step11-groups",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator } = req.query;

        const result = await query(
          `
        SELECT * FROM estimator_step11_finalize_boq 
        WHERE bill_no = $1 AND estimator = $2 
        ORDER BY s_no ASC
      `,
          [session_id, estimator],
        );

        res.json({ items: result.rows });
      } catch (err) {
        console.error("GET /api/estimator-step11-groups error", err);
        res.status(500).json({ message: "Failed to load step 11 groups" });
      }
    },
  );

  // GET /api/step11-by-product - Get Step 11 data for a product
  app.get(
    "/api/step11-by-product",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { product_id, estimator } = req.query;

        if (!product_id || !estimator) {
          return res.status(400).json({
            message: "product_id and estimator query parameters are required",
          });
        }

        // First, get the product details to find matching items
        const productResult = await query(
          `SELECT name FROM products WHERE id = $1`,
          [product_id],
        );

        if (productResult.rows.length === 0) {
          return res.json({ items: [] });
        }

        const product = productResult.rows[0];
        const productName = product.name.toLowerCase();

        // Query estimator_step11_finalize_boq table
        // Filter by estimator AND match product keywords
        const result = await query(
          `
        SELECT 
          id, bill_no, estimator, s_no, item, location, unit,
          qty, supply_rate, install_rate, supply_amount, install_amount, created_at
        FROM estimator_step11_finalize_boq 
        WHERE estimator = $1
        ORDER BY s_no ASC
        LIMIT 50
      `,
          [estimator],
        );

        // Filter items that match the product name with strict matching
        // Get the first significant word of the product name (e.g., "Flush" from "Flush Door")
        const productWords = productName.split(" ").filter((w) => w.length > 2);
        const primaryWord = productWords[0]; // e.g., "flush" or "glass"

        const filteredRows = result.rows.filter((row: any) => {
          const itemLower = row.item?.toLowerCase() || "";

          // Match ONLY if item starts with the primary product word
          // This ensures "Flush Door" items only match "flush*" and "Glass Door" only matches "glass*"
          return itemLower.startsWith(primaryWord);
        });

        // If no matches found, return empty (don't return all items)
        if (filteredRows.length === 0) {
          return res.json({ items: [] });
        }

        // Transform data to match Step 11Preview expectations
        const items = filteredRows.map((row: any) => ({
          id: row.id || `${row.bill_no}-${row.s_no}`,
          s_no: row.s_no,
          bill_no: row.bill_no,
          estimator: row.estimator,
          title: row.item,
          description: row.item, // Use item as description since description column may not exist
          location: row.location,
          unit: row.unit,
          qty: parseFloat(row.qty || 0),
          supply_rate: parseFloat(row.supply_rate || 0),
          install_rate: parseFloat(row.install_rate || 0),
          supply_amount: parseFloat(row.supply_amount || 0),
          install_amount: parseFloat(row.install_amount || 0),
          group_id: row.bill_no,
        }));

        res.json({ items });
      } catch (err) {
        console.error("GET /api/step11-by-product error", err);
        res.status(500).json({ message: "Failed to load step 11 data" });
      }
    },
  );

  app.get(
    "/api/estimator-step12-qa-selection",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator } = req.query;

        const result = await query(
          `
        SELECT * FROM estimator_step12_qa_boq 
        WHERE bill_no = $1 AND estimator = $2 
        ORDER BY s_no ASC
      `,
          [session_id, estimator],
        );

        res.json({ items: result.rows });
      } catch (err) {
        console.error("GET /api/estimator-step12-qa-selection error", err);
        res.status(500).json({ message: "Failed to load step 12 QA items" });
      }
    },
  );

  app.delete(
    "/api/estimator-step9-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator, items } = req.body;

        // Ensure table exists
        await query(`
        CREATE TABLE IF NOT EXISTS estimator_step9_cart (
          id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
          estimator TEXT NOT NULL,
          bill_no TEXT NOT NULL,
          s_no INTEGER,
          item TEXT,
          description TEXT,
          unit TEXT,
          qty DECIMAL(10,2),
          rate DECIMAL(10,2),
          amount DECIMAL(10,2),
          material_id UUID,
          batch_id TEXT,
          row_id TEXT,
          shop_id UUID,
          supply_rate DECIMAL(10,2),
          install_rate DECIMAL(10,2),
          door_type TEXT,
          panel_type TEXT,
          sub_option TEXT,
          glazing_type TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);

        if (items && Array.isArray(items) && items.length > 0) {
          // Delete specific items by ID
          for (const item of items) {
            await query(
              `
            DELETE FROM estimator_step9_cart
            WHERE id = $1 AND bill_no = $2 AND estimator = $3
          `,
              [item.dbId || item.id, session_id, estimator],
            );
          }
        } else {
          // Delete all items for the session (backward compatibility)
          await query(
            `
          DELETE FROM estimator_step9_cart
          WHERE bill_no = $1 AND estimator = $2
        `,
            [session_id, estimator],
          );
        }

        res.json({ message: "Step 9 items deleted successfully" });
      } catch (err) {
        console.error("DELETE /api/estimator-step9-items error", err);
        res.status(500).json({ message: "Failed to delete step 9 items" });
      }
    },
  );

  app.delete(
    "/api/estimator-step11-groups",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator, ids } = req.body;

        if (ids && Array.isArray(ids) && ids.length > 0) {
          // Delete specific items by IDs
          await query(
            `
          DELETE FROM estimator_step11_finalize_boq
          WHERE id = ANY($1) AND estimator = $2
        `,
            [ids, estimator],
          );
        } else if (session_id && estimator) {
          // Delete all items for a session (legacy behavior)
          await query(
            `
          DELETE FROM estimator_step11_finalize_boq
          WHERE bill_no = $1 AND estimator = $2
        `,
            [session_id, estimator],
          );
        } else {
          return res.status(400).json({
            message: "Either ids array or session_id/estimator required",
          });
        }

        res.json({ message: "Step 11 groups deleted successfully" });
      } catch (err) {
        console.error("DELETE /api/estimator-step11-groups error", err);
        res.status(500).json({ message: "Failed to delete step 11 groups" });
      }
    },
  );

  app.delete(
    "/api/estimator-step12-qa-selection",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator } = req.body;

        await query(
          `
        DELETE FROM estimator_step12_qa_boq 
        WHERE bill_no = $1 AND estimator = $2
      `,
          [session_id, estimator],
        );

        res.json({ message: "Step 12 QA items deleted successfully" });
      } catch (err) {
        console.error("DELETE /api/estimator-step12-qa-selection error", err);
        res.status(500).json({ message: "Failed to delete step 12 QA items" });
      }
    },
  );

  return httpServer;
}
