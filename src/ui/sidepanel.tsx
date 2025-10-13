import React from "react";
import { createRoot } from "react-dom/client";
import PanelApp from "./panelApp";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Side panel root element not found");
}

createRoot(container).render(
  <React.StrictMode>
    <PanelApp />
  </React.StrictMode>
);
