import { useEffect, useState } from "react";
import { Alert, Box, Button, Center, Group, Loader, Modal, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { Newsletter } from "../../../../shared/types";
import { previewNewsletter, useNewsletterMutations } from "../../api/newsletters";
import { useSection } from "../../api/sections";
import { notifyError, notifyOk } from "../../components/notify";

export function PreviewModal({ newsletter, onClose }: { newsletter: Newsletter; onClose: () => void }) {
  const auto = newsletter.emailTheme === "auto";
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const q = useQuery({
    queryKey: ["nl-preview", newsletter.id, auto ? scheme : "fixed"],
    queryFn: () => previewNewsletter(newsletter.id, auto ? scheme : undefined),
    staleTime: 0,
  });
  return (
    <Modal opened onClose={onClose} title={`Preview — ${newsletter.subject || newsletter.name}`} size={720} centered>
      {q.isPending ? (
        <Center p="xl">
          <Loader />
        </Center>
      ) : q.error || !q.data ? (
        <Alert color="red">{String(q.error)}</Alert>
      ) : (
        <Stack gap="xs">
          {auto && (
            <Group justify="flex-end">
              <SegmentedControl
                size="xs"
                value={scheme}
                onChange={(v) => setScheme(v as "light" | "dark")}
                data={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </Group>
          )}
          {q.data.warnings.map((w) => (
            <Alert key={w} color="yellow" variant="light" p="xs">
              <Text size="xs">{w}</Text>
            </Alert>
          ))}
          <Box style={{ border: "1px solid var(--nz-border)", borderRadius: 8, overflow: "hidden" }}>
            <iframe title="Newsletter preview" sandbox="allow-same-origin" srcDoc={q.data.html} style={{ width: "100%", height: "70vh", border: 0, display: "block" }} />
          </Box>
        </Stack>
      )}
    </Modal>
  );
}

export function TestModal({ newsletter, onClose }: { newsletter: Newsletter; onClose: () => void }) {
  const smtp = useSection("smtp");
  const m = useNewsletterMutations();
  const [to, setTo] = useState("");
  useEffect(() => {
    if (!to && smtp.data) setTo(smtp.data.fromAddress || smtp.data.username || "");
  }, [smtp.data, to]);

  return (
    <Modal opened onClose={onClose} title={`Send a test of “${newsletter.name}”`} centered>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.send.mutate(
            { id: newsletter.id, testTo: to.trim() },
            {
              onSuccess: (r) => {
                if (r.status === "sent") {
                  notifyOk(`Test sent to ${to.trim()}`, "Test sent");
                  onClose();
                } else notifyError(new Error(r.error ?? r.status), "Test failed");
              },
              onError: (err) => notifyError(err, "Test failed"),
            },
          );
        }}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Builds the newsletter exactly as it would go out now and sends it to one address. Nobody else receives it.
          </Text>
          <TextInput label="Send to" type="email" value={to} onChange={(e) => setTo(e.currentTarget.value)} required data-autofocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={m.send.isPending} leftSection={<IconSend size={16} />}>
              Send test
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
