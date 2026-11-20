import {
  type ReactNode,
  createContext,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';
import { z } from 'zod';

import {
  type PhotoTheme,
  contrastingText,
  defaultPhotoTheme,
  photoThemeSchema,
} from './photo-theme';

const savedTheme = z.object({ active: z.boolean(), design: photoThemeSchema });
type SavedTheme = z.infer<typeof savedTheme>;

const ThemeContext = createContext<{
  current: SavedTheme;
  apply: (design: PhotoTheme) => void;
  useStandardTheme: () => void;
} | null>(null);

export const usePersonalTheme = () => useContext(ThemeContext);

export function PersonalThemeProvider({
  accountId,
  children,
}: {
  accountId: number;
  children: ReactNode;
}) {
  const storageKey = `openathlete-personal-theme:${accountId}`;
  const [current, setCurrent] = useState<SavedTheme>(() => {
    try {
      return savedTheme.parse(
        JSON.parse(localStorage.getItem(storageKey) ?? 'null'),
      );
    } catch {
      return { active: false, design: defaultPhotoTheme };
    }
  });

  useLayoutEffect(() => {
    if (!current.active) return;
    const { background, foreground, sidebar, sidebarText, accent } =
      current.design;
    const root = document.documentElement;
    const variables = {
      '--theme-surface': background,
      '--theme-text': foreground,
      '--theme-sidebar': sidebar,
      '--theme-sidebar-text': sidebarText,
      '--theme-accent': accent,
      '--theme-accent-text': contrastingText(accent),
    };
    Object.entries(variables).forEach(([name, value]) =>
      root.style.setProperty(name, value),
    );
    root.dataset.personalTheme = 'active';
    return () => {
      Object.keys(variables).forEach((name) => root.style.removeProperty(name));
      delete root.dataset.personalTheme;
    };
  }, [current]);

  const apply = (design: PhotoTheme) => {
    const next = { active: true, design: photoThemeSchema.parse(design) };
    localStorage.setItem(storageKey, JSON.stringify(next));
    setCurrent(next);
  };
  const useStandardTheme = () => {
    if (!current.active) return;
    const next = { ...current, active: false };
    localStorage.setItem(storageKey, JSON.stringify(next));
    setCurrent(next);
  };

  return (
    <ThemeContext.Provider value={{ current, apply, useStandardTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function PersonalThemePhoto({
  placement,
  mobile = false,
}: {
  placement: 'banner' | 'sidebar';
  mobile?: boolean;
}) {
  const theme = usePersonalTheme()?.current;
  if (!theme?.active || !theme.design.photo) return null;
  const visiblePlacement =
    mobile && theme.design.placement === 'sidebar'
      ? 'banner'
      : theme.design.placement;
  if (visiblePlacement !== placement) return null;
  const { photo, focusX, focusY } = theme.design;
  return (
    <img
      data-personal-theme-photo={placement}
      src={photo}
      alt=""
      className={
        placement === 'sidebar'
          ? 'mx-2 h-28 w-auto shrink-0 rounded-lg object-cover group-data-[collapsible=icon]:hidden'
          : 'h-24 w-full shrink-0 object-cover md:h-32'
      }
      style={{ objectPosition: `${focusX}% ${focusY}%` }}
    />
  );
}
