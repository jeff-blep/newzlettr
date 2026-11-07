import { notifications } from "@mantine/notifications";

export const notifyOk = (message: string, title = "Saved") => notifications.show({ title, message, color: "green" });

export const notifyError = (err: unknown, title = "Something went wrong") =>
  notifications.show({ title, message: err instanceof Error ? err.message : String(err), color: "red", autoClose: 8000 });
