"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileCheck2, LayoutTemplate, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/upload", label: "Upload", icon: UploadCloud },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b bg-white/85 backdrop-blur-sm supports-backdrop-filter:bg-white/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileCheck2 className="size-4.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Invoice Review Portal
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
          <Link
            href="/upload"
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "ml-2")}
          >
            New invoice
          </Link>
        </nav>
      </div>
    </header>
  );
}
