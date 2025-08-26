import * as React from "react";
import { cn } from "../../lib/cn";

export function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>) {
  const { className, ...rest } = props;
  return (
    <label
      className={cn("text-sm font-medium text-gray-800", className)}
      {...rest}
    />
  );
}

export default Label;
