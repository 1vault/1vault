import { useEffect } from "react";

/** Popup is a thin launcher — product UX lives in the side panel. */
export function PopupApp() {
  useEffect(() => {
    void (async () => {
      const win = await chrome.windows.getCurrent();
      if (win.id != null) {
        await chrome.sidePanel.open({ windowId: win.id });
      }
      window.close();
    })();
  }, []);

  return (
    <div className="sp" style={{ minHeight: 120, padding: 16 }}>
      <div className="muted">Opening 1Vault side panel…</div>
    </div>
  );
}
