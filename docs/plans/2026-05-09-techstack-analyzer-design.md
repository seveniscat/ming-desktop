# TechStack Analyzer Design

## Overview

A new feature that analyzes technology stacks from two sources: DMG/App installation packages and local project folders.

## UI

Single page with top tab switcher:
- Tab 1: "安装包分析" — drag-drop zone for .dmg/.app/.exe files
- Tab 2: "项目分析" — folder picker button

Results display: framework type, version, detected resources, language composition.

## DMG/App Detection Logic (Main Process)

File system analysis of the app bundle:
- **Electron**: `Contents/Frameworks/Electron Framework.framework` or `Resources/app.asar`
- **Tauri**: `Contents/Frameworks/WebView2.framework` or `Resources/_updater/`
- **React Native**: `Contents/Resources/*.jsbundle`
- **Flutter**: `Contents/Frameworks/App.framework/Flutter`
- **Qt**: `Contents/Frameworks/QtCore.framework`
- **SwiftUI/AppKit**: Info.plist `NSMainNibFile` or absence of above frameworks

DMG workflow: mount to temp dir → analyze .app → unmount.

## Project Analysis Logic (Main Process)

Scan directory for config files:
- `package.json` → npm deps, scripts, engines
- `Cargo.toml` → Rust deps
- `pyproject.toml` / `requirements.txt` → Python deps
- `go.mod` → Go deps
- `pom.xml` / `build.gradle` → Java deps
- `.csproj` / `*.sln` → .NET
- `Gemfile` → Ruby deps

## Architecture

- New IPC channels: `analyze:app`, `analyze:project`
- New sidebar tab with icon
- New component: `TechStackAnalyzer.tsx`
- Main process handlers in existing `main.ts`
