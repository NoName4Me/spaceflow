import { createRoot } from "react-dom/client";
import { App } from "./App";
import { WorkspaceProvider } from "./workspace";
import "./theme.css";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <WorkspaceProvider>
    <App />
  </WorkspaceProvider>,
);
