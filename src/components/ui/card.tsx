import * as React from "react";
import { cn } from "../../lib/cn";

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div className={cn("rounded-2xl border bg-white shadow-sm", className)} {...rest} />;
}

export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div className={cn("p-4 md:p-6 border-b bg-gray-50", className)} {...rest} />;
}

export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  const { className, ...rest } = props;
  return <h3 className={cn("text-lg font-semibold", className)} {...rest} />;
}

export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div className={cn("p-4 md:p-6", className)} {...rest} />;
}
