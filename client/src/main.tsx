import { createRoot } from "react-dom/client";
import { App } from "./App";
import { WorkspaceProvider } from "./workspace";
import "./shadcn.css";
import "./theme.css";
import "./styles.css";
import "./ui-foundation.css";
createRoot(document.getElementById("root")!).render(
  <WorkspaceProvider>
    <App />
  </WorkspaceProvider>,
);
