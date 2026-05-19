import { getDatabase } from '../database/connection';

export interface GitCommitsCache {
  cacheKey: string;
  commits: any[];
  stats: { totalCommits: number; totalRepos: number };
  cachedAt: string;
}

export interface GitHeatmapCache {
  data: Record<string, number>;
  stats: {
    totalCommits: number;
    longestStreak: number;
    currentStreak: number;
    mostActiveMonth: string;
    mostActiveDay: string;
  };
  cachedAt: string;
}

export class GitCacheManager {
  /**
   * Save commits and stats to persistent cache
   */
  static saveCommitsCache(cacheKey: string, commits: any[], stats: { totalCommits: number; totalRepos: number }): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO git_commits_cache (cache_key, commits, stats)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        commits = excluded.commits,
        stats = excluded.stats,
        cached_at = datetime('now')
    `);
    
    stmt.run(cacheKey, JSON.stringify(commits), JSON.stringify(stats));
  }

  /**
   * Load commits and stats from persistent cache
   */
  static loadCommitsCache(cacheKey: string): GitCommitsCache | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM git_commits_cache WHERE cache_key = ?');
    const row = stmt.get(cacheKey) as any;
    
    if (!row) return null;
    
    return {
      cacheKey: row.cache_key,
      commits: JSON.parse(row.commits),
      stats: JSON.parse(row.stats),
      cachedAt: row.cached_at,
    };
  }

  /**
   * Save heatmap data to persistent cache
   */
  static saveHeatmapCache(heatmapData: { data: Record<string, number>; stats: any }): void {
    const db = getDatabase();
    
    // Delete old cache and insert new one (keep only latest)
    db.exec('DELETE FROM git_heatmap_cache');
    
    const stmt = db.prepare(`
      INSERT INTO git_heatmap_cache (heatmap_data)
      VALUES (?)
    `);
    
    stmt.run(JSON.stringify(heatmapData));
  }

  /**
   * Load heatmap data from persistent cache
   */
  static loadHeatmapCache(): GitHeatmapCache | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM git_heatmap_cache ORDER BY cached_at DESC LIMIT 1');
    const row = stmt.get() as any;
    
    if (!row) return null;
    
    const data = JSON.parse(row.heatmap_data);
    return {
      data: data.data,
      stats: data.stats,
      cachedAt: row.cached_at,
    };
  }

  /**
   * Clear all git cache
   */
  static clearAllCache(): void {
    const db = getDatabase();
    db.exec('DELETE FROM git_commits_cache');
    db.exec('DELETE FROM git_heatmap_cache');
  }

  /**
   * Clear commits cache for specific key
   */
  static clearCommitsCache(cacheKey: string): void {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM git_commits_cache WHERE cache_key = ?');
    stmt.run(cacheKey);
  }

  /**
   * Clear heatmap cache
   */
  static clearHeatmapCache(): void {
    const db = getDatabase();
    db.exec('DELETE FROM git_heatmap_cache');
  }
}
