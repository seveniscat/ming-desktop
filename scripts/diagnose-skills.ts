/**
 * 诊断 Skill 文件夹结构
 * 使用方法: npx ts-node scripts/diagnose-skills.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'ming-desktop', 'db.sqlite3');
const skillsRoot = path.join(os.homedir(), 'Library', 'Application Support', 'ming-desktop', 'skills');

console.log('📋 Skill 文件夹诊断工具\n');
console.log('数据库路径:', dbPath);
console.log('Skills 根目录:', skillsRoot);
console.log('');

// 检查数据库
try {
  const db = new Database(dbPath, { readonly: true });
  
  const skills = db.prepare('SELECT id, name, folder_path, source_type FROM skills ORDER BY updated_at DESC').all() as any[];
  
  console.log(`📁 数据库中共有 ${skills.length} 个 skill\n`);
  
  for (const skill of skills) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Skill: ${skill.name}`);
    console.log(`ID: ${skill.id}`);
    console.log(`来源: ${skill.source_type || 'user'}`);
    console.log(`文件夹: ${skill.folder_path}`);
    
    // 检查文件夹是否存在
    if (!fs.existsSync(skill.folder_path)) {
      console.log(`❌ 文件夹不存在！`);
      console.log('');
      continue;
    }
    
    // 列出文件夹内容
    try {
      const entries = fs.readdirSync(skill.folder_path, { withFileTypes: true });
      const files: string[] = [];
      const dirs: string[] = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(entry.name);
        } else {
          files.push(entry.name);
        }
      }
      
      console.log(`✅ 文件夹存在`);
      console.log(`   文件 (${files.length}): ${files.join(', ') || '无'}`);
      if (dirs.length > 0) {
        console.log(`   文件夹 (${dirs.length}): ${dirs.join(', ')}`);
      }
      
      // 检查SKILL.md
      const skillMdPath = path.join(skill.folder_path, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const lines = content.split('\n').length;
        console.log(`   SKILL.md: ${lines} 行`);
      } else {
        console.log(`   ⚠️  SKILL.md 不存在！`);
      }
      
    } catch (error) {
      console.log(`❌ 读取文件夹失败:`, error);
    }
    
    console.log('');
  }
  
  db.close();
  
} catch (error) {
  console.error('❌ 诊断失败:', error);
  process.exit(1);
}

// 检查常见本地skill路径
console.log('\n🔍 检查常见本地 Skill 路径:\n');

const homeDir = os.homedir();
const checkPaths = [
  path.join(homeDir, '.codex', 'skills'),
  path.join(homeDir, '.agents', 'skills'),
  path.join(homeDir, '.codex', 'plugins', 'cache'),
];

for (const checkPath of checkPaths) {
  if (fs.existsSync(checkPath)) {
    console.log(`✅ ${checkPath}`);
    try {
      const entries = fs.readdirSync(checkPath, { withFileTypes: true });
      const skillDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      console.log(`   找到 ${skillDirs.length} 个文件夹: ${skillDirs.slice(0, 5).join(', ')}${skillDirs.length > 5 ? '...' : ''}`);
    } catch {
      console.log(`   ⚠️  无法读取`);
    }
  } else {
    console.log(`❌ ${checkPath} (不存在)`);
  }
}

console.log('\n✅ 诊断完成');
