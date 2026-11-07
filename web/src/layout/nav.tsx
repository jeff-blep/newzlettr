import type { ReactNode } from "react";
import {
  IconActivity,
  IconChartBar,
  IconMail,
  IconSettings,
  IconStar,
  IconTemplate,
  IconUsers,
  IconDeviceDesktopAnalytics,
} from "@tabler/icons-react";
import { Placeholder } from "../pages/Placeholder";
import { GeneralSettings } from "../pages/settings/GeneralSettings";
import { SystemStatus } from "../pages/system/SystemStatus";
import { SystemTasks } from "../pages/system/SystemTasks";
import { ConnectionsSettings } from "../pages/settings/ConnectionsSettings";
import { EmailSettings } from "../pages/settings/EmailSettings";
import { ImagesSettings } from "../pages/settings/ImagesSettings";

export interface NavChild {
  label: string;
  path: string;
  element: ReactNode;
}
export interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  element?: ReactNode;
  children?: NavChild[];
}

const soon = (title: string, milestone: number, what: string) => (
  <Placeholder title={title} milestone={milestone} description={what} />
);

/** Single source of truth for the sidebar and the routes. */
export const NAV: NavItem[] = [
  {
    label: "Newsletters",
    path: "/newsletters",
    icon: <IconMail size={18} />,
    element: soon("Newsletters", 5, "Scheduled newsletters, next run, last send, send now."),
  },
  {
    label: "Templates",
    path: "/templates",
    icon: <IconTemplate size={18} />,
    element: soon("Templates", 4, "Rich-text templates with insertable Plex/Tautulli cards and a true preview."),
  },
  {
    label: "Recipients",
    path: "/recipients",
    icon: <IconUsers size={18} />,
    element: soon("Recipients", 3, "Who gets the newsletter. Import from Tautulli."),
  },
  {
    label: "Host's Pick",
    path: "/host-pick",
    icon: <IconStar size={18} />,
    element: soon("Host's Pick", 3, "Feature one title from your Plex library with a note."),
  },
  {
    label: "Stats",
    path: "/stats",
    icon: <IconChartBar size={18} />,
    element: soon("Stats", 3, "Library totals and what's been watched."),
  },
  {
    label: "Activity",
    path: "/activity",
    icon: <IconActivity size={18} />,
    element: soon("Activity", 5, "Every send: when, to how many, and whether it worked."),
  },
  {
    label: "Settings",
    path: "/settings",
    icon: <IconSettings size={18} />,
    children: [
      { label: "General", path: "/settings/general", element: <GeneralSettings /> },
      { label: "Connections", path: "/settings/connections", element: <ConnectionsSettings /> },
      { label: "Email", path: "/settings/email", element: <EmailSettings /> },
      { label: "Images", path: "/settings/images", element: <ImagesSettings /> },
      { label: "Content", path: "/settings/content", element: soon("Content", 4, "Items per card, excluded shows, accent color.") },
    ],
  },
  {
    label: "System",
    path: "/system",
    icon: <IconDeviceDesktopAnalytics size={18} />,
    children: [
      { label: "Status", path: "/system/status", element: <SystemStatus /> },
      { label: "Tasks", path: "/system/tasks", element: <SystemTasks /> },
      { label: "Logs", path: "/system/logs", element: soon("Logs", 6, "Application log viewer.") },
      { label: "Backup", path: "/system/backup", element: soon("Backup", 6, "Download or restore your /config.") },
    ],
  },
];
