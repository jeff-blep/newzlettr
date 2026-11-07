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
import { GeneralSettings } from "../pages/settings/GeneralSettings";
import { SystemStatus } from "../pages/system/SystemStatus";
import { SystemTasks } from "../pages/system/SystemTasks";
import { ConnectionsSettings } from "../pages/settings/ConnectionsSettings";
import { EmailSettings } from "../pages/settings/EmailSettings";
import { ImagesSettings } from "../pages/settings/ImagesSettings";
import { RecipientsPage } from "../pages/RecipientsPage";
import { HostPickPage } from "../pages/HostPickPage";
import { StatsPage } from "../pages/StatsPage";
import { TemplatesPage } from "../pages/templates/TemplatesPage";
import { TemplateEditorPage } from "../pages/templates/TemplateEditorPage";
import { ContentSettings } from "../pages/settings/ContentSettings";
import { NewslettersPage } from "../pages/newsletters/NewslettersPage";
import { ActivityPage } from "../pages/ActivityPage";
import { SystemLogs } from "../pages/system/SystemLogs";
import { SystemBackup } from "../pages/system/SystemBackup";

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
  /** Extra routes under this section that don't appear in the sidebar (e.g. detail pages). */
  routes?: { path: string; element: ReactNode }[];
}

/** Single source of truth for the sidebar and the routes. */
export const NAV: NavItem[] = [
  {
    label: "Newsletters",
    path: "/newsletters",
    icon: <IconMail size={18} />,
    element: <NewslettersPage />,
  },
  {
    label: "Templates",
    path: "/templates",
    icon: <IconTemplate size={18} />,
    element: <TemplatesPage />,
    routes: [{ path: "/templates/:id", element: <TemplateEditorPage /> }],
  },
  {
    label: "Recipients",
    path: "/recipients",
    icon: <IconUsers size={18} />,
    element: <RecipientsPage />,
  },
  {
    label: "Host's Pick",
    path: "/host-pick",
    icon: <IconStar size={18} />,
    element: <HostPickPage />,
  },
  {
    label: "Stats",
    path: "/stats",
    icon: <IconChartBar size={18} />,
    element: <StatsPage />,
  },
  {
    label: "Activity",
    path: "/activity",
    icon: <IconActivity size={18} />,
    element: <ActivityPage />,
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
      { label: "Content", path: "/settings/content", element: <ContentSettings /> },
    ],
  },
  {
    label: "System",
    path: "/system",
    icon: <IconDeviceDesktopAnalytics size={18} />,
    children: [
      { label: "Status", path: "/system/status", element: <SystemStatus /> },
      { label: "Tasks", path: "/system/tasks", element: <SystemTasks /> },
      { label: "Logs", path: "/system/logs", element: <SystemLogs /> },
      { label: "Backup", path: "/system/backup", element: <SystemBackup /> },
    ],
  },
];
