import * as React from "react";

export function Switch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onCheckedChange(!checked)}
      className={
        "w-12 h-7 rounded-full transition " +
        (checked ? "bg-black" : "bg-gray-300")
      }
      aria-pressed={checked}
      role="switch"
    >
      <span
        className={
          "block h-6 w-6 bg-white rounded-full mt-0.5 transition " +
          (checked ? "translate-x-5" : "translate-x-1")
        }
      />
    </button>
  );
}
export default Switch;
