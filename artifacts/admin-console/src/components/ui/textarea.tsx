import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

// Mirrors artifacts/rhetoric-xray/src/components/ui/textarea.tsx — see the
// comment in ./input.tsx for why this admin console has its own copy of
// these primitives instead of importing across artifacts.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
