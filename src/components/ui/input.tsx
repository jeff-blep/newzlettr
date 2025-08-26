import * as React from "react";
import { cn } from "../../lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export default Input;
