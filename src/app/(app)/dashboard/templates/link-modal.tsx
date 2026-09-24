"use client";

import { useState } from "react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LinkModal({
  onAdd,
  onPrepare,
}: {
  onAdd: (url: string) => void;
  onPrepare: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("https://");

  const submit = () => {
    const value = url.trim();
    if (!/^https?:\/\//i.test(value) && !/^mailto:/i.test(value)) return;
    onAdd(value);
    setUrl("https://");
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        onMouseDown={(event) => {
          event.preventDefault();
          onPrepare();
        }}
        onClick={() => setOpen(true)}
        aria-label="Add link"
      >
        <Link2 className="size-4" aria-hidden />
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="link-modal-title" className="font-semibold">
                Add link
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close link dialog"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="grid gap-2">
              <label htmlFor="rich-link-url" className="text-sm font-medium">
                URL
              </label>
              <Input
                id="rich-link-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                autoFocus
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={submit}>
                Add link
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
