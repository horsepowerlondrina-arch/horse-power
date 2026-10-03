import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { createDatabase } from "./db/database.js";
import { seed } from "./db/seed.js";
import { createApp } from "./app.js";
if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
  throw new Error("Configure APP_ORIGIN para produção.");
const db = createDatabase();
if (process.env.NODE_ENV !== "production") await seed(db);
createApp(db).listen(Number(process.env.PORT || 3001), "127.0.0.1", () =>
  console.log("Horse Power disponível em http://127.0.0.1:3001"),
);
