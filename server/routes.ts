import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { comparePasswords, generateToken } from "./auth";
import { authMiddleware, requireRole } from "./middleware";
import { randomUUID } from "crypto";
import { query } from "./db/client";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed default material templates on startup (best-effort)
  try {
    // dynamic import to avoid circular deps during startup
    const { seedMaterialTemplates } = await import('./seed-templates');
    await seedMaterialTemplates();
  } catch (err: unknown) {
    console.warn('[seed] Could not run material template seed:', (err as any)?.message || err);
  }

  // Seed category and subcategory tables on startup
  try {
    const { seedMaterialCategories } = await import('./seed-categories');
    await seedMaterialCategories();
  } catch (err: unknown) {
    console.warn('[seed] Could not run category seed:', (err as any)?.message || err);
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
    await query(`CREATE INDEX IF NOT EXISTS idx_messages_sender_role ON messages (sender_role)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at)`);
  } catch (err: unknown) {
    console.warn('[migrations] ensure messages table failed (continuing):', (err as any)?.message || err);
  }

  // In-memory fallback storage for messages when DB is unreachable (development only)
  let inMemoryMessages: any[] = [];
  let inMemoryMessagesEnabled = false;
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // ====== PUBLIC AUTH ROUTES ======

  // POST /api/auth/signup - Register a new user
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { username, password, role } = req.body;

      if (!username || !password) {
        res.status(400).json({ message: "Username and password are required" });
        return;
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        res.status(409).json({ message: "User already exists" });
        return;
      }

      // Create new user
      const user = await storage.createUser({
        username,
        password,
        role: role || "user",
      });

      // Generate token
      const token = generateToken(user);

      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json({
        message: "User created successfully",
        user: userWithoutPassword,
        token,
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Internal server error" });
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
      console.log(`[auth] login attempt for username=${username} found=${!!user}`);

      let authenticatedUser = user;
      if (user) {
        // Compare password for stored users
        const isPasswordValid = await comparePasswords(password, user.password);
        // eslint-disable-next-line no-console
        console.log(`[auth] password valid=${isPasswordValid} for username=${username}`);
        if (!isPasswordValid) {
          // Fallback to permissive mock login: accept credentials like original mock behavior
          // Create a transient user object instead of rejecting
          // eslint-disable-next-line no-console
          console.log(`[auth] falling back to permissive login for username=${username}`);
          authenticatedUser = {
            id: randomUUID(),
            username,
            role: (req.body.role as string) || "user",
            password: "",
          } as any;
        }
      } else {
        // No stored user: permissive mock login (accept any credentials)
        // eslint-disable-next-line no-console
        console.log(`[auth] permissive login: creating transient user for ${username}`);
        authenticatedUser = {
          id: randomUUID(),
          username,
          role: (req.body.role as string) || "user",
          password: "",
        } as any;
      }

      // Generate token for authenticatedUser
      const token = generateToken(authenticatedUser as any);

      // Return user without password
      const { password: _, ...userWithoutPassword } = authenticatedUser as any;
      res.json({ message: "Login successful (permissive)", user: userWithoutPassword, token });
    } catch (error) {
      console.error("Login error:", error);
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
  app.get("/api/auth/me", authMiddleware, async (req: Request, res: Response) => {
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
  });

  // ====== SHOPS & MATERIALS API ======

  // GET /api/shops - list shops
  app.get("/api/shops", async (_req, res) => {
    try {
      // Only return shops that are approved for public listing
      const result = await query("SELECT * FROM shops WHERE approved IS TRUE ORDER BY created_at DESC");
      res.json({ shops: result.rows });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/shops error", err);
      res.status(500).json({ message: "failed to list shops" });
    }
  });

  // POST /api/shops - create shop (authenticated)
  app.post("/api/shops", authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized: user not authenticated" });
        return;
      }

      const body = req.body || {};
      const id = randomUUID();
      const categories = Array.isArray(body.categories) ? body.categories : [];
      
      // eslint-disable-next-line no-console
      console.log(`[POST /api/shops] inserting shop: name=${body.name}, owner_id=${req.user.id}`);
      
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
        res.status(500).json({ message: "failed to create shop - no rows returned" });
        return;
      }
      
      res.status(201).json({ shop: result.rows[0] });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("create shop error", err);
      const errMessage = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: "failed to create shop", error: errMessage });
    }
  });

  // GET /api/materials - list materials
  app.get("/api/materials", async (_req, res) => {
    try {
      // Only return materials that are approved for public listing
      const result = await query("SELECT * FROM materials WHERE approved IS TRUE ORDER BY created_at DESC");
      res.json({ materials: result.rows });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/materials error", err);
      res.status(500).json({ message: "failed to list materials" });
    }
  });

  // POST /api/materials - create material (authenticated)
  app.post("/api/materials", authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized: user not authenticated" });
        return;
      }

      const body = req.body || {};
      const id = randomUUID();
      const attributes = typeof body.attributes === "object" ? body.attributes : {};
      
      // eslint-disable-next-line no-console
      console.log(`[POST /api/materials] inserting material: name=${body.name}, shop_id=${body.shopId}`);
      
      const result = await query(
        `INSERT INTO materials (id, name, code, rate, shop_id, unit, category, brandname, modelnumber, subcategory, technicalspecification, image, attributes, master_material_id, approved, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now()) RETURNING *`,
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
          body.technicalSpecification || null,
          body.image || null,
          JSON.stringify(attributes || {}),
          body.masterMaterialId || null,
          false,
        ],
      );
      
      if (!result.rows || result.rows.length === 0) {
        res.status(500).json({ message: "failed to create material - no rows returned" });
        return;
      }
      
      res.status(201).json({ material: result.rows[0] });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("create material error", err);
      const errMessage = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: "failed to create material", error: errMessage });
    }
  });

  // GET /api/shops/:id
  app.get('/api/shops/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const result = await query('SELECT * FROM shops WHERE id = $1', [id]);
      if (result.rowCount === 0) return res.status(404).json({ message: 'not found' });
      res.json({ shop: result.rows[0] });
    } catch (err: unknown) { console.error(err as any); res.status(500).json({ message: 'error' }); }
  });

  // PUT /api/shops/:id
  app.put('/api/shops/:id', authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body || {};
      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const k of ['name','location','phoneCountryCode','contactNumber','city','state','country','pincode','image','rating','gstNo']) {
        if (body[k] !== undefined) { fields.push(`${k} = $${idx++}`); vals.push(body[k]); }
      }
      if (body.categories !== undefined) { fields.push(`categories = $${idx++}`); vals.push(JSON.stringify(body.categories)); }
      if (fields.length === 0) return res.status(400).json({ message: 'no fields' });
      vals.push(id);
      const q = `UPDATE shops SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
      const result = await query(q, vals);
      res.json({ shop: result.rows[0] });
    } catch (err: unknown) { console.error(err as any); res.status(500).json({ message: 'error' }); }
  });

  // DELETE /api/shops/:id
  app.delete('/api/shops/:id', authMiddleware, requireRole('admin','software_team'), async (req, res) => {
    try {
      const id = req.params.id;
      await query('DELETE FROM materials WHERE shop_id = $1', [id]);
      await query('DELETE FROM shops WHERE id = $1', [id]);
      res.json({ message: 'deleted' });
    } catch (err: unknown) { console.error(err as any); res.status(500).json({ message: 'error' }); }
  });

  // Approve / reject shop
  app.post('/api/shops/:id/approve', authMiddleware, requireRole('admin','software_team','purchase_team'), async (req, res) => {
    try {
      const id = req.params.id;
      // ensure approved column exists
      await query("ALTER TABLE shops ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true");
      await query("ALTER TABLE shops ADD COLUMN IF NOT EXISTS approval_reason text");
      const result = await query('UPDATE shops SET approved = true, approval_reason = NULL WHERE id = $1 RETURNING *', [id]);
      res.json({ shop: result.rows[0] });
    } catch (err: unknown) { console.error(err as any); res.status(500).json({ message: 'error' }); }
  });

  app.post('/api/shops/:id/reject', authMiddleware, requireRole('admin','software_team','purchase_team'), async (req, res) => {
    try {
      const id = req.params.id;
      const reason = req.body?.reason || null;
      await query("ALTER TABLE shops ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true");
      await query("ALTER TABLE shops ADD COLUMN IF NOT EXISTS approval_reason text");
      const result = await query('UPDATE shops SET approved = false, approval_reason = $2 WHERE id = $1 RETURNING *', [id, reason]);
      res.json({ shop: result.rows[0] });
    } catch (err: unknown) { console.error(err as any); res.status(500).json({ message: 'error' }); }
  });

  // MATERIAL endpoints: GET by id, PUT, DELETE, approve/reject
  app.get('/api/materials/:id', async (req, res) => {
    try { const id = req.params.id; const result = await query('SELECT * FROM materials WHERE id = $1', [id]); if (result.rowCount === 0) return res.status(404).json({ message: 'not found' }); res.json({ material: result.rows[0] }); } catch (err) { console.error(err); res.status(500).json({ message: 'error' }); }
  });

  app.put('/api/materials/:id', authMiddleware, async (req, res) => {
    try {
      const id = req.params.id; const body = req.body || {};
      const fields: string[] = []; const vals: any[] = []; let idx = 1;
      for (const k of ['name','code','rate','shop_id','unit','category','brandname','modelnumber','subcategory','technicalspecification','image']) {
        if (body[k] !== undefined) { fields.push(`${k} = $${idx++}`); vals.push(body[k]); }
      }
      if (body.attributes !== undefined) { fields.push(`attributes = $${idx++}`); vals.push(JSON.stringify(body.attributes)); }
      if (fields.length === 0) return res.status(400).json({ message: 'no fields' });
      vals.push(id);
      const q = `UPDATE materials SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
      const result = await query(q, vals);
      res.json({ material: result.rows[0] });
    } catch (err) { console.error(err); res.status(500).json({ message: 'error' }); }
  });

  app.delete('/api/materials/:id', authMiddleware, requireRole('admin','software_team'), async (req, res) => {
    try { const id = req.params.id; await query('DELETE FROM materials WHERE id = $1', [id]); res.json({ message: 'deleted' }); } catch (err) { console.error(err); res.status(500).json({ message: 'error' }); }
  });

  app.post('/api/materials/:id/approve', authMiddleware, requireRole('admin','software_team','purchase_team'), async (req, res) => {
    try { const id = req.params.id; await query("ALTER TABLE materials ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true"); await query("ALTER TABLE materials ADD COLUMN IF NOT EXISTS approval_reason text"); const result = await query('UPDATE materials SET approved = true, approval_reason = NULL WHERE id = $1 RETURNING *', [id]); res.json({ material: result.rows[0] }); } catch (err) { console.error(err); res.status(500).json({ message: 'error' }); }
  });

  app.post('/api/materials/:id/reject', authMiddleware, requireRole('admin','software_team','purchase_team'), async (req, res) => {
    try { const id = req.params.id; const reason = req.body?.reason || null; await query("ALTER TABLE materials ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true"); await query("ALTER TABLE materials ADD COLUMN IF NOT EXISTS approval_reason text"); const result = await query('UPDATE materials SET approved = false, approval_reason = $2 WHERE id = $1 RETURNING *', [id, reason]); res.json({ material: result.rows[0] }); } catch (err) { console.error(err); res.status(500).json({ message: 'error' }); }
  });

  // GET pending approvals for materials and shops
  app.get('/api/materials-pending-approval', async (_req, res) => {
    try {
      // materials pending approval are those where approved is not true (NULL or false)
      const result = await query("SELECT * FROM materials WHERE approved IS NOT TRUE ORDER BY created_at DESC");
      const requests = result.rows.map((r: any) => ({ id: r.id, status: 'pending', material: r }));
      res.json({ materials: requests });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('/api/materials-pending-approval error', err);
      res.status(500).json({ message: 'failed to list pending materials' });
    }
  });

  app.get('/api/shops-pending-approval', async (_req, res) => {
    try {
      const result = await query("SELECT * FROM shops WHERE approved IS NOT TRUE ORDER BY created_at DESC");
      const requests = result.rows.map((r: any) => ({ id: r.id, status: 'pending', shop: r }));
      res.json({ shops: requests });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('/api/shops-pending-approval error', err);
      res.status(500).json({ message: 'failed to list pending shops' });
    }
  });

  // ====== MATERIAL TEMPLATES ROUTES (Admin/Software Team only) ======

  // GET /api/material-templates - List all material templates
  app.get('/api/material-templates', async (_req, res) => {
    try {
      const result = await query("SELECT * FROM material_templates ORDER BY created_at DESC");
      res.json({ templates: result.rows });
    } catch (err) {
      console.error('/api/material-templates error', err);
      res.status(500).json({ message: 'failed to list material templates' });
    }
  });

  // GET /api/material-categories - List categories created by admin/software_team/purchase_team
  app.get('/api/material-categories', async (_req, res) => {
    try {
      // Return all categories (including seeded ones)
      const result = await query(`
        SELECT DISTINCT name FROM material_categories
        ORDER BY name ASC
      `);
      const categories = result.rows.map(row => row.name).filter(Boolean);
      res.json({ categories });
    } catch (err) {
      console.error('/api/material-categories error', err);
      res.status(500).json({ message: 'failed to list categories' });
    }
  });

  // GET /api/material-subcategories/:category - List subcategories created by admin/software_team/purchase_team
  app.get('/api/material-subcategories/:category', async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      // Return all subcategories for a category (including seeded ones)
      const result = await query(`
        SELECT DISTINCT name FROM material_subcategories 
        WHERE category = $1
        ORDER BY name ASC
      `, [category]);
      const subcategories = result.rows.map(row => row.name).filter(Boolean);
      res.json({ subcategories });
    } catch (err) {
      console.error('/api/material-subcategories error', err);
      res.status(500).json({ message: 'failed to list subcategories' });
    }
  });

  // POST /api/categories - Create a new category (Admin/Software Team only)
  app.post('/api/categories', authMiddleware, requireRole('admin', 'software_team'), async (req: Request, res: Response) => {
    try {
      const { name } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ message: 'Category name is required' });
        return;
      }

      const id = randomUUID();
      const userId = (req as any).user?.id;
      const result = await query(
        `INSERT INTO material_categories (id, name, created_by) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [id, name.trim(), userId || null]
      );

      res.status(201).json({ category: result.rows[0] });
      } catch (err: any) {
        console.error('/api/categories error', err as any);
      if (err.code === '23505') {
        res.status(409).json({ message: 'Category already exists' });
      } else {
        res.status(500).json({ message: 'failed to create category', error: err.message });
      }
    }
  });

  // POST /api/subcategories - Create a new subcategory (Admin/Software Team only)
  app.post('/api/subcategories', authMiddleware, requireRole('admin', 'software_team'), async (req: Request, res: Response) => {
    try {
      const { name, category } = req.body;

      if (!name || !name.trim() || !category || !category.trim()) {
        res.status(400).json({ message: 'Subcategory name and parent category are required' });
        return;
      }

      const id = randomUUID();
      const userId = (req as any).user?.id;
      const result = await query(
        `INSERT INTO material_subcategories (id, name, category, created_by) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [id, name.trim(), category.trim(), userId || null]
      );

      res.status(201).json({ subcategory: result.rows[0] });
    } catch (err: any) {
      console.error('/api/subcategories error', err as any);
      if (err.code === '23505') {
        res.status(409).json({ message: 'Subcategory already exists for this category' });
      } else {
        res.status(500).json({ message: 'failed to create subcategory', error: err.message });
      }
    }
  });

  // GET /api/categories - List all categories created by admin (including seeded ones)
  app.get('/api/categories', async (_req, res) => {
    try {
      const result = await query(`
        SELECT * FROM material_categories 
        ORDER BY created_at DESC
      `);
      
      res.json({ categories: result.rows.map(r => r.name) });
    } catch (err: unknown) {
      console.error('/api/categories error', err as any);
      res.status(500).json({ message: 'failed to list categories' });
    }
  });

  // DELETE /api/categories/:name - Delete a category and its subcategories (Admin/Software Team only)
  app.delete('/api/categories/:name', authMiddleware, requireRole('admin', 'software_team'), async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      if (!name) return res.status(400).json({ message: 'category name required' });

      // Delete subcategories for this category
      await query('DELETE FROM material_subcategories WHERE category = $1', [name]);

      // Optionally, remove any material_templates that reference this category
      await query('DELETE FROM material_templates WHERE category = $1', [name]);

      // Delete the category itself
      const result = await query('DELETE FROM material_categories WHERE name = $1 RETURNING *', [name]);

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Category not found' });
      }

      res.json({ message: 'Category deleted', category: result.rows[0] });
    } catch (err) {
      console.error('/api/categories/:name DELETE error', err);
      res.status(500).json({ message: 'failed to delete category' });
    }
  });

  // GET /api/subcategories-admin - List all subcategories for admin (from DB)
  app.get('/api/subcategories-admin', async (_req, res) => {
    try {
      const result = await query(`
        SELECT * FROM material_subcategories 
        ORDER BY category ASC, name ASC
      `);
      
      res.json({ subcategories: result.rows });
    } catch (err) {
      console.error('/api/subcategories-admin error', err);
      res.status(500).json({ message: 'failed to list subcategories' });
    }
  });

  // POST /api/material-templates - Create a new material template (Admin/Software Team/Purchase Team)
  app.post('/api/material-templates', authMiddleware, requireRole('admin', 'software_team', 'purchase_team'), async (req: Request, res: Response) => {
    try {
      const { name, code, category } = req.body;

      if (!name || !code) {
        res.status(400).json({ message: 'Name and code are required' });
        return;
      }

      const id = randomUUID();
      const result = await query(
        `INSERT INTO material_templates (id, name, code, category) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [id, name, code, category || null]
      );

      res.status(201).json({ template: result.rows[0] });
    } catch (err: any) {
      console.error('/api/material-templates error', err);
      if (err.code === '23505') {
        res.status(409).json({ message: 'Material code already exists' });
      } else {
        res.status(500).json({ message: 'failed to create material template' });
      }
    }
  });

  // PUT /api/material-templates/:id - Update material template name (Admin/Software Team only)
  app.put('/api/material-templates/:id', authMiddleware, requireRole('admin', 'software_team'), async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const { name } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ message: 'Material name is required' });
        return;
      }

      const result = await query(
        `UPDATE material_templates SET name = $1 WHERE id = $2 RETURNING *`,
        [name.trim(), id]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ message: 'Template not found' });
        return;
      }

      res.json({ template: result.rows[0] });
    } catch (err: any) {
      console.error('/api/material-templates/:id PUT error', err);
      res.status(500).json({ message: 'failed to update material template' });
    }
  });

  // DELETE /api/material-templates/:id - Delete a material template (Admin/Software Team only)
  app.delete('/api/material-templates/:id', authMiddleware, requireRole('admin', 'software_team'), async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      
      console.log('[DELETE /api/material-templates/:id] Attempting to delete template:', id);
      
      // First, delete all material_submissions that reference this template
      const submissionsDeleted = await query(
        'DELETE FROM material_submissions WHERE template_id = $1',
        [id]
      );
      console.log('[DELETE /api/material-templates/:id] Deleted submissions:', submissionsDeleted.rowCount);
      
      // Then delete the template itself
      const result = await query(
        'DELETE FROM material_templates WHERE id = $1 RETURNING *',
        [id]
      );

      console.log('[DELETE /api/material-templates/:id] Deleted template rows:', result.rowCount);
      
      if (result.rowCount === 0) {
        res.status(404).json({ message: 'Template not found' });
        return;
      }

      res.json({ message: 'Template deleted successfully', template: result.rows[0] });
    } catch (err: any) {
      console.error('/api/material-templates/:id DELETE error', err);
      res.status(500).json({ message: 'failed to delete template: ' + (err.message || 'unknown error') });
    }
  });

  // ====== MATERIAL SUBMISSIONS ROUTES (Suppliers) ======

  // POST /api/material-submissions - Supplier submits material details for a template
  app.post('/api/material-submissions', authMiddleware, requireRole('supplier'), async (req: Request, res: Response) => {
    try {
      const { template_id, shop_id, rate, unit, brandname, modelnumber, subcategory, technicalspecification } = req.body;

      if (!template_id || !shop_id) {
        res.status(400).json({ message: 'template_id and shop_id are required' });
        return;
      }

      const id = randomUUID();
      const result = await query(
        `INSERT INTO material_submissions (id, template_id, shop_id, rate, unit, brandname, modelnumber, subcategory, technicalspecification) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING *`,
        [id, template_id, shop_id, rate || null, unit || null, brandname || null, modelnumber || null, subcategory || null, technicalspecification || null]
      );

      res.status(201).json({ submission: result.rows[0] });
    } catch (err: any) {
      console.error('/api/material-submissions error', err);
      res.status(500).json({ message: 'failed to create material submission' });
    }
  });

  // GET /api/material-submissions-pending-approval - List pending material submissions
  app.get('/api/material-submissions-pending-approval', authMiddleware, requireRole('admin', 'software_team', 'purchase_team'), async (_req, res) => {
    try {
      const result = await query(`
        SELECT 
          ms.id,
          ms.template_id,
          ms.shop_id,
          ms.rate,
          ms.unit,
          ms.brandname,
          ms.modelnumber,
          ms.subcategory,
          ms.technicalspecification,
          ms.approved,
          ms.created_at,
          mt.name as template_name,
          mt.code as template_code,
          s.name as shop_name
        FROM material_submissions ms
        JOIN material_templates mt ON ms.template_id = mt.id
        JOIN shops s ON ms.shop_id = s.id
        WHERE ms.approved IS NOT TRUE
        ORDER BY ms.created_at DESC
      `);
      
      const submissions = result.rows.map((r: any) => ({
        id: r.id,
        status: 'pending',
        submission: r
      }));
      
      res.json({ submissions });
    } catch (err) {
      console.error('/api/material-submissions-pending-approval error', err);
      res.status(500).json({ message: 'failed to list pending material submissions' });
    }
  });

  // POST /api/material-submissions/:id/approve - Approve a material submission
  app.post('/api/material-submissions/:id/approve', authMiddleware, requireRole('admin', 'software_team', 'purchase_team'), async (req: Request, res: Response) => {
    try {
      const id = req.params.id;

      // Get the submission details
      const submissionResult = await query(
        `SELECT * FROM material_submissions WHERE id = $1`,
        [id]
      );

      if (submissionResult.rows.length === 0) {
        res.status(404).json({ message: 'Submission not found' });
        return;
      }

      const submission = submissionResult.rows[0];

      // Get the template details
      const templateResult = await query(
        `SELECT * FROM material_templates WHERE id = $1`,
        [submission.template_id]
      );

      const template = templateResult.rows[0];

      // Create an entry in the materials table with all the details
      const materialId = randomUUID();
      await query(
        `INSERT INTO materials (id, name, code, rate, shop_id, unit, category, brandname, modelnumber, subcategory, technicalspecification, template_id, approved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
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
          submission.technicalspecification,
          submission.template_id
        ]
      );

      // Mark submission as approved
      const approvedResult = await query(
        `UPDATE material_submissions SET approved = true WHERE id = $1 RETURNING *`,
        [id]
      );

      res.json({ submission: approvedResult.rows[0], material: { id: materialId } });
    } catch (err) {
      console.error('/api/material-submissions/:id/approve error', err);
      res.status(500).json({ message: 'failed to approve material submission' });
    }
  });

  // GET /api/supplier/my-submissions - Get supplier's material submissions
  app.get('/api/supplier/my-submissions', authMiddleware, requireRole('supplier'), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;

      // Get the shop(s) owned by this user (fallback to shops.owner_id)
      console.log('[supplier/my-submissions] fetching shops for user:', userId);
      const userShopsResult = await query(
        `SELECT id as shop_id FROM shops WHERE owner_id = $1`,
        [userId]
      );
      console.log('[supplier/my-submissions] userShopsResult rows:', userShopsResult.rows.length);

      if (userShopsResult.rows.length === 0) {
        res.json({ submissions: [] });
        return;
      }

      const shopIds = userShopsResult.rows.map((r: any) => r.shop_id);

      // Get all submissions for this supplier's shops
      console.log('[supplier/my-submissions] shopIds:', shopIds);
      let result;
      try {
        result = await query(`
        SELECT 
          ms.id,
          ms.template_id,
          ms.shop_id,
          ms.rate,
          ms.unit,
          ms.brandname,
          ms.modelnumber,
          ms.subcategory,
          ms.technicalspecification,
          ms.approved,
          ms.approval_reason,
          ms.created_at,
          mt.name as template_name,
          mt.code as template_code,
          s.name as shop_name
        FROM material_submissions ms
        JOIN material_templates mt ON ms.template_id = mt.id
        JOIN shops s ON ms.shop_id = s.id
        WHERE ms.shop_id = ANY($1::uuid[])
        ORDER BY ms.created_at DESC
      `, [shopIds]);
      } catch (sqlErr) {
        console.error('[supplier/my-submissions] SQL error', sqlErr);
        throw sqlErr;
      }

      const submissions = result.rows.map((r: any) => ({
        id: r.id,
        status: r.approved === null ? 'pending' : (r.approved ? 'approved' : 'rejected'),
        templateName: r.template_name,
        templateCode: r.template_code,
        shopName: r.shop_name,
        rate: r.rate,
        unit: r.unit,
        brandname: r.brandname,
        modelnumber: r.modelnumber,
        subcategory: r.subcategory,
        technicalspecification: r.technicalspecification,
        approvalReason: r.approval_reason,
        createdAt: r.created_at
      }));

      res.json({ submissions });
    } catch (err) {
      console.error('/api/supplier/my-submissions error', err);
      res.status(500).json({ message: 'failed to get supplier submissions' });
    }
  });

  // GET /api/supplier/my-shops - Get supplier's own shops (submitted and approved)
  app.get('/api/supplier/my-shops', authMiddleware, requireRole('supplier'), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;

      const result = await query(
        `SELECT * FROM shops WHERE owner_id = $1 ORDER BY created_at DESC`,
        [userId]
      );

      res.json({ shops: result.rows || [] });
    } catch (err) {
      console.error('/api/supplier/my-shops error', err);
      res.status(500).json({ message: 'failed to get supplier shops' });
    }
  });

  // POST /api/material-submissions/:id/reject - Reject a material submission
  app.post('/api/material-submissions/:id/reject', authMiddleware, requireRole('admin', 'software_team', 'purchase_team'), async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const reason = req.body?.reason || null;

      const result = await query(
        `UPDATE material_submissions SET approved = false, approval_reason = $2 WHERE id = $1 RETURNING *`,
        [id, reason]
      );

      res.json({ submission: result.rows[0] });
    } catch (err) {
      console.error('/api/material-submissions/:id/reject error', err);
      res.status(500).json({ message: 'failed to reject material submission' });
    }
  });

  // ===== MESSAGES API =====

  // POST /api/messages - Create a new message
  app.post('/api/messages', authMiddleware, async (req: Request, res: Response) => {
    const { senderName, senderEmail: bodySenderEmail, message, info } = req.body;
    const user = (req as any).user;

    if (!senderName || !message) {
      res.status(400).json({ message: 'Sender name and message are required' });
      return;
    }

    // Prefer authenticated username/email if available
    const senderEmail = user?.username || bodySenderEmail || null;

    try {
      const result = await query(
        `INSERT INTO messages (sender_name, sender_email, sender_role, message, info, is_read, sent_at, created_at)
         VALUES ($1, $2, $3, $4, $5, false, now(), now())
         RETURNING id, sender_name, sender_email, sender_role, message, info, is_read, sent_at, created_at`,
        [senderName, senderEmail, user?.role || 'user', message, info || null]
      );

      return res.status(201).json({ message: result.rows[0] });
    } catch (err: any) {
      console.error('/api/messages POST error', err);

      // If DB is down or table missing, enable in-memory fallback
      inMemoryMessagesEnabled = true;
      const now = new Date().toISOString();
      const fallbackMsg = {
        id: randomUUID(),
        sender_name: senderName,
        sender_email: senderEmail,
        sender_role: (user?.role) || 'user',
        message,
        info: info || null,
        is_read: false,
        sent_at: now,
        created_at: now,
      };
      inMemoryMessages.unshift(fallbackMsg);
      return res.status(201).json({ message: fallbackMsg, fallback: true });
    }
  });

  // GET /api/messages - Get messages. Admin/software/purchase get all; others get only their own messages
  app.get('/api/messages', authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;

    try {
      if (user && (user.role === 'admin' || user.role === 'software_team' || user.role === 'purchase_team')) {
        const result = await query(
          `SELECT id, sender_name, sender_email, sender_role, message, info, is_read, sent_at, created_at
           FROM messages
           ORDER BY created_at DESC`
        );
        return res.json({ messages: result.rows });
      }

      // For regular users and suppliers, return only messages they sent (match by username/email if present)
      const username = (user && user.username) ? user.username : null;
      if (!username) {
        return res.json({ messages: [] });
      }

      const result = await query(
        `SELECT id, sender_name, sender_email, sender_role, message, info, is_read, sent_at, created_at
         FROM messages
         WHERE sender_email = $1
         ORDER BY created_at DESC`,
        [username]
      );

      return res.json({ messages: result.rows });
    } catch (err: any) {
      console.error('/api/messages GET error', err);

      // DB failed: return in-memory fallback if enabled
      inMemoryMessagesEnabled = true;
      if (user && (user.role === 'admin' || user.role === 'software_team' || user.role === 'purchase_team')) {
        return res.json({ messages: inMemoryMessages });
      }
      const username = (user && user.username) ? user.username : null;
      if (!username) return res.json({ messages: [] });
      const filtered = inMemoryMessages.filter((m) => m.sender_email === username);
      return res.json({ messages: filtered });
    }
  });

  // DELETE /api/messages/:id - Delete a message (admins/teams can delete any; owners can delete their own)
  app.delete('/api/messages/:id', authMiddleware, async (req: Request, res: Response) => {
    const id = req.params.id;
    const user = (req as any).user;

    try {
      if (user && (user.role === 'admin' || user.role === 'software_team' || user.role === 'purchase_team')) {
        const result = await query(`DELETE FROM messages WHERE id = $1 RETURNING id`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Message not found' });
        return res.json({ message: 'Message deleted successfully' });
      }

      // Regular users can delete only their own messages (match by sender_email)
      const username = user?.username || null;
      if (!username) return res.status(403).json({ message: 'Forbidden' });

      const result = await query(`DELETE FROM messages WHERE id = $1 AND sender_email = $2 RETURNING id`, [id, username]);
      if (result.rows.length === 0) return res.status(404).json({ message: 'Message not found or not owned by you' });
      res.json({ message: 'Message deleted successfully' });
    } catch (err: any) {
      console.error('/api/messages DELETE error', err);

      // DB failed: attempt to delete from in-memory fallback
      inMemoryMessagesEnabled = true;
      const userEmail = user?.username || null;
      if (user && (user.role === 'admin' || user.role === 'software_team' || user.role === 'purchase_team')) {
        const idx = inMemoryMessages.findIndex((m) => m.id === id);
        if (idx === -1) return res.status(404).json({ message: 'Message not found' });
        inMemoryMessages.splice(idx, 1);
        return res.json({ message: 'Message deleted successfully (fallback)' });
      }
      if (!userEmail) return res.status(403).json({ message: 'Forbidden' });
      const idx = inMemoryMessages.findIndex((m) => m.id === id && m.sender_email === userEmail);
      if (idx === -1) return res.status(404).json({ message: 'Message not found or not owned by you' });
      inMemoryMessages.splice(idx, 1);
      return res.json({ message: 'Message deleted successfully (fallback)' });
    }
  });

  return httpServer;
}
