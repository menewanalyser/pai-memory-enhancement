# Usage Guide

Practical examples and workflows for using the PAI Memory Enhancement system.

---

## Daily Workflows

### Morning Routine

When you start your first Claude session of the day:

```bash
claude
```

**What happens automatically:**
1. SessionStart hook runs
2. Loads yesterday's context
3. Shows active projects
4. Shows open items
5. Shows recent learnings

**Example output:**
```
📊 SESSION CONTEXT
══════════════════════════════════════════════════

📅 YESTERDAY
Built REST API authentication. Fixed three bugs. Added tests.

Work completed:
  • API endpoints for user management
  • Integration test suite

Carry forward:
  ⏭️  Deploy to staging

🎯 ACTIVE PROJECTS
  • API Development
  • Frontend Redesign

📝 OPEN ITEMS
  [HIGH] Complete API documentation
  [MEDIUM] Review team PRs

💡 RECENT LEARNINGS
  • [2026-02-01] Built REST API endpoint
  • [2026-02-02] Implemented API versioning
```

### Evening Routine

At end of day:

```bash
# Update session summary
cd ~/.claude/tools
bun CurrentWorkManager.ts update-session \
  "Completed auth system and tests" \
  "Deploy to staging" \
  "Update documentation"

# Add any new open items for tomorrow
bun CurrentWorkManager.ts add-item "Review deployment logs" high
```

---

## Working with Projects

### Add Active Project

```bash
bun CurrentWorkManager.ts add-project "Mobile App Redesign"
```

Now this project appears in every session's context.

### Remove Completed Project

```bash
bun CurrentWorkManager.ts remove-project "Old Project"
```

### View All Projects

```bash
bun CurrentWorkManager.ts show
```

Example output:
```json
{
  "activeProjects": [
    "API Development",
    "Frontend Redesign",
    "Mobile App Redesign"
  ],
  "lastSession": {...},
  "openItems": [...],
  "lastUpdated": "2026-02-03T22:15:00Z"
}
```

---

## Managing Open Items

### Add Item with Priority

```bash
# High priority
bun CurrentWorkManager.ts add-item "Fix critical bug in auth" high

# Medium priority (default)
bun CurrentWorkManager.ts add-item "Update README"

# Low priority
bun CurrentWorkManager.ts add-item "Refactor old code" low
```

### Clear Completed Items

```bash
bun CurrentWorkManager.ts clear-item "Fix critical bug in auth"
```

### View Open Items

```bash
bun CurrentWorkManager.ts show | grep -A 10 "openItems"
```

---

## Searching Memory

### Basic Search

```bash
# Search all memory
bun MemorySearch.ts "authentication"
```

### Filter by Type

```bash
# Search only work sessions
bun MemorySearch.ts "deploy" --type WORK

# Search only learnings
bun MemorySearch.ts "bug" --type ALGORITHM
```

### Filter by Date

```bash
# Recent entries
bun MemorySearch.ts "api" --since 2026-02-01

# Combine filters
bun MemorySearch.ts "refactor" --type ALGORITHM --since 2026-01-15
```

### Example Output

```
Searching PAI Memory for "authentication"

Found 3 files with 8 matches
============================================================

[ALGORITHM] 2026-02/2026-02-01_LEARNING_api-auth.md (Score: 5)
   Timestamp: 2026-02-01
   Line 15:
   implementing JWT-based authentication was straightforward
   > Built complete authentication system with:
   - User registration endpoint
   - Login/logout endpoints

[WORK] 20260201-143022_api-work/summary.md (Score: 3)
   Timestamp: 2026-02-01
   Line 8:

   > Completed authentication endpoints
   Added rate limiting to prevent brute force attacks
```

---

## Weekly Synthesis

### Automatic (Recommended)

Configure GoodNight skill to run synthesis on Sunday nights.

### Manual Execution

```bash
# Analyze past week
bun WeeklySynthesis.ts

# Analyze specific week
bun WeeklySynthesis.ts --date 2026-02-01

# Preview without saving
bun WeeklySynthesis.ts --dry-run
```

### Example Output

Creates: `~/.claude/MEMORY/LEARNING/SYNTHESIS/2026-02/Weekly-Synthesis-2026-02-03.md`

```markdown
# Weekly Synthesis - 2026-01-27 to 2026-02-03

**Total Learnings:** 24

## 🔍 Patterns Detected

### api (7 occurrences)
**Insight:** Recurring theme requiring attention

### bug (5 occurrences)
**Insight:** Pattern of similar bugs - consider preventive measures

### test (4 occurrences)
**Insight:** Recurring theme requiring attention

## 💡 Key Insights
- API work dominated this week
- Need better testing practices
- Several authentication-related bugs
```

### Reading Synthesis

```bash
# View most recent synthesis
cat ~/.claude/MEMORY/LEARNING/SYNTHESIS/2026-02/Weekly-Synthesis-*.md | tail -100

# Search all syntheses
grep -r "API" ~/.claude/MEMORY/LEARNING/SYNTHESIS/
```

---

## Database Operations

### Sync New Files

After creating new learnings or work sessions:

```bash
bun MemoryDatabase.ts sync
```

Output:
```
✓ Database initialized
✓ Synced 347 memories to database
```

### Search Database

```bash
bun MemoryDatabase.ts search "authentication"
```

Faster than file-based search for large datasets.

### View Statistics

```bash
bun MemoryDatabase.ts stats
```

Example output:
```
Memory Database Statistics

Total memories: 347

By type:
  learning: 218
  work: 98
  session: 31

Ratings:
  Average: 7.2/10
  Range: 3-10
  Rated count: 189
```

---

## Integration Patterns

### With Journal System

If you keep a daily journal:

```bash
# Link your journal directory
ln -s ~/Documents/Journal ~/vault/journal

# Create today's entry
echo "# $(date +%Y-%m-%d)

## Work Session
- Built authentication system
- Fixed three bugs
- Added integration tests

**Carry forward:** Deploy to staging
" > ~/vault/journal/$(date +%Y-%m-%d).md
```

Tomorrow's session will automatically load this context.

### With Git Commits

Capture work in git commits AND memory:

```bash
# Make changes
git add .
git commit -m "feat: Add JWT authentication"

# Also update session
bun CurrentWorkManager.ts update-session \
  "Added JWT authentication to API" \
  "Add refresh token logic" \
  "Write security documentation"
```

### With Goals System

Track project alignment:

```bash
# Add project with goal tag
bun CurrentWorkManager.ts add-project "Security Certification Study"

# Add learning with tags
# In your learning capture, include:
#security #certification #goal-professional
```

---

## Advanced Usage

### Custom Context Loading

Create a custom context loader:

```typescript
// ~/.claude/tools/MyContextLoader.ts
import { loadSessionContext } from './SessionContextLoader';

export async function loadMyContext() {
  const base = await loadSessionContext();

  // Add custom sections
  const custom = {
    ...base,
    customMetrics: await loadCustomMetrics(),
    airingGrievances: await loadGrievances()
  };

  return custom;
}
```

### Filtered Synthesis

Create focused synthesis:

```bash
# Only analyze specific tag
bun MemorySearch.ts "#security" --since 2026-02-01 > security-learnings.txt
# Process security-learnings.txt for security-focused insights
```

### Memory Export

Export all memory for backup:

```bash
# Create archive
tar -czf memory-backup-$(date +%Y%m%d).tar.gz ~/.claude/MEMORY/

# Export database
sqlite3 ~/.claude/MEMORY/memory.db .dump > memory-export.sql
```

---

## Troubleshooting Workflows

### "Session context is stale"

Force refresh:

```bash
# Re-sync database
bun MemoryDatabase.ts sync

# Reload context
bun SessionContextLoader.ts load
```

### "Too much context at startup"

Reduce context window:

Edit `SessionContextLoader.ts`:
```typescript
// Change from 7 days to 3 days
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - 3);  // was -7
```

### "Missing recent learning"

Check if file was created:
```bash
ls -lt ~/.claude/MEMORY/LEARNING/ALGORITHM/$(date +%Y-%m)/ | head -5
```

If missing, learning capture may not be configured.

---

## Best Practices

### 1. Consistent Journaling

- Write daily journal entries
- Include session summaries
- Note carry-forward items
- Tag important work

### 2. Regular Synthesis

- Run weekly synthesis every Sunday
- Review patterns and insights
- Adjust workflows based on patterns
- Archive old syntheses

### 3. Proactive State Management

- Update active projects weekly
- Clear completed open items daily
- Add new items as they arise
- Review priorities regularly

### 4. Search Before Building

- Search memory before starting new work
- Review past solutions
- Learn from previous mistakes
- Build on previous knowledge

### 5. Tag Consistently

- Use consistent hashtags
- Tag by project
- Tag by technology
- Tag by goal alignment

---

## Example Daily Workflow

```bash
# Morning
claude                          # Auto-loads yesterday's context
# Review context, plan day

# During work
# ... work happens ...
# Rate sessions to capture learnings

# Evening
bun CurrentWorkManager.ts update-session \
  "Built X, fixed Y, learned Z" \
  "Tomorrow: Deploy X" \
  "Test Y"

bun CurrentWorkManager.ts add-item "Deploy to staging" high
bun CurrentWorkManager.ts clear-item "Fix bug #123"

# Weekend (Sunday)
bun WeeklySynthesis.ts          # Review patterns
# Read synthesis, adjust next week's priorities
```

---

## Tips & Tricks

### Quick Search Alias

Add to `~/.bashrc` or `~/.zshrc`:
```bash
alias msearch='cd ~/.claude/tools && bun MemorySearch.ts'
alias mstats='cd ~/.claude/tools && bun MemoryDatabase.ts stats'
alias msynth='cd ~/.claude/tools && bun WeeklySynthesis.ts'
```

Usage:
```bash
msearch "authentication"
mstats
msynth --dry-run
```

### Context Preview

Before starting Claude:
```bash
bun SessionContextLoader.ts load | head -50
```

Review what context will be loaded.

### Memory Grep

Quick content search:
```bash
grep -r "specific phrase" ~/.claude/MEMORY/LEARNING/
```

---

**Next:** See [architecture.md](architecture.md) for system internals.
