import { useEffect, useState } from "react";
import { completeCallbackLogin } from "./auth";

export default function AuthCallback() {
  const [error, setError] = useState<string>();

  useEffect(() => {
    void (async () => {
      try {
        await completeCallbackLogin();
        window.location.replace("/");
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  return (
    <div className="auth-callback">
      {error ? (
        <>
          <h1>X sign-in failed</h1>
          <p className="nv-error">{error}</p>
          <a href="/">Back to simulator</a>
        </>
      ) : (
        <>
          <h1>Signing you in…</h1>
          <p className="nv-hint">Completing X (Twitter) login via 1Vault backend.</p>
        </>
      )}
    </div>
  );
}
