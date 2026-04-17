#!/usr/bin/env node
/**
 * Fails if app/lib/actions/components contain PostgREST .upsert( — ON CONFLICT breaks when
 * the DB has no matching unique constraint. Garmin sync uses delete-then-insert instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const roots = ["app", "lib", "actions", "components"];
const rootDir = path.resolve(__dirname, "..");

const upsertCall = /\.\s*upsert\s*\(/;
const exts = new Set([".ts", ".tsx"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

let bad = [];
for (const r of roots) {
  const d = path.join(rootDir, r);
  if (!fs.existsSync(d)) continue;
  for (const f of walk(d)) {
    const t = fs.readFileSync(f, "utf8");
    if (upsertCall.test(t)) bad.push(path.relative(rootDir, f));
  }
}

if (bad.length) {
  console.error(
    "[check-no-upsert-on-conflict] Forbidden .upsert( in:\n",
    bad.map((f) => `  ${f}`).join("\n"),
  );
  process.exit(1);
}

console.log("[check-no-upsert-on-conflict] OK — no .upsert( in app/lib/actions/components");
