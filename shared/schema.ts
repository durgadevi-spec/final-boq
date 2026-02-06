import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  decimal,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  username: text("username").notNull().unique(),
  password: text("password").notNull(),

  // user, admin, supplier, software_team, purchase_team
  role: text("role").notNull().default("user"),

  // approved, pending, rejected
  approved: text("approved").notNull().default("approved"),

  // DB column is approval_reason, but TS key can be approvalReason
  approvalReason: text("approval_reason"),

  fullName: text("full_name"),
  mobileNumber: text("mobile_number"),
  department: text("department"),
  employeeCode: text("employee_code"),
  companyName: text("company_name"),
  gstNumber: text("gst_number"),
  businessAddress: text("business_address"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const estimatorStep9Cart = pgTable("estimator_step9_cart", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  estimator: text("estimator").notNull(),
  billNo: text("bill_no").notNull(), // session_id

  sNo: integer("s_no"),
  item: text("item"),
  description: text("description"),
  unit: text("unit"),
  qty: decimal("qty", { precision: 10, scale: 2 }),
  rate: decimal("rate", { precision: 10, scale: 2 }),
  amount: decimal("amount", { precision: 10, scale: 2 }),

  materialId: uuid("material_id"),
  batchId: text("batch_id"),
  rowId: text("row_id"),
  shopId: uuid("shop_id"),

  supplyRate: decimal("supply_rate", { precision: 10, scale: 2 }),
  installRate: decimal("install_rate", { precision: 10, scale: 2 }),

  doorType: text("door_type"),
  panelType: text("panel_type"),
  subOption: text("sub_option"),
  glazingType: text("glazing_type"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * Stronger validation for insert payloads
 */
export const userRoleEnum = z.enum([
  "user",
  "admin",
  "supplier",
  "software_team",
  "purchase_team",
  "contractor",
  "pre_sales",
]);

export const approvalStatusEnum = z.enum([
  "approved",
  "pending",
  "rejected",
]);

export const insertUserSchema = createInsertSchema(users, {
  username: z.string().min(3),
  password: z.string().min(6),
  role: userRoleEnum.optional(),
  approved: approvalStatusEnum.optional(),
  approvalReason: z.string().nullable().optional(),
  fullName: z.string().nullable().optional(),
  mobileNumber: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  employeeCode: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  gstNumber: z.string().nullable().optional(),
  businessAddress: z.string().nullable().optional(),
}).pick({
  username: true,
  password: true,
  role: true,
  approved: true,
  approvalReason: true,
  fullName: true,
  mobileNumber: true,
  department: true,
  employeeCode: true,
  companyName: true,
  gstNumber: true,
  businessAddress: true,
});

export const insertEstimatorStep9CartSchema = createInsertSchema(estimatorStep9Cart, {
  estimator: z.string(),
  billNo: z.string(),
  sNo: z.number().nullable().optional(),
  item: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  qty: z.number().nullable().optional(),
  rate: z.number().nullable().optional(),
  amount: z.number().nullable().optional(),
  materialId: z.string().uuid().nullable().optional(),
  batchId: z.string().nullable().optional(),
  rowId: z.string().nullable().optional(),
  shopId: z.string().uuid().nullable().optional(),
  supplyRate: z.number().nullable().optional(),
  installRate: z.number().nullable().optional(),
  doorType: z.string().nullable().optional(),
  panelType: z.string().nullable().optional(),
  subOption: z.string().nullable().optional(),
  glazingType: z.string().nullable().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type EstimatorStep9Cart = typeof estimatorStep9Cart.$inferSelect;
export type InsertEstimatorStep9Cart = z.infer<typeof insertEstimatorStep9CartSchema>;
