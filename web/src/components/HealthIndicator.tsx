import { ActionIcon, Indicator, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useHealth } from "../api/sections";

/** Header icon: green check when healthy, warning with a count otherwise (links to Status). */
export function HealthIndicator() {
  const { data } = useHealth();
  const checks = data?.checks ?? [];
  const errors = checks.filter((c) => c.level === "error").length;
  const color = errors ? "red" : checks.length ? "yellow" : "green";
  const label = checks.length ? `${checks.length} health issue${checks.length > 1 ? "s" : ""}` : data?.checkedAt ? "All systems healthy" : "Checking…";

  return (
    <Tooltip label={label}>
      <Indicator disabled={!checks.length} label={checks.length} size={16} color={color} offset={4}>
        <ActionIcon component={Link} to="/system/status" variant="subtle" color={color} size="lg" aria-label={label}>
          {checks.length ? <IconAlertTriangle size={20} /> : <IconCircleCheck size={20} />}
        </ActionIcon>
      </Indicator>
    </Tooltip>
  );
}
