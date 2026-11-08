import { useEffect } from "react";
import { Button, Group, Modal, Text } from "@mantine/core";
import { useBlocker } from "react-router-dom";

/**
 * Warns before leaving a page with unsaved edits: in-app navigation shows a modal,
 * closing/reloading the tab shows the browser prompt. Render the returned element.
 */
export function useUnsavedChanges(dirty: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <Modal opened={blocker.state === "blocked"} onClose={() => blocker.reset?.()} title="Unsaved changes" centered>
      <Text size="sm">You have unsaved changes on this page. Leave without saving?</Text>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={() => blocker.reset?.()}>
          Stay
        </Button>
        <Button color="red" onClick={() => blocker.proceed?.()}>
          Discard changes
        </Button>
      </Group>
    </Modal>
  );
}
