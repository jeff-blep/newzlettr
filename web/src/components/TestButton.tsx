import { useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { IconCircleCheck, IconCircleX, IconPlugConnected } from "@tabler/icons-react";
import type { TestResult } from "../../../shared/types";

/** *arr-style "Test" button that shows the result inline right under the section. */
export function TestButton({ onTest, label = "Test", disabled }: { onTest: () => Promise<TestResult>; label?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  return (
    <Stack gap="xs">
      <Group>
        <Button
          variant="default"
          leftSection={<IconPlugConnected size={16} />}
          loading={busy}
          disabled={disabled}
          onClick={async () => {
            setBusy(true);
            setResult(null);
            try {
              setResult(await onTest());
            } catch (e) {
              setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
            } finally {
              setBusy(false);
            }
          }}
        >
          {label}
        </Button>
      </Group>
      {result && (
        <Alert
          variant="light"
          color={result.ok ? "green" : "red"}
          icon={result.ok ? <IconCircleCheck size={18} /> : <IconCircleX size={18} />}
          withCloseButton
          onClose={() => setResult(null)}
          maw={640}
        >
          <Text size="sm">{result.message}</Text>
          {result.details && (
            <Text size="xs" c="dimmed" mt={4}>
              {Object.entries(result.details)
                .map(([k, v]) => `${k}: ${typeof v === "number" ? v.toLocaleString() : v}`)
                .join(" · ")}
            </Text>
          )}
        </Alert>
      )}
    </Stack>
  );
}
