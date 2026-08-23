#!/usr/bin/env node
/**
 * Recomputes the CSP sha256 hash-source for index.html's inline JSON-LD
 * script block. Run this and paste the printed value into the
 * script-src directive whenever you edit that block's content.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!match) {
  console.error("No <script type=\"application/ld+json\"> block found in index.html");
  process.exit(1);
}

const hash = createHash("sha256").update(match[1]).digest("base64");
console.log(`sha256-${hash}`);
