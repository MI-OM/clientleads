import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            CL
          </span>
          ClientLeads
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
            Open dashboard
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-6 px-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          One simple place to manage your client relationships.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-muted-foreground">
          ClientLeads connects your contacts, leads, bookings, communications
          and follow-ups in a single lightweight system — with a branded public
          page your prospects can book and inquire through.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Get started
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}