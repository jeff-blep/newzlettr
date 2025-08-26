import * as React from "react";
import { cn } from "../../lib/cn";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export default Textarea;
