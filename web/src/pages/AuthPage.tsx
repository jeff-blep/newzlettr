import { useState } from "react";
import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { authKey, login, setupAdmin } from "../api/auth";

/** First-run admin creation (mode="setup") or the login form - like modern *arr apps. */
export function AuthPage({ mode }: { mode: "setup" | "login" }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setup = mode === "setup";
  const mismatch = setup && confirm.length > 0 && password !== confirm;

  return (
    <Center h="100%" p="md">
      <Paper w={380} p="xl" radius="md" withBorder bg="var(--nz-sidebar-bg)">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await (setup ? setupAdmin(username, password) : login(username, password));
              await qc.invalidateQueries({ queryKey: authKey });
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Stack>
            <Center>
              <img src="/favicon.svg" width={56} height={56} alt="" />
            </Center>
            <Title order={3} ta="center">
              {setup ? "Welcome to Newzlettr" : "Sign in"}
            </Title>
            {setup && (
              <Alert icon={<IconInfoCircle size={18} />} variant="light">
                <Text size="sm">Create the admin account. You'll use it to sign in to this app.</Text>
              </Alert>
            )}
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <TextInput
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              autoComplete="username"
              required
              data-autofocus
            />
            <PasswordInput
              label="Password"
              description={setup ? "At least 8 characters" : undefined}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete={setup ? "new-password" : "current-password"}
              required
            />
            {setup && (
              <PasswordInput
                label="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.currentTarget.value)}
                autoComplete="new-password"
                error={mismatch ? "Passwords don't match" : undefined}
                required
              />
            )}
            <Button type="submit" loading={busy} disabled={mismatch || (setup && password.length < 8)} fullWidth mt="xs">
              {setup ? "Create account" : "Sign in"}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
