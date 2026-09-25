import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Briefcase,
  Camera,
  Clock,
  Contact as ContactIcon,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Play,
  ThumbsUp,
} from "lucide-react";
import { getPublicPageData } from "@/lib/public/page-data";
import type { PublicService } from "@/lib/public/types";
import { formatDuration, formatPrice, locationShort } from "@/lib/public/format";
import { LeadForm } from "./lead-form";
import { ResourceDownload } from "./resource-gate";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPageData(slug);
  if (!page) return { title: "Not found" };
  return {
    title: page.org.name,
    description: page.org.description ?? `Learn about ${page.org.name}.`,
  };
}

const SOCIAL_ICONS: Record<string, typeof Globe> = {
  instagram: Camera,
  facebook: ThumbsUp,
  linkedin: Briefcase,
  x: MessageCircle,
  twitter: MessageCircle,
  youtube: Play,
  website: Globe,
};

function Section({
  id,
  children,
  className = "",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 px-4 py-12 sm:py-16 ${className}`}>
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="text-2xl font-semibold tracking-tight sm:text-3xl"
      style={{ color: "var(--brand)" }}
    >
      {children}
    </h2>
  );
}

function ServiceCard({
  service,
  enquireHref,
  bookHref,
}: {
  service: PublicService;
  enquireHref: string;
  bookHref?: string;
}) {
  return (
    <article className="group relative flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--brand)]/40 hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-[var(--brand)] opacity-70" />
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Service
        </p>
        <h3 className="text-lg font-semibold tracking-tight">{service.name}</h3>
      </div>
      {service.description ? (
        <p className="flex-1 text-sm text-muted-foreground">{service.description}</p>
      ) : null}
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="size-3.5" aria-hidden /> {formatDuration(service.duration_min)}
        </div>
        <div className="text-muted-foreground">{locationShort(service.location_type)}</div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-base font-semibold">
          {formatPrice(service.price, service.currency) ?? "Pricing on request"}
        </span>
        <div className="flex items-center gap-2">
          {bookHref ? (
            <Link
              href={bookHref}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Book
            </Link>
          ) : null}
          <a
            href={enquireHref}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-[var(--brand)]/40 hover:bg-muted"
          >
            Enquire
          </a>
        </div>
      </div>
    </article>
  );
}

interface SearchParams {
  service?: string | string[];
}

export default async function PublicBusinessPage({
  params,
  searchParams,
}: PageProps & { searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  const { service: serviceParam } = await searchParams;
  const page = await getPublicPageData(slug);
  if (!page) notFound();

  const { org } = page;
  const requestedServiceId = Array.isArray(serviceParam) ? serviceParam[0] : serviceParam;
  const requestedService = page.services.find((service) => service.id === requestedServiceId);
  const brandVars = {
    "--brand": org.primary_color,
    "--brand-soft": org.secondary_color,
  } as CSSProperties;

  const navLinks = [
    ...(page.services.length > 0 ? [{ href: "#services", label: "Services" }] : []),
    { href: "#about", label: "About" },
    ...(page.resources.length > 0 ? [{ href: "#resources", label: "Resources" }] : []),
    { href: "#contact", label: "Contact" },
  ];

  const contactLine = [
    org.address,
    [org.city, org.province].filter(Boolean).join(", "),
    [org.country, org.postal_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="min-h-screen" style={brandVars}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <a href="#top" className="flex min-w-0 items-center gap-2.5">
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logo_url}
                alt=""
                className="size-9 shrink-0 rounded-md border border-border bg-white object-contain p-0.5"
              />
            ) : (
              <span
                className="grid size-9 shrink-0 place-items-center rounded-md text-sm font-bold text-white"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {org.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="truncate font-semibold">{org.name}</span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-4" aria-label="Site">
            {navLinks.map((link) =>
              link.href.startsWith("#") ? (
                <a
                  key={link.href}
                  href={link.href}
                  className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
                >
                  {link.label}
                </Link>
              ),
            )}
            <a
              href="#lead"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Get in touch
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <Section
          id="hero"
          className="overflow-hidden bg-[color-mix(in_srgb,var(--brand)_6%,white)] py-0 sm:py-0"
        >
          <div className="relative flex min-h-[27rem] flex-col justify-center gap-8 py-16 sm:min-h-[31rem] sm:py-20">
            <div className="relative max-w-3xl">
              <p
                className="mb-4 text-xs font-semibold uppercase tracking-[0.24em]"
                style={{ color: "var(--brand)" }}
              >
                Welcome to {org.name}
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                {org.name}
              </h1>
              {org.description ? (
                <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                  {org.description}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {page.services.length > 0 ? (
                <a
                  href="#services"
                  className="rounded-md bg-[color-mix(in_srgb,var(--brand)_12%,white)] px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ color: "var(--brand)" }}
                >
                  View services
                </a>
              ) : null}
              <a
                href="#lead"
                className="rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--brand)" }}
              >
                Get in touch
              </a>
            </div>
          </div>
        </Section>

        {/* About */}
        <Section id="about" className="border-t border-border/60 bg-card">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.24em]"
                style={{ color: "var(--brand)" }}
              >
                Our story
              </p>
              <SectionTitle>About {org.name}</SectionTitle>
            </div>
            <p className="max-w-3xl whitespace-pre-line text-lg leading-8 text-muted-foreground">
              {org.about || `${org.name} looks forward to working with you.`}
            </p>
          </div>
        </Section>

        {/* Services */}
        {page.services.length > 0 ? (
          <Section id="services" className="border-t border-border/60 bg-muted/30">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p
                  className="mb-2 text-xs font-semibold uppercase tracking-[0.24em]"
                  style={{ color: "var(--brand)" }}
                >
                  How we can help
                </p>
                <SectionTitle>Services</SectionTitle>
              </div>
              <p className="max-w-sm text-sm text-muted-foreground sm:text-right">
                Choose a service to start a conversation or book a time that works for you.
              </p>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {page.services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  enquireHref={
                    page.forms.length > 0
                      ? `?service=${encodeURIComponent(service.id)}#lead`
                      : "#contact"
                  }
                  bookHref={
                    service.booking_enabled ? `/${org.slug}/book?service=${service.id}` : undefined
                  }
                />
              ))}
            </div>
          </Section>
        ) : null}

        {/* Lead form */}
        {page.forms.length > 0 ? (
          <Section
            id="lead"
            className="border-t border-border/60 bg-[color-mix(in_srgb,var(--brand)_6%,white)]"
          >
            <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
              <div>
                <SectionTitle>Get in touch</SectionTitle>
                <p className="mt-4 max-w-md text-muted-foreground">
                  Choose a form and send us a message — no commitment, just a conversation.
                </p>
                {page.forms.length > 1 ? (
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {page.forms.map((form) => (
                      <li key={form.id}>
                        <a
                          href={`#${form.slug}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {form.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="grid gap-8 lg:col-span-2">
                {page.forms.map((form) => (
                  <div
                    key={form.id}
                    id={form.slug}
                    className="scroll-mt-24 rounded-lg border border-border bg-card p-5 lg:p-6"
                  >
                    <h3 className="mb-4 text-lg font-semibold">{form.name}</h3>
                    <LeadForm
                      form={form}
                      pageSlug={org.slug}
                      serviceName={requestedService?.name}
                    />
                  </div>
                ))}
              </div>
            </div>
          </Section>
        ) : null}

        {/* Resources */}
        {page.resources.length > 0 ? (
          <Section id="resources" className="border-t border-border/60">
            <SectionTitle>Resources</SectionTitle>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {page.resources.map((resource) => (
                <article
                  key={resource.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-sm"
                >
                  <h3 className="text-base font-semibold">{resource.title}</h3>
                  {resource.description ? (
                    <p className="flex-1 text-sm text-muted-foreground">{resource.description}</p>
                  ) : null}
                  <div className="border-t border-border pt-3">
                    <ResourceDownload resource={resource} pageSlug={org.slug} />
                  </div>
                </article>
              ))}
            </div>
          </Section>
        ) : null}

        {/* Contact */}
        <Section id="contact" className="border-t border-border/60 bg-muted/30">
          <SectionTitle>Contact</SectionTitle>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {org.email ? (
              <a
                href={`mailto:${org.email}`}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm hover:shadow-sm"
              >
                <Mail
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: "var(--brand)" }}
                  aria-hidden
                />
                <span className="break-all">{org.email}</span>
              </a>
            ) : null}
            {org.phone ? (
              <a
                href={`tel:${org.phone.replace(/\s/g, "")}`}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm hover:shadow-sm"
              >
                <Phone
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: "var(--brand)" }}
                  aria-hidden
                />
                <span>{org.phone}</span>
              </a>
            ) : null}
            {contactLine ? (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm">
                <MapPin
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: "var(--brand)" }}
                  aria-hidden
                />
                <span className="whitespace-pre-line">{contactLine}</span>
              </div>
            ) : null}
          </div>
          {Object.entries(org.social_links ?? {}).filter(([, url]) => url).length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {Object.entries(org.social_links).map(([key, url]) => {
                if (!url) return null;
                const Icon = SOCIAL_ICONS[key] ?? ContactIcon;
                return (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Icon className="size-4" aria-hidden />
                    <span className="capitalize">{key}</span>
                  </a>
                );
              })}
            </div>
          ) : null}
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} {org.name}
          </p>
          <p className="flex items-center gap-1.5">
            <MessageSquare className="size-3.5" aria-hidden /> Powered by ClientLeads
          </p>
        </div>
      </footer>
    </div>
  );
}
