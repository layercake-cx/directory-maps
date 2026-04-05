import "./style.css";
import { installGlobalErrorHandlers } from "./lib/errorLogger.js";
import React from "react";
import ReactDOM from "react-dom/client";
import Root from "./Root.jsx";

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
