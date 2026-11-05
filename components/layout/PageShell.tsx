"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { footerLinks } from "@/lib/botchain/chain";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

export default function PageShell({
  children,
  nav = [
    { href: "/", label: "Polls" },
    { href: "/new", label: "New Poll" },
    { href: "/me", label: "My Votes" },
  ],
  title,
  description,
}: PageShellProps) {
  const links = footerLinks();
  const pathname = usePathname();

  return (
    <div
      className="flex flex-col min-h-screen overflow-x-hidden"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      <header
        className="sticky top-0 z-30 flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
        }}
      >
        <div className="mx-auto w-full max-w-5xl px-4 md:px-6">
          <div className="flex items-center gap-4 py-3">
            <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 no-underline group">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 group-hover:scale-110 transition-transform"
                style={{ background: "var(--accent)" }}
                aria-hidden="true"
              />
              <div className="flex flex-col">
                <span className="font-heading text-lg font-bold tracking-tight text-[var(--text-primary)]">
                  {app.name}
                </span>
                <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline -mt-1 font-sans">
                  {app.tagline}
                </span>
              </div>
            </Link>

            <nav className="hidden sm:flex items-center gap-1 ml-4" aria-label="Main Navigation">
              {nav.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 text-xs font-semibold rounded font-heading uppercase tracking-wider transition-colors ${
                      isActive
                        ? "bg-[var(--bg-elevated)] text-[var(--accent)] border border-[var(--border-subtle)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex-1" />
            <NetworkBadge />
            <div className="w-[140px] md:w-[170px] flex-shrink-0">
              <ConnectButton />
            </div>
          </div>

          <nav className="flex sm:hidden items-center gap-1 pb-2 border-t border-[var(--border-subtle)] pt-2" aria-label="Mobile Navigation">
            {nav.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex-1 text-center py-1.5 text-xs font-semibold rounded font-heading uppercase tracking-wider ${
                    isActive
                      ? "bg-[var(--bg-elevated)] text-[var(--accent)] border border-[var(--border-subtle)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {(title || description) && (
          <header className="mb-6">
            {title && (
              <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                {title}
              </h1>
            )}
            {description && (
              <p className="text-sm text-[var(--text-muted)] mt-1.5 max-w-2xl font-sans">
                {description}
              </p>
            )}
          </header>
        )}
        {children}
      </main>

      <footer
        className="flex-shrink-0 mt-auto border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-6 text-xs text-[var(--text-muted)]"
      >
        <div className="mx-auto w-full max-w-5xl px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
            {links.contract && (
              <a
                href={links.contract}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text-primary)] transition-colors underline underline-offset-4"
              >
                Contract
              </a>
            )}
            <a
              href={links.site}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors underline underline-offset-4"
            >
              botchain.ai
            </a>
            <a
              href={links.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors underline underline-offset-4"
            >
              Explorer
            </a>
          </div>
          <BuiltOnBotChain />
        </div>
      </footer>
    </div>
  );
}
