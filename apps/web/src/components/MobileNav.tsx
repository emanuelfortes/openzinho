'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Menu } from 'lucide-react';

/** Id of the sidebar element the header menu button controls (aria-controls). */
export const SIDEBAR_ID = 'nexo-sidebar';

type MobileNavState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The header button, so closing the drawer can hand focus back to it. */
  buttonRef: React.RefObject<HTMLButtonElement | null>;
};

const MobileNavContext = createContext<MobileNavState | null>(null);

/** Shares the open/closed state of the sidebar drawer (below `lg`) between the header button and the sidebar. */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpenState] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const setOpen = useCallback((next: boolean) => setOpenState(next), []);
  const value = useMemo(() => ({ open, setOpen, buttonRef }), [open, setOpen]);
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavState {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error('useMobileNav precisa estar dentro de MobileNavProvider');
  return ctx;
}

/** Header button that opens the navigation drawer; hidden at `lg` and up, where the sidebar is always visible. */
export function MobileNavButton() {
  const { open, setOpen, buttonRef } = useMobileNav();
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls={SIDEBAR_ID}
      aria-label={open ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
      className="mr-auto grid h-9 w-9 shrink-0 place-items-center rounded-nexo text-nexo-dim transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexo-sky lg:hidden"
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
