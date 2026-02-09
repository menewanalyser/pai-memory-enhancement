#!/usr/bin/env bun
/**
 * WeeklySynthesis.ts - Weekly Memory Consolidation
 *
 * PURPOSE:
 * Runs weekly to analyze all learnings, identify patterns, synthesize themes,
 * and create a consolidated weekly report. This enables cross-session pattern
 * recognition and compound learning.
 *
 * USAGE:
 *   bun WeeklySynthesis.ts                    # Analyze past week
 *   bun WeeklySynthesis.ts --date 2026-02-01  # Analyze specific week
 *   bun WeeklySynthesis.ts --dry-run          # Preview without writing
 *
 * OUTPUT:
 *   - Creates: MEMORY/LEARNING/SYNTHESIS/YYYY-MM/Weekly-Synthesis-YYYY-MM-DD.md
 *   - Updates: MEMORY/STATE/memory-index.json
 *
 * ALGORITHM:
 *   1. Read all learnings from past 7 days
 *   2. Group by topic/theme
 *   3. Identify patterns (3+ similar situations)
 *   4. Extract key lessons
 *   5. Generate synthesis document
 *   6. Update memory index
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';

const PAI_HOME = process.env.HOME + '/.claude';
const MEMORY_DIR = join(PAI_HOME, 'MEMORY');
const LEARNING_DIR = join(MEMORY_DIR, 'LEARNING');
const SYNTHESIS_DIR = join(LEARNING_DIR, 'SYNTHESIS');
const STATE_DIR = join(MEMORY_DIR, 'STATE');
const MEMORY_INDEX_FILE = join(STATE_DIR, 'memory-index.json');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
};

interface Learning {
  file: string;
  path: string;
  date: string;
  title: string;
  content: string;
  category: 'ALGORITHM' | 'SYSTEM';
  rating?: number;
}

interface Pattern {
  theme: string;
  occurrences: number;
  learnings: Learning[];
  insight: string;
}

interface SynthesisResult {
  weekStart: string;
  weekEnd: string;
  totalLearnings: number;
  patterns: Pattern[];
  topInsights: string[];
  lowRatings: Learning[];
}

/**
 * Get date range for past week
 */
function getWeekRange(endDate?: Date): { start: Date; end: Date } {
  const end = endDate || new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Load all learnings from a date range
 */
async function loadLearnings(startDate: Date, endDate: Date): Promise<Learning[]> {
  const learnings: Learning[] = [];
  const categories: Array<'ALGORITHM' | 'SYSTEM'> = ['ALGORITHM', 'SYSTEM'];

  for (const category of categories) {
    const categoryDir = join(LEARNING_DIR, category);
    if (!existsSync(categoryDir)) continue;

    // Get all month directories
    const months = readdirSync(categoryDir).filter(d => d.match(/^\d{4}-\d{2}$/));

    for (const month of months) {
      const monthDir = join(categoryDir, month);
      const files = readdirSync(monthDir).filter(f => f.endsWith('.md'));

      for (const file of files) {
        const filePath = join(monthDir, file);
        const stats = statSync(filePath);

        // Check if file is in date range
        if (stats.mtime >= startDate && stats.mtime <= endDate) {
          try {
            const content = readFileSync(filePath, 'utf-8');

            // Extract title
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1] : file.replace(/\.md$/, '');

            // Extract rating
            const ratingMatch = content.match(/(?:rating|RATE).*?(\d+)/i);
            const rating = ratingMatch ? parseInt(ratingMatch[1]) : undefined;

            // Extract date from filename
            const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
            const date = dateMatch ? dateMatch[1] : formatDate(stats.mtime);

            learnings.push({
              file,
              path: filePath,
              date,
              title,
              content,
              category,
              rating
            });
          } catch (error) {
            console.error(`${colors.yellow}⚠ Could not read ${file}: ${error}${colors.reset}`);
          }
        }
      }
    }
  }

  return learnings.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Extract keywords from learning content
 */
function extractKeywords(content: string): string[] {
  const keywords: string[] = [];

  // Extract hashtags
  const tags = content.match(/#[a-zA-Z0-9_-]+/g) || [];
  keywords.push(...tags);

  // Extract common technical terms
  const techTerms = [
    'bug', 'fix', 'error', 'issue', 'problem',
    'feature', 'implement', 'add', 'create',
    'refactor', 'optimize', 'improve',
    'test', 'debug', 'deploy',
    'api', 'database', 'hook', 'skill',
    'session', 'memory', 'learning', 'context'
  ];

  const lowerContent = content.toLowerCase();
  for (const term of techTerms) {
    if (lowerContent.includes(term)) {
      keywords.push(term);
    }
  }

  return [...new Set(keywords)]; // Deduplicate
}

/**
 * Identify patterns by grouping similar learnings
 */
function identifyPatterns(learnings: Learning[]): Pattern[] {
  const patterns: Pattern[] = [];
  const grouped = new Map<string, Learning[]>();

  // Group learnings by keywords
  for (const learning of learnings) {
    const keywords = extractKeywords(learning.content);

    for (const keyword of keywords) {
      if (!grouped.has(keyword)) {
        grouped.set(keyword, []);
      }
      grouped.get(keyword)!.push(learning);
    }
  }

  // Find patterns with 3+ occurrences
  for (const [theme, items] of grouped) {
    if (items.length >= 3) {
      // Deduplicate learnings (same learning might have multiple keywords)
      const uniqueLearnings = Array.from(new Set(items.map(l => l.path)))
        .map(path => items.find(l => l.path === path)!);

      if (uniqueLearnings.length >= 3) {
        patterns.push({
          theme: theme.replace(/^#/, ''),
          occurrences: uniqueLearnings.length,
          learnings: uniqueLearnings,
          insight: generateInsight(theme, uniqueLearnings)
        });
      }
    }
  }

  // Sort by occurrence count
  return patterns.sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Generate insight from a pattern
 */
function generateInsight(theme: string, learnings: Learning[]): string {
  const avgRating = learnings
    .filter(l => l.rating)
    .reduce((sum, l) => sum + (l.rating || 0), 0) / learnings.filter(l => l.rating).length;

  if (avgRating && avgRating < 5) {
    return `Repeated low ratings (avg ${avgRating.toFixed(1)}/10) suggest this area needs improvement`;
  }

  if (theme.includes('bug') || theme.includes('fix') || theme.includes('error')) {
    return 'Pattern of similar bugs - consider preventive measures or improved testing';
  }

  if (theme.includes('refactor') || theme.includes('optimize')) {
    return 'Technical debt accumulation - schedule dedicated refactoring time';
  }

  return `Recurring theme requiring attention - ${learnings.length} instances this week`;
}

/**
 * Synthesize weekly report
 */
function synthesize(learnings: Learning[], weekStart: string, weekEnd: string): SynthesisResult {
  const patterns = identifyPatterns(learnings);

  // Extract top insights
  const topInsights = patterns.slice(0, 5).map(p => p.insight);

  // Find low-rated learnings
  const lowRatings = learnings.filter(l => l.rating && l.rating <= 3);

  return {
    weekStart,
    weekEnd,
    totalLearnings: learnings.length,
    patterns,
    topInsights,
    lowRatings
  };
}

/**
 * Generate markdown synthesis document
 */
function generateMarkdown(result: SynthesisResult): string {
  const lines: string[] = [];

  lines.push(`# Weekly Synthesis - ${result.weekStart} to ${result.weekEnd}`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Total Learnings:** ${result.totalLearnings}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Patterns section
  if (result.patterns.length > 0) {
    lines.push('## 🔍 Patterns Detected');
    lines.push('');

    for (const pattern of result.patterns.slice(0, 10)) {
      lines.push(`### ${pattern.theme} (${pattern.occurrences} occurrences)`);
      lines.push('');
      lines.push(`**Insight:** ${pattern.insight}`);
      lines.push('');
      lines.push('**Related Learnings:**');
      for (const learning of pattern.learnings.slice(0, 5)) {
        lines.push(`- [${learning.date}] ${learning.title}`);
      }
      lines.push('');
    }
  } else {
    lines.push('## 🔍 Patterns Detected');
    lines.push('');
    lines.push('No significant patterns detected this week (requires 3+ similar learnings).');
    lines.push('');
  }

  // Key insights
  if (result.topInsights.length > 0) {
    lines.push('## 💡 Key Insights');
    lines.push('');
    for (const insight of result.topInsights) {
      lines.push(`- ${insight}`);
    }
    lines.push('');
  }

  // Low ratings
  if (result.lowRatings.length > 0) {
    lines.push('## ⚠️ Areas for Improvement');
    lines.push('');
    lines.push('Learnings with low ratings (≤3/10) requiring attention:');
    lines.push('');
    for (const learning of result.lowRatings) {
      lines.push(`- **[${learning.date}]** ${learning.title} (${learning.rating}/10)`);
    }
    lines.push('');
  }

  // Action items
  lines.push('## 📋 Action Items');
  lines.push('');
  if (result.patterns.length > 0) {
    lines.push('- Review top patterns and identify systemic improvements');
  }
  if (result.lowRatings.length > 0) {
    lines.push('- Address root causes of low-rated learnings');
  }
  lines.push('- Apply lessons to upcoming work');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*Auto-generated by WeeklySynthesis.ts*');

  return lines.join('\n');
}

/**
 * Update memory index with weekly synthesis
 */
function updateMemoryIndex(result: SynthesisResult, synthesisPath: string): void {
  let index: any = { weeks: [], patterns: {} };

  if (existsSync(MEMORY_INDEX_FILE)) {
    try {
      index = JSON.parse(readFileSync(MEMORY_INDEX_FILE, 'utf-8'));
    } catch {
      // Invalid JSON, start fresh
    }
  }

  // Add week entry
  index.weeks = index.weeks || [];
  index.weeks.push({
    start: result.weekStart,
    end: result.weekEnd,
    learnings: result.totalLearnings,
    patterns: result.patterns.length,
    file: synthesisPath.replace(PAI_HOME + '/', '')
  });

  // Update patterns index
  index.patterns = index.patterns || {};
  for (const pattern of result.patterns) {
    if (!index.patterns[pattern.theme]) {
      index.patterns[pattern.theme] = {
        count: 0,
        weeks: []
      };
    }
    index.patterns[pattern.theme].count += pattern.occurrences;
    index.patterns[pattern.theme].weeks.push(result.weekStart);
  }

  // Write index
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  writeFileSync(MEMORY_INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`${colors.green}✓ Updated memory index${colors.reset}`);
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dateArg = args.find(a => a.startsWith('--date='))?.split('=')[1];

  console.log(`${colors.bold}${colors.cyan}Weekly Synthesis${colors.reset}\n`);

  // Determine date range
  const endDate = dateArg ? new Date(dateArg) : new Date();
  const { start, end } = getWeekRange(endDate);
  const weekStart = formatDate(start);
  const weekEnd = formatDate(end);

  console.log(`📅 Analyzing week: ${weekStart} to ${weekEnd}\n`);

  // Load learnings
  console.log(`${colors.cyan}Loading learnings...${colors.reset}`);
  const learnings = await loadLearnings(start, end);
  console.log(`${colors.green}✓ Loaded ${learnings.length} learnings${colors.reset}\n`);

  if (learnings.length === 0) {
    console.log(`${colors.yellow}No learnings found for this week${colors.reset}`);
    process.exit(0);
  }

  // Synthesize
  console.log(`${colors.cyan}Identifying patterns...${colors.reset}`);
  const result = synthesize(learnings, weekStart, weekEnd);
  console.log(`${colors.green}✓ Found ${result.patterns.length} patterns${colors.reset}\n`);

  // Generate markdown
  const markdown = generateMarkdown(result);

  if (dryRun) {
    console.log(`${colors.yellow}DRY RUN - Preview:${colors.reset}\n`);
    console.log(markdown);
    process.exit(0);
  }

  // Write synthesis file
  const year = weekEnd.slice(0, 4);
  const month = weekEnd.slice(0, 7);
  const synthesisMonthDir = join(SYNTHESIS_DIR, month);

  if (!existsSync(synthesisMonthDir)) {
    mkdirSync(synthesisMonthDir, { recursive: true });
  }

  const filename = `Weekly-Synthesis-${weekEnd}.md`;
  const filepath = join(synthesisMonthDir, filename);

  writeFileSync(filepath, markdown, 'utf-8');
  console.log(`${colors.green}✓ Created synthesis: ${filepath}${colors.reset}`);

  // Update memory index
  updateMemoryIndex(result, filepath);

  console.log(`\n${colors.bold}${colors.green}Weekly synthesis complete!${colors.reset}`);
}

main().catch((error) => {
  console.error(`${colors.magenta}Error: ${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});
