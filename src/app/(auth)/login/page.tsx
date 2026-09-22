import Link from "next/link";
import { LoginForm } from "./form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = typeof params.error === "string" ? params.error : undefined;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-xl">Sign in to ClientLeads</CardTitle>
        <CardDescription>Your workspace for contacts, leads, and appointments.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm notice={notice} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to home
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
