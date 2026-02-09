#!/usr/bin/env bun

/**
 * Current Work State Manager
 *
 * Manages the STATE/session-continuity.json file that tracks:
 * - Active projects
 * - Last session summary
 * - Open items/todos
 *
 * TypeScript Learning Points:
 * 1. Import types from other files
 * 2. readFileSync/writeFileSync for file operations
 * 3. JSON.parse() with type assertions
 * 4. Error handling with try/catch
 * 5. Default values with || operator
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { CurrentWorkState, OpenItem, LastSession } from './types/memory';

// Environment variable from PAI setup
const PAI_HOME = process.env.PAI_HOME || `${process.env.HOME}/.claude`;
const STATE_DIR = join(PAI_HOME, 'MEMORY', 'STATE');
const CURRENT_WORK_FILE = join(STATE_DIR, 'session-continuity.json');

/**
 * Get the current work state
 * Returns the state object or creates a new default state if file doesn't exist
 */
export function getCurrentWorkState(): CurrentWorkState {
  try {
    // TypeScript: existsSync returns boolean
    if (!existsSync(CURRENT_WORK_FILE)) {
      return getDefaultState();
    }

    // TypeScript: readFileSync returns Buffer, 'utf-8' converts to string
    const fileContent = readFileSync(CURRENT_WORK_FILE, 'utf-8');

    // TypeScript: JSON.parse returns 'any', so we assert it's CurrentWorkState
    // The 'as' keyword is a type assertion
    const state = JSON.parse(fileContent) as CurrentWorkState;

    return state;
  } catch (error) {
    // TypeScript: error is 'unknown' by default
    // Use 'instanceof' to check the type safely
    console.error('Error reading current work state:', error instanceof Error ? error.message : error);
    return getDefaultState();
  }
}

/**
 * Save the current work state
 */
export function saveCurrentWorkState(state: CurrentWorkState): void {
  try {
    // Update the lastUpdated timestamp
    state.lastUpdated = new Date().toISOString();

    // TypeScript: JSON.stringify with null, 2 for pretty printing
    // writeFileSync expects string | Buffer
    const content = JSON.stringify(state, null, 2);
    writeFileSync(CURRENT_WORK_FILE, content, 'utf-8');

    console.log('✅ Current work state saved');
  } catch (error) {
    console.error('Error saving current work state:', error instanceof Error ? error.message : error);
    throw error; // Re-throw so caller knows it failed
  }
}

/**
 * Add a new open item
 */
export function addOpenItem(description: string, priority?: 'high' | 'medium' | 'low'): void {
  const state = getCurrentWorkState();

  // TypeScript: Create object matching OpenItem interface
  const newItem: OpenItem = {
    description,
    priority: priority || 'medium', // Default to medium if not specified
    createdAt: new Date().toISOString()
  };

  state.openItems.push(newItem);
  saveCurrentWorkState(state);
}

/**
 * Update the last session summary
 */
export function updateLastSession(summary: string, nextSteps: string[], filesModified?: string[]): void {
  const state = getCurrentWorkState();

  // TypeScript: Create object matching LastSession interface
  const lastSession: LastSession = {
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
    summary,
    nextSteps,
    filesModified
  };

  state.lastSession = lastSession;
  saveCurrentWorkState(state);
}

/**
 * Add a project to active projects (if not already there)
 */
export function addActiveProject(projectName: string): void {
  const state = getCurrentWorkState();

  // TypeScript: includes() is a type-safe array method
  if (!state.activeProjects.includes(projectName)) {
    state.activeProjects.push(projectName);
    saveCurrentWorkState(state);
  }
}

/**
 * Remove a project from active projects
 */
export function removeActiveProject(projectName: string): void {
  const state = getCurrentWorkState();

  // TypeScript: filter() creates new array without the specified item
  state.activeProjects = state.activeProjects.filter(p => p !== projectName);
  saveCurrentWorkState(state);
}

/**
 * Clear completed open items (by description match)
 */
export function clearOpenItem(description: string): void {
  const state = getCurrentWorkState();

  // TypeScript: filter keeps items that DON'T match
  state.openItems = state.openItems.filter(item => item.description !== description);
  saveCurrentWorkState(state);
}

/**
 * Get default empty state
 */
function getDefaultState(): CurrentWorkState {
  // TypeScript: Return object must match CurrentWorkState interface exactly
  return {
    activeProjects: [],
    lastSession: {
      date: new Date().toISOString().split('T')[0],
      summary: 'No previous session',
      nextSteps: []
    },
    openItems: [],
    lastUpdated: new Date().toISOString()
  };
}

/**
 * CLI Interface
 * Allows running this script directly from command line
 */
if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'show':
      // Show current state
      console.log(JSON.stringify(getCurrentWorkState(), null, 2));
      break;

    case 'add-item':
      // Add open item: bun CurrentWorkManager.ts add-item "Do the thing"
      const description = args[1];
      const priority = args[2] as 'high' | 'medium' | 'low' | undefined;
      if (description) {
        addOpenItem(description, priority);
      } else {
        console.error('Usage: bun CurrentWorkManager.ts add-item "description" [priority]');
      }
      break;

    case 'add-project':
      // Add active project: bun CurrentWorkManager.ts add-project "Project-A"
      const project = args[1];
      if (project) {
        addActiveProject(project);
      } else {
        console.error('Usage: bun CurrentWorkManager.ts add-project "ProjectName"');
      }
      break;

    case 'update-session':
      // Update last session: bun CurrentWorkManager.ts update-session "Built memory system" "Next: phase 2"
      const summary = args[1];
      const nextSteps = args.slice(2);
      if (summary && nextSteps.length > 0) {
        updateLastSession(summary, nextSteps);
      } else {
        console.error('Usage: bun CurrentWorkManager.ts update-session "summary" "next step 1" "next step 2"');
      }
      break;

    default:
      console.log(`
PAI Current Work Manager

USAGE:
  bun CurrentWorkManager.ts <command> [args]

COMMANDS:
  show                          Show current work state
  add-item <desc> [priority]    Add open item (priority: high|medium|low)
  add-project <name>            Add active project
  update-session <summary> <next-steps...>  Update last session

EXAMPLES:
  bun CurrentWorkManager.ts show
  bun CurrentWorkManager.ts add-item "Fix memory bug" high
  bun CurrentWorkManager.ts add-project "Project-A"
  bun CurrentWorkManager.ts update-session "Built phase 2" "Test integration" "Document"
      `);
  }
}
