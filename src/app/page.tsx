import Link from "next/link";
import { ArrowRight, LayoutTemplate, ScanSearch, UploadCloud } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: UploadCloud,
    title: "1. Upload",
    description: "Drop in an invoice PDF or image. It's sent straight to the extraction agent.",
  },
  {
    icon: ScanSearch,
    title: "2. Review",
    description: "See the original document next to each extracted field, with confidence and validation.",
  },
  {
    icon: LayoutTemplate,
    title: "3. Export",
    description: "Choose which fields matter, edit anything that's off, and export a clean .xlsx.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 py-20 text-center">
        <span className="mx-auto mb-5 inline-flex items-center rounded-full border bg-white px-3 py-1 text-xs font-medium text-muted-foreground">
          AI-assisted invoice review
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
          Turn invoices into verified, exportable data
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
          Upload an invoice, let the extraction agent do the first pass, then review, correct, and export the
          result with confidence.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/upload" className={cn(buttonVariants({ variant: "default", size: "lg" }), "gap-2")}>
            Upload an invoice
            <ArrowRight className="size-4" />
          </Link>
          <Link href="/templates" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Manage field templates
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4.5" />
                </span>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
