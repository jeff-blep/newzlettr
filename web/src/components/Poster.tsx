import { Center, Image } from "@mantine/core";
import { IconMovie } from "@tabler/icons-react";
import { posterUrl } from "../api/media";

/** 2:3 poster from Plex (via the authenticated image proxy) with a placeholder fallback. */
export function Poster({ thumb, width = 80, radius = "sm" }: { thumb?: string; width?: number; radius?: string }) {
  const h = Math.round(width * 1.5);
  const fallback = (
    <Center w={width} h={h} bg="dark.6" style={{ borderRadius: 4, flexShrink: 0 }}>
      <IconMovie size={width / 3} color="var(--mantine-color-dark-2)" />
    </Center>
  );
  if (!thumb) return fallback;
  return (
    <Image
      src={posterUrl(thumb, Math.min(600, width * 2))}
      w={width}
      h={h}
      radius={radius}
      fit="cover"
      loading="lazy"
      fallbackSrc={undefined}
      style={{ flexShrink: 0, background: "var(--mantine-color-dark-6)" }}
      alt=""
    />
  );
}
