import { migrate, pool } from "./db.js";

await migrate();
console.log("[1vault-indexer] schema applied");
await pool.end();
