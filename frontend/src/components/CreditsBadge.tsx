import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  creditsApi,
  billingApi,
  ApiError,
  type CreditsInfo,
  type BillingInfo,
} from "../lib/api";
import { useChiptune } from "../hooks/useChiptune";

/**
 * Play-credit coin badge. Rendered in the hosted deployment
 * (config.credits_enabled). Always shows the balance (🪙 N CREDITS) so a player
 * can see, before hitting New Game, how many plays they have — and at zero,
 * why they can't start one.
 *
 * Two variants: `toolbar` sits in the top-right AudioControls row and matches
 * those buttons' metrics (its "CREDIT(S)" word carries `audio-controls__label`
 * so it collapses with the BGM/SFX labels when the row runs out of room);
 * `block` is the standalone chip used inline by the out-of-credits prompt.
 *
 * When self-serve billing is on (config.billing_enabled, reflected in the
 * balance payload) the badge doubles as a buy button that opens the Stripe
 * pack picker; `openOnMount` lets the create flow surface that directly after a
 * 402. When billing is off it's a static informational chip (free plays reset
 * monthly).
 *
 * A change in the balance plays a coin animation (kick + floating "-N"/"+N").
 * A play is charged server-side when the game is created, so in practice the
 * spend fires as the player lands on stage select — the balance refetch below
 * is what surfaces it. It animates off the *observed* balance rather than a
 * client-side guess, so a purchase or a refund never fakes a spend.
 *
 * In a dev build the chip doubles as a top-up button (see `grant`), because
 * playtesting the charge flow otherwise means running out of plays.
 */
/** Dev-only top-up: plays granted per click, and the ceiling it stops at. */
const DEV_GRANT_SIZE = 3;
const DEV_GRANT_MAX = 99;

export default function CreditsBadge({
  openOnMount = false,
  variant = "block",
}: {
  openOnMount?: boolean;
  variant?: "block" | "toolbar";
}) {
  const [info, setInfo] = useState<CreditsInfo | null>(null);
  const [packs, setPacks] = useState<BillingInfo["packs"] | null>(null);
  const [open, setOpen] = useState(openOnMount);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Last change in balance, rendered as a floating "-N"/"+N" while the coin
  // animation runs; null when idle.
  const [delta, setDelta] = useState<number | null>(null);
  const lastBalance = useRef<number | null>(null);
  const { creditSpend, creditGrant } = useChiptune();

  // Apply a fetched balance, animating whatever changed. Nothing animates on
  // the first load — there is no "before" to have moved from.
  const apply = (next: CreditsInfo) => {
    const prev = lastBalance.current;
    lastBalance.current = next.balance;
    setInfo(next);
    if (prev === null || next.balance === prev) return;
    setDelta(next.balance - prev);
    if (next.balance < prev) creditSpend();
    else creditGrant();
  };

  // The toolbar badge is mounted once for the whole app, so it can't rely on a
  // remount to pick up a spent credit — refetch the balance on each navigation.
  const { pathname } = useLocation();
  useEffect(() => {
    creditsApi
      .me()
      .then(apply)
      .catch(() => setInfo(null));
    // apply closes over the chiptune helpers, which are recreated on every
    // SFX-toggle render; depending on it would double-fetch and could replay
    // the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Clear the floating "-N"/"+N" once its animation has run.
  useEffect(() => {
    if (delta === null) return;
    const t = setTimeout(() => setDelta(null), 900);
    return () => clearTimeout(t);
  }, [delta]);

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

  // Dev-only top-up: clicking the chip grants a few plays so the charge flow
  // can be exercised repeatedly without buying (or hand-editing a balance).
  // Stripped from production builds, and the endpoint only exists on a
  // credits-enabled backend — self-host has no credits and never renders this.
  const devGrant = import.meta.env.DEV && !billing;
  const grant = () => {
    if (!devGrant || balance >= DEV_GRANT_MAX) return;
    creditsApi
      .devGrant()
      .then(apply)
      .catch(() => {});
  };

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

  const toolbar = variant === "toolbar";
  const accent = out ? "var(--nes-red)" : "var(--nes-gray)";

  const chip: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    // Toolbar: match the AudioControls buttons' metrics exactly (fixed height,
    // same padding/type scale) so the row reads as one set of controls.
    fontSize: toolbar ? "0.8rem" : "0.7rem",
    height: toolbar ? 46 : undefined,
    padding: toolbar ? "6px 10px" : "8px 14px",
    borderWidth: 3,
    borderStyle: "solid",
    borderColor: accent,
    background: "var(--nes-darkgray)",
    boxShadow: `4px 4px 0 ${accent}`,
    color: out ? "var(--nes-red)" : "var(--nes-yellow)",
    whiteSpace: "nowrap",
  };

  const className = `credits-badge${delta !== null ? " credits-badge--bump" : ""}`;

  const label = (
    <>
      <span>🪙</span>
      {info && <span>{balance}</span>}
      {/* In the toolbar the word collapses along with the BGM/SFX labels when
          the row runs out of room, leaving "🪙 N". */}
      <span
        className={toolbar ? "audio-controls__label" : undefined}
        style={{ fontSize: toolbar ? "0.65rem" : undefined }}
      >
        {balance === 1 ? "CREDIT" : "CREDITS"}
      </span>
      {delta !== null && (
        <span
          className="credits-badge__delta"
          style={{
            fontSize: toolbar ? "0.8rem" : "0.7rem",
            color: delta < 0 ? "var(--nes-red)" : "var(--nes-green)",
          }}
        >
          {delta < 0 ? "−" : "+"}
          {Math.abs(delta)} 🪙
        </span>
      )}
    </>
  );

  // --- Billing off: informational chip (a top-up button in dev) --------------
  if (!billing) {
    const monthly = out
      ? "You're out of plays this month — free plays reset on the 1st."
      : "Free plays reset on the 1st of each month.";
    if (!devGrant) {
      return (
        <div className={className} title={monthly} style={chip}>
          {label}
        </div>
      );
    }
    return (
      <button
        className={className}
        title={
          balance >= DEV_GRANT_MAX
            ? `${monthly} (dev: already at the ${DEV_GRANT_MAX}-credit cap)`
            : `${monthly} (dev: click for +${DEV_GRANT_SIZE} credits)`
        }
        style={{ ...chip, fontFamily: "inherit", cursor: "pointer" }}
        onClick={grant}
      >
        {label}
      </button>
    );
  }

  // --- Billing on: clickable buy button + pack modal -------------------------
  return (
    <>
      <button
        className={className}
        style={{ ...chip, fontFamily: "inherit", cursor: "pointer" }}
        title="Buy more plays"
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
