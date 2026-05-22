import type { ReactNode } from 'react';
import './assistant-theme.css';

interface AssistantThemeProps {
  children: ReactNode;
}

/**
 * Theme wrapper for assistant-ui components.
 *
 * Imports the CSS overrides that map our design tokens (CSS variables)
 * to assistant-ui's data-attribute selectors. Wrap your assistant-ui
 * component tree with this to apply consistent styling.
 */
export function AssistantTheme({ children }: AssistantThemeProps) {
  return <>{children}</>;
}
