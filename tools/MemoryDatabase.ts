#!/usr/bin/env bun
/**
 * PAI Memory Database
 *
 * SQLite-based memory storage for searchable, indexed access to all PAI memories.
 *
 * Usage:
 *   bun MemoryDatabase.ts init                           # Initialize database
 *   bun MemoryDatabase.ts insert <type> <file>           # Insert memory from file
 *   bun MemoryDatabase.ts search <query>                 # Search memories
 *   bun MemoryDatabase.ts sync                           # Sync all MEMORY files to DB
 *   bun MemoryDatabase.ts stats                          # Show database statistics
 */

import { Database } from "bun:sqlite";
import * as path from "path";
import * as fs from "fs";
import { Glob } from "bun";

// Configuration
const PAI_HOME = process.env.HOME + "/.claude";
const MEMORY_DIR = path.join(PAI_HOME, "MEMORY");
const DB_PATH = path.join(PAI_HOME, "MEMORY", "memory.db");

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

interface Memory {
  id: string;
  timestamp: string;
  type: "learning" | "session" | "synthesis" | "work";
  topic: string;
  content: string;
  rating: number | null;
  tags: string;
  file_path: string;
  importance: number; // 1-5
  stability: number; // 1-5
}

// Initialize database with schema
function initDatabase(): Database {
  const db = new Database(DB_PATH, { create: true });

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      timestamp DATETIME NOT NULL,
      type TEXT NOT NULL,
      topic TEXT,
      content TEXT NOT NULL,
      rating INTEGER,
      tags TEXT,
      file_path TEXT NOT NULL,
      importance INTEGER DEFAULT 3,
      stability INTEGER DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp);
    CREATE INDEX IF NOT EXISTS idx_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_topic ON memories(topic);
    CREATE INDEX IF NOT EXISTS idx_rating ON memories(rating);
    CREATE INDEX IF NOT EXISTS idx_importance ON memories(importance);
    CREATE INDEX IF NOT EXISTS idx_stability ON memories(stability);
    CREATE INDEX IF NOT EXISTS idx_created_at ON memories(created_at);

    -- Full-text search virtual table
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      id,
      content,
      topic,
      tags,
      content='memories',
      content_rowid='rowid'
    );

    -- FTS triggers to keep search index updated
    CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, id, content, topic, tags)
      VALUES (new.rowid, new.id, new.content, new.topic, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
      DELETE FROM memories_fts WHERE rowid = old.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
      UPDATE memories_fts SET
        id = new.id,
        content = new.content,
        topic = new.topic,
        tags = new.tags
      WHERE rowid = new.rowid;
    END;
  `);

  console.log(`${colors.green}✓ Database initialized at ${DB_PATH}${colors.reset}`);
  return db;
}

// Extract metadata from file content
function extractMetadata(content: string, filePath: string): Partial<Memory> {
  const metadata: Partial<Memory> = {
    topic: "",
    rating: null,
    tags: "",
    importance: 3,
    stability: 3,
  };

  // Extract rating from content
  const ratingMatch = content.match(/(?:rating|RATE).*?(\d+)/i);
  if (ratingMatch) {
    metadata.rating = parseInt(ratingMatch[1]);
  }

  // Extract topic from filename or content
  const fileNameMatch = filePath.match(/(?:LEARNING|WORK).*?\/([^\/]+)\.\w+$/);
  if (fileNameMatch) {
    metadata.topic = fileNameMatch[1]
      .replace(/^\d{4}-\d{2}-\d{2}[-_]/, "") // Remove date prefix
      .replace(/[-_]/g, " "); // Replace separators with spaces
  }

  // Try to extract topic from content headers
  const topicMatch = content.match(/^#\s+(.+)$/m);
  if (topicMatch && topicMatch[1]) {
    metadata.topic = topicMatch[1];
  }

  // Extract tags from content
  const tagMatches = content.match(/#[a-zA-Z0-9_]+/g);
  if (tagMatches) {
    metadata.tags = tagMatches.join(" ");
  }

  // Determine importance based on rating and content signals
  if (metadata.rating) {
    if (metadata.rating >= 8) metadata.importance = 5;
    else if (metadata.rating >= 6) metadata.importance = 4;
    else if (metadata.rating >= 4) metadata.importance = 3;
    else metadata.importance = 2;
  }

  // Determine stability based on content type
  if (filePath.includes("goals") || filePath.includes("user-context")) {
    metadata.stability = 5; // Core identity/goals = permanent
  } else if (filePath.includes("LEARNING/ALGORITHM")) {
    metadata.stability = 4; // Learnings = mostly stable
  } else if (filePath.includes("WORK")) {
    metadata.stability = 2; // Session work = temporal
  }

  return metadata;
}

// Insert or update a memory
function insertMemory(db: Database, memory: Memory): void {
  const stmt = db.prepare(`
    INSERT INTO memories (
      id, timestamp, type, topic, content, rating, tags, file_path, importance, stability
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      timestamp = excluded.timestamp,
      type = excluded.type,
      topic = excluded.topic,
      content = excluded.content,
      rating = excluded.rating,
      tags = excluded.tags,
      file_path = excluded.file_path,
      importance = excluded.importance,
      stability = excluded.stability
  `);

  stmt.run(
    memory.id,
    memory.timestamp,
    memory.type,
    memory.topic,
    memory.content,
    memory.rating,
    memory.tags,
    memory.file_path,
    memory.importance,
    memory.stability
  );
}

// Extract timestamp from file path
function extractTimestamp(filePath: string): string {
  // Try WORK directory: 20260129-150618_...
  const workMatch = filePath.match(/WORK\/(\d{8})-(\d{6})_/);
  if (workMatch) {
    const dateStr = workMatch[1];
    const timeStr = workMatch[2];
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const hour = timeStr.slice(0, 2);
    const minute = timeStr.slice(2, 4);
    const second = timeStr.slice(4, 6);
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  // Try LEARNING: 2026-01-29-...
  const learningMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  if (learningMatch) {
    return `${learningMatch[1]} 12:00:00`; // Default to noon
  }

  // Fallback to file modification time
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime.toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
  }
}

// Sync all memory files to database
async function syncAllMemories(db: Database): Promise<number> {
  let count = 0;

  // Sync WORK files
  const workDir = path.join(MEMORY_DIR, "WORK");
  if (fs.existsSync(workDir)) {
    const workGlob = new Glob("*/{summary.md,IDEAL.md}");
    for await (const file of workGlob.scan({ cwd: workDir, absolute: false })) {
      const filePath = path.join(workDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const metadata = extractMetadata(content, filePath);

      const memory: Memory = {
        id: `work_${path.dirname(file)}`,
        timestamp: extractTimestamp(filePath),
        type: "work",
        topic: metadata.topic || "Work Session",
        content: content.slice(0, 5000), // Limit content size
        rating: metadata.rating || null,
        tags: metadata.tags || "",
        file_path: filePath.replace(PAI_HOME + "/", ""),
        importance: metadata.importance || 3,
        stability: metadata.stability || 2,
      };

      insertMemory(db, memory);
      count++;
    }
  }

  // Sync LEARNING/ALGORITHM files
  const algoDir = path.join(MEMORY_DIR, "LEARNING", "ALGORITHM");
  if (fs.existsSync(algoDir)) {
    const algoGlob = new Glob("**/*.md");
    for await (const file of algoGlob.scan({ cwd: algoDir, absolute: false })) {
      const filePath = path.join(algoDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const metadata = extractMetadata(content, filePath);

      const memory: Memory = {
        id: `algo_${file.replace(/\//g, "_").replace(/\.md$/, "")}`,
        timestamp: extractTimestamp(filePath),
        type: "learning",
        topic: metadata.topic || "Algorithm Learning",
        content,
        rating: metadata.rating || null,
        tags: metadata.tags || "",
        file_path: filePath.replace(PAI_HOME + "/", ""),
        importance: metadata.importance || 4,
        stability: metadata.stability || 4,
      };

      insertMemory(db, memory);
      count++;
    }
  }

  // Sync LEARNING/SYSTEM files
  const sysDir = path.join(MEMORY_DIR, "LEARNING", "SYSTEM");
  if (fs.existsSync(sysDir)) {
    const sysGlob = new Glob("**/*.md");
    for await (const file of sysGlob.scan({ cwd: sysDir, absolute: false })) {
      const filePath = path.join(sysDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const metadata = extractMetadata(content, filePath);

      const memory: Memory = {
        id: `sys_${file.replace(/\//g, "_").replace(/\.md$/, "")}`,
        timestamp: extractTimestamp(filePath),
        type: "learning",
        topic: metadata.topic || "System Learning",
        content,
        rating: metadata.rating || null,
        tags: metadata.tags || "",
        file_path: filePath.replace(PAI_HOME + "/", ""),
        importance: metadata.importance || 4,
        stability: metadata.stability || 4,
      };

      insertMemory(db, memory);
      count++;
    }
  }

  // Sync vault/work files (optional - user's personal vault)
  const vaultWork = path.join(process.env.HOME!, "vault", "work");
  if (fs.existsSync(vaultWork)) {
    const vaultWorkGlob = new Glob("**/*.md");
    for await (const file of vaultWorkGlob.scan({ cwd: vaultWork, absolute: false })) {
      const filePath = path.join(vaultWork, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const metadata = extractMetadata(content, filePath);

      const memory: Memory = {
        id: `vault_work_${file.replace(/\//g, "_").replace(/\.md$/, "")}`,
        timestamp: extractTimestamp(filePath),
        type: "work",
        topic: metadata.topic || path.basename(file, ".md"),
        content,
        rating: metadata.rating || null,
        tags: metadata.tags || "",
        file_path: filePath.replace(process.env.HOME + "/", "~/"),
        importance: metadata.importance || 4,
        stability: metadata.stability || 3,
      };

      insertMemory(db, memory);
      count++;
    }
  }

  // Sync vault/projects files (optional - user's personal vault)
  const vaultProjects = path.join(process.env.HOME!, "vault", "projects");
  if (fs.existsSync(vaultProjects)) {
    const vaultProjectsGlob = new Glob("**/*.md");
    for await (const file of vaultProjectsGlob.scan({ cwd: vaultProjects, absolute: false })) {
      const filePath = path.join(vaultProjects, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const metadata = extractMetadata(content, filePath);

      const memory: Memory = {
        id: `vault_project_${file.replace(/\//g, "_").replace(/\.md$/, "")}`,
        timestamp: extractTimestamp(filePath),
        type: "work",
        topic: metadata.topic || path.basename(file, ".md"),
        content,
        rating: metadata.rating || null,
        tags: metadata.tags || "",
        file_path: filePath.replace(process.env.HOME + "/", "~/"),
        importance: metadata.importance || 5,
        stability: metadata.stability || 4,
      };

      insertMemory(db, memory);
      count++;
    }
  }

  // Sync vault/journal files (optional - recent only, last 30 days)
  const vaultJournal = path.join(process.env.HOME!, "vault", "journal");
  if (fs.existsSync(vaultJournal)) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const journalGlob = new Glob("*.md");
    for await (const file of journalGlob.scan({ cwd: vaultJournal, absolute: false })) {
      const filePath = path.join(vaultJournal, file);
      const stats = fs.statSync(filePath);

      // Only index recent journal entries
      if (stats.mtime > thirtyDaysAgo) {
        const content = fs.readFileSync(filePath, "utf-8");
        const metadata = extractMetadata(content, filePath);

        const memory: Memory = {
          id: `vault_journal_${file.replace(/\.md$/, "")}`,
          timestamp: extractTimestamp(filePath),
          type: "session",
          topic: metadata.topic || `Journal ${file.replace(/\.md$/, "")}`,
          content: content.slice(0, 3000), // Limit journal content for privacy
          rating: metadata.rating || null,
          tags: metadata.tags || "",
          file_path: filePath.replace(process.env.HOME + "/", "~/"),
          importance: metadata.importance || 3,
          stability: metadata.stability || 2,
        };

        insertMemory(db, memory);
        count++;
      }
    }
  }

  console.log(`${colors.green}✓ Synced ${count} memories to database${colors.reset}`);
  return count;
}

// Search memories using full-text search
function searchMemories(db: Database, query: string, limit: number = 20): any[] {
  const stmt = db.prepare(`
    SELECT
      m.id,
      m.timestamp,
      m.type,
      m.topic,
      m.content,
      m.rating,
      m.tags,
      m.file_path,
      m.importance,
      m.stability,
      rank
    FROM memories m
    JOIN memories_fts ON m.rowid = memories_fts.rowid
    WHERE memories_fts MATCH ?
    ORDER BY rank, m.importance DESC, m.timestamp DESC
    LIMIT ?
  `);

  return stmt.all(query, limit) as any[];
}

// Get database statistics
function getStats(db: Database): any {
  const totalStmt = db.prepare("SELECT COUNT(*) as total FROM memories");
  const typeStmt = db.prepare("SELECT type, COUNT(*) as count FROM memories GROUP BY type");
  const ratingStmt = db.prepare(`
    SELECT
      AVG(rating) as avg_rating,
      MIN(rating) as min_rating,
      MAX(rating) as max_rating,
      COUNT(*) as rated_count
    FROM memories WHERE rating IS NOT NULL
  `);

  return {
    total: totalStmt.get() as any,
    by_type: typeStmt.all() as any[],
    ratings: ratingStmt.get() as any,
  };
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help") {
    console.log(`
${colors.bold}PAI Memory Database${colors.reset}

${colors.cyan}COMMANDS:${colors.reset}
  init                 Initialize database with schema
  sync                 Sync all MEMORY files to database
  search <query>       Search memories (full-text search)
  stats                Show database statistics
  help                 Show this help message

${colors.cyan}EXAMPLES:${colors.reset}
  bun MemoryDatabase.ts init
  bun MemoryDatabase.ts sync
  bun MemoryDatabase.ts search "project proposal"
  bun MemoryDatabase.ts stats
    `);
    process.exit(0);
  }

  const db = initDatabase();

  switch (command) {
    case "init":
      // Already initialized above
      break;

    case "sync":
      await syncAllMemories(db);
      break;

    case "search": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error(`${colors.red}Error: No search query provided${colors.reset}`);
        process.exit(1);
      }

      const results = searchMemories(db, query);
      console.log(`\n${colors.bold}Found ${results.length} results for "${query}"${colors.reset}\n`);

      for (const result of results) {
        console.log(`${colors.cyan}${result.topic}${colors.reset} ${colors.dim}(${result.type})${colors.reset}`);
        console.log(`${colors.dim}  ${result.timestamp} | ${result.file_path}${colors.reset}`);
        if (result.rating) {
          console.log(`${colors.yellow}  Rating: ${result.rating}/10${colors.reset}`);
        }
        console.log(`${colors.dim}  ${result.content.slice(0, 200)}...${colors.reset}`);
        console.log("");
      }
      break;
    }

    case "stats": {
      const stats = getStats(db);
      console.log(`\n${colors.bold}Memory Database Statistics${colors.reset}\n`);
      console.log(`${colors.cyan}Total memories:${colors.reset} ${stats.total.total}`);
      console.log(`\n${colors.cyan}By type:${colors.reset}`);
      for (const { type, count } of stats.by_type) {
        console.log(`  ${type}: ${count}`);
      }
      if (stats.ratings.rated_count > 0) {
        console.log(`\n${colors.cyan}Ratings:${colors.reset}`);
        console.log(`  Average: ${stats.ratings.avg_rating.toFixed(1)}/10`);
        console.log(`  Range: ${stats.ratings.min_rating}-${stats.ratings.max_rating}`);
        console.log(`  Rated count: ${stats.ratings.rated_count}`);
      }
      console.log("");
      break;
    }

    default:
      console.error(`${colors.red}Unknown command: ${command}${colors.reset}`);
      console.log(`Run "bun MemoryDatabase.ts help" for usage information`);
      process.exit(1);
  }

  db.close();
}

main().catch((error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});
