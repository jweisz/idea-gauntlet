#!/usr/bin/env node
// Formats/checks markdown files in this package with Prettier.
//
// Frontend currently has no .md files of its own, and Prettier's CLI exits
// with an error when a glob matches zero files. Without this guard, the
// mdformat/mdformat-check tasks would fail for no reason until a markdown
// file eventually shows up here — so this discovers files itself and no-ops
// cleanly when there aren't any yet.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const mode = process.argv[2]; // "--write" | "--check"
if (mode !== "--write" && mode !== "--check") {
  console.error("Usage: mdformat.mjs --write|--check");
  process.exit(1);
}

const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git"]);

const files = readdirSync(".", { recursive: true })
  .filter((p) => p.endsWith(".md"))
  .filter((p) => !p.split("/").some((segment) => EXCLUDED_DIRS.has(segment)));

if (files.length === 0) {
  console.log("No markdown files in frontend/ yet — nothing to format.");
  process.exit(0);
}

execFileSync("npx", ["prettier", mode, ...files], { stdio: "inherit" });
