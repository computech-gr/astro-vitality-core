import type { ReactNode } from "react";

/**
 * Minimal responsive application shell for Mitochondria.
 * Intentionally sparse: this phase establishes architecture, not product UI.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">
            Mitochondria
          </span>
          <span className="text-xs text-muted-foreground">
            Foundation build
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 text-xs text-muted-foreground">
          Open-source · Offline-first · NASA Space Apps Challenge 2026
        </div>
      </footer>
    </div>
  );
}
