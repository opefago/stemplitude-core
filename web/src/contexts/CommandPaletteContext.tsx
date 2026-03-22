import { createContext, useContext, useState, useCallback, type ReactNode, type Dispatch, type SetStateAction } from "react";

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  openPalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);
  return (
    <CommandPaletteContext.Provider value={{ open, setOpen, openPalette }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    return {
      open: false,
      setOpen: () => {},
      openPalette: () => {},
    };
  }
  return ctx;
}
