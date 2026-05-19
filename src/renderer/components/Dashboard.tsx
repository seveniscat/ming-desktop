import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calendar as CalendarIcon, GitBranch, FileText, Play, RefreshCw, Folder, Activity, User, Plus, Minus, Copy, Check, X, Search } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardHeader, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/lib/utils';
import GitHeatmap from './GitHeatmap';
import { useIdentities } from './IdentityProvider';

interface GitRepo {
  name: string;
  path: string;
}

interface CommitInfo {
  hash: string;
  date: string;
  author: string;
  message: string;
  description?: string;
  repo: string;
  files_changed: string[];
  additions: number;
  deletions: number;
  branches: string;
}

interface DashboardProps {
  onStartChat?: (request: {
    agentName: string;
    message: string;
    model?: string;
    newConversation?: boolean;
    reuseAgentConversation?: boolean;
    autoSend?: boolean;
  }) => void;
}

// Module-level cache: survives tab switches (component unmount/remount)
type HeatmapData = {
  data: Record<string, number>;
  stats: {
    totalCommits: number;
    longestStreak: number;
    currentStreak: number;
    mostActiveMonth: string;
    mostActiveDay: string;
  };
};
let cachedHeatmapData: HeatmapData | null = null;
let heatmapFetchPromise: Promise<HeatmapData | null> | null = null;

// Module-level cache for stats: keyed by serialized params
type StatsCache = {
  key: string;
  commits: CommitInfo[];
  stats: { totalCommits: number; totalRepos: number };
};
let cachedStatsData: StatsCache | null = null;
let statsFetchPromise: Promise<StatsCache | null> | null = null;

export default function Dashboard({ onStartChat }: DashboardProps) {
  const { identities: myIdentities, setIdentities: setMyIdentities } = useIdentities();
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [timeRange, setTimeRange] = useState<string>('today');
  const [customSince, setCustomSince] = useState<Date>();
  const [customUntil, setCustomUntil] = useState<Date>();
  const [stats, setStats] = useState({
    totalCommits: 0,
    totalRepos: 0,
  });
  const [workPaths, setWorkPaths] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [gitRepos, setGitRepos] = useState<GitRepo[]>([]);
  const [activeSheet, setActiveSheet] = useState<'commits' | 'repos' | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [gitAuthors, setGitAuthors] = useState<{ name: string; email: string }[]>([]);
  const [heatmapData, setHeatmapData] = useState<{
    data: Record<string, number>;
    stats: {
      totalCommits: number;
      longestStreak: number;
      currentStreak: number;
      mostActiveMonth: string;
      mostActiveDay: string;
    };
  } | null>(null);
  const [isHeatmapLoading, setIsHeatmapLoading] = useState(false);
  const [identityDialogOpen, setIdentityDialogOpen] = useState(false);
  const [selectedIdentities, setSelectedIdentities] = useState<Set<string>>(new Set());
  const [identitySearch, setIdentitySearch] = useState('');

  // Keep identities in a ref so fetchHeatmap/fetchStats don't depend on the array reference
  const identitiesRef = useRef(myIdentities);
  identitiesRef.current = myIdentities;

  const fetchHeatmap = useCallback(async (forceRefresh = false) => {
    // Clear memory cache if forcing refresh
    if (forceRefresh) {
      cachedHeatmapData = null;
    }

    // Return cached data immediately if available
    if (cachedHeatmapData) {
      setHeatmapData(cachedHeatmapData);
      return;
    }

    // Deduplicate: reuse in-flight request
    if (!heatmapFetchPromise) {
      const ids = identitiesRef.current;
      const authorNames = ids.length > 0 ? ids.map(i => i.name) : undefined;
      heatmapFetchPromise = window.electronAPI.git.heatmap(authorNames)
        .then(result => {
          cachedHeatmapData = result;
          return result;
        })
        .catch(error => {
          console.error('Failed to fetch heatmap:', error);
          return null;
        })
        .finally(() => {
          heatmapFetchPromise = null;
        });
    }
    setIsHeatmapLoading(true);
    const result = await heatmapFetchPromise;
    if (result) setHeatmapData(result);
    setIsHeatmapLoading(false);
  }, []);

  // Sort repos by activity: repos with commits first (sorted by date desc), then repos without commits
  const sortedGitRepos = useMemo(() => {
    const repoLastCommit = new Map<string, Date>();
    commits.forEach(commit => {
      const commitDate = new Date(commit.date);
      const existing = repoLastCommit.get(commit.repo);
      if (!existing || commitDate > existing) {
        repoLastCommit.set(commit.repo, commitDate);
      }
    });

    return [...gitRepos].sort((a, b) => {
      const aDate = repoLastCommit.get(a.name);
      const bDate = repoLastCommit.get(b.name);
      if (aDate && bDate) return bDate.getTime() - aDate.getTime();
      if (aDate) return -1;
      if (bDate) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [gitRepos, commits]);

  const loadWorkPaths = useCallback(async () => {
    try {
      const paths = await window.electronAPI.config.get('workPaths');
      if (Array.isArray(paths) && paths.length > 0) {
        setWorkPaths(paths);
      } else {
        setWorkPaths([]);
      }
    } catch {
      setWorkPaths([]);
    }
  }, []);

  const loadGitRepos = useCallback(async () => {
    try {
      const repos = await window.electronAPI.git.scanRepos();
      setGitRepos(repos || []);
    } catch {
      setGitRepos([]);
    }
  }, []);

  const handleAddPath = async () => {
    try {
      const result = await window.electronAPI.dialog.showOpenDialog({
        title: '选择工作目录',
        properties: ['openDirectory', 'multiSelections'],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        const newPaths = [...workPaths];
        for (const p of result.filePaths) {
          if (!newPaths.includes(p)) {
            newPaths.push(p);
          }
        }
        setWorkPaths(newPaths);
        await window.electronAPI.config.set('workPaths', newPaths);
      }
    } catch (error) {
      console.error('Failed to open dialog:', error);
    }
  };

  const handleRemovePath = async (index: number) => {
    const newPaths = workPaths.filter((_, i) => i !== index);
    setWorkPaths(newPaths);
    await window.electronAPI.config.set('workPaths', newPaths);
  };

  useEffect(() => {
    loadWorkPaths();
  }, [loadWorkPaths]);

  useEffect(() => {
    if (workPaths.length > 0) {
      loadGitRepos();
      // Load all git authors when work paths are available
      window.electronAPI.git.getAllAuthors().then(async authors => {
        setGitAuthors(authors || []);
      }).catch(() => {});
    } else {
      setGitRepos([]);
      setGitAuthors([]);
    }
  }, [workPaths, loadGitRepos, myIdentities.length]);

  const buildReportParams = useCallback(() => {
    const params: any = {
      timeRange: timeRange === 'custom' ? 'today' : timeRange,
      includeAllBranches: true,
    };
    const ids = identitiesRef.current;
    if (ids.length > 0) {
      params.authors = ids.map(i => i.name);
    }
    if (timeRange === 'custom') {
      if (customSince) params.sinceDate = format(customSince, 'yyyy-MM-dd');
      if (customUntil) params.untilDate = format(customUntil, 'yyyy-MM-dd');
    }
    return params;
  }, [timeRange, customSince, customUntil]);

  const fetchStats = useCallback(async (forceRefresh = false) => {
    const params = buildReportParams();
    const cacheKey = JSON.stringify(params);

    // Clear memory cache if forcing refresh
    if (forceRefresh && cachedStatsData?.key === cacheKey) {
      cachedStatsData = null;
    }

    // Return cached data immediately if available and not forcing refresh
    if (!forceRefresh && cachedStatsData && cachedStatsData.key === cacheKey) {
      setCommits(cachedStatsData.commits);
      setStats(cachedStatsData.stats);
      return;
    }

    // Deduplicate: reuse in-flight request
    if (!forceRefresh && statsFetchPromise) {
      setIsRefreshing(true);
      const result = await statsFetchPromise;
      if (result && result.key === cacheKey) {
        setCommits(result.commits);
        setStats(result.stats);
      }
      setIsRefreshing(false);
      return;
    }

    setIsRefreshing(true);
    statsFetchPromise = (async () => {
      try {
        const result = await window.electronAPI.dailyReport.fetch(params);
        const commitList = result.commits || [];
        const reposWithCommits = new Set(commitList.map((c: CommitInfo) => c.repo));
        const statsResult = {
          totalCommits: commitList.length,
          totalRepos: reposWithCommits.size,
        };
        const cached: StatsCache = { key: cacheKey, commits: commitList, stats: statsResult };
        cachedStatsData = cached;
        return cached;
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        return null;
      } finally {
        statsFetchPromise = null;
      }
    })();

    const result = await statsFetchPromise;
    if (result) {
      setCommits(result.commits);
      setStats(result.stats);
    } else {
      setCommits([]);
      setStats({ totalCommits: 0, totalRepos: 0 });
    }
    setIsRefreshing(false);
  }, [buildReportParams]);

  useEffect(() => {
    if (workPaths.length > 0) {
      fetchStats();
    }
  }, [workPaths, fetchStats]);

  // Refetch stats when time range changes (cache is keyed by params, so re-fetch with new params)
  useEffect(() => {
    if (workPaths.length > 0 && myIdentities.length > 0) {
      cachedStatsData = null;
      fetchStats(true);
    }
  }, [timeRange, customSince, customUntil, workPaths.length]);

  // Refetch stats and heatmap when identities actually change (compare names, not reference)
  const identityKey = myIdentities.map(i => `${i.name}|${i.email}`).sort().join(',');
  useEffect(() => {
    if (workPaths.length > 0 && identityKey) {
      cachedStatsData = null;
      cachedHeatmapData = null;
      fetchStats(true);
      fetchHeatmap(true);
    }
  }, [identityKey, workPaths.length]);

  // Load stats and heatmap on initial mount (uses cache if available)
  useEffect(() => {
    if (workPaths.length > 0) {
      fetchStats();
      fetchHeatmap();
    }
  }, [workPaths, fetchStats, fetchHeatmap]);


  // Group commits by repo
  const commitsByRepo = useMemo(() => {
    const grouped: Record<string, CommitInfo[]> = {};
    for (const c of commits) {
      if (!grouped[c.repo]) grouped[c.repo] = [];
      grouped[c.repo].push(c);
    }
    // Sort each group by date descending
    for (const repo of Object.keys(grouped)) {
      grouped[repo].sort((a, b) => b.date.localeCompare(a.date));
    }
    return grouped;
  }, [commits]);

  const handleGenerateReport = useCallback(() => {
    if (commits.length === 0) return;

    const lines: string[] = ['# Git Commit Report\n'];
    for (const [repo, repoCommits] of Object.entries(commitsByRepo)) {
      lines.push(`## ${repo} (${repoCommits.length} commits)\n`);
      for (const c of repoCommits) {
        lines.push(`- **${c.message}** (${c.hash.slice(0, 7)}) — ${c.author}, ${format(new Date(c.date), 'yyyy-MM-dd HH:mm')}`);
        if (c.description) lines.push(`  > ${c.description}`);
        if (c.additions || c.deletions) lines.push(`  +${c.additions} / -${c.deletions} in ${c.files_changed.length} files`);
      }
      lines.push('');
    }

    onStartChat?.({
      agentName: 'Ming',
      message: lines.join('\n'),
      newConversation: true,
      autoSend: true,
    });
  }, [commits, commitsByRepo, onStartChat]);

  const copyToClipboard = useCallback(async (text: string, hash?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (hash) {
        setCopiedHash(hash);
        setTimeout(() => setCopiedHash(null), 2000);
      }
    } catch {
      // silently fail
    }
  }, []);

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">WorkGround</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={async () => {
                // Clear persistent cache
                await window.electronAPI.git.clearCache();
                // Clear memory cache and refetch
                cachedStatsData = null;
                cachedHeatmapData = null;
                fetchStats(true);
                fetchHeatmap(true);
              }}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* My Identities Card */}
        {gitAuthors.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-secondary-foreground">
                    My Identities
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {myIdentities.length} selected
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedIdentities(new Set(myIdentities.map(i => `${i.name}|${i.email}`)));
                    setIdentitySearch('');
                    setIdentityDialogOpen(true);
                  }}
                >
                  Manage
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {myIdentities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {myIdentities.map((id, i) => (
                    <Badge key={i} variant="secondary" className="text-xs gap-1">
                      {id.name}
                      {id.email && <span className="opacity-60 font-normal">{id.email}</span>}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Click "Manage" to select your identities
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Git Commit Heatmap */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium text-secondary-foreground">
                Commit Activity
              </span>
              {heatmapData && (
                <span className="text-sm text-muted-foreground ml-1">
                  {heatmapData.stats.totalCommits.toLocaleString()} commits in the last year
                </span>
              )}
            </div>
            <GitHeatmap heatmapData={heatmapData} isLoading={isHeatmapLoading} />
          </CardContent>
        </Card>

        {/* Time range selector — controls repos activity + commit stats below */}
        <div className="flex items-center gap-3 mb-6">
          <CalendarIcon size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">统计范围</span>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">今天</SelectItem>
              <SelectItem value="yesterday">昨天</SelectItem>
              <SelectItem value="day_before_yesterday">前天</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="custom">自定义</SelectItem>
            </SelectContent>
          </Select>
          {timeRange === 'custom' && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-7 gap-1 text-xs', !customSince && 'text-muted-foreground')}
                  >
                    <CalendarIcon size={12} />
                    {customSince ? format(customSince, 'MM/dd') : '开始'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customSince}
                    onSelect={setCustomSince}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">~</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-7 gap-1 text-xs', !customUntil && 'text-muted-foreground')}
                  >
                    <CalendarIcon size={12} />
                    {customUntil ? format(customUntil, 'MM/dd') : '结束'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customUntil}
                    onSelect={setCustomUntil}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>

        {/* Work Paths and Git Repos - Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Work Paths Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-secondary-foreground">
                    Work Paths ({workPaths.length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      setIsRefreshing(true);
                      await loadGitRepos();
                      setIsRefreshing(false);
                    }}
                    className="flex items-center gap-2"
                    disabled={isRefreshing}
                  >
                    <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                    Rescan
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAddPath}
                    className="flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Add Folder
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {workPaths.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    未配置工作目录，请添加 Work Paths 以启用统计功能
                  </p>
                  <Button
                    variant="outline"
                    onClick={handleAddPath}
                    className="flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Add Folder
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Work Paths List */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {workPaths.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--surface-hover)] border border-[hsl(var(--border))]"
                      >
                        <Folder size={14} className="flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-sm truncate text-foreground">{p}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemovePath(i)}
                          className="flex-shrink-0 h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="Remove"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Git Repositories */}
          <Card
            className="cursor-pointer select-none hover:border-emerald-500/50 transition-colors"
            onClick={() => setActiveSheet('repos')}
            title="Click to view full repository list"
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder size={16} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-secondary-foreground">
                    Git Repositories ({gitRepos.length})
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setActiveSheet('repos'); }}
                  className="flex items-center gap-1 text-xs"
                >
                  View Details
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {sortedGitRepos.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No git repositories found in configured work paths.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sortedGitRepos.slice(0, 8).map((repo, i) => {
                    const hasCommits = commits.some(c => c.repo === repo.name);
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-lg border',
                          hasCommits
                            ? 'bg-primary/5 border-primary/30'
                            : 'bg-[var(--surface-hover)] border-[hsl(var(--border))]'
                        )}
                      >
                        <Folder size={14} className="text-muted-foreground flex-shrink-0" />
                        <span className={cn('font-medium truncate text-sm', hasCommits ? 'text-foreground' : 'text-foreground/70')}>
                          {repo.name}
                        </span>
                        {hasCommits && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0 flex-shrink-0">
                            <Activity size={10} className="mr-0.5" />
                            active
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {gitRepos.length > 8 && (
                    <div className="text-xs text-muted-foreground text-center pt-2">
                      +{gitRepos.length - 8} more repositories
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-8">
          <Card
            className={cn('cursor-pointer select-none transition-colors', stats.totalCommits > 0 && 'hover:border-primary/50')}
            onClick={() => { if (stats.totalCommits > 0) setActiveSheet('commits'); }}
            title={stats.totalCommits > 0 ? 'Click to view commit details' : 'No commits in this period'}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-accent">
                  <GitBranch size={24} className="text-primary" />
                </div>
              </div>
              <div className="text-3xl font-bold mb-1 text-foreground">{stats.totalCommits}</div>
              <div className="text-sm text-muted-foreground">Commits · {stats.totalRepos} Repos</div>
            </CardContent>
          </Card>
        </div>

        {/* Commit Detail Sheet */}
        <Sheet open={activeSheet === 'commits'} onOpenChange={(open) => !open && setActiveSheet(null)}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <div className="flex items-center justify-between pr-6">
                <SheetTitle className="flex items-center gap-2">
                  <CalendarIcon size={18} />
                  Commit Details ({commits.length} commits in {Object.keys(commitsByRepo).length} repos)
                </SheetTitle>
              </div>
              <SheetDescription>
                Git commit details for the selected time range
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <div className="flex items-center justify-end mb-4">
                <Button onClick={handleGenerateReport} size="sm">
                  <Play size={14} />
                  Generate in Chat
                </Button>
              </div>

              {commits.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  没有找到提交记录
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(commitsByRepo).map(([repo, repoCommits]) => (
                    <div key={repo}>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Folder size={14} className="text-muted-foreground" />
                        {repo}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          {repoCommits.length}
                        </Badge>
                      </h3>
                      <div className="space-y-2">
                        {repoCommits.map((commit, i) => (
                          <div
                            key={i}
                            className="rounded-lg border bg-card p-3 text-sm"
                          >
                            {/* Commit header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-foreground truncate">
                                  {commit.message}
                                </div>
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                  <button
                                    className="font-mono hover:text-foreground transition-colors flex items-center gap-1"
                                    onClick={() => copyToClipboard(commit.hash, commit.hash)}
                                    title={copiedHash === commit.hash ? '已复制' : '点击复制完整 hash'}
                                  >
                                    {commit.hash.slice(0, 7)}
                                    {copiedHash === commit.hash
                                      ? <Check size={10} className="text-green-500" />
                                      : <Copy size={10} />
                                    }
                                  </button>
                                  <span className="flex items-center gap-1">
                                    <User size={10} />
                                    {commit.author}
                                  </span>
                                  <span title={commit.date}>{commit.date.slice(0, 19)}</span>
                                  {commit.branches && (
                                    <span className="flex items-center gap-1">
                                      <GitBranch size={10} />
                                      {commit.branches}
                                    </span>
                                  )}
                                </div>
                                {commit.description && commit.description.trim() && (
                                  <div className="mt-1.5 text-xs text-muted-foreground/80 border-l-2 border-border pl-2">
                                    {commit.description.trim().split('\n').map((line, li) => (
                                      <span key={li}>{line}<br /></span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {(commit.additions > 0 || commit.deletions > 0) && (
                                <div className="flex items-center gap-2 text-xs flex-shrink-0">
                                  {commit.additions > 0 && (
                                    <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                                      <Plus size={10} />{commit.additions}
                                    </span>
                                  )}
                                  {commit.deletions > 0 && (
                                    <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
                                      <Minus size={10} />{commit.deletions}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Files changed */}
                            {(commit.files_changed || []).length > 0 && (
                              <div className="mt-2 pt-2 border-t">
                                <div className="space-y-0.5">
                                  {(commit.files_changed || []).map((file, fi) => (
                                    <div key={fi} className="text-xs text-muted-foreground font-mono truncate">
                                      {file}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Identity Selector Dialog */}
        <Dialog open={identityDialogOpen} onOpenChange={setIdentityDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User size={18} />
                Select Your Identities
              </DialogTitle>
              <DialogDescription>
                Choose which git identities belong to you. This affects heatmap, commits, and reports.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search authors..."
                value={identitySearch}
                onChange={e => setIdentitySearch(e.target.value)}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent pl-9 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="mt-3 max-h-[50vh] overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {gitAuthors
                  .filter(a => {
                    if (!identitySearch) return true;
                    const q = identitySearch.toLowerCase();
                    return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
                  })
                  .map((author, i) => {
                  const key = `${author.name}|${author.email}`;
                  const isSelected = selectedIdentities.has(key);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedIdentities(prev => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors border',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-[hsl(var(--border))] hover:border-primary/50'
                      )}
                    >
                      <span className="font-medium">{author.name}</span>
                      {author.email && <span className="text-xs opacity-70">({author.email})</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={async () => {
                  const identities = gitAuthors.filter(a => selectedIdentities.has(`${a.name}|${a.email}`));
                  await setMyIdentities(identities);
                  setIdentityDialogOpen(false);
                  cachedStatsData = null;
                  cachedHeatmapData = null;
                  fetchStats(true);
                  fetchHeatmap(true);
                }}
                disabled={selectedIdentities.size === 0}
              >
                Confirm ({selectedIdentities.size} selected)
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Git Repo List Sheet */}
        <Sheet open={activeSheet === 'repos'} onOpenChange={(open) => !open && setActiveSheet(null)}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <div className="flex items-center justify-between pr-6">
                <SheetTitle>
                  Git Repositories ({gitRepos.length})
                </SheetTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={loadGitRepos}
                  title="Refresh repo list"
                >
                  <RefreshCw size={14} />
                </Button>
              </div>
              <SheetDescription>
                Repositories found in your configured work paths
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              {sortedGitRepos.length === 0 ? (
                <p className="text-sm py-2 text-muted-foreground">
                  No git repositories found in configured work paths.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {sortedGitRepos.map((repo, i) => {
                    const hasCommits = commits.some(c => c.repo === repo.name);
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-xl text-sm border',
                          hasCommits
                            ? 'bg-primary/5 border-primary/30'
                            : 'bg-[var(--surface-hover)] border-[hsl(var(--border))]'
                        )}
                      >
                        <Folder size={14} className="text-muted-foreground flex-shrink-0" />
                        <span className={cn('font-medium truncate', hasCommits ? 'text-foreground' : 'text-foreground/70')}>
                          {repo.name}
                        </span>
                        {hasCommits && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0 flex-shrink-0">
                            <Activity size={10} className="mr-0.5" />
                            active
                          </Badge>
                        )}
                        <span className="text-xs truncate ml-auto flex-shrink-0 text-muted-foreground" title={repo.path}>
                          {repo.path.replace(/^\/Users\/[^/]+/, '~')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        </div>
      </div>
  );
}
