import { useEffect, useState } from "react";
import {
  creditsApi,
  billingApi,
  ApiError,
  type CreditsInfo,
  type BillingInfo,
} from "../lib/api";

/**
 * Play-credit coin badge. Rendered in the hosted deployment
 * (config.credits_enabled). Always shows the balance (🪙 N CREDITS) so a player
 * can see, before hitting New Game, how many plays they have — and at zero,
 * why they can't start one.
 *
 * When self-serve billing is on (config.billing_enabled, reflected in the
 * balance payload) the badge doubles as a buy button that opens the Stripe
 * pack picker; `openOnMount` lets the create flow surface that directly after a
 * 402. When billing is off it's a static informational chip (free plays reset
 * monthly).
 */
export default function CreditsBadge({
  openOnMount = false,
}: {
  openOnMount?: boolean;
}) {
  const [info, setInfo] = useState<CreditsInfo | null>(null);
  const [packs, setPacks] = useState<BillingInfo["packs"] | null>(null);
  const [open, setOpen] = useState(openOnMount);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    creditsApi
      .me()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const billing = info?.billing_enabled ?? false;
  const balance = info?.balance ?? 0;
  const out = info !== null && balance <= 0;

  // Packs are only needed inside the buy modal — fetch them lazily when it opens.
  useEffect(() => {
    if (open && billing && !packs) {
      billingApi
        .me()
        .then((b) => setPacks(b.packs))
        .catch(() => {});
    }
  }, [open, billing, packs]);

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

  const label = info
    ? `🪙 ${balance} ${balance === 1 ? "CREDIT" : "CREDITS"}`
    : "🪙 CREDITS";

  // --- Billing off: static informational chip --------------------------------
  if (!billing) {
    return (
      <div
        title={
          out
            ? "You're out of plays this month — free plays reset on the 1st."
            : "Free plays reset on the 1st of each month."
        }
        style={{
          fontSize: "0.7rem",
          padding: "8px 14px",
          borderWidth: 3,
          borderStyle: "solid",
          borderColor: out ? "var(--nes-red)" : "var(--nes-gray)",
          background: "var(--nes-darkgray)",
          boxShadow: `4px 4px 0 ${out ? "var(--nes-red)" : "var(--nes-gray)"}`,
          color: out ? "var(--nes-red)" : "var(--nes-yellow)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    );
  }

  // --- Billing on: clickable buy button + pack modal -------------------------
  return (
    <>
      <button
        className="pixel-btn"
        style={{ fontSize: "0.7rem", padding: "8px 14px" }}
        onClick={() => setOpen(true)}
      >
        {label}
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
              🪙 BUY CREDITS
            </h2>
            <p
              style={{
                fontSize: "0.65rem",
                color: "var(--nes-gray)",
                lineHeight: 1.9,
              }}
            >
              You have {balance} credits. 1 credit = 1 new game (resuming is
              free).
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {packs &&
                Object.entries(packs).map(([key, p]) => (
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
