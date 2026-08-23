import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PopupApp } from "./PopupApp";
import "../styles/shared.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
);
