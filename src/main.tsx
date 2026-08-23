import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ThemeProvider } from "./hooks/use-theme.tsx";
import { installStaleChunkRecovery } from "./lib/chunk-reload";
import "./index.css";

// Must run before the first lazy route is reached — a tab left open across a
// deploy asks for the previous build's chunk names and would otherwise dead-end
// on the ErrorBoundary screen.
installStaleChunkRecovery();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
