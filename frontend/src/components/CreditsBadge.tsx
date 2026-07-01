import { useEffect, useState } from "react";
import { billingApi, ApiError, type BillingInfo } from "../lib/api";

/**
 * Credits balance + buy modal. Rendered only in the hosted deployment
 * (config.billing_enabled). `openOnMount` lets the create flow surface it
 * directly after a 402.
 */
export default function CreditsBadge({
  openOnMount = false,
}: {
  openOnMount?: boolean;
}) {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [open, setOpen] = useState(openOnMount);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    billingApi
      .me()
      .then(setInfo)
      .catch(() => setInfo(null));

  useEffect(() => {
    void load();
  }, []);

  const buy = async (pack: string) => {
    setBusy(pack);
    setError(null);
    try {
      const { url } = await billingApi.checkout(pack);
      window.location.assign(url); // Stripe-hosted checkout
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not start checkout");
      setBusy(null);
    }
  };

  return (
    <>
      <button
        className="pixel-btn"
        style={{ fontSize: "0.7rem", padding: "8px 14px" }}
        onClick={() => setOpen(true)}
      >
        💳 {info ? `${info.credits_balance} CREDITS` : "CREDITS"}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              background: "var(--nes-darkgray)",
              border: "4px solid var(--nes-cyan)",
              boxShadow: "6px 6px 0 var(--nes-cyan)",
              padding: "20px 24px",
              width: "min(440px, 100%)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <h2 className="text-cyan" style={{ fontSize: "0.9rem" }}>
              💳 BUY CREDITS
            </h2>
            <p
              style={{
                fontSize: "0.65rem",
                color: "var(--nes-gray)",
                lineHeight: 1.9,
              }}
            >
              You have {info?.credits_balance ?? 0} credits. 1 credit = 1 new
              game (resuming is free).
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {info &&
                Object.entries(info.packs).map(([key, p]) => (
                  <button
                    key={key}
                    className="pixel-btn pixel-btn--green"
                    style={{ fontSize: "0.7rem", padding: "12px 14px" }}
                    disabled={busy !== null}
                    onClick={() => void buy(key)}
                  >
                    {busy === key
                      ? "REDIRECTING…"
                      : `${p.credits} PLAYS — $${p.price_usd.toFixed(2)}`}
                  </button>
                ))}
            </div>

            {error && (
              <p style={{ fontSize: "0.6rem", color: "var(--nes-red)" }}>
                {error}
              </p>
            )}

            <button
              className="pixel-btn"
              style={{
                fontSize: "0.65rem",
                padding: "10px 18px",
                alignSelf: "flex-end",
              }}
              onClick={() => setOpen(false)}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </>
  );
}
