import * as React from "react";
import { cn } from "../../lib/cn";

type Variant = "default" | "outline" | "secondary";

export function Button(
  { className, variant = "default", ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
) {
  const base = "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm transition border";
  const variants: Record<Variant, string> = {
    default: "bg-black text-white border-black/10 hover:opacity-90",
    outline: "bg-white text-gray-900 border-gray-300 hover:bg-gray-50",
    secondary: "bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200",
  };
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export default Button;
