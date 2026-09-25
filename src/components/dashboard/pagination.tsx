import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function Pagination({
  page,
  totalPages,
  href,
}: {
  page: number;
  totalPages: number;
  href: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
