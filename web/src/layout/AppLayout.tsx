import { useState, type ReactNode } from "react";
import { AppShell, Badge, Burger, Group, Menu, ScrollArea, UnstyledButton, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronDown, IconKey, IconLogout, IconUserCircle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useLocation } from "react-router-dom";
import { authKey, logout, useAuthStatus } from "../api/auth";
import { ChangePasswordModal } from "../components/ChangePasswordModal";
import { HealthIndicator } from "../components/HealthIndicator";
import { useHealth } from "../api/sections";
import { HEADER_HEIGHT, SIDEBAR_WIDTH } from "../theme";
import { NAV } from "./nav";
import classes from "./AppLayout.module.css";

export function AppLayout({ children }: { children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const [pwOpen, setPwOpen] = useState(false);
  const { pathname } = useLocation();
  const auth = useAuthStatus();
  const qc = useQueryClient();
  const health = useHealth();
  const issues = health.data?.checks ?? [];
  const issueColor = issues.some((c) => c.level === "error") ? "red" : "yellow";

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: SIDEBAR_WIDTH, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header className={classes.header}>
        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" color="white" />
        <Link to="/" className={classes.brand}>
          <img src="/favicon.svg" width={28} height={28} alt="" />
          Newzlettr
        </Link>
        <Group ml="auto" gap="md">
          <HealthIndicator />
          <Menu position="bottom-end" width={200}>
            <Menu.Target>
              <UnstyledButton>
                <Group gap={6} c="gray.3">
                  <IconUserCircle size={20} />
                  <Text size="sm">{auth.data?.username ?? (auth.data?.localBypass ? "Local network" : "")}</Text>
                  <IconChevronDown size={14} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              {auth.data?.username && (
                <Menu.Item leftSection={<IconKey size={16} />} onClick={() => setPwOpen(true)}>
                  Change password
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<IconLogout size={16} />}
                onClick={async () => {
                  await logout();
                  await qc.invalidateQueries({ queryKey: authKey });
                }}
              >
                Log out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar className={classes.navbar}>
        <ScrollArea>
          {NAV.map((item) => {
            const inSection = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <div key={item.path}>
                <NavLink
                  to={item.children?.length ? item.children[0]!.path : item.path}
                  className={inSection ? classes.itemActive : classes.item}
                  onClick={item.children?.length ? undefined : close}
                >
                  {item.icon}
                  {item.label}
                  {item.path === "/system" && issues.length > 0 && (
                    <Badge size="sm" circle color={issueColor} ml="auto">
                      {issues.length}
                    </Badge>
                  )}
                </NavLink>
                {inSection &&
                  item.children?.map((c) => (
                    <NavLink
                      key={c.path}
                      to={c.path}
                      end
                      onClick={close}
                      className={({ isActive }) => (isActive ? classes.childActive : classes.child)}
                    >
                      {c.label}
                    </NavLink>
                  ))}
              </div>
            );
          })}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main className={classes.main}>{children}</AppShell.Main>
      <ChangePasswordModal opened={pwOpen} onClose={() => setPwOpen(false)} />
    </AppShell>
  );
}
