import { useState } from "react";
import { Button, Group, Modal, PasswordInput, Stack } from "@mantine/core";
import { changePassword } from "../api/auth";
import { notifyError, notifyOk } from "./notify";

export function ChangePasswordModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    onClose();
  };

  return (
    <Modal opened={opened} onClose={close} title="Change password" centered>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await changePassword(current, next);
            notifyOk("Password changed. Other sessions were signed out.");
            close();
          } catch (err) {
            notifyError(err, "Couldn't change password");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Stack>
          <PasswordInput label="Current password" value={current} onChange={(e) => setCurrent(e.currentTarget.value)} required />
          <PasswordInput
            label="New password"
            description="At least 8 characters"
            value={next}
            onChange={(e) => setNext(e.currentTarget.value)}
            required
            minLength={8}
          />
          <PasswordInput
            label="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
            error={mismatch ? "Passwords don't match" : undefined}
            required
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={mismatch || next.length < 8}>
              Change password
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
