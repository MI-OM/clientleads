import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { getPublicPageData } from "@/lib/public/page-data";
import { BookWizard } from "./book-wizard";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ service?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPageData(slug);
  if (!page) return { title: "Not found" };
  return {
    title: `Book — ${page.org.name}`,
    description: `Book an appointment with ${page.org.name}.`,
  };
}

export default async function BookPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { service: serviceParam } = await searchParams;
  const page = await getPublicPageData(slug);
  if (!page) notFound();

  const { org, services } = page;
  const bookable = services.filter((s) => s.booking_enabled);

  if (bookable.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <CalendarOff className="mx-auto size-12 text-muted-foreground/50" aria-hidden />
        <h1 className="mt-4 text-xl font-bold">Online booking isn&apos;t available yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {org.name} doesn&apos;t have any bookable services right now — check back soon.
        </p>
        <Link
          href={`/${slug}`}
          className="mt-6 inline-block text-sm text-primary underline underline-offset-4"
        >
          ← Back to {org.name}
        </Link>
      </div>
    );
  }

  const initialServiceId =
    serviceParam && bookable.some((s) => s.id === serviceParam) ? serviceParam : null;

  return (
    <BookWizard
      slug={org.slug}
      orgName={org.name}
      services={bookable}
      timezone={org.timezone}
      initialServiceId={initialServiceId}
    />
  );
}
