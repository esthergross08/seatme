"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Registers the service worker and shows a small "Install SeatMe" banner on the
// signed-in landing screens. Android/Chrome gets a real install button (via the
// beforeinstallprompt event); iPhone/iPad get the Share → Add to Home Screen
// instructions, since Safari has no install API.

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  gold: "#A8823C",
  line: "#E4DCC9",
  muted: "#736D5F",
};

// Only nudge people who are already using the product — never on the public
// marketing pages, and never on guests' RSVP pages.
const PROMPT_PATHS = ["/home", "/events"];
const DISMISS_KEY = "seatme-install-dismissed-at";
const DISMISS_DAYS = 30;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; tell it apart by touch support.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function PwaSupport() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Production only: in `next dev` a service worker caching build chunks
    // would make hot reload confusing.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Not fatal — the site works the same without it.
        });
    }

    if (isStandalone() || recentlyDismissed()) return;
    setHidden(false);
    if (isIOS()) setShowIOS(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setHidden(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onThisPage = PROMPT_PATHS.includes(pathname);
  if (hidden || !onThisPage || (!deferred && !showIOS)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // storage blocked (private mode) — just hide for this visit
    }
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setHidden(true);
    else dismiss();
  };

  return (
    <div
      role="dialog"
      aria-label="Install SeatMe"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pt-2"
      style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div
        className="mx-auto max-w-md flex items-center gap-3 rounded-2xl border p-3 shadow-lg"
        style={{ backgroundColor: "#FFFFFF", borderColor: C.line, color: C.ink }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl shrink-0" />
        <div className="flex-1 min-w-0 text-sm leading-snug">
          <div className="font-semibold">Get the SeatMe app</div>
          {deferred ? (
            <div style={{ color: C.muted }}>Opens full-screen from your home screen.</div>
          ) : (
            <div style={{ color: C.muted }}>
              Tap <ShareIcon /> Share, then <strong style={{ color: C.ink }}>Add to Home Screen</strong>.
            </div>
          )}
        </div>
        {deferred && (
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: C.ink, color: C.paper }}
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="shrink-0 rounded-full w-8 h-8 flex items-center justify-center text-lg"
          style={{ color: C.muted }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline", verticalAlign: "-2px" }}
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
