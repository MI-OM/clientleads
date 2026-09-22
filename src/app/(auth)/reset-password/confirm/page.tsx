import Link from "next/link";
import { SetPasswordForm } from "./form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SetPasswordPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>
          You arrived through a secure reset link — set your new password below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm />
        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}