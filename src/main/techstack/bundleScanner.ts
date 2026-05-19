import * as fs from 'fs';
import * as path from 'path';
import { JS_FINGERPRINTS, CSS_FINGERPRINTS, type BundleFingerprint, type CSSFingerprint } from './fingerprints';

export interface DetectedLibrary {
  name: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  source: 'package.json' | 'fingerprint-js' | 'fingerprint-css' | 'node_modules';
  version?: string;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024;       // skip files > 2MB
const SAMPLE_SIZE = 500 * 1024;               // for large files, read first 500KB
const MAX_TOTAL_SCAN = 15 * 1024 * 1024;      // total scan budget across all files

/**
 * Scan an asar archive or Resources directory for JS/CSS bundle fingerprints.
 * Works because Electron's fs module natively supports asar reads.
 */
export function scanBundles(asarOrResourcesPath: string, isAsar: boolean): DetectedLibrary[] {
  const detected = new Map<string, DetectedLibrary>();

  // Phase 1: package.json extraction (most accurate)
  if (isAsar) {
    extractPackageJsonDeps(asarOrResourcesPath, detected);
    scanNodeModules(asarOrResourcesPath, detected);
  }

  // Phase 2: JS fingerprint scanning
  const jsFiles = isAsar ? listAsarFiles(asarOrResourcesPath, '.js') : listDirFiles(asarOrResourcesPath, '.js');
  scanJSFiles(jsFiles, detected);

  // Phase 3: CSS fingerprint scanning
  const cssFiles = isAsar ? listAsarFiles(asarOrResourcesPath, '.css') : listDirFiles(asarOrResourcesPath, '.css');
  scanCSSFiles(cssFiles, detected);

  // Deduplicate: if fingerprint found something already detected via package.json, keep the more confident source
  return Array.from(detected.values());
}

function addDetection(map: Map<string, DetectedLibrary>, lib: DetectedLibrary) {
  const existing = map.get(lib.name);
  if (!existing) {
    map.set(lib.name, lib);
    return;
  }
  // Upgrade confidence if new evidence is stronger
  const sourceRank = { 'package.json': 4, 'node_modules': 3, 'fingerprint-js': 2, 'fingerprint-css': 1 };
  if ((sourceRank[lib.source] || 0) > (sourceRank[existing.source] || 0)) {
    map.set(lib.name, { ...existing, ...lib, evidence: [...new Set([...existing.evidence, ...lib.evidence])] });
  } else {
    existing.evidence = [...new Set([...existing.evidence, ...lib.evidence])];
    if (lib.version && !existing.version) existing.version = lib.version;
  }
}

// ── Phase 1: package.json ──

function extractPackageJsonDeps(asarPath: string, detected: Map<string, DetectedLibrary>) {
  const rootPkgPath = path.join(asarPath, 'package.json');
  if (!fs.existsSync(rootPkgPath)) return;

  try {
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(allDeps)) {
      const category = findCategory(name);
      addDetection(detected, {
        name,
        category,
        confidence: 'high',
        evidence: [`package.json: ${version}`],
        source: 'package.json',
        version: cleanVersion(version as string),
      });
    }
  } catch { /* skip */ }
}

function scanNodeModules(asarPath: string, detected: Map<string, DetectedLibrary>) {
  const nmPath = path.join(asarPath, 'node_modules');
  if (!fs.existsSync(nmPath)) return;

  try {
    const entries = fs.readdirSync(nmPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      if (entry.name.startsWith('@')) {
        // Scoped packages: @scope/name
        try {
          const scopeDir = path.join(nmPath, entry.name);
          for (const sub of fs.readdirSync(scopeDir)) {
            const pkgJson = path.join(scopeDir, sub, 'package.json');
            if (fs.existsSync(pkgJson)) {
              readNmPackageJson(pkgJson, detected);
            }
          }
        } catch { /* skip */ }
      } else {
        const pkgJson = path.join(nmPath, entry.name, 'package.json');
        if (fs.existsSync(pkgJson)) {
          readNmPackageJson(pkgJson, detected);
        }
      }
    }
  } catch { /* skip */ }
}

function readNmPackageJson(pkgJsonPath: string, detected: Map<string, DetectedLibrary>) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    if (!pkg.name) return;
    const category = findCategory(pkg.name);
    addDetection(detected, {
      name: pkg.name,
      category,
      confidence: 'high',
      evidence: [`node_modules/${pkg.name}/package.json`],
      source: 'node_modules',
      version: pkg.version,
    });
  } catch { /* skip */ }
}

// ── Phase 2: JS fingerprint scanning ──

function scanJSFiles(files: string[], detected: Map<string, DetectedLibrary>) {
  let totalScanned = 0;

  for (const filePath of files) {
    if (totalScanned >= MAX_TOTAL_SCAN) break;

    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      if (fileSize === 0) continue;

      const readSize = Math.min(fileSize, MAX_FILE_SIZE);
      if (readSize < fileSize && readSize < SAMPLE_SIZE) continue; // too small sample for very large file

      const content = fs.readFileSync(filePath, { encoding: 'utf-8', length: readSize }) as string;

      for (const fp of JS_FINGERPRINTS) {
        if (detected.has(fp.name)) continue; // already found

        const matchedPatterns = fp.patterns.filter(p => content.includes(p));
        if (matchedPatterns.length === 0) continue;

        const version = fp.versionPattern
          ? extractVersion(content, fp.versionPattern)
          : extractVersionFromComment(content, fp.name);

        addDetection(detected, {
          name: fp.name,
          category: fp.category,
          confidence: matchedPatterns.length >= 2 ? 'high' : 'medium',
          evidence: matchedPatterns.slice(0, 3),
          source: 'fingerprint-js',
          version,
        });
      }

      totalScanned += readSize;
    } catch { /* skip unreadable files */ }
  }
}

// ── Phase 3: CSS fingerprint scanning ──

function scanCSSFiles(files: string[], detected: Map<string, DetectedLibrary>) {
  for (const filePath of files) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size === 0 || stat.size > MAX_FILE_SIZE) continue;

      const content = fs.readFileSync(filePath, 'utf-8');

      for (const fp of CSS_FINGERPRINTS) {
        if (detected.has(fp.name)) continue;

        const matchedPatterns = fp.patterns.filter(p => content.includes(p));
        if (matchedPatterns.length === 0) continue;

        addDetection(detected, {
          name: fp.name,
          category: fp.category,
          confidence: matchedPatterns.length >= 2 ? 'high' : 'low',
          evidence: matchedPatterns.slice(0, 3),
          source: 'fingerprint-css',
        });
      }
    } catch { /* skip */ }
  }
}

// ── File listing helpers ──

function listAsarFiles(asarPath: string, ext: string): string[] {
  const files: string[] = [];
  try {
    collectFiles(asarPath, ext, files, 0);
  } catch { /* skip */ }
  return files;
}

function listDirFiles(dir: string, ext: string): string[] {
  const files: string[] = [];
  try {
    collectDirFiles(dir, ext, files, 0);
  } catch { /* skip */ }
  return files;
}

function collectFiles(base: string, ext: string, out: string[], depth: number) {
  if (depth > 8) return; // prevent excessive recursion
  try {
    const entries = fs.readdirSync(base, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= 200) return; // cap file count
      const full = path.join(base, entry.name);
      if (entry.isDirectory()) {
        // Skip large/uninteresting directories within asar
        if (['.cache', '.git'].includes(entry.name)) continue;
        collectFiles(full, ext, out, depth + 1);
      } else if (entry.name.endsWith(ext) && !entry.name.endsWith('.map')) {
        out.push(full);
      }
    }
  } catch { /* skip */ }
}

function collectDirFiles(dir: string, ext: string, out: string[], depth: number) {
  if (depth > 5) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= 200) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        collectDirFiles(full, ext, out, depth + 1);
      } else if (entry.name.endsWith(ext) && !entry.name.endsWith('.map')) {
        out.push(full);
      }
    }
  } catch { /* skip */ }
}

// ── Version extraction helpers ──

function extractVersion(content: string, pattern: string): string | undefined {
  try {
    const match = content.match(new RegExp(pattern));
    return match?.[1];
  } catch { return undefined; }
}

function extractVersionFromComment(content: string, libName: string): string | undefined {
  // Common patterns: "react.production.min.js" → no version, but look for "version":"x.y.z"
  const patterns = [
    new RegExp(`(?:${escapeRegex(libName)})[/.](\\d+\\.\\d+\\.\\d+)`),
    new RegExp(`["']version["']\\s*:\\s*["'](\\d+\\.\\d+\\.\\d+)["']`),
  ];
  for (const p of patterns) {
    const m = content.match(p);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanVersion(v: string): string {
  // Strip semver range prefixes like ^, ~, >=
  return v.replace(/^[\^~>=<\s]+/, '').split(' ').pop() || v;
}

// ── Category lookup ──

const CATEGORY_MAP: Record<string, string> = {};
for (const fp of JS_FINGERPRINTS) {
  CATEGORY_MAP[fp.name] = fp.category;
}

function findCategory(pkgName: string): string {
  // Exact match
  if (CATEGORY_MAP[pkgName]) return CATEGORY_MAP[pkgName];
  // Scoped package: @radix-ui/react-dialog → check @radix-ui
  if (pkgName.startsWith('@')) {
    const scope = pkgName.split('/')[0];
    if (CATEGORY_MAP[scope]) return CATEGORY_MAP[scope];
  }
  // Prefix match
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (pkgName.startsWith(key + '-') || pkgName.startsWith(key + '/')) return cat;
  }
  return '其他';
}
