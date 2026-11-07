import { PasswordInput, type PasswordInputProps } from "@mantine/core";

const MASK = "********";

/**
 * Secret field. The server sends "********" for a stored secret; we show an empty box with a
 * "saved" placeholder, and send "********" back unless the user typed something new.
 */
export function SecretInput({ value, onChange, ...rest }: Omit<PasswordInputProps, "value" | "onChange"> & { value: string; onChange: (v: string) => void }) {
  const stored = value === MASK;
  return (
    <PasswordInput
      {...rest}
      value={stored ? "" : value}
      placeholder={stored ? "•••••••• (saved — type to replace)" : rest.placeholder}
      onChange={(e) => onChange(e.currentTarget.value === "" && stored ? MASK : e.currentTarget.value)}
      autoComplete="new-password"
    />
  );
}
