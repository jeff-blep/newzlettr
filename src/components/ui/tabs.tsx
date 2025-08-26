import * as React from "react";

export function Tabs({
  defaultValue,
  children,
}: {
  defaultValue: string;
  children: React.ReactNode;
}) {
  return <div>{children}</div>;
}

export function TabsList({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex rounded-xl border bg-white p-1">{children}</div>;
}

export function TabsTrigger({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  // Simple stub – no state syncing in this minimal version
  return <button className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100">{children}</button>;
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
