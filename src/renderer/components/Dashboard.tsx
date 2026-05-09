import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar as CalendarIcon, GitBranch, FileText, TrendingUp, Play, RefreshCw, Folder, Activity, User, Plus, Minus, Copy, Check, Clock, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';

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

interface DailyReportRecord {
  id: number;
  title: string;
  content: string;
  time_range: string;
  commits_count: number;
  repos_count: number;
  created_at: string;
}

interface DashboardProps {
  onNavigate?: (tab: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
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
  const [activeSheet, setActiveSheet] = useState<'commits' | 'repos' | 'report' | 'report-history' | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);
  const [dailyReporterAgentId, setDailyReporterAgentId] = useState<string | null>(null);
  const [gitUser, setGitUser] = useState({ name: '', email: '' });
  const [reportHistory, setReportHistory] = useState<DailyReportRecord[]>([]);
  const [selectedReport, setSelectedReport] = useState<DailyReportRecord | null>(null);

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

  const loadReportHistory = useCallback(async () => {
    try {
      const reports = await window.electronAPI.dailyReport.list();
      setReportHistory(reports || []);
    } catch {
      setReportHistory([]);
    }
  }, []);

  useEffect(() => {
    loadWorkPaths();
    window.electronAPI.git.getUser().then(setGitUser).catch(() => {});
    loadReportHistory();
  }, [loadWorkPaths, loadReportHistory]);

  // Find Daily Reporter agent on mount
  useEffect(() => {
    window.electronAPI.agents.list().then(agents => {
      const reporter = agents.find((a: any) => a.name === 'Daily Reporter');
      if (reporter) setDailyReporterAgentId(reporter.id);
    });
  }, []);

  useEffect(() => {
    if (workPaths.length > 0) {
      loadGitRepos();
    } else {
      setGitRepos([]);
    }
  }, [workPaths, loadGitRepos]);

  const buildReportParams = useCallback(() => {
    const params: any = {
      timeRange: timeRange === 'custom' ? 'today' : timeRange,
      includeAllBranches: true,
      author: 'zhangbing',
    };
    if (timeRange === 'custom') {
      if (customSince) params.sinceDate = format(customSince, 'yyyy-MM-dd');
      if (customUntil) params.untilDate = format(customUntil, 'yyyy-MM-dd');
    }
    return params;
  }, [timeRange, customSince, customUntil]);

  const fetchStats = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const params = buildReportParams();
      const result = await window.electronAPI.dailyReport.fetch(params);

      const commitList = result.commits || [];
      setCommits(commitList);

      // Calculate stats
      const reposWithCommits = new Set(commitList.map((c: CommitInfo) => c.repo));
      setStats({
        totalCommits: commitList.length,
        totalRepos: reposWithCommits.size,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setCommits([]);
      setStats({ totalCommits: 0, totalRepos: 0 });
    } finally {
      setIsRefreshing(false);
    }
  }, [buildReportParams]);

  useEffect(() => {
    if (workPaths.length > 0) {
      fetchStats();
    }
  }, [workPaths, fetchStats]);

  const handleGenerateReport = async () => {
    // Refresh commit stats first (for the stats cards)
    await fetchStats();

    if (!dailyReporterAgentId) {
      console.error('Daily Reporter agent not found');
      return;
    }

    setIsGenerating(true);
    setReportContent('');
    setActiveSheet('report');

    try {
      // Create a conversation for this report
      const conv = await window.electronAPI.conversations.create();

      // Build user message with time range context
      const timeRangeLabels: Record<string, string> = {
        today: '今天',
        yesterday: '昨天',
        day_before_yesterday: '前天',
        week: '本周',
      };
      let rangeLabel = timeRangeLabels[timeRange] || timeRange;
      if (timeRange === 'custom') {
        const parts = [];
        if (customSince) parts.push(format(customSince, 'yyyy-MM-dd'));
        if (customUntil) parts.push(`至 ${format(customUntil, 'yyyy-MM-dd')}`);
        rangeLabel = parts.join(' ') || '自定义范围';
      }
      const userMessage = `请生成工作日报，时间范围：${rangeLabel}`;

      // Set up stream listeners
      const unsubChunk = window.electronAPI.conversations.onStreamChunk((data) => {
        if (data.conversationId === conv.id) {
          setReportContent(prev => prev + data.content);
        }
      });
      const unsubEnd = window.electronAPI.conversations.onStreamEnd(async (data) => {
        unsubChunk();
        unsubEnd();
        unsubError();
        setIsGenerating(false);

        // Save the report to history
        const fullContent = data?.fullContent || reportContent;
        if (fullContent) {
          const title = `${rangeLabel}工作日报 - ${format(new Date(), 'yyyy-MM-dd')}`;
          try {
            await window.electronAPI.dailyReport.save({
              title,
              content: fullContent,
              timeRange,
              commitsCount: stats.totalCommits,
              reposCount: stats.totalRepos,
            });
            loadReportHistory();
          } catch (e) {
            console.error('Failed to save report:', e);
          }
        }
      });
      const unsubError = window.electronAPI.conversations.onStreamError((data) => {
        unsubChunk();
        unsubEnd();
        unsubError();
        console.error('Report generation error:', data.error);
        setIsGenerating(false);
      });

      // Fire the chat — agent will call daily-report tool and format the response
      window.electronAPI.conversations.chat(conv.id, dailyReporterAgentId, userMessage);
    } catch (error) {
      console.error('Failed to generate report:', error);
      setIsGenerating(false);
    }
  };

  const handleDeleteReport = async (id: number) => {
    try {
      await window.electronAPI.dailyReport.delete(id);
      setReportHistory(prev => prev.filter(r => r.id !== id));
      if (selectedReport?.id === id) {
        setSelectedReport(null);
      }
    } catch (e) {
      console.error('Failed to delete report:', e);
    }
  };

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

  const copyToClipboard = useCallback(async (text: string, hash?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (hash) {
        setCopiedHash(hash);
        setTimeout(() => setCopiedHash(null), 2000);
      } else {
        setCopiedReport(true);
        setTimeout(() => setCopiedReport(false), 2000);
      }
    } catch {
      // silently fail
    }
  }, []);

  const timeRangeLabels: Record<string, string> = {
    today: '今天',
    yesterday: '昨天',
    day_before_yesterday: '前天',
    week: '本周',
    custom: '自定义',
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">WorkGround</h1>
          </div>
          <div className="flex items-center gap-2">
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
                      className={cn('h-8 gap-1 text-xs', !customSince && 'text-muted-foreground')}
                    >
                      <CalendarIcon size={14} />
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
                      className={cn('h-8 gap-1 text-xs', !customUntil && 'text-muted-foreground')}
                    >
                      <CalendarIcon size={14} />
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => fetchStats()}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* User Info Card - First */}
        {gitUser.name && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-violet-500/10">
                  <User size={28} className="text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-bold text-foreground truncate">{gitUser.name}</div>
                  <div className="text-sm text-muted-foreground truncate">{gitUser.email}</div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">{stats.totalCommits}</div>
                    <div>Commits</div>
                  </div>
                  <Separator orientation="vertical" className="h-10" />
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">{gitRepos.length}</div>
                    <div>Repos</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Work Paths Info */}
        {workPaths.length > 0 && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium text-secondary-foreground">
                  Work Paths ({workPaths.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {workPaths.map((p, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {p}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {workPaths.length === 0 && (
          <Card className="mb-6 border-yellow-500">
            <CardContent className="pt-6">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                未配置工作目录，请在 Settings 中添加 Work Paths 以启用统计功能
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
              <div className="text-sm text-muted-foreground">Commits</div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer select-none hover:border-emerald-500/50 transition-colors"
            onClick={() => setActiveSheet('repos')}
            title="Click to view repository list"
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-emerald-500/10">
                  <FileText size={24} className="text-emerald-500" />
                </div>
                <span className="text-sm text-muted-foreground">{stats.totalRepos} active</span>
              </div>
              <div className="text-3xl font-bold mb-1 text-foreground">{gitRepos.length}</div>
              <div className="text-sm text-muted-foreground">Git Repositories</div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer select-none hover:border-amber-500/50 transition-colors"
            onClick={() => setActiveSheet('report-history')}
            title="Click to view report history"
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-amber-500/10">
                  <Clock size={24} className="text-amber-500" />
                </div>
                <span className="text-sm text-muted-foreground">{reportHistory.length} total</span>
              </div>
              <div className="text-3xl font-bold mb-1 text-foreground">{reportHistory.length}</div>
              <div className="text-sm text-muted-foreground">Daily Reports</div>
            </CardContent>
          </Card>
        </div>

        {/* Daily Report Sheet */}
        <Sheet open={activeSheet === 'report'} onOpenChange={(open) => !open && setActiveSheet(null)}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <div className="flex items-center justify-between pr-6">
                <SheetTitle className="flex items-center gap-2">
                  <FileText size={18} />
                  工作日报
                </SheetTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(reportContent)}
                  >
                    {copiedReport ? <Check size={14} /> : <Copy size={14} />}
                    {copiedReport ? '已复制' : '复制'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateReport}
                    disabled={isGenerating}
                  >
                    <Play size={14} />
                    {isGenerating ? '生成中...' : '重新生成'}
                  </Button>
                </div>
              </div>
              <SheetDescription>
                {format(new Date(), 'yyyy年MM月dd日')}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 prose prose-sm dark:prose-invert max-w-none">
              {reportContent ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {reportContent}
                </ReactMarkdown>
              ) : (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  暂无日报内容，点击「重新生成」
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Report History Sheet */}
        <Sheet open={activeSheet === 'report-history'} onOpenChange={(open) => { if (!open) { setActiveSheet(null); setSelectedReport(null); } }}>
          <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Clock size={18} />
                日报记录 ({reportHistory.length})
              </SheetTitle>
              <SheetDescription>
                查看和管理已生成的工作日报
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              {selectedReport ? (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mb-4"
                    onClick={() => setSelectedReport(null)}
                  >
                    ← 返回列表
                  </Button>
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold">{selectedReport.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span>{format(new Date(selectedReport.created_at), 'yyyy-MM-dd HH:mm')}</span>
                      <Badge variant="secondary" className="text-[10px]">{timeRangeLabels[selectedReport.time_range] || selectedReport.time_range}</Badge>
                      <span>{selectedReport.commits_count} commits</span>
                      <span>{selectedReport.repos_count} repos</span>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedReport.content}
                    </ReactMarkdown>
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(selectedReport.content)}
                    >
                      {copiedReport ? <Check size={14} /> : <Copy size={14} />}
                      {copiedReport ? '已复制' : '复制内容'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteReport(selectedReport.id)}
                    >
                      <Trash2 size={14} />
                      删除
                    </Button>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-200px)]">
                  {reportHistory.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">
                      暂无日报记录，点击「Generate」生成第一份日报
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {reportHistory.map((report) => (
                        <div
                          key={report.id}
                          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer group"
                          onClick={() => setSelectedReport(report)}
                        >
                          <div className="p-2 rounded-lg bg-amber-500/10">
                            <FileText size={16} className="text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{report.title}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span>{format(new Date(report.created_at), 'MM-dd HH:mm')}</span>
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-3.5">
                                {timeRangeLabels[report.time_range] || report.time_range}
                              </Badge>
                              <span>{report.commits_count} commits</span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.id); }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>
          </SheetContent>
        </Sheet>

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
                <Button
                  onClick={handleGenerateReport}
                  disabled={isGenerating}
                  size="sm"
                >
                  <Play size={14} />
                  {isGenerating ? 'Generating...' : 'Regenerate'}
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
                          'flex items-center gap-2 p-2.5 rounded-lg text-sm border',
                          hasCommits
                            ? 'bg-primary/5 border-primary/30'
                            : 'bg-input border-border'
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

        {/* Daily Report Generator */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent">
                  <TrendingUp size={20} className="text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Daily Report Generator</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Generate work reports from Git commits</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setActiveSheet('report-history')}
                >
                  <Clock size={16} />
                  日报列表
                </Button>
                {reportContent && (
                  <Button
                    variant="outline"
                    onClick={() => setActiveSheet('report')}
                  >
                    <FileText size={16} />
                    查看日报
                  </Button>
                )}
                <Button
                  onClick={handleGenerateReport}
                  disabled={isGenerating}
                >
                  <Play size={18} />
                  {isGenerating ? 'Generating...' : 'Generate'}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
