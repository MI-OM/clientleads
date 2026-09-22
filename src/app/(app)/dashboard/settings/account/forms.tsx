"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction } from "./actions";
import type { AccountState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function FormStatus({ state }: { state: AccountState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-sm text-primary">
        {state.success}
      </p>
    );
  }
  return null;
}

export function AccountSettingsForms({
  fullName,
  phone,
  avatarUrl,
  email,
}: {
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  email: string | null;
}) {
  const [profileState, profileAction, profilePending] = useActionState<
    AccountState,
    FormData
  >(updateProfileAction, {});
  const [passwordState, passwordAction, passwordPending] = useActionState<
    AccountState,
    FormData
  >(changePasswordAction, {});

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>
            How you appear across the workspace. Your email is managed by
            Supabase Auth and can&apos;t be changed here yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={profileAction} className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  defaultValue={fullName ?? ""}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email ?? ""} disabled readOnly />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ""} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="avatarUrl">Avatar URL</Label>
                <Input
                  id="avatarUrl"
                  name="avatarUrl"
                  type="url"
                  defaultValue={avatarUrl ?? ""}
                  placeholder="https://…"
                />
              </div>
            </div>
            <FormStatus state={profileState} />
            <div>
              <Button type="submit" loading={profilePending}>
                Save profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Set a new password. You&apos;ll use it the next time you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={passwordAction} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat your new password"
                  required
                />
              </div>
            </div>
            <FormStatus state={passwordState} />
            <div>
              <Button type="submit" loading={passwordPending}>
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}