# Installation Guide

Step-by-step instructions for installing the PAI Memory Enhancement system.

---

## Prerequisites

Before installing, ensure you have:

1. **PAI Installed**
   - PAI should be installed at `~/.claude`
   - If not, install from: https://github.com/danielmiessler/PAI

2. **Bun Runtime**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

3. **Claude Code CLI**
   - Should already be installed with PAI
   - Test: `claude --version`

---

## Installation Steps

### 1. Clone the Repository

```bash
# Clone to a temporary location
cd /tmp
git clone https://github.com/menewanalyser/pai-memory-enhancement
cd pai-memory-enhancement
```

### 2. Create Directory Structure

```bash
# Create MEMORY directories
mkdir -p ~/.claude/MEMORY/LEARNING/ALGORITHM
mkdir -p ~/.claude/MEMORY/LEARNING/SYSTEM
mkdir -p ~/.claude/MEMORY/LEARNING/SYNTHESIS
mkdir -p ~/.claude/MEMORY/WORK
mkdir -p ~/.claude/MEMORY/STATE

# Create vault directories (optional - customize path as needed)
mkdir -p ~/vault/journal
mkdir -p ~/vault/work
mkdir -p ~/vault/projects
```

### 3. Copy Tools

```bash
# Copy all tools to PAI installation
cp -r tools/* ~/.claude/tools/
```

Verify installation:
```bash
ls ~/.claude/tools/WeeklySynthesis.ts
ls ~/.claude/tools/SessionContextLoader.ts
ls ~/.claude/tools/MemoryDatabase.ts
ls ~/.claude/tools/MemorySearch.ts
ls ~/.claude/tools/CurrentWorkManager.ts
ls ~/.claude/tools/types/memory.ts
```

### 4. Initialize Database

```bash
cd ~/.claude/tools

# Initialize SQLite database
bun MemoryDatabase.ts init
```

Expected output:
```
✓ Database initialized at /home/user/.claude/MEMORY/memory.db
```

### 5. Test Installation

```bash
# Test session context loader
bun SessionContextLoader.ts load
```

Expected output:
```
📊 SESSION CONTEXT
══════════════════════════════════════════════════

📅 YESTERDAY
No work session found

🎯 ACTIVE PROJECTS
(none yet)

📝 OPEN ITEMS
(none yet)

💡 RECENT LEARNINGS (Last 7 days)
(none yet)

══════════════════════════════════════════════════
```

### 6. Configure SessionStart Hook (Optional)

To automatically load context at session start:

1. Create or edit `~/.claude/hooks/SessionStart.hook.ts`

2. Add this code:
```typescript
import { execSync } from 'child_process';

const PAI_HOME = process.env.HOME + '/.claude';

// Load session context
try {
  const context = execSync(
    `cd ${PAI_HOME}/tools && bun SessionContextLoader.ts load`,
    { encoding: 'utf-8' }
  );

  console.log('\n<system-reminder>');
  console.log('SESSION CONTINUITY CONTEXT\n');
  console.log(context);
  console.log('</system-reminder>\n');
} catch (error) {
  console.error('Error loading session context:', error);
}
```

3. Test the hook:
```bash
# Start a new Claude session
claude
```

You should see the session context automatically loaded.

---

## Vault Integration (Optional)

If you want to integrate with a personal vault/journal system:

### Option 1: Obsidian Integration

If you use Obsidian:

```bash
# Link vault journal to expected location
ln -s ~/path/to/ObsidianVault/Journal ~/vault/journal
ln -s ~/path/to/ObsidianVault/Work ~/vault/work
ln -s ~/path/to/ObsidianVault/Projects ~/vault/projects
```

### Option 2: Custom Path

Edit the tools to point to your journal location:

1. Open `~/.claude/tools/SessionContextLoader.ts`
2. Change line 26:
```typescript
const JOURNAL_DIR = `${process.env.HOME}/your/custom/path`;
```

---

## Verification

### Test Each Tool

```bash
cd ~/.claude/tools

# 1. Test Current Work Manager
bun CurrentWorkManager.ts show

# 2. Test Session Context Loader
bun SessionContextLoader.ts load

# 3. Test Memory Search (will be empty initially)
bun MemorySearch.ts "test"

# 4. Test Database
bun MemoryDatabase.ts stats

# 5. Test Weekly Synthesis (will be empty initially)
bun WeeklySynthesis.ts --dry-run
```

All tools should run without errors (though output will be minimal until you have data).

---

## Populate Test Data (Optional)

To test with sample data:

```bash
# Copy example learning to MEMORY
cp /tmp/pai-memory-enhancement/examples/learning-sample.md \
   ~/.claude/MEMORY/LEARNING/ALGORITHM/2026-02/

# Sync to database
cd ~/.claude/tools
bun MemoryDatabase.ts sync

# Test search
bun MemorySearch.ts "authentication"

# Should find the sample learning
```

---

## Troubleshooting

### "Command not found: bun"

Install bun:
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc  # or ~/.zshrc
```

### "Permission denied"

Make tools executable:
```bash
chmod +x ~/.claude/tools/*.ts
```

### "Cannot find module './types/memory'"

Ensure types were copied:
```bash
ls ~/.claude/tools/types/memory.ts
```

If missing:
```bash
mkdir -p ~/.claude/tools/types
cp /tmp/pai-memory-enhancement/tools/types/memory.ts ~/.claude/tools/types/
```

### "Database locked"

Close any other processes using the database:
```bash
# Find processes
lsof ~/.claude/MEMORY/memory.db

# Or just delete and reinit (safe - will resync)
rm ~/.claude/MEMORY/memory.db
bun MemoryDatabase.ts init
bun MemoryDatabase.ts sync
```

### Session context shows nothing

This is normal for fresh installation! Context will populate as you:
- Create journal entries
- Work on projects
- Capture learnings
- Add open items

---

## Next Steps

1. **Start using PAI** - Begin your normal workflow
2. **Add projects** - `bun CurrentWorkManager.ts add-project "YourProject"`
3. **Add open items** - `bun CurrentWorkManager.ts add-item "Your task" high`
4. **Create learnings** - Rate sessions to trigger learning capture
5. **Run weekly synthesis** - Sunday nights or manual: `bun WeeklySynthesis.ts`

After a week of use, you'll have rich context loading automatically!

---

## Uninstallation

To remove the memory system:

```bash
# Remove tools
rm ~/.claude/tools/WeeklySynthesis.ts
rm ~/.claude/tools/SessionContextLoader.ts
rm ~/.claude/tools/MemoryDatabase.ts
rm ~/.claude/tools/MemorySearch.ts
rm ~/.claude/tools/CurrentWorkManager.ts
rm -r ~/.claude/tools/types

# Remove data (WARNING: This deletes all memory)
rm -r ~/.claude/MEMORY
```

---

**Next:** See [usage-guide.md](usage-guide.md) for how to use the system effectively.
