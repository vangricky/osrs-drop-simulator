#!/usr/bin/env node
/**
 * Recomputes the CSP sha256 hash-source for an inline JSON-LD script block,
 * so it can be allowed in that page's script-src without opening it up to
 * arbitrary inline scripts. Run this and paste the printed value into the
 * page's CSP whenever you edit that block's content.
 *
 * Usage: node scripts/hash-jsonld.mjs [path/to/page.html]
 * Defaults to index.html (the main app) when no path is given.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = new URL("..", import.meta.url);
const target = process.argv[2] ?? "index.html";
const htmlPath = fileURLToPath(new URL(target, ROOT));

const html = readFileSync(htmlPath, "utf8");
const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!match) {
  console.error(`No <script type="application/ld+json"> block found in ${target}`);
  process.exit(1);
}

const hash = createHash("sha256").update(match[1]).digest("base64");
console.log(`sha256-${hash}`);
