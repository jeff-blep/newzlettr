import { createTheme, type MantineColorsTuple } from "@mantine/core";

// Newzlettr's own accent (violet), in the spirit of the *arr apps' single-accent dark UI.
const newz: MantineColorsTuple = [
  "#f0ecff",
  "#dcd4ff",
  "#b6a6ff",
  "#8f74ff",
  "#7c5cff",
  "#6c49ff",
  "#6340fe",
  "#5233e3",
  "#482ccb",
  "#3c22b3",
];

export const theme = createTheme({
  primaryColor: "newz",
  primaryShade: { light: 6, dark: 4 },
  colors: { newz },
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  defaultRadius: "sm",
  components: {
    Button: { defaultProps: { size: "sm" } },
    TextInput: { defaultProps: { size: "sm" } },
    Card: { defaultProps: { withBorder: true, radius: "sm" } },
  },
});

/** Layout constants shared by the shell. */
export const HEADER_HEIGHT = 56;
export const SIDEBAR_WIDTH = 220;
