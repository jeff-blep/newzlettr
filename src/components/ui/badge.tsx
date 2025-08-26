import { cn } from "../../lib/cn";

export function Badge({
  className,
  children,
  variant = "secondary",
}: {
  className?: string;
  children: React.ReactNode;
  variant?: "secondary";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
        variant === "secondary" && "border-gray-300 text-gray-700 bg-gray-50",
        className
      )}
    >
      {children}
    </span>
  );
}

export default Badge;
