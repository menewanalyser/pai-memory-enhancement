# PAI Memory System Architecture

This document describes the architecture, data flow, and design decisions of the PAI Memory Enhancement system.

---

## 🎯 Design Goals

1. **Automatic** - Memory capture and loading should be invisible to the user
2. **Fast** - Session startup must remain under 2 seconds
3. **Reliable** - No lost data, no corruption
4. **Scalable** - Handle thousands of learnings without performance degradation
5. **Private** - All data stays local, nothing sent to external services

---

## 📊 System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     PAI MEMORY SYSTEM                        │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
   ┌────▼────┐                           ┌─────▼─────┐
   │ CAPTURE │                           │   LOAD    │
   │ Phase A │                           │  Phase B  │
   └────┬────┘                           └─────┬─────┘
        │                                      │
        │  ┌─────────────────────────────┐    │
        └──►  MEMORY/LEARNING/           │◄───┘
           │  - ALGORITHM/               │
           │  - SYSTEM/                  │
           │  MEMORY/WORK/               │
           │  MEMORY/STATE/              │
           └──┬───────────────────────┬──┘
              │                       │
         ┌────▼────┐            ┌─────▼─────┐
         │ SEARCH  │            │ SYNTHESIZE│
         │ Phase C │            │  Phase D  │
         └─────────┘            └───────────┘
```

---

## 🔄 Data Flow

### Session Start

```
1. User runs `claude` command
2. SessionStart hook executes
3. SessionContextLoader.ts runs
   ├─ Load yesterday's journal
   ├─ Read MEMORY/WORK sessions
   ├─ Read STATE/session-continuity.json
   └─ Read recent LEARNING files (7 days)
4. Format context as markdown
5. Inject into system prompt
6. Claude receives full context
7. Response time: <2 seconds
```

### Learning Capture

```
1. User rates session (1-10)
2. Rating hook detects score
3. Learning file created in MEMORY/LEARNING/ALGORITHM/
4. Auto-tagged with date, rating, category
5. Indexed for future search
6. Available for next synthesis
```

### Weekly Synthesis

```
1. GoodNight skill triggers (Sunday)
2. WeeklySynthesis.ts runs
3. Load all learnings from past 7 days
4. Extract keywords and themes
5. Group by similarity
6. Identify patterns (3+ occurrences)
7. Generate insights
8. Create synthesis markdown
9. Update memory-index.json
```

---

## 📁 File Structure

### MEMORY Directory

```
~/.claude/MEMORY/
├── LEARNING/
│   ├── ALGORITHM/          # User-focused learnings
│   │   └── YYYY-MM/
│   │       └── YYYY-MM-DD-HHMMSS_LEARNING_*.md
│   ├── SYSTEM/             # System-focused learnings
│   │   └── YYYY-MM/
│   │       └── YYYY-MM-DD-HHMMSS_LEARNING_*.md
│   └── SYNTHESIS/          # Weekly synthesis reports
│       └── YYYY-MM/
│           └── Weekly-Synthesis-YYYY-MM-DD.md
├── WORK/                   # Session summaries
│   └── YYYYMMDD-HHMMSS_*/
│       ├── summary.md
│       ├── IDEAL.md
│       └── META.yaml
└── STATE/                  # System state
    ├── session-continuity.json
    ├── memory-index.json
    └── integrity-state.json
```

### User Vault (Optional)

```
~/vault/
├── journal/                # Daily journal entries
│   └── YYYY-MM-DD.md
├── work/                   # Work documentation
│   └── *.md
└── projects/               # Project files
    └── *.md
```

---

## 🧩 Component Details

### 1. SessionContextLoader.ts

**Purpose:** Load relevant context at session start

**Sources:**
1. Yesterday's journal (`~/vault/journal/YYYY-MM-DD.md`)
2. Work sessions (`MEMORY/WORK/*/summary.md`)
3. Session continuity (`STATE/session-continuity.json`)
4. Recent learnings (`MEMORY/LEARNING/**/*.md`)

**Output:** Formatted markdown with:
- Yesterday summary
- Active projects
- Open items (with priorities)
- Recent learnings (past 7 days)

**Performance:** <500ms for typical dataset

### 2. WeeklySynthesis.ts

**Purpose:** Identify patterns and generate insights

**Algorithm:**
1. Load learnings from past 7 days
2. Extract keywords (hashtags + technical terms)
3. Group learnings by keyword
4. Find patterns (3+ similar learnings)
5. Generate insight for each pattern
6. Create synthesis markdown
7. Update memory index

**Output:** `MEMORY/LEARNING/SYNTHESIS/YYYY-MM/Weekly-Synthesis-YYYY-MM-DD.md`

**Performance:** ~2 seconds for 200 learnings

### 3. MemoryDatabase.ts

**Purpose:** SQLite storage for fast search

**Schema:**
```sql
memories (
  id TEXT PRIMARY KEY,
  timestamp DATETIME,
  type TEXT,              -- learning|session|synthesis|work
  topic TEXT,
  content TEXT,
  rating INTEGER,
  tags TEXT,
  file_path TEXT,
  importance INTEGER,     -- 1-5
  stability INTEGER       -- 1-5
)

memories_fts (          -- Full-text search
  id, content, topic, tags
)
```

**Features:**
- Full-text search via FTS5
- Ranked results (by relevance)
- Importance/stability scoring
- Automatic index updates

**Performance:** <100ms for typical queries

### 4. MemorySearch.ts

**Purpose:** Fast full-text search across memory

**Features:**
- Regex-based search
- Context display (3 lines before/after)
- Highlighted matches
- Type filtering (ALGORITHM|SYSTEM|WORK)
- Date filtering (--since)

**Performance:** <500ms for 1000+ files

### 5. CurrentWorkManager.ts

**Purpose:** Manage session continuity state

**State File:** `STATE/session-continuity.json`

```json
{
  "activeProjects": ["Project A", "Project B"],
  "lastSession": {
    "date": "2026-02-03",
    "summary": "Built auth system",
    "nextSteps": ["Deploy", "Test"]
  },
  "openItems": [
    {
      "description": "Review PR #42",
      "priority": "high",
      "createdAt": "2026-02-03T10:00:00Z"
    }
  ],
  "lastUpdated": "2026-02-03T22:15:00Z"
}
```

---

## 🔐 Security & Privacy

### Data Storage

- **All local** - No external services
- **User-owned** - Lives in `~/.claude`
- **Git-ignored** - MEMORY/ excluded from PAI backups

### Sensitive Data

The system does NOT store:
- API keys
- Passwords
- Personal identifying information
- External service credentials

Optional vault integration (`~/vault/`) allows:
- Personal journal entries (last 30 days only)
- Project documentation
- Work files

**Privacy:** Vault content truncated (3000 chars max for journals)

---

## 🚀 Performance

### Benchmarks

| Operation | Time | Dataset |
|-----------|------|---------|
| Session context load | 450ms | 30 learnings, 5 projects |
| Weekly synthesis | 1.8s | 180 learnings |
| Database sync | 2.5s | 500 files |
| Memory search | 380ms | 1200 files |
| Pattern detection | 850ms | 180 learnings |

### Optimizations

1. **Lazy loading** - Only load last 7 days by default
2. **File-based caching** - Avoid re-parsing unchanged files
3. **SQLite indexing** - FTS5 for fast search
4. **Smart filtering** - Skip sentiment-rating files in search
5. **Parallel processing** - Future: concurrent file reads

---

## 📈 Scalability

### Current Limits

- **Learnings:** Tested up to 1000 files
- **Weekly synthesis:** Works well up to 300 learnings/week
- **Session load:** Fast up to 50 learnings/week
- **Search:** Performant up to 2000 files

### Future Enhancements

1. **Memory compression** - Archive old learnings
2. **Incremental synthesis** - Daily micro-synthesis
3. **Smart indexing** - LRU cache for frequent queries
4. **Async loading** - Non-blocking context load
5. **Sharding** - Split by month/year for large datasets

---

## 🔧 Extension Points

### Adding New Memory Sources

1. Create loader function in SessionContextLoader.ts
2. Define interface in types/memory.ts
3. Add to SessionContext type
4. Update formatSessionContext()

### Custom Synthesis Algorithms

1. Extend WeeklySynthesis.ts
2. Implement custom pattern detection
3. Add insight generation logic
4. Output to SYNTHESIS/ directory

### New Search Backends

1. Implement search interface
2. Add to MemoryDatabase.ts
3. Update sync logic
4. Test performance benchmarks

---

## 🎓 Design Decisions

### Why TypeScript?

- Type safety reduces bugs
- Better IDE support
- Self-documenting code
- Easy refactoring

### Why Bun?

- Fast TypeScript execution
- Built-in SQLite support
- Native file system operations
- Single binary deployment

### Why Local Storage?

- Privacy first
- No API costs
- Works offline
- User owns data

### Why Markdown?

- Human-readable
- Git-friendly
- Portable
- Tool-agnostic

---

**Next:** See [usage-guide.md](usage-guide.md) for practical examples.
