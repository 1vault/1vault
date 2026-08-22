import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthCallback from "./AuthCallback";
import "./index.css";

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const isCallback = path === "/auth/callback";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isCallback ? <AuthCallback /> : <App />}</React.StrictMode>
);
