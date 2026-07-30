import { useEffect, useRef, useState } from "react";
import { authApi, ApiError } from "../lib/api";
import { setJwtSession } from "../lib/auth";
import { useGameName } from "../store/configStore";

/**
 * Google sign-in screen, shown only in the hosted deployment (config.auth ===
 * "google"). Loads Google Identity Services, renders the official button, and
 * exchanges the credential for an app JWT via the hosted /api/auth/google
 * endpoint.
 */

const GIS_SRC = "https://accounts.google.com/gsi/client";

export default function GoogleSignIn({
  clientId,
  onSignedIn,
}: {
  clientId: string;
  onSignedIn: () => void;
}) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const gameName = useGameName();

  useEffect(() => {
    let cancelled = false;

    const handleCredential = async (resp: { credential: string }) => {
      try {
        const result = await authApi.googleSignIn(resp.credential);
        setJwtSession(result.access_token, result.user);
        onSignedIn();
      } catch (e) {
        setError(e instanceof ApiError ? e.detail : "Sign-in failed");
      }
    };

    const init = () => {
      if (cancelled || !window.google || !btnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "filled_black",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
      });
    };

    if (window.google) {
      init();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${GIS_SRC}"]`,
      );
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.src = GIS_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", init);
      return () => {
        cancelled = true;
        script.removeEventListener("load", init);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [clientId, onSignedIn]);

  return (
    <div
      className="screen"
      style={{
        gap: 28,
        maxWidth: 520,
        margin: "0 auto",
        width: "100%",
        padding: "56px 24px",
        textAlign: "center",
      }}
    >
      <h1
        className="text-cyan animate-glow"
        style={{ fontSize: "1.8rem", letterSpacing: 3 }}
      >
        {gameName.toUpperCase()}
      </h1>
      <p
        style={{ fontSize: "0.8rem", color: "var(--nes-gray)", lineHeight: 2 }}
      >
        DEFEND YOUR IDEA AGAINST A GAUNTLET OF AI CRITICS
      </p>
      <p
        style={{
          fontSize: "0.7rem",
          color: "var(--nes-yellow)",
          lineHeight: 2,
        }}
      >
        Sign in to play
      </p>
      <div ref={btnRef} style={{ display: "flex", justifyContent: "center" }} />
      {error && (
        <p style={{ fontSize: "0.65rem", color: "var(--nes-red)" }}>{error}</p>
      )}
    </div>
  );
}
