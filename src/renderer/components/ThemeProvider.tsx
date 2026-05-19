import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';
import { themePresets, defaultThemeName, applyThemePreset, type ThemePreset } from '@/lib/themes';

interface ColorThemeContextType {
  colorTheme: string;
  setColorTheme: (name: string) => void;
  colorPresets: ThemePreset[];
}

const ColorThemeContext = createContext<ColorThemeContextType>({
  colorTheme: defaultThemeName,
  setColorTheme: () => {},
  colorPresets: themePresets,
});

function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useNextTheme();
  const [colorTheme, setColorThemeState] = useState(defaultThemeName);

  const setColorTheme = useCallback((name: string) => {
    setColorThemeState(name);
    const preset = themePresets.find(p => p.name === name) || themePresets[0];
    const resolved = (resolvedTheme === 'light' ? 'light' : 'dark') as 'light' | 'dark';
    applyThemePreset(preset, resolved);
    window.electronAPI?.config.set('colorTheme', name);
  }, [resolvedTheme]);

  // Load saved color theme on mount
  useEffect(() => {
    const load = async () => {
      const saved = await window.electronAPI?.config.get('colorTheme');
      const name = saved || defaultThemeName;
      setColorThemeState(name);
      const preset = themePresets.find(p => p.name === name) || themePresets[0];
      const resolved = (resolvedTheme === 'light' ? 'light' : 'dark') as 'light' | 'dark';
      applyThemePreset(preset, resolved);
    };
    load();
  }, [resolvedTheme]);

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme, colorPresets: themePresets }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="ming-theme"
    >
      <ColorThemeProvider>
        {children}
      </ColorThemeProvider>
    </NextThemesProvider>
  );
}

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useNextTheme();
  const { colorTheme, setColorTheme, colorPresets } = useContext(ColorThemeContext);

  return {
    theme: (theme || 'dark') as 'light' | 'dark' | 'system',
    resolvedTheme: (resolvedTheme || 'dark') as 'light' | 'dark',
    setTheme,
    colorTheme,
    setColorTheme,
    colorPresets,
  };
}
