#!/usr/bin/env bun

/**
 * Session Context Loader
 *
 * Loads relevant context at session start by combining:
 * - Yesterday's work session summary
 * - Active projects and open items
 * - Recent learnings from MEMORY/LEARNING
 *
 * TypeScript Learning Points:
 * 1. Importing from other modules
 * 2. Async/await for executing shell commands
 * 3. Type narrowing with 'as const'
 * 4. Array methods: map, filter, slice
 * 5. String manipulation and date handling
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import { getCurrentWorkState } from './CurrentWorkManager';
import type { SessionContext, MemorySearchResult } from './types/memory';

const PAI_HOME = process.env.PAI_HOME || `${process.env.HOME}/.claude`;
const JOURNAL_DIR = `${process.env.HOME}/vault/journal`;

/**
 * Load session context for the current session
 * This is the main entry point called by SessionStart hook
 *
 * @param sinceDate - Optional: Only load changes since this date (for delta loading)
 */
export async function loadSessionContext(sinceDate?: Date): Promise<SessionContext> {
  try {
    const yesterday = await loadYesterdayContext();
    const workState = getCurrentWorkState();
    const recentLearnings = await loadRecentLearnings(sinceDate);

    // TypeScript: Object must match SessionContext interface
    const context: SessionContext = {
      yesterday,
      activeProjects: workState.activeProjects,
      openItems: workState.openItems,
      recentLearnings
    };

    return context;
  } catch (error) {
    console.error('Error loading session context:', error instanceof Error ? error.message : error);

    // Return empty context on error
    return {
      yesterday: {
        summary: 'Unable to load yesterday context',
        workDone: [],
        carryForward: []
      },
      activeProjects: [],
      openItems: [],
      recentLearnings: []
    };
  }
}

/**
 * Load lightweight delta context (only what changed since a given time)
 * Used for same-day sessions after morning context has been loaded
 */
export async function loadDeltaContext(since: Date): Promise<string> {
  try {
    const workState = getCurrentWorkState();
    const newLearnings = await loadRecentLearnings(since);
    const recentSessions = await extractRecentSessionWork(since);

    const lines: string[] = [];
    lines.push('🔄 SESSION RESUME (Delta since morning)');
    lines.push('═'.repeat(50));
    lines.push('');

    const hoursAgo = Math.floor((new Date().getTime() - since.getTime()) / (1000 * 60 * 60));
    lines.push(`⏰ Last full load: ${hoursAgo}h ago`);
    lines.push('');

    // Show recent session work extracted from learning captures
    if (recentSessions.length > 0) {
      lines.push('🔨 RECENT SESSIONS:');
      recentSessions.forEach(session => lines.push(`  • ${session}`));
      lines.push('');
    }

    // Only show NEW learnings
    if (newLearnings.length > 0) {
      lines.push('🆕 NEW LEARNINGS SINCE MORNING:');
      newLearnings.forEach(learning => lines.push(`  • ${learning}`));
      lines.push('');
    }

    // Always show current open items (lightweight)
    if (workState.openItems.length > 0) {
      lines.push('📝 CURRENT OPEN ITEMS:');
      workState.openItems.slice(0, 3).forEach(item => {
        const priority = item.priority ? `[${item.priority.toUpperCase()}]` : '';
        lines.push(`  ${priority} ${item.description}`);
      });
      lines.push('');
    }

    lines.push('💡 Full context from this morning still active');
    lines.push('   (Tasks, weather, priorities loaded at startup)');
    lines.push('');
    lines.push('═'.repeat(50));

    return lines.join('\n');
  } catch (error) {
    console.error('Error loading delta context:', error);
    return 'Unable to load delta context';
  }
}

/**
 * Load yesterday's context from journal and work sessions
 */
async function loadYesterdayContext(): Promise<SessionContext['yesterday']> {
  try {
    // TypeScript: Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

    // Try to read yesterday's journal entry
    const journalFile = join(JOURNAL_DIR, `${yesterdayStr}.md`);
    let journalContent = '';

    try {
      journalContent = readFileSync(journalFile, 'utf-8');
    } catch {
      // Journal doesn't exist - that's ok
    }

    // Extract session summary from journal
    const sessionSummary = extractSessionSummary(journalContent);

    // Also search MEMORY/WORK for yesterday's sessions
    const workSummary = await searchYesterdayWork(yesterdayStr);

    return {
      summary: sessionSummary || workSummary || 'No work session found',
      workDone: extractWorkDone(journalContent),
      carryForward: extractCarryForward(journalContent)
    };
  } catch (error) {
    console.error('Error loading yesterday context:', error);
    return {
      summary: 'Unable to load',
      workDone: [],
      carryForward: []
    };
  }
}

/**
 * Extract session summary from journal entry
 */
function extractSessionSummary(journalContent: string): string | null {
  // TypeScript: Regular expression to find session section
  const sessionMatch = journalContent.match(/## (?:Work|Session)[^\n]*\n([\s\S]*?)(?=\n##|\n---|\n#|$)/);

  if (sessionMatch && sessionMatch[1]) {
    // Extract bullet points and clean up
    const bullets = sessionMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.trim().substring(2)) // Remove '- ' prefix
      .join('. ');

    return bullets || null;
  }

  return null;
}

/**
 * Extract work done items from journal
 */
function extractWorkDone(journalContent: string): string[] {
  const items: string[] = [];

  // Look in Daily Thoughts or Work section
  const dailyThoughtsMatch = journalContent.match(/# (?:Daily Thoughts|Work)\n([\s\S]*?)(?=\n#|$)/);
  if (dailyThoughtsMatch && dailyThoughtsMatch[1]) {
    const thoughts = dailyThoughtsMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.trim().substring(2));
    items.push(...thoughts);
  }

  return items.slice(0, 5); // Return max 5 items
}

/**
 * Extract carry forward items from notes
 */
function extractCarryForward(journalContent: string): string[] {
  const items: string[] = [];

  const carryForwardMatch = journalContent.match(/\*\*Carry forward:\*\* (.*)/);
  if (carryForwardMatch && carryForwardMatch[1]) {
    items.push(carryForwardMatch[1].trim());
  }

  return items;
}

/**
 * Search MEMORY/WORK for yesterday's session summaries
 */
async function searchYesterdayWork(yesterdayStr: string): Promise<string | null> {
  try {
    const WORK_DIR = join(PAI_HOME, 'MEMORY', 'WORK');

    // TypeScript: readdirSync returns string[]
    const sessions = readdirSync(WORK_DIR)
      .filter(dir => {
        // Filter directories that start with yesterday's date
        return dir.startsWith(yesterdayStr.replace(/-/g, ''));
      })
      .map(dir => join(WORK_DIR, dir))
      .filter(path => statSync(path).isDirectory());

    if (sessions.length === 0) {
      return null;
    }

    // Read the most recent session's summary
    const mostRecent = sessions[sessions.length - 1];
    const summaryFile = join(mostRecent, 'summary.md');

    try {
      const summary = readFileSync(summaryFile, 'utf-8');
      // Return first paragraph
      const firstPara = summary.split('\n\n')[0];
      return firstPara.trim();
    } catch {
      return null;
    }
  } catch (error) {
    console.error('Error searching yesterday work:', error);
    return null;
  }
}

/**
 * Extract recent session work from learning captures
 *
 * Learning captures include "Assistant Response Context" that shows what was worked on.
 * This extracts those summaries to provide session continuity.
 *
 * @param since - Only return sessions that occurred after this date
 */
async function extractRecentSessionWork(since: Date): Promise<string[]> {
  try {
    const LEARNING_DIR = join(PAI_HOME, 'MEMORY', 'LEARNING', 'ALGORITHM');
    const sessions: string[] = [];

    // Get current year-month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthDir = join(LEARNING_DIR, currentMonth);

    try {
      // Find all learning files created after 'since' timestamp
      // Include sentiment-rating files - they contain response context
      const files = readdirSync(monthDir)
        .filter(f => f.endsWith('.md') && f.includes('sentiment-rating'))
        .map(f => ({
          name: f,
          path: join(monthDir, f),
          mtime: statSync(join(monthDir, f)).mtime
        }))
        .filter(f => f.mtime > since)
        .sort((a, b) => a.mtime.getTime() - b.mtime.getTime()); // Chronological order

      // Extract session context from each file
      for (const file of files) {
        try {
          const content = readFileSync(file.path, 'utf-8');

          // Look for "Assistant Response Context" section
          const contextMatch = content.match(/## Assistant Response Context\s+([\s\S]*?)(?=\n---|\n##|\z)/);

          if (contextMatch && contextMatch[1]) {
            // Skip files with "No response context available"
            if (contextMatch[1].includes('No response context available')) {
              continue;
            }

            // Extract the summary line
            const summaryMatch = contextMatch[1].match(/📋 (?:\*\*)?SUMMARY:(?:\*\*)? (.+)/);

            if (summaryMatch && summaryMatch[1]) {
              const summary = summaryMatch[1].trim();

              // Extract time from filename
              const timeMatch = file.name.match(/\d{4}-\d{2}-\d{2}-(\d{2})(\d{2})/);
              const timeStr = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '';

              sessions.push(`[${timeStr}] ${summary}`);
            }
          }
        } catch {
          // Skip if can't read
        }
      }
    } catch {
      // Directory doesn't exist or can't read
    }

    return sessions.slice(0, 5); // Max 5 recent sessions
  } catch (error) {
    console.error('Error extracting recent session work:', error);
    return [];
  }
}

/**
 * Load recent learnings from MEMORY/LEARNING
 *
 * @param since - Optional: Only return learnings created after this date
 */
async function loadRecentLearnings(since?: Date): Promise<string[]> {
  try {
    const LEARNING_DIR = join(PAI_HOME, 'MEMORY', 'LEARNING');
    const learnings: string[] = [];

    // Get current year-month dynamically
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get cutoff date - either 'since' param or 7 days ago
    const cutoffDate = since || (() => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return sevenDaysAgo;
    })();

    // Search ALGORITHM and SYSTEM directories
    for (const subdir of ['ALGORITHM', 'SYSTEM']) {
      const dir = join(LEARNING_DIR, subdir);
      const monthDir = join(dir, currentMonth);

      try {
        const files = readdirSync(monthDir)
          .filter(f => f.endsWith('.md') && !f.includes('sentiment-rating')) // Skip auto sentiment files
          .map(f => ({
            name: f,
            path: join(monthDir, f),
            mtime: statSync(join(monthDir, f)).mtime
          }))
          .filter(f => f.mtime > cutoffDate)
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()) // Most recent first
          .slice(0, 5); // Top 5

        // Extract key sections from files
        for (const file of files) {
          try {
            const content = readFileSync(file.path, 'utf-8');
            const titleMatch = content.match(/^# (.+)$/m);

            if (titleMatch) {
              const title = titleMatch[1];

              // Extract date from filename
              const dateMatch = file.name.match(/^(\d{4}-\d{2}-\d{2})/);
              const date = dateMatch ? dateMatch[1] : 'Recent';

              // Create compact learning summary
              const learningSummary = `[${date}] ${title}`;
              learnings.push(learningSummary);
            }
          } catch {
            // Skip if can't read
          }
        }
      } catch {
        // Directory might not exist - try previous month
        const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
        const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        const prevMonthDir = join(dir, prevMonthStr);

        try {
          const files = readdirSync(prevMonthDir)
            .filter(f => f.endsWith('.md') && !f.includes('sentiment-rating'))
            .map(f => ({
              name: f,
              path: join(prevMonthDir, f),
              mtime: statSync(join(prevMonthDir, f)).mtime
            }))
            .filter(f => f.mtime > cutoffDate)
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
            .slice(0, 2);

          for (const file of files) {
            try {
              const content = readFileSync(file.path, 'utf-8');
              const titleMatch = content.match(/^# (.+)$/m);

              if (titleMatch) {
                const title = titleMatch[1];
                const dateMatch = file.name.match(/^(\d{4}-\d{2}-\d{2})/);
                const date = dateMatch ? dateMatch[1] : 'Recent';
                const learningSummary = `[${date}] ${title}`;
                learnings.push(learningSummary);
              }
            } catch {
              // Skip if can't read
            }
          }
        } catch {
          // Previous month directory doesn't exist either
        }
      }
    }

    return learnings.slice(0, 5); // Max 5 learnings
  } catch (error) {
    console.error('Error loading recent learnings:', error);
    return [];
  }
}

/**
 * Format session context as human-readable text
 */
export function formatSessionContext(context: SessionContext): string {
  const lines: string[] = [];

  lines.push('📊 SESSION CONTEXT');
  lines.push('═'.repeat(50));
  lines.push('');

  // Yesterday's summary
  lines.push('📅 YESTERDAY');
  lines.push(`${context.yesterday.summary}`);
  if (context.yesterday.workDone.length > 0) {
    lines.push('');
    lines.push('Work completed:');
    context.yesterday.workDone.forEach(item => lines.push(`  • ${item}`));
  }
  if (context.yesterday.carryForward.length > 0) {
    lines.push('');
    lines.push('Carry forward:');
    context.yesterday.carryForward.forEach(item => lines.push(`  ⏭️  ${item}`));
  }
  lines.push('');

  // Active projects
  if (context.activeProjects.length > 0) {
    lines.push('🎯 ACTIVE PROJECTS');
    context.activeProjects.forEach(project => lines.push(`  • ${project}`));
    lines.push('');
  }

  // Open items
  if (context.openItems.length > 0) {
    lines.push('📝 OPEN ITEMS');
    context.openItems.forEach(item => {
      const priority = item.priority ? `[${item.priority.toUpperCase()}]` : '';
      lines.push(`  ${priority} ${item.description}`);
    });
    lines.push('');
  }

  // Recent learnings
  if (context.recentLearnings.length > 0) {
    lines.push('💡 RECENT LEARNINGS (Last 7 days)');
    context.recentLearnings.forEach(learning => lines.push(`  • ${learning}`));
    lines.push('');
  }

  lines.push('═'.repeat(50));

  return lines.join('\n');
}

/**
 * CLI Interface
 */
if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];
  const sinceArg = args[1]; // Optional ISO timestamp

  if (command === 'load' || !command) {
    // Load and display full context
    loadSessionContext().then(context => {
      console.log(formatSessionContext(context));
    });
  } else if (command === 'delta' && sinceArg) {
    // Load delta context since given timestamp
    const since = new Date(sinceArg);
    loadDeltaContext(since).then(deltaText => {
      console.log(deltaText);
    });
  } else {
    console.log(`
PAI Session Context Loader

USAGE:
  bun SessionContextLoader.ts [load]              # Full context load
  bun SessionContextLoader.ts delta <timestamp>   # Delta load since timestamp

DESCRIPTION:
  Loads relevant context at session start including:
  - Yesterday's work summary (full load only)
  - Active projects and open items
  - Recent learnings (all or delta)

EXAMPLES:
  bun SessionContextLoader.ts load
  bun SessionContextLoader.ts delta "2026-02-02T08:00:00Z"
    `);
  }
}
