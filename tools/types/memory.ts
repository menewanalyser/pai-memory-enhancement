/**
 * Type Definitions for PAI Memory System
 *
 * TypeScript Learning Points:
 * 1. Interfaces define the "shape" of objects
 * 2. Optional properties use the ? operator
 * 3. Union types (|) allow multiple possible types
 * 4. Export makes these types available to other files
 */

// Represents an item that's still open/in-progress
export interface OpenItem {
  description: string;
  context?: string;      // Optional: additional context
  createdAt: string;     // ISO date string
  priority?: 'high' | 'medium' | 'low';  // Union type: only these values allowed
}

// Represents a summary of the last work session
export interface LastSession {
  date: string;          // ISO date string (YYYY-MM-DD)
  summary: string;       // Human-readable summary
  nextSteps: string[];   // Array of strings
  filesModified?: string[];  // Optional: which files were changed
}

// The main state object stored in STATE/session-continuity.json
export interface CurrentWorkState {
  activeProjects: string[];
  lastSession: LastSession;
  openItems: OpenItem[];
  lastUpdated: string;   // ISO timestamp
}

// Result from memory search
export interface MemorySearchResult {
  file: string;
  context: string;
  relevance: number;
  timestamp: string;
  type: 'ALGORITHM' | 'SYSTEM' | 'WORK';
}

// Context loaded at session start
export interface SessionContext {
  yesterday: {
    summary: string;
    workDone: string[];
    carryForward: string[];
  };
  activeProjects: string[];
  openItems: OpenItem[];
  recentLearnings: string[];
}
