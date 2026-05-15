// shadcn/ui official theme presets — light + dark HSL values
export interface ThemePreset {
  name: string;
  label: string;
  light: Record<string, string>;
  dark: Record<string, string>;
}

// Helper to build a theme from primary + base colors
function makeTheme(
  name: string,
  label: string,
  primaryLight: string,
  primaryForegroundLight: string,
  primaryDark: string,
  primaryForegroundDark: string,
  ringLight: string,
  ringDark: string,
): ThemePreset {
  return {
    name,
    label,
    light: {
      '--background': '0 0% 100%',
      '--foreground': `${primaryLight}`,
      '--card': '0 0% 100%',
      '--card-foreground': `${primaryLight}`,
      '--popover': '0 0% 100%',
      '--popover-foreground': `${primaryLight}`,
      '--primary': `${primaryLight}`,
      '--primary-foreground': `${primaryForegroundLight}`,
      '--secondary': '210 40% 96.1%',
      '--secondary-foreground': `${primaryLight}`,
      '--muted': '210 40% 96.1%',
      '--muted-foreground': '215.4 16.3% 46.9%',
      '--accent': '210 40% 96.1%',
      '--accent-foreground': `${primaryLight}`,
      '--destructive': '0 84.2% 60.2%',
      '--destructive-foreground': '210 40% 98%',
      '--border': '214.3 31.8% 91.4%',
      '--input': '214.3 31.8% 91.4%',
      '--ring': `${ringLight}`,
    },
    dark: {
      '--background': '240 10% 3.9%',
      '--foreground': '210 40% 98%',
      '--card': '240 6% 7%',
      '--card-foreground': '210 40% 98%',
      '--popover': '240 6% 7%',
      '--popover-foreground': '210 40% 98%',
      '--primary': `${primaryDark}`,
      '--primary-foreground': `${primaryForegroundDark}`,
      '--secondary': '240 4% 10%',
      '--secondary-foreground': '210 40% 98%',
      '--muted': '240 4% 16%',
      '--muted-foreground': '215 20.2% 65.1%',
      '--accent': '240 4% 10%',
      '--accent-foreground': '210 40% 98%',
      '--destructive': '0 62.8% 30.6%',
      '--destructive-foreground': '210 40% 98%',
      '--border': '240 4% 16%',
      '--input': '240 4% 16%',
      '--ring': `${ringDark}`,
    },
  };
}

export const themePresets: ThemePreset[] = [
  makeTheme('indigo', 'Indigo', '239 84% 67%', '0 0% 100%', '239 84% 67%', '0 0% 100%', '239 84% 67%', '239 84% 67%'),
  makeTheme('sky', 'Sky', '199 89% 48%', '0 0% 100%', '199 89% 48%', '0 0% 100%', '199 89% 48%', '199 89% 48%'),
  makeTheme('violet', 'Violet', '262.1 83.3% 57.8%', '0 0% 100%', '263.4 70% 50.4%', '0 0% 100%', '262.1 83.3% 57.8%', '263.4 70% 50.4%'),
  makeTheme('green', 'Green', '142.1 76.2% 36.3%', '0 0% 100%', '142.1 70.6% 45.3%', '0 0% 100%', '142.1 76.2% 36.3%', '142.1 70.6% 45.3%'),
  makeTheme('rose', 'Rose', '346.8 77.2% 49.8%', '0 0% 100%', '346.8 77.2% 49.8%', '0 0% 100%', '346.8 77.2% 49.8%', '346.8 77.2% 49.8%'),
  makeTheme('orange', 'Orange', '24.6 95% 53.1%', '0 0% 100%', '20.5 90.2% 48.2%', '0 0% 100%', '24.6 95% 53.1%', '20.5 90.2% 48.2%'),
  makeTheme('blue', 'Blue', '221.2 83.2% 53.3%', '0 0% 100%', '217.2 91.2% 59.8%', '0 0% 100%', '221.2 83.2% 53.3%', '217.2 91.2% 59.8%'),
  makeTheme('zinc', 'Zinc', '240 5.9% 10%', '0 0% 100%', '240 4.9% 83.9%', '240 5.9% 10%', '240 5.9% 10%', '240 4.9% 83.9%'),
  makeTheme('red', 'Red', '0 72.2% 50.6%', '0 0% 100%', '0 72.2% 50.6%', '0 0% 100%', '0 72.2% 50.6%', '0 72.2% 50.6%'),
  makeTheme('yellow', 'Yellow', '47.9 95.8% 53.1%', '26 83.3% 14.1%', '47.9 95.8% 53.1%', '26 83.3% 14.1%', '47.9 95.8% 53.1%', '47.9 95.8% 53.1%'),
  makeTheme('teal', 'Teal', '172.3 66.3% 35.3%', '0 0% 100%', '174.4 66.4% 41.8%', '0 0% 100%', '172.3 66.3% 35.3%', '174.4 66.4% 41.8%'),
];

export const defaultThemeName = 'indigo';

export function applyThemePreset(preset: ThemePreset, resolvedTheme: 'light' | 'dark') {
  const vars = resolvedTheme === 'dark' ? preset.dark : preset.light;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}
