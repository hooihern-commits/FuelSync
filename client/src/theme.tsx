import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ThemeColors {
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  subtext: string;
  muted: string;
  teal: string;
  inputBg: string;
  inputBorder: string;
  track: string;
  tabBar: string;
}

const light: ThemeColors = {
  bg: '#ffffff', card: '#f4f8f8', cardBorder: '#d8e7e7',
  text: '#1a1a1a', subtext: '#666666', muted: '#999999',
  teal: '#01696f', inputBg: '#ffffff', inputBorder: '#dddddd',
  track: '#dce8e8', tabBar: '#ffffff',
};

const dark: ThemeColors = {
  bg: '#0f1417', card: '#1a2227', cardBorder: '#2a3339',
  text: '#f0f4f5', subtext: '#9fb0b5', muted: '#6b7c82',
  teal: '#4fc3cb', inputBg: '#1a2227', inputBorder: '#33424a',
  track: '#2a3339', tabBar: '#141b1f',
};

interface ThemeCtx {
  dark: boolean;
  colors: ThemeColors;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ dark: false, colors: light, toggle: () => {} });

export const useTheme = () => useContext(Ctx);

const STORAGE_KEY = 'fuelsync_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'dark') setIsDark(true);
    });
  }, []);

  const toggle = () => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <Ctx.Provider value={{ dark: isDark, colors: isDark ? dark : light, toggle }}>
      {children}
    </Ctx.Provider>
  );
}
