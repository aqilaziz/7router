import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./db.js";
import { adminRoutes } from "./routes-admin.js";
import { openaiRoutes } from "./routes-openai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

await app.register(cors, { origin: true });
await openaiRoutes(app);
await adminRoutes(app);

// Dashboard statis
await app.register(fastifyStatic, {
  root: path.join(__dirname, "..", "public"),
  prefix: "/",
});

app.get("/health", async () => ({ ok: true, time: new Date().toISOString() }));

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });
console.log(`\n  7router jalan di http://localhost:${port}`);
console.log(`  Dashboard : http://localhost:${port}`);
console.log(`  BYOK base : http://localhost:${port}/v1\n`);
