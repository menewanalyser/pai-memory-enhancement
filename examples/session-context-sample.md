# Session Context Example

This shows what the SessionContextLoader outputs at session startup.

```
📊 SESSION CONTEXT
══════════════════════════════════════════════════

📅 YESTERDAY
Built API authentication system. Fixed three bugs in form validation.
Added integration tests.

Work completed:
  • REST API endpoints for user management
  • Rate limiting middleware
  • Integration test suite

Carry forward:
  ⏭️  Deploy to staging environment

🎯 ACTIVE PROJECTS
  • API Development
  • Frontend Redesign
  • Database Migration

📝 OPEN ITEMS
  [HIGH] Complete API documentation
  [MEDIUM] Review pull requests from team
  [LOW] Update deployment runbook

💡 RECENT LEARNINGS (Last 7 days)
  • [2026-02-01] Built REST API endpoint for user authentication
  • [2026-02-02] Implemented API versioning strategy
  • [2026-02-03] Set up continuous integration pipeline

══════════════════════════════════════════════════
```

## How It Works

The SessionContextLoader combines multiple sources:

1. **Yesterday's Journal** - Extracts session summary, work done, carry forward items
2. **Work Sessions** - Reads from MEMORY/WORK for session summaries
3. **Active Projects** - From STATE/session-continuity.json
4. **Open Items** - From STATE/session-continuity.json
5. **Recent Learnings** - Last 7 days from MEMORY/LEARNING

This context is automatically loaded at every session start, giving you full continuity.
