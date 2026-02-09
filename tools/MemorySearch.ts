#!/usr/bin/env bun
/**
 * PAI Memory Search Tool
 *
 * Full-text search across PAI's memory system (sessions, learnings, work).
 *
 * Usage:
 *   bun MemorySearch.ts <query> [--type ALGORITHM|SYSTEM|WORK] [--since YYYY-MM-DD]
 *
 * Examples:
 *   bun MemorySearch.ts "project-a"                    # Search all memory
 *   bun MemorySearch.ts "api" --type WORK             # Search only work summaries
 *   bun MemorySearch.ts "budget" --since 2026-01-20   # Search recent entries
 *   bun MemorySearch.ts "refactor" --type ALGORITHM --since 2026-01-01
 */

import { Glob } from "bun";
import * as path from "path";
import * as fs from "fs";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  bgYellow: "\x1b[43m",
  black: "\x1b[30m",
};

// Configuration
const PAI_HOME = process.env.HOME + "/.claude";
const MEMORY_DIR = path.join(PAI_HOME, "MEMORY");
const CONTEXT_LINES = 3;

interface SearchResult {
  filePath: string;
  relativePath: string;
  type: "ALGORITHM" | "SYSTEM" | "WORK";
  timestamp: Date | null;
  score: number;
  matches: MatchContext[];
}

interface MatchContext {
  lineNumber: number;
  before: string[];
  matchLine: string;
  after: string[];
}

// Parse command line arguments
function parseArgs(): { query: string; type?: string; since?: Date } {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  let query = "";
  let type: string | undefined;
  let since: Date | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && args[i + 1]) {
      type = args[i + 1].toUpperCase();
      if (!["ALGORITHM", "SYSTEM", "WORK"].includes(type)) {
        console.error(`${colors.red}Error: Invalid type "${type}". Use ALGORITHM, SYSTEM, or WORK.${colors.reset}`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--since" && args[i + 1]) {
      const dateStr = args[i + 1];
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) {
        console.error(`${colors.red}Error: Invalid date "${dateStr}". Use YYYY-MM-DD format.${colors.reset}`);
        process.exit(1);
      }
      since = parsed;
      i++;
    } else if (!args[i].startsWith("--")) {
      query = args[i];
    }
  }

  if (!query) {
    console.error(`${colors.red}Error: No search query provided.${colors.reset}`);
    printUsage();
    process.exit(1);
  }

  return { query, type, since };
}

function printUsage() {
  console.log(`
${colors.bold}PAI Memory Search${colors.reset}

Full-text search across PAI's memory system.

${colors.cyan}USAGE:${colors.reset}
  bun MemorySearch.ts <query> [OPTIONS]

${colors.cyan}OPTIONS:${colors.reset}
  --type <TYPE>       Filter by type: ALGORITHM, SYSTEM, or WORK
  --since <DATE>      Only show results from this date forward (YYYY-MM-DD)
  --help, -h          Show this help message

${colors.cyan}EXAMPLES:${colors.reset}
  bun MemorySearch.ts "project-a"
      Search all memory for "project-a"

  bun MemorySearch.ts "api" --type WORK
      Search only work session summaries for "api"

  bun MemorySearch.ts "budget" --since 2026-01-20
      Search entries from Jan 20, 2026 onwards

  bun MemorySearch.ts "refactor" --type ALGORITHM --since 2026-01-01
      Combine type and date filters

${colors.cyan}SEARCH SCOPE:${colors.reset}
  - MEMORY/WORK/*/summary.md, IDEAL.md, META.yaml
  - MEMORY/LEARNING/ALGORITHM/**/*.md
  - MEMORY/LEARNING/SYSTEM/**/*.md

${colors.cyan}OUTPUT:${colors.reset}
  Results are sorted by relevance (match count).
  Context (3 lines before/after) is shown for each match.
  Query terms are highlighted in ${colors.bgYellow}${colors.black}yellow${colors.reset}.
`);
}

// Get all files to search based on type filter
async function getFilesToSearch(typeFilter?: string): Promise<{ path: string; type: "ALGORITHM" | "SYSTEM" | "WORK" }[]> {
  const files: { path: string; type: "ALGORITHM" | "SYSTEM" | "WORK" }[] = [];

  // WORK files (session summaries and ideals)
  if (!typeFilter || typeFilter === "WORK") {
    const workDir = path.join(MEMORY_DIR, "WORK");
    if (fs.existsSync(workDir)) {
      const workGlob = new Glob("*/{summary.md,IDEAL.md,META.yaml}");
      for await (const file of workGlob.scan({ cwd: workDir, absolute: false })) {
        files.push({ path: path.join(workDir, file), type: "WORK" });
      }
    }
  }

  // ALGORITHM learnings
  if (!typeFilter || typeFilter === "ALGORITHM") {
    const algoDir = path.join(MEMORY_DIR, "LEARNING", "ALGORITHM");
    if (fs.existsSync(algoDir)) {
      const algoGlob = new Glob("**/*.md");
      for await (const file of algoGlob.scan({ cwd: algoDir, absolute: false })) {
        files.push({ path: path.join(algoDir, file), type: "ALGORITHM" });
      }
    }
  }

  // SYSTEM learnings
  if (!typeFilter || typeFilter === "SYSTEM") {
    const sysDir = path.join(MEMORY_DIR, "LEARNING", "SYSTEM");
    if (fs.existsSync(sysDir)) {
      const sysGlob = new Glob("**/*.md");
      for await (const file of sysGlob.scan({ cwd: sysDir, absolute: false })) {
        files.push({ path: path.join(sysDir, file), type: "SYSTEM" });
      }
    }
  }

  return files;
}

// Extract date from file path or content
function extractDate(filePath: string): Date | null {
  // Try to extract from WORK directory name: 20260129-150618_...
  const workMatch = filePath.match(/WORK\/(\d{8})-\d{6}_/);
  if (workMatch) {
    const dateStr = workMatch[1];
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(4, 6)) - 1;
    const day = parseInt(dateStr.slice(6, 8));
    return new Date(year, month, day);
  }

  // Try LEARNING directory: 2026-01-29-... or 2026-01-29_...
  const learningMatch = filePath.match(/(\d{4}-\d{2}-\d{2})[-_]/);
  if (learningMatch) {
    return new Date(learningMatch[1]);
  }

  // Try from year-month directory: 2026-01/
  const yearMonthMatch = filePath.match(/(\d{4}-\d{2})\//);
  if (yearMonthMatch) {
    return new Date(yearMonthMatch[1] + "-01");
  }

  return null;
}

// Search a single file for matches with context
function searchFile(filePath: string, query: string, regexPattern: RegExp): MatchContext[] {
  const matches: MatchContext[] = [];

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (regexPattern.test(lines[i])) {
        const before = lines.slice(Math.max(0, i - CONTEXT_LINES), i);
        const after = lines.slice(i + 1, Math.min(lines.length, i + 1 + CONTEXT_LINES));

        matches.push({
          lineNumber: i + 1,
          before,
          matchLine: lines[i],
          after,
        });
      }
    }
  } catch (error) {
    // Skip files that can't be read
  }

  return matches;
}

// Highlight query matches in text
function highlightMatches(text: string, regexPattern: RegExp): string {
  return text.replace(regexPattern, (match) =>
    `${colors.bgYellow}${colors.black}${match}${colors.reset}`
  );
}

// Format a search result for display
function formatResult(result: SearchResult, query: string, regexPattern: RegExp): string {
  const lines: string[] = [];

  // Header with file path and score
  const typeColor = result.type === "WORK" ? colors.cyan :
                   result.type === "ALGORITHM" ? colors.green : colors.magenta;

  lines.push(`\n${colors.bold}${typeColor}[${result.type}]${colors.reset} ${colors.bold}${result.relativePath}${colors.reset} ${colors.dim}(Score: ${result.score})${colors.reset}`);

  // Timestamp if available
  if (result.timestamp) {
    lines.push(`   ${colors.dim}Timestamp: ${result.timestamp.toISOString().split("T")[0]}${colors.reset}`);
  }

  // Show matches with context
  for (const match of result.matches) {
    lines.push(`   ${colors.dim}Line ${match.lineNumber}:${colors.reset}`);

    // Before context
    for (const line of match.before) {
      lines.push(`   ${colors.dim}${line}${colors.reset}`);
    }

    // Match line with highlighting
    lines.push(`   ${colors.yellow}>${colors.reset} ${highlightMatches(match.matchLine, regexPattern)}`);

    // After context
    for (const line of match.after) {
      lines.push(`   ${colors.dim}${line}${colors.reset}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

// Main search function
async function search(query: string, typeFilter?: string, sinceDate?: Date): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const regexPattern = new RegExp(query, "gi");

  const files = await getFilesToSearch(typeFilter);

  for (const { path: filePath, type } of files) {
    // Check date filter
    if (sinceDate) {
      const fileDate = extractDate(filePath);
      if (fileDate && fileDate < sinceDate) {
        continue;
      }
    }

    const matches = searchFile(filePath, query, regexPattern);

    if (matches.length > 0) {
      const relativePath = filePath.replace(MEMORY_DIR + "/", "");
      results.push({
        filePath,
        relativePath,
        type,
        timestamp: extractDate(filePath),
        score: matches.reduce((sum, m) => sum + (m.matchLine.match(regexPattern) || []).length, 0),
        matches,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

// Main entry point
async function main() {
  const { query, type, since } = parseArgs();

  console.log(`\n${colors.bold}Searching PAI Memory for "${query}"${colors.reset}`);
  if (type) console.log(`${colors.dim}Type filter: ${type}${colors.reset}`);
  if (since) console.log(`${colors.dim}Since: ${since.toISOString().split("T")[0]}${colors.reset}`);
  console.log("");

  const results = await search(query, type, since);
  const regexPattern = new RegExp(query, "gi");

  if (results.length === 0) {
    console.log(`${colors.yellow}No results found for "${query}"${colors.reset}`);
    process.exit(0);
  }

  const totalMatches = results.reduce((sum, r) => sum + r.score, 0);
  console.log(`${colors.green}Found ${results.length} files with ${totalMatches} matches${colors.reset}`);
  console.log(`${"=".repeat(60)}`);

  for (const result of results) {
    console.log(formatResult(result, query, regexPattern));
  }
}

main().catch((error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
