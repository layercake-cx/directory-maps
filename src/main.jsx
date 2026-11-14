import "@mantine/core/styles.css";
import "./style.css";
import { installGlobalErrorHandlers } from "./lib/errorLogger.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import Root from "./Root.jsx";

installGlobalErrorHandlers();

// Teal scale built around the shell accent (#0f5e63 = shade 6). Discover UI phase 1.
const teal = [
  "#e6f0ef", "#cfe3e2", "#a9cfcd", "#7db6b8", "#4e9a9e",
  "#2a7e83", "#0f5e63", "#0c4f53", "#0a4346", "#073538",
];

const theme = createTheme({
  colors: { teal },
  primaryColor: "teal",
  primaryShade: 6,
  fontFamily: "var(--font-body)",
  headings: { fontFamily: "var(--font-display)" },
  defaultRadius: 10,
  components: {
    Button: {
      defaultProps: { radius: 10 },
      // 44px default height; explicit small sizes (xs/sm/compact-*) keep Mantine's own.
      styles: (_theme, props) =>
        !props.size || props.size === "md" ? { root: { height: 44 } } : {},
    },
    Input: {
      styles: { input: { borderRadius: 10, borderColor: "#e3dfd8" } },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <MantineProvider theme={theme}>
    <Root />
  </MantineProvider>
);
