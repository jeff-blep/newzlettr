import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <Center mih={300}>
      <Stack align="center">
        <Title order={2}>Page not found</Title>
        <Text c="dimmed">That page doesn't exist.</Text>
        <Button component={Link} to="/">
          Go home
        </Button>
      </Stack>
    </Center>
  );
}
