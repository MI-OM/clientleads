"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, List, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkModal } from "./link-modal";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [color, setColor] = useState("#14532d");

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const command = (name: string, commandValue?: string) => {
    if (name === "createLink" && savedRangeRef.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRangeRef.current);
    }
    editorRef.current?.focus();
    document.execCommand(name, false, commandValue);
    onChange(editorRef.current?.innerHTML ?? "");
  };

  const prepareLink = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  };

  const addLink = (url: string) => command("createLink", url);

  return (
    <div className="overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 p-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => command("bold")}
          aria-label="Bold"
          onMouseDown={(event) => event.preventDefault()}
        >
          <Bold className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => command("underline")}
          aria-label="Underline"
          onMouseDown={(event) => event.preventDefault()}
        >
          <Underline className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => command("insertUnorderedList")}
          aria-label="Bullet list"
          onMouseDown={(event) => event.preventDefault()}
        >
          <List className="size-4" aria-hidden />
        </Button>
        <LinkModal onAdd={addLink} onPrepare={prepareLink} />
        <label
          className="ml-1 flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground"
          title="Text color"
        >
          <span className="font-medium">A</span>
          <Input
            type="color"
            value={color}
            onMouseDown={(event) => event.preventDefault()}
            onChange={(event) => {
              setColor(event.target.value);
              command("foreColor", event.target.value);
            }}
            className="size-6 cursor-pointer border-0 p-0"
            aria-label="Text color"
          />
        </label>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        className="min-h-28 whitespace-pre-wrap p-3 text-sm leading-6 outline-none [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
        onInput={() => onChange(editorRef.current?.innerHTML ?? "")}
        suppressContentEditableWarning
      />
    </div>
  );
}
