import {
  beginCapture,
  captureState,
  finishCapture,
  importCapture,
} from "./services/extension.js";
import { assertUniqueService } from "./services/serviceCatalog.js";
import { generateExpenses, payExpense } from "./services/expenses.js";
import { createShare, readShare } from "./services/sharing.js";
import express from "express";
import { z } from "zod";
import { resolve } from "node:path";
import type { DB } from "./db/database.js";
import { transaction } from "./db/database.js";
import {
  auth,
  digest,
  startSession,
  tokenFrom,
  verifyPassword,
  hashPassword,
  type Context,
} from "./auth/session.js";
import {
  audit,
  id,
  listOrders,
  mechanicWorkspace,
  saveOrder,
  scoped,
  settle,
  transitionOrder,
} from "./services/workshop.js";
import { statuses } from "./domain/orders.js";
import { configurePlan, settleInstallment } from "./services/payments.js";
import { calculatePlan, paymentMethods } from "./domain/payments.js";
import { lookupVehicle, providerToken } from "./services/vehicleLookup.js";
const text = z.string().trim().max(500).default("");
const name = z
  .string()
  .trim()
  .min(2, "Informe pelo menos 2 caracteres.")
  .max(150);
const integer = z.number().int().min(0).max(100000000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Data inválida.");
const schemas = {
  customers: z.object({
    name,
    phone: text,
    email: z.union([z.string().email(), z.literal("")]).default(""),
    document: text,
    birthday: z.union([date, z.literal("")]).default(""),
    address: text,
    notes: text,
    active: z.number().int().min(0).max(1).default(1),
  }),
  vehicles: z.object({
    customer_id: z.string().min(1),
    plate: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => v.replace(/[^A-Z0-9]/g, ""))
      .refine(
        (v) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(v),
        "Informe uma placa brasileira válida.",
      ),
    brand: name,
    model: name,
    year: z.number().int().min(1900).max(2100),
    color: text,
    km: integer,
    chassis: text,
    active: z.number().int().min(0).max(1).default(1),
  }),
  catalog: z.object({
    kind: z.enum(["product", "service"]),
    name,
    sku: z.string().trim().min(1).max(40),
    category: text,
    cost: integer,
    price: integer,
    stock: integer,
    minimum_stock: integer,
    active: z.number().int().min(0).max(1).default(1),
  }),
  professionals: z.object({
    name,
    role: name,
    phone: text,
    email: z.union([z.string().email(), z.literal("")]).default(""),
    active: z.number().int().min(0).max(1).default(1),
  }),
};
const orderSchema = z.object({
  customer_id: z.string().nullable().optional(),
  vehicle_id: z.string().nullable().optional(),
  status: z.enum(["quote", "open"]).default("open"),
  guest_name: text,
  guest_plate: text,
  guest_vehicle: text,
  entered_on: date,
  due_on: date,
  km: integer,
  problem: text,
  notes: z.string().trim().max(4000).default(""),
  discount: integer,
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        catalog_id: z.string().min(1),
        professional_id: z.string().nullable().optional(),
        quantity: z.number().int().min(1).max(10000),
        price: integer,
      }),
    )
    .max(200),
});
const paymentSchema = z.object({
  pass_card_fee: z.boolean().default(false),
  method: z.enum(paymentMethods),
  installments: z.number().int().min(1).max(24),
  card_fee_bps: z.number().int().min(0).max(10000),
  interest_bps: z.number().int().min(0).max(10000),
  first_due_on: date,
});
export function createApp(db: DB) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      let origin;
      try {
        origin = new URL(req.headers.origin);
      } catch {
        res.status(403).json({ error: "Origem inválida." });
        return;
      }
      const extensionRequest =
        req.path === "/extension/import" &&
        /^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin);
      const valid =
        extensionRequest ||
        (process.env.NODE_ENV === "production"
          ? [
              process.env.APP_ORIGIN,
              ...(process.env.APP_ORIGINS || "").split(","),
            ]
              .map((value) => value?.trim())
              .includes(origin.origin)
          : [
              "http://127.0.0.1:5173",
              "http://localhost:5173",
              "http://127.0.0.1:3001",
              "http://localhost:3001",
            ].includes(origin.origin));
      if (!valid) {
        res.status(403).json({ error: "Origem não autorizada." });
        return;
      }
    }
    next();
  });
  if (process.env.VERCEL) app.set("trust proxy", 1);
  app.post("/api/setup", async (req, res) => {
    const input = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: z
          .string()
          .min(12, "Use uma senha com pelo menos 12 caracteres.")
          .max(200),
      })
      .parse(req.body);
    await transaction(db, async () => {
      const setup = await db
        .prepare(
          "SELECT * FROM admin_setup WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
        )
        .get(digest(input.token), Date.now());
      if (!setup) throw new Error("Link de ativação inválido ou expirado.");
      await db
        .prepare("UPDATE users SET password_hash=? WHERE id=?")
        .run(hashPassword(input.password), setup.user_id);
      await db
        .prepare(
          "UPDATE admin_setup SET used_at=? WHERE user_id=? AND used_at IS NULL",
        )
        .run(new Date().toISOString(), setup.user_id);
      await db
        .prepare("DELETE FROM sessions WHERE user_id=?")
        .run(setup.user_id);
    });
    res.json({ ok: true });
  });
  app.post("/api/login", async (req, res) => {
    const input = z
      .object({
        email: z.string().email(),
        password: z.string().min(1).max(200),
      })
      .parse(req.body);
    const key = digest((req.ip || "local") + ":" + input.email.toLowerCase());
    const now = Date.now();
    const attempt = await db
      .prepare(
        "INSERT INTO login_attempts(key,count,until_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempts.until_at<? THEN 1 ELSE login_attempts.count+1 END,until_at=CASE WHEN login_attempts.until_at<? THEN excluded.until_at ELSE login_attempts.until_at END RETURNING count",
      )
      .get(key, now + 300000, now, now);
    if (Number(attempt?.count) > 10) {
      res
        .status(429)
        .json({ error: "Aguarde alguns minutos antes de tentar novamente." });
      return;
    }
    const user = await db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(input.email.toLowerCase());
    if (!user || !verifyPassword(input.password, String(user.password_hash))) {
      res.status(401).json({ error: "E-mail ou senha incorretos." });
      return;
    }
    await db
      .prepare("DELETE FROM login_attempts WHERE key=? OR until_at<?")
      .run(key, now);
    const membership = (await db
      .prepare(
        "SELECT tenant_id FROM memberships WHERE user_id=? ORDER BY tenant_id LIMIT 1",
      )
      .get(user.id))!;
    await db
      .prepare("DELETE FROM sessions WHERE expires_at<? OR token_hash=?")
      .run(Date.now(), digest(tokenFrom(req)));
    if (!membership) {
      res.status(403).json({ error: "Acesso não habilitado." });
      return;
    }
    await startSession(db, res, String(user.id), String(membership.tenant_id));
    res.json({ ok: true });
  });
  app.get("/api/public/:token", async (req, res) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Referrer-Policy", "no-referrer");
    const result = await readShare(db, String(req.params.token));
    if (!result) {
      res.status(404).json({ error: "Link indisponível ou expirado." });
      return;
    }
    res.json(result);
  });
  app.post("/api/extension/import", async (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
    res.json(await importCapture(db, token, req.body));
  });
  app.use("/api", auth(db));
  app.get("/api/session", async (_req, res) => {
    const ctx: Context = res.locals.context;
    res.json({
      user: await db
        .prepare("SELECT id,name,email FROM users WHERE id=?")
        .get(ctx.userId),
      tenant: await db
        .prepare("SELECT * FROM tenants WHERE id=?")
        .get(ctx.tenantId),
      tenants: await db
        .prepare(
          "SELECT t.* FROM tenants t JOIN memberships m ON m.tenant_id=t.id WHERE m.user_id=? ORDER BY t.name",
        )
        .all(ctx.userId),
      role: ctx.role,
    });
  });
  app.post("/api/logout", async (req, res) => {
    await db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(digest(tokenFrom(req)));
    res.clearCookie("hp_session", { path: "/" }).json({ ok: true });
  });
  app.post("/api/tenant", async (req, res) => {
    const ctx: Context = res.locals.context;
    const tenant = z.string().parse(req.body.tenant_id);
    if (
      !(await db
        .prepare("SELECT 1 FROM memberships WHERE user_id=? AND tenant_id=?")
        .get(ctx.userId, tenant))
    ) {
      res.status(403).json({ error: "Você não tem acesso a esta oficina." });
      return;
    }
    await db
      .prepare("UPDATE sessions SET tenant_id=? WHERE token_hash=?")
      .run(tenant, digest(tokenFrom(req)));
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    if (
      res.locals.context.role === "owner" ||
      (req.method === "GET" && req.path === "/workspace") ||
      (req.method === "POST" && /^\/orders\/[^/]+\/status$/.test(req.path)) ||
      (req.method === "PATCH" && /^\/orders\/[^/]+\/notes$/.test(req.path))
    ) {
      next();
      return;
    }
    res.status(403).json({ error: "Esta área é exclusiva do administrador." });
  });
  app.get("/api/workspace", async (_req, res) => {
    const tenant = res.locals.context.tenantId;
    if (res.locals.context.role !== "owner") {
      res.json(await mechanicWorkspace(db, tenant));
      return;
    }
    res.json({
      catalog_mode:
        (
          await db
            .prepare("SELECT catalog_mode FROM tenants WHERE id=?")
            .get(tenant)
        )?.catalog_mode || "standard",
      installments: await db
        .prepare(
          "SELECT * FROM payment_installments WHERE tenant_id=? ORDER BY sequence",
        )
        .all(tenant),
      payment_settings: (await db
        .prepare("SELECT * FROM payment_settings WHERE tenant_id=?")
        .get(tenant)) || {
        debit_fee_bps: 0,
        credit_fee_bps: 0,
        interest_bps: 0,
      },
      plate_lookup_enabled: !!providerToken(tenant),
      customers: await db
        .prepare("SELECT * FROM customers WHERE tenant_id=? ORDER BY name")
        .all(tenant),
      vehicles: await db
        .prepare(
          "SELECT v.*,c.name customer_name FROM vehicles v JOIN customers c ON c.id=v.customer_id AND c.tenant_id=v.tenant_id WHERE v.tenant_id=? ORDER BY v.plate",
        )
        .all(tenant),
      catalog: await db
        .prepare(
          "SELECT c.*,(SELECT group_concat(a.alias,' ') FROM service_aliases a WHERE a.tenant_id=c.tenant_id AND a.catalog_id=c.id) search_aliases FROM catalog c WHERE c.tenant_id=? AND c.merged_into IS NULL AND c.archived_at IS NULL ORDER BY c.name",
        )
        .all(tenant),
      professionals: await db
        .prepare("SELECT * FROM professionals WHERE tenant_id=? ORDER BY name")
        .all(tenant),
      card_rates: await db
        .prepare(
          "SELECT * FROM card_rates WHERE tenant_id=? ORDER BY installments",
        )
        .all(tenant),
      orders: await listOrders(db, tenant),
      receivables: await db
        .prepare(
          `SELECT r.*,(SELECT number FROM orders o WHERE o.tenant_id=r.tenant_id AND o.id=r.order_id) order_number,c.name customer_name,CASE WHEN r.plan_configured=0 THEN r.amount ELSE COALESCE((SELECT SUM(gross) FROM payment_installments p WHERE p.tenant_id=r.tenant_id AND p.receivable_id=r.id AND p.status='open'),0) END balance FROM receivables r JOIN customers c ON c.id=r.customer_id AND c.tenant_id=r.tenant_id WHERE r.tenant_id=? ORDER BY r.due_on`,
        )
        .all(tenant),
      cash: await db
        .prepare(
          "SELECT * FROM cash_entries WHERE tenant_id=? ORDER BY created_at",
        )
        .all(tenant),
      movements: await db
        .prepare(
          "SELECT s.*,c.name product_name,u.name user_name FROM stock_movements s JOIN catalog c ON c.id=s.catalog_id AND c.tenant_id=s.tenant_id JOIN users u ON u.id=s.user_id WHERE s.tenant_id=? ORDER BY s.created_at DESC",
        )
        .all(tenant),
    });
  });
  app.get("/api/expenses", async (_req, res) => {
    const t = res.locals.context.tenantId;
    res.json({
      templates: await db
        .prepare(
          "SELECT * FROM expense_templates WHERE tenant_id=? ORDER BY category,description",
        )
        .all(t),
      payables: await db
        .prepare("SELECT * FROM payables WHERE tenant_id=? ORDER BY due_on")
        .all(t),
    });
  });
  const expenseSchema = z.object({
    description: name,
    supplier: text,
    category: name,
    amount: integer.refine((v) => v > 0),
    due_on: date,
    notes: text,
  });
  app.post("/api/payables", async (req, res) => {
    const ctx: Context = res.locals.context;
    const value = expenseSchema.parse(req.body),
      record = id();
    await db
      .prepare(
        "INSERT INTO payables(id,tenant_id,description,supplier,category,amount,due_on,notes) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        record,
        ctx.tenantId,
        value.description,
        value.supplier,
        value.category,
        value.amount,
        value.due_on,
        value.notes,
      );
    await audit(db, ctx, "expense.created", record);
    res.json({ id: record });
  });
  app.put("/api/payables/:id", async (req, res) => {
    const ctx: Context = res.locals.context;
    const p = await scoped(db, "payables", ctx.tenantId, String(req.params.id));
    if (p.status !== "open")
      throw new Error("Somente contas em aberto podem ser editadas.");
    const v = expenseSchema.parse(req.body);
    await db
      .prepare(
        "UPDATE payables SET description=?,supplier=?,category=?,amount=?,due_on=?,notes=? WHERE tenant_id=? AND id=?",
      )
      .run(
        v.description,
        v.supplier,
        v.category,
        v.amount,
        v.due_on,
        v.notes,
        ctx.tenantId,
        p.id,
      );
    await audit(db, ctx, "expense.updated", p.id);
    res.json({ ok: true });
  });
  app.post("/api/payables/:id/pay", async (req, res) => {
    const value = z.object({ paid_on: date, method: name }).parse(req.body);
    await payExpense(
      db,
      res.locals.context,
      String(req.params.id),
      value.paid_on,
      value.method,
    );
    res.json({ ok: true });
  });
  app.post("/api/payables/:id/cancel", async (req, res) => {
    const ctx: Context = res.locals.context;
    const p = await scoped(db, "payables", ctx.tenantId, String(req.params.id));
    if (p.status !== "open")
      throw new Error("Somente contas em aberto podem ser canceladas.");
    await db
      .prepare(
        "UPDATE payables SET status='cancelled' WHERE tenant_id=? AND id=?",
      )
      .run(ctx.tenantId, p.id);
    await audit(db, ctx, "expense.cancelled", p.id);
    res.json({ ok: true });
  });
  app.post("/api/expenses/generate", async (req, res) => {
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(req.body.month);
    res.json(await generateExpenses(db, res.locals.context, month));
  });
  app.put("/api/expense-templates/:id", async (req, res) => {
    const ctx: Context = res.locals.context;
    const p = await scoped(
      db,
      "expense_templates",
      ctx.tenantId,
      String(req.params.id),
    );
    const v = z
      .object({
        amount: integer.nullable(),
        due_day: z.number().int().min(1).max(31),
        active: z.number().int().min(0).max(1),
      })
      .parse(req.body);
    await db
      .prepare(
        "UPDATE expense_templates SET amount=?,due_day=?,active=? WHERE tenant_id=? AND id=?",
      )
      .run(v.amount, v.due_day, v.active, ctx.tenantId, p.id);
    await audit(db, ctx, "expense_template.updated", p.id);
    res.json({ ok: true });
  });
  app.post("/api/orders/:id/capture-session", async (req, res) => {
    res.json(
      await beginCapture(
        db,
        res.locals.context,
        String(req.params.id),
        tokenFrom(req),
      ),
    );
  });
  app.get("/api/orders/:id/capture-state", async (req, res) => {
    res.json(await captureState(db, res.locals.context, String(req.params.id)));
  });
  app.post("/api/orders/:id/end-capture", async (req, res) => {
    res.json(
      await finishCapture(db, res.locals.context, String(req.params.id)),
    );
  });
  app.get("/api/service-times", async (_req, res) => {
    if (res.locals.context.role !== "owner") {
      res.status(403).json({ error: "Acesso restrito ao administrador." });
      return;
    }
    res.json(
      await db
        .prepare(
          "SELECT t.*,c.name catalog_name FROM service_times t JOIN catalog c ON c.id=t.catalog_id AND c.tenant_id=t.tenant_id WHERE t.tenant_id=? AND c.archived_at IS NULL ORDER BY t.captured_at DESC LIMIT 2000",
        )
        .all(res.locals.context.tenantId),
    );
  });
  app.post("/api/orders/:id/share", async (req, res) =>
    res.json({
      ...(await createShare(db, res.locals.context, String(req.params.id))),
      public_origin: process.env.PUBLIC_ORIGIN || "",
    }),
  );
  app.post("/api/orders/:id/revoke-share", async (req, res) => {
    const ctx: Context = res.locals.context;
    await scoped(db, "orders", ctx.tenantId, String(req.params.id));
    await db
      .prepare(
        "UPDATE public_shares SET revoked=1 WHERE tenant_id=? AND order_id=?",
      )
      .run(ctx.tenantId, String(req.params.id));
    res.json({ ok: true });
  });
  const lookupLimits = new Map<string, { count: number; until: number }>();
  app.post("/api/vehicles/lookup", async (req, res) => {
    const tenant = res.locals.context.tenantId;
    const plate = z.string().max(12).parse(req.body.plate);
    const prior = lookupLimits.get(tenant);
    const entry =
      prior && prior.until > Date.now()
        ? prior
        : { count: 0, until: Date.now() + 60000 };
    if (entry.count >= 20) {
      res
        .status(429)
        .json({ error: "Limite de consultas atingido. Aguarde um minuto." });
      return;
    }
    entry.count++;
    lookupLimits.set(tenant, entry);
    res.json(await lookupVehicle(db, tenant, plate));
  });
  app.post("/api/customers-with-vehicle", async (req, res) => {
    const ctx: Context = res.locals.context;
    const customer = schemas.customers.parse(req.body.customer);
    const vehicle = schemas.vehicles
      .omit({ customer_id: true })
      .parse(req.body.vehicle);
    const result = await transaction(db, async () => {
      const customerId = id(),
        vehicleId = id();
      const fields = Object.keys(customer);
      await db
        .prepare(
          `INSERT INTO customers(id,tenant_id,${fields.join(",")}) VALUES(${Array(
            fields.length + 2,
          )
            .fill("?")
            .join(",")})`,
        )
        .run(customerId, ctx.tenantId, ...Object.values(customer));
      const vf = Object.keys(vehicle);
      await db
        .prepare(
          `INSERT INTO vehicles(id,tenant_id,customer_id,${vf.join(",")}) VALUES(${Array(
            vf.length + 3,
          )
            .fill("?")
            .join(",")})`,
        )
        .run(vehicleId, ctx.tenantId, customerId, ...Object.values(vehicle));
      await audit(db, ctx, "customers.created", customerId);
      await audit(db, ctx, "vehicles.created", vehicleId);
      return { id: customerId, vehicle_id: vehicleId };
    });
    res.status(201).json(result);
  });
  app.patch("/api/orders/:id/notes", async (req, res) => {
    const ctx: Context = res.locals.context;
    const record = String(req.params.id);
    const order = await scoped(db, "orders", ctx.tenantId, record);
    if (
      order.kind !== "order" ||
      !["open", "working", "ready"].includes(order.status)
    )
      throw new Error("As observações só podem mudar em uma OS em andamento.");
    const notes = z.string().trim().max(4000).parse(req.body.notes);
    await transaction(db, async () => {
      await db
        .prepare("UPDATE orders SET notes=? WHERE tenant_id=? AND id=?")
        .run(notes, ctx.tenantId, record);
      await audit(db, ctx, "order.notes_updated", record);
    });
    res.json({ ok: true });
  });
  app.put("/api/payment-settings", async (req, res) => {
    const input = z
      .object({
        debit_fee_bps: z.number().int().min(0).max(10000),
        credit_fee_bps: z.number().int().min(0).max(10000),
        interest_bps: z.number().int().min(0).max(10000),
      })
      .parse(req.body);
    await db
      .prepare(
        "INSERT INTO payment_settings(tenant_id,debit_fee_bps,credit_fee_bps,interest_bps) VALUES(?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET debit_fee_bps=excluded.debit_fee_bps,credit_fee_bps=excluded.credit_fee_bps,interest_bps=excluded.interest_bps",
      )
      .run(
        res.locals.context.tenantId,
        input.debit_fee_bps,
        input.credit_fee_bps,
        input.interest_bps,
      );
    res.json({ ok: true });
  });
  app.post("/api/receivables/:id/preview", async (req, res) => {
    const r = await scoped(
      db,
      "receivables",
      res.locals.context.tenantId,
      String(req.params.id),
    );
    res.json(calculatePlan(r.amount, paymentSchema.parse(req.body)));
  });
  app.post("/api/receivables/:id/plan", async (req, res) =>
    res.json(
      await configurePlan(
        db,
        res.locals.context,
        String(req.params.id),
        paymentSchema.parse(req.body),
      ),
    ),
  );
  app.post("/api/installments/:id/settle", async (req, res) => {
    await settleInstallment(db, res.locals.context, String(req.params.id));
    res.json({ ok: true });
  });
  for (const table of [
    "customers",
    "vehicles",
    "catalog",
    "professionals",
  ] as const) {
    const handler = async (req: express.Request, res: express.Response) => {
      const ctx: Context = res.locals.context;
      const input: Record<string, any> = schemas[table].parse(req.body);
      const record = req.params.id ? String(req.params.id) : undefined;
      const savedId = await transaction(db, async () => {
        const old = record
          ? await scoped(db, table, ctx.tenantId, record)
          : null;
        if (table === "vehicles") {
          const customer = await scoped(
            db,
            "customers",
            ctx.tenantId,
            input.customer_id,
          );
          if (!customer.active) throw new Error("Cliente inativo.");
          if (
            old &&
            old.customer_id !== input.customer_id &&
            (await db
              .prepare(
                "SELECT 1 FROM orders WHERE tenant_id=? AND vehicle_id=?",
              )
              .get(ctx.tenantId, record!))
          )
            throw new Error(
              "Veículos com histórico não podem trocar de proprietário nesta fase.",
            );
        }
        if (table === "catalog") {
          if (old?.archived_at)
            throw new Error(
              "Este item pertence ao catálogo anterior. Importe novamente pela extensão.",
            );
          if (old?.merged_into)
            throw new Error(
              "Este cadastro foi unificado. Edite o serviço principal.",
            );
          input.cost_known = 1;
          if (old && old.kind !== input.kind)
            throw new Error("O tipo do item não pode ser alterado.");
          if (input.kind === "service") {
            await assertUniqueService(db, ctx.tenantId, input.name, record);
            input.stock = 0;
            input.minimum_stock = 0;
          }
          if (old && old.stock !== input.stock)
            throw new Error("Use o ajuste de estoque para alterar o saldo.");
        }
        const recordId = record || id();
        const fields = Object.keys(input);
        if (old)
          await db
            .prepare(
              `UPDATE ${table} SET ${fields.map((f) => `${f}=?`).join(",")} WHERE tenant_id=? AND id=?`,
            )
            .run(...Object.values(input), ctx.tenantId, recordId);
        else
          await db
            .prepare(
              `INSERT INTO ${table}(id,tenant_id,${fields.join(",")}) VALUES(${fields
                .map(() => "?")
                .concat(["?", "?"])
                .join(",")})`,
            )
            .run(recordId, ctx.tenantId, ...Object.values(input));
        if (table === "catalog" && !old && input.stock > 0)
          await db
            .prepare(
              "INSERT INTO stock_movements(id,tenant_id,catalog_id,quantity,reason,user_id) VALUES(?,?,?,?,?,?)",
            )
            .run(
              id(),
              ctx.tenantId,
              recordId,
              input.stock,
              "Saldo inicial",
              ctx.userId,
            );
        await audit(
          db,
          ctx,
          `${table}.${old ? "updated" : "created"}`,
          recordId,
        );
        return recordId;
      });
      res.json({ ok: true, id: savedId });
    };
    app.post(`/api/${table}`, handler);
    app.put(`/api/${table}/:id`, handler);
  }
  app.post("/api/stock/:id", async (req, res) => {
    const ctx: Context = res.locals.context;
    const input = z
      .object({
        quantity: z
          .number()
          .int()
          .min(-100000)
          .max(100000)
          .refine((n) => n !== 0),
        reason: z.string().trim().min(5).max(200),
      })
      .parse(req.body);
    await transaction(db, async () => {
      const item = await scoped(
        db,
        "catalog",
        ctx.tenantId,
        String(req.params.id),
      );
      if (item.kind !== "product" || !item.active)
        throw new Error("Selecione um produto ativo.");
      if (item.stock + input.quantity < 0)
        throw new Error("O estoque não pode ficar negativo.");
      await db
        .prepare(
          "UPDATE catalog SET stock_verified=1,stock=stock+? WHERE tenant_id=? AND id=?",
        )
        .run(input.quantity, ctx.tenantId, item.id);
      await db
        .prepare(
          "INSERT INTO stock_movements(id,tenant_id,catalog_id,quantity,reason,user_id) VALUES(?,?,?,?,?,?)",
        )
        .run(
          id(),
          ctx.tenantId,
          item.id,
          input.quantity,
          input.reason,
          ctx.userId,
        );
      await audit(db, ctx, "stock.adjusted", item.id);
    });
    res.json({ ok: true });
  });
  app.post("/api/orders", async (req, res) =>
    res.status(201).json({
      id: await saveOrder(db, res.locals.context, orderSchema.parse(req.body)),
    }),
  );
  app.put("/api/orders/:id", async (req, res) =>
    res.json({
      id: await saveOrder(
        db,
        res.locals.context,
        orderSchema.parse(req.body),
        String(req.params.id),
      ),
    }),
  );
  app.post("/api/orders/:id/status", async (req, res) => {
    await transitionOrder(
      db,
      res.locals.context,
      String(req.params.id),
      z.enum(statuses).parse(req.body.status),
    );
    res.json({ ok: true });
  });
  app.post("/api/receivables/:id/settle", async (req, res) => {
    await settle(
      db,
      res.locals.context,
      String(req.params.id),
      z
        .enum([
          "Pix",
          "Dinheiro",
          "Cartão de débito",
          "Cartão de crédito",
          "Transferência",
          "Boleto",
        ])
        .parse(req.body.method),
    );
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Recurso não encontrado." }),
  );
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" "),
        });
        return;
      }
      const message = String(error.message || "");
      const constraint =
        message.includes("UNIQUE constraint") || error.code === "23505";
      if (
        typeof error.code === "string" &&
        /^[0-9A-Z]{5}$/.test(error.code) &&
        !constraint
      ) {
        console.error("Database operation failed", { code: error.code });
        res.status(500).json({
          error: "Não foi possível concluir a operação. Tente novamente.",
        });
        return;
      }
      res.status(error.status || 400).json({
        error: constraint
          ? "Já existe um cadastro com essa placa ou referência nesta oficina."
          : message.includes("constraint")
            ? "Não foi possível vincular os registros."
            : message || "Não foi possível concluir a operação.",
      });
    },
  );
  return app;
}
