import * as React from "react";

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  // Plain inline box so it works even without Tailwind
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.4)"
    }}
      onClick={() => onOpenChange(false)}
    >
      <div
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "80vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          border: "1px solid #e5e7eb",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div>{children}</div>;
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, borderBottom: "1px solid #eee", background: "#f9fafb" }}>
      {children}
    </div>
  );
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{children}</h3>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, borderTop: "1px solid #eee", background: "#f9fafb", display: "flex", justifyContent: "flex-end", gap: 8 }}>
      {children}
    </div>
  );
}

export default Dialog;
