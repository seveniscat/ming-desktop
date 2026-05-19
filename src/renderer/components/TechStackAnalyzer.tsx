import { useState, useCallback } from 'react';
import { PackageOpen, FolderSearch, Loader2, Upload, FileCode, Layers, Cpu, Wrench, Box, Layers3, Activity, Copy, Check, Eye, FileJson, Code, Palette } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface FrameworkDetection {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  version?: string;
  evidence: string[];
}

interface DetectedLibrary {
  name: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  source: 'package.json' | 'fingerprint-js' | 'fingerprint-css' | 'node_modules';
  version?: string;
}

interface AppAnalysisResult {
  appName: string;
  version?: string;
  bundleId?: string;
  frameworks: FrameworkDetection[];
  resources: { type: string; count: number };
  fileType: string;
  categorizedDependencies?: Record<string, string[]>;
  detectedLibraries?: DetectedLibrary[];
  plistInfo?: Record<string, any>;
  runtimeProcesses?: string[];
}

interface ProjectAnalysisResult {
  languages: { name: string; percentage: number }[];
  frameworks: string[];
  buildTools: string[];
  packageManagers: string[];
  dependencies: { manager: string; count: number };
  categorizedDependencies: Record<string, string[]>;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572a5', Rust: '#dea584',
  Go: '#00add8', Java: '#b07219', Swift: '#f05138', 'C++': '#f34b7d', 'C#': '#178600',
  Ruby: '#701516', PHP: '#4f5d95', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883',
  Svelte: '#ff3e00', Kotlin: '#a97bff', Dart: '#00b4ab', Shell: '#89e051',
};

function ConfidenceBadge({ level }: { level: string }) {
  const variant = level === 'high' ? 'default' : level === 'medium' ? 'secondary' : 'outline';
  const label = level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low';
  return <Badge variant={variant} className="text-xs">{label}</Badge>;
}

function SectionTitle({ icon: Icon, title }: { icon: any, title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={18} className="text-primary" />
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  );
}

const SOURCE_LABELS: Record<string, { label: string; icon: any }> = {
  'package.json': { label: 'pkg', icon: FileJson },
  'fingerprint-js': { label: 'JS', icon: Code },
  'fingerprint-css': { label: 'CSS', icon: Palette },
  'node_modules': { label: 'mod', icon: Box },
};

function SourceBadge({ source }: { source: string }) {
  const info = SOURCE_LABELS[source] || { label: source, icon: Eye };
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 font-mono">
      {info.label}
    </Badge>
  );
}

function generateAppMarkdown(result: AppAnalysisResult): string {
  let md = `# ${result.appName}`;
  if (result.version) md += ` v${result.version}`;
  md += '\n\n';

  if (result.bundleId) md += `- **Bundle ID**: ${result.bundleId}\n`;
  md += `- **File Type**: ${result.fileType}\n`;
  if (result.plistInfo) {
    if (result.plistInfo.category) md += `- **Category**: ${result.plistInfo.category}\n`;
    if (result.plistInfo.minOSVersion) md += `- **Min OS**: macOS ${result.plistInfo.minOSVersion}\n`;
    if (result.plistInfo.electronAsarIntegrity) md += `- **Electron Asar Integrity**: Enabled\n`;
  }
  md += '\n';

  if (result.frameworks.length > 0) {
    md += '## Detected Frameworks\n\n';
    result.frameworks.forEach(fw => {
      md += `- **${fw.name}**${fw.version ? ` ${fw.version}` : ''} (${fw.confidence})\n`;
      if (fw.evidence.length > 0) {
        md += `  - Evidence: ${fw.evidence.slice(0, 3).join(' · ')}\n`;
      }
    });
    md += '\n';
  }

  if (result.detectedLibraries && result.detectedLibraries.length > 0) {
    md += '## 技术栈详情\n\n';
    // Group by category
    const byCategory: Record<string, DetectedLibrary[]> = {};
    for (const lib of result.detectedLibraries) {
      if (!byCategory[lib.category]) byCategory[lib.category] = [];
      byCategory[lib.category].push(lib);
    }
    for (const [category, libs] of Object.entries(byCategory)) {
      md += `### ${category}\n\n`;
      for (const lib of libs) {
        md += `- **${lib.name}**${lib.version ? ` v${lib.version}` : ''} (${lib.confidence}, via ${lib.source})\n`;
      }
      md += '\n';
    }
  }

  if (result.resources.type) {
    md += '## Resources\n\n';
    md += `- Type: ${result.resources.type}\n`;
    md += `- Total files: ${result.resources.count}\n\n`;
  }

  if (result.runtimeProcesses && result.runtimeProcesses.length > 0) {
    md += '## Running Processes\n\n';
    result.runtimeProcesses.forEach(proc => md += `- \`${proc}\`\n`);
    md += '\n';
  }

  return md;
}

function generateProjectMarkdown(result: ProjectAnalysisResult): string {
  let md = '# Project Analysis Report\n\n';

  if (result.languages.length > 0) {
    md += '## Languages\n\n';
    result.languages.forEach(lang => {
      md += `- ${lang.name}: ${lang.percentage}%\n`;
    });
    md += '\n';
  }

  if (result.frameworks.length > 0) {
    md += '## Frameworks & Libraries\n\n';
    result.frameworks.forEach(fw => md += `- ${fw}\n`);
    md += '\n';
  }

  if (result.buildTools.length > 0) {
    md += '## Build Tools\n\n';
    result.buildTools.forEach(tool => md += `- ${tool}\n`);
    md += '\n';
  }

  if (result.packageManagers.length > 0 || result.dependencies.count > 0) {
    md += '## Dependencies\n\n';
    if (result.packageManagers.length > 0) {
      md += `- **Package Manager**: ${result.packageManagers.join(', ')}\n`;
    }
    if (result.dependencies.count > 0) {
      md += `- **Dependencies**: ${result.dependencies.count}`;
      if (result.dependencies.manager) md += ` via ${result.dependencies.manager}`;
      md += '\n';
    }
    md += '\n';
  }

  if (Object.keys(result.categorizedDependencies).length > 0) {
    md += '## 技术栈分类\n\n';
    Object.entries(result.categorizedDependencies).forEach(([category, deps]) => {
      md += `### ${category}\n\n`;
      deps.forEach(dep => md += `- ${dep}\n`);
      md += '\n';
    });
  }

  return md;
}

function AppResult({ result }: { result: AppAnalysisResult }) {
  const [copied, setCopied] = useState(false);
  const [detailCategory, setDetailCategory] = useState<string | null>(null);

  const handleCopy = async () => {
    const md = generateAppMarkdown(result);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Group detected libraries by category for detail view
  const libsByCategory: Record<string, DetectedLibrary[]> = {};
  if (result.detectedLibraries) {
    for (const lib of result.detectedLibraries) {
      if (!libsByCategory[lib.category]) libsByCategory[lib.category] = [];
      libsByCategory[lib.category].push(lib);
    }
  }

  const detailLibs = detailCategory ? (libsByCategory[detailCategory] || []) : [];
  const detailDeps = detailCategory ? (result.categorizedDependencies?.[detailCategory] || []) : [];

  return (
    <div className="space-y-6">
      {/* Header with Copy Button */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <PackageOpen size={24} className="text-primary" />
            {result.appName}
          </h2>
          {result.version && (
            <p className="text-lg text-muted-foreground mt-1">Version {result.version}</p>
          )}
        </div>
        <Button
          onClick={handleCopy}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy Report'}
        </Button>
      </div>

      {/* App Info */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        {result.bundleId && (
          <div className="text-sm">
            <span className="text-muted-foreground">Bundle ID:</span> {result.bundleId}
          </div>
        )}
        <div className="text-sm">
          <span className="text-muted-foreground">File Type:</span> {result.fileType}
        </div>
        {result.plistInfo && Object.keys(result.plistInfo).length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1.5">
            {result.plistInfo.category && (
              <div className="text-sm"><span className="text-muted-foreground">Category:</span> {result.plistInfo.category}</div>
            )}
            {result.plistInfo.minOSVersion && (
              <div className="text-sm"><span className="text-muted-foreground">Min OS:</span> macOS {result.plistInfo.minOSVersion}</div>
            )}
            {result.plistInfo.electronAsarIntegrity && (
              <div className="text-sm text-muted-foreground">Electron Asar Integrity: Enabled</div>
            )}
          </div>
        )}
      </div>

      {/* Frameworks */}
      {result.frameworks.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={Layers} title="Detected Frameworks" />
          <div className="rounded-lg border bg-card p-4 space-y-3">
            {result.frameworks.map((fw, i) => (
              <div key={i} className="flex items-start justify-between p-3 rounded-md bg-muted/30">
                <div className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {fw.name}
                    {fw.version && <span className="text-xs text-muted-foreground">{fw.version}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5">
                    {fw.evidence.slice(0, 3).join(' · ')}
                  </div>
                </div>
                <ConfidenceBadge level={fw.confidence} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resources */}
      {result.resources.type && (
        <div className="space-y-3">
          <SectionTitle icon={FileCode} title="Resources" />
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm">{result.resources.type}</div>
            <div className="text-xs text-muted-foreground mt-1">{result.resources.count} total files</div>
          </div>
        </div>
      )}

      {/* Categorized Dependencies */}
      {result.categorizedDependencies && Object.keys(result.categorizedDependencies).length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={Layers3} title="技术栈分类" />
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(result.categorizedDependencies).map(([category, deps]) => (
              <div key={category} className="space-y-2 rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-foreground">{category}</div>
                  <button
                    type="button"
                    onClick={() => setDetailCategory(category)}
                    className="text-xs text-primary hover:underline"
                  >
                    查看详情
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {deps.slice(0, 5).map(dep => (
                    <Badge key={dep} variant="outline" className="text-xs">{dep}</Badge>
                  ))}
                  {deps.length > 5 && (
                    <Badge variant="secondary" className="text-xs">+{deps.length - 5} more</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Runtime Processes */}
      {result.runtimeProcesses && result.runtimeProcesses.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={Activity} title="Running Processes" />
          <div className="rounded-lg border bg-card p-4 space-y-1.5">
            {result.runtimeProcesses.slice(0, 3).map((proc, i) => (
              <div key={i} className="text-xs font-mono text-muted-foreground truncate">{proc}</div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailCategory} onOpenChange={(open) => { if (!open) setDetailCategory(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{detailCategory}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {detailLibs.length > 0 && (
              <div className="rounded-lg border bg-card p-4 space-y-1 mb-4">
                {detailLibs.map(lib => (
                  <div key={lib.name} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30 text-sm">
                    <span className="font-medium flex-1">{lib.name}</span>
                    {lib.version && (
                      <span className="text-xs text-muted-foreground font-mono">{lib.version}</span>
                    )}
                    <SourceBadge source={lib.source} />
                    <ConfidenceBadge level={lib.confidence} />
                  </div>
                ))}
              </div>
            )}
            {detailDeps.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap gap-1.5">
                  {detailDeps.map(dep => (
                    <Badge key={dep} variant="outline" className="text-xs">{dep}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectResult({ result }: { result: ProjectAnalysisResult }) {
  const [copied, setCopied] = useState(false);
  const [detailCategory, setDetailCategory] = useState<string | null>(null);

  const handleCopy = async () => {
    const md = generateProjectMarkdown(result);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const detailDeps = detailCategory ? (result.categorizedDependencies[detailCategory] || []) : [];

  return (
    <div className="space-y-6">
      {/* Header with Copy Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FileCode size={24} className="text-primary" />
          Project Analysis Report
        </h2>
        <Button
          onClick={handleCopy}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy Report'}
        </Button>
      </div>

      {/* Languages */}
      <div className="space-y-3">
        <SectionTitle icon={FileCode} title="Languages" />
        <div className="rounded-lg border bg-card p-4 space-y-3">
          {/* Bar chart */}
          <div className="flex rounded-full overflow-hidden h-3 bg-muted">
            {result.languages.map((lang) => (
              <div
                key={lang.name}
                style={{
                  width: `${lang.percentage}%`,
                  backgroundColor: LANG_COLORS[lang.name] || '#8b8b8b',
                }}
                title={`${lang.name}: ${lang.percentage}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {result.languages.map(lang => (
              <div key={lang.name} className="flex items-center gap-1.5 text-sm">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LANG_COLORS[lang.name] || '#8b8b8b' }} />
                <span>{lang.name}</span>
                <span className="text-muted-foreground">{lang.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Frameworks */}
      {result.frameworks.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={Cpu} title="Frameworks & Libraries" />
          <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap gap-2">
              {result.frameworks.map(fw => (
                <Badge key={fw} variant="secondary" className="text-sm">{fw}</Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Build Tools */}
      {result.buildTools.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={Wrench} title="Build Tools" />
          <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap gap-2">
              {result.buildTools.map(tool => (
                <Badge key={tool} variant="outline" className="text-sm">{tool}</Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Package Managers & Dependencies */}
      {(result.packageManagers.length > 0 || result.dependencies.count > 0) && (
        <div className="space-y-3">
          <SectionTitle icon={Box} title="Dependencies" />
          <div className="rounded-lg border bg-card p-4 space-y-3">
            {result.packageManagers.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Package Manager:</span>
                <div className="flex gap-1">
                  {result.packageManagers.map(pm => (
                    <Badge key={pm} variant="secondary">{pm}</Badge>
                  ))}
                </div>
              </div>
            )}
            {result.dependencies.count > 0 && (
              <div className="text-sm">
                <span className="text-muted-foreground">Dependencies:</span>{' '}
                <span className="font-medium">{result.dependencies.count}</span>
                {result.dependencies.manager && (
                  <span className="text-muted-foreground"> via {result.dependencies.manager}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Categorized Dependencies */}
      {Object.keys(result.categorizedDependencies).length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={Layers3} title="技术栈分类" />
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(result.categorizedDependencies).map(([category, deps]) => (
              <div key={category} className="space-y-2 rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-foreground">{category}</div>
                  <button
                    type="button"
                    onClick={() => setDetailCategory(category)}
                    className="text-xs text-primary hover:underline"
                  >
                    查看详情
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {deps.slice(0, 5).map(dep => (
                    <Badge key={dep} variant="outline" className="text-xs">{dep}</Badge>
                  ))}
                  {deps.length > 5 && (
                    <Badge variant="secondary" className="text-xs">+{deps.length - 5} more</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailCategory} onOpenChange={(open) => { if (!open) setDetailCategory(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{detailCategory}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap gap-1.5">
                {detailDeps.map(dep => (
                  <Badge key={dep} variant="outline" className="text-xs">{dep}</Badge>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TechStackAnalyzer() {
  const [activeTab, setActiveTab] = useState('app');
  const [loading, setLoading] = useState(false);
  const [appResult, setAppResult] = useState<AppAnalysisResult | null>(null);
  const [projectResult, setProjectResult] = useState<ProjectAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const analyzeApp = useCallback(async (filePath: string) => {
    setLoading(true);
    setError(null);
    setAppResult(null);
    try {
      const result = await window.electronAPI.techStack.analyzeApp(filePath);
      setAppResult(result);
    } catch (err: any) {
      setError(err.message || '分析失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeProject = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    setProjectResult(null);
    try {
      const result = await window.electronAPI.techStack.analyzeProject(dirPath);
      setProjectResult(result);
    } catch (err: any) {
      setError(err.message || '分析失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenApp = async () => {
    const result = await window.electronAPI.dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Applications', extensions: ['app', 'dmg', 'exe'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!result.canceled && result.filePaths[0]) {
      analyzeApp(result.filePaths[0]);
    }
  };

  const handleOpenProject = async () => {
    const result = await window.electronAPI.dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths[0]) {
      analyzeProject(result.filePaths[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && activeTab === 'app') {
      // In Electron, we need the file path
      const filePath = (file as any).path;
      if (filePath) analyzeApp(filePath);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-1 text-foreground">TechStack Analyzer</h1>
        <p className="text-muted-foreground mb-6">分析安装包或项目的技术栈</p>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="app" className="gap-2">
              <PackageOpen size={16} />
              安装包分析
            </TabsTrigger>
            <TabsTrigger value="project" className="gap-2">
              <FolderSearch size={16} />
              项目分析
            </TabsTrigger>
          </TabsList>

          <TabsContent value="app">
            <div
              className={`border-2 border-dashed rounded-lg transition-colors cursor-pointer ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={handleOpenApp}
            >
              <div className="py-16 flex flex-col items-center gap-4">
                {loading ? (
                  <>
                    <Loader2 size={40} className="text-primary animate-spin" />
                    <p className="text-muted-foreground">分析中...</p>
                  </>
                ) : (
                  <>
                    <Upload size={40} className="text-muted-foreground" />
                    <div className="text-center">
                      <p className="font-medium">拖入安装包或点击选择</p>
                      <p className="text-sm text-muted-foreground mt-1">支持 .dmg, .app, .exe</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
            )}

            {appResult && <div className="mt-8"><AppResult result={appResult} /></div>}
          </TabsContent>

          <TabsContent value="project">
            <div
              className="border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors cursor-pointer rounded-lg"
              onClick={handleOpenProject}
            >
              <div className="py-16 flex flex-col items-center gap-4">
                {loading ? (
                  <>
                    <Loader2 size={40} className="text-primary animate-spin" />
                    <p className="text-muted-foreground">分析中...</p>
                  </>
                ) : (
                  <>
                    <FolderSearch size={40} className="text-muted-foreground" />
                    <div className="text-center">
                      <p className="font-medium">点击选择项目文件夹</p>
                      <p className="text-sm text-muted-foreground mt-1">自动检测 package.json, Cargo.toml, go.mod 等</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
            )}

            {projectResult && <div className="mt-8"><ProjectResult result={projectResult} /></div>}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
