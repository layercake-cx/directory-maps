import "@mantine/core/styles.css";
import "./style.css";
import { installGlobalErrorHandlers } from "./lib/errorLogger.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import Root from "./Root.jsx";

installGlobalErrorHandlers();

const theme = createTheme({
  fontFamily: "inherit",
  primaryColor: "dark",
  primaryShade: 9,
  defaultRadius: "md",
  components: {
    Button: {
      defaultProps: { radius: "md" },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <MantineProvider theme={theme}>
    <Root />
  </MantineProvider>
);
