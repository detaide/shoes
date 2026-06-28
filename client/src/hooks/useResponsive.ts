import { useState, useEffect, useCallback } from 'react';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ResponsiveState {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const BREAKPOINTS: { key: Breakpoint; min: number }[] = [
  { key: 'xl', min: 1440 },
  { key: 'lg', min: 1024 },
  { key: 'md', min: 768 },
  { key: 'sm', min: 480 },
  { key: 'xs', min: 0 },
];

function calcBreakpoint(width: number): Breakpoint {
  for (const bp of BREAKPOINTS) {
    if (width >= bp.min) return bp.key;
  }
  return 'xs';
}

function deriveState(width: number, height: number): ResponsiveState {
  const bp = calcBreakpoint(width);
  return {
    width,
    height,
    breakpoint: bp,
    isMobile: bp === 'xs' || bp === 'sm',
    isTablet: bp === 'md',
    isDesktop: bp === 'lg' || bp === 'xl',
  };
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() =>
    deriveState(
      typeof window !== 'undefined' ? window.innerWidth : 1024,
      typeof window !== 'undefined' ? window.innerHeight : 768,
    ),
  );

  const handleResize = useCallback(() => {
    setState(deriveState(window.innerWidth, window.innerHeight));
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  return state;
}
