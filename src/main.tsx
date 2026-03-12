import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register Service Worker for PWA offline support — production only.
// In Vite dev mode the SW would cache stale pre-bundle chunks and cause
// "Invalid hook call" errors (duplicate-React from split chunk versions).
if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failure is non-fatal; app works without it
    });
  });
}
