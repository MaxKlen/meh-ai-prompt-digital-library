"use client";

import { useEffect, useState } from "react";
import { Check, Download, Smartphone, Wifi, WifiOff } from "lucide-react";

type OfflinePhase = "checking" | "available" | "saving" | "ready" | "error" | "unsupported";
type OfflineStatus = { ready: boolean; version: string; total: number; bytes: number };
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function workerStatus(worker: ServiceWorker, type = "GET_OFFLINE_STATUS", timeoutMs = 5000): Promise<OfflineStatus> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("The offline copy could not be verified."));
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<OfflineStatus>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      if (typeof event.data?.ready !== "boolean") reject(new Error("Invalid offline status."));
      else resolve(event.data);
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}

function activeWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) return Promise.reject(new Error("No offline worker was installed."));
  if (worker.state === "activated") return Promise.resolve(worker);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("The download took too long. Please try again.")), 180000);
    function finish(error?: Error) {
      window.clearTimeout(timeout);
      worker!.removeEventListener("statechange", changed);
      if (error) reject(error);
      else resolve(worker!);
    }
    function changed() {
      if (worker!.state === "activated") finish();
      else if (worker!.state === "redundant") finish(new Error("Some files could not be saved. Please retry online."));
    }
    worker.addEventListener("statechange", changed);
    changed();
  });
}

export default function OfflineControls() {
  const [phase, setPhase] = useState<OfflinePhase>("checking");
  const [online, setOnline] = useState(true);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    let mounted = true;
    const connectionChanged = () => setOnline(navigator.onLine);
    const checkSavedCopy = async () => {
      if (!("serviceWorker" in navigator) || !window.isSecureContext) {
        if (mounted) setPhase("unsupported");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const worker = registration?.active;
        const status = worker ? await workerStatus(worker) : null;
        if (mounted) setPhase(status?.ready ? "ready" : "available");
      } catch {
        if (mounted) setPhase("available");
      }
    };
    const workerMessage = (event: MessageEvent) => {
      if (!mounted) return;
      const message = event.data;
      if (message?.type === "OFFLINE_PROGRESS" && Number.isFinite(message.completed) && Number.isFinite(message.total)) {
        setPhase("saving");
        setProgress({ completed: message.completed, total: message.total });
      } else if (message?.type === "OFFLINE_READY") {
        void checkSavedCopy();
      } else if (message?.type === "OFFLINE_ERROR") {
        setError("The download did not finish. Reconnect and try again; device storage may be full.");
        void checkSavedCopy();
      }
    };
    const canInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const didInstall = () => { setInstalled(true); setInstallPrompt(null); setShowHelp(false); };
    connectionChanged();
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    window.addEventListener("online", connectionChanged);
    window.addEventListener("offline", connectionChanged);
    window.addEventListener("beforeinstallprompt", canInstall);
    window.addEventListener("appinstalled", didInstall);
    navigator.serviceWorker?.addEventListener("message", workerMessage);
    navigator.serviceWorker?.addEventListener("controllerchange", checkSavedCopy);
    void checkSavedCopy();
    return () => {
      mounted = false;
      window.removeEventListener("online", connectionChanged);
      window.removeEventListener("offline", connectionChanged);
      window.removeEventListener("beforeinstallprompt", canInstall);
      window.removeEventListener("appinstalled", didInstall);
      navigator.serviceWorker?.removeEventListener("message", workerMessage);
      navigator.serviceWorker?.removeEventListener("controllerchange", checkSavedCopy);
    };
  }, []);

  async function saveOffline() {
    setPhase("saving");
    setError("");
    setProgress({ completed: 0, total: 0 });
    try {
      // A request, not a guarantee: the OS/browser still controls device storage.
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      if (registration.active && !registration.installing) await registration.update();
      const worker = await activeWorker(registration);
      let status = await workerStatus(worker);
      if (!status.ready) status = await workerStatus(worker, "PREPARE_OFFLINE", 180000);
      if (!status.ready) throw new Error("The offline copy is incomplete.");
      setPhase("ready");
    } catch {
      // An interrupted update must not hide a previously complete saved copy.
      const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
      const saved = registration?.active ? await workerStatus(registration.active).catch(() => null) : null;
      setPhase(saved?.ready ? "ready" : "error");
      setError(navigator.onLine ? "Could not save every file. Please try again; device storage may be full." : "Connect to the internet once, then tap Try again to finish saving.");
    }
  }

  async function installApp() {
    if (!installPrompt) { setShowHelp((visible) => !visible); return; }
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } catch {
      setInstallPrompt(null);
      setShowHelp(true);
    }
  }

  const ready = phase === "ready";
  const saving = phase === "saving";
  const title = ready ? (online ? "Ready offline" : "You’re offline · library ready") : saving ? "Saving for offline…" : phase === "checking" ? "Checking saved library…" : phase === "unsupported" ? "Open in Safari or Chrome to save offline" : "Your library, wherever you go";
  const description = ready ? "Search, browse, view and copy — no connection needed." : saving ? (progress.total ? `${progress.completed} of ${progress.total} files saved. Keep this page open.` : "Preparing the app and full library. Keep this page open.") : phase === "unsupported" ? "Offline storage needs a supported browser on a secure HTTPS address." : "Save the app and all local prompts on this device (~35 MB).";

  return (
    <section className="offline-panel mb-6" aria-label="Offline app">
      <div className="flex items-start gap-3">
        <span className={`offline-icon ${ready ? "offline-icon-ready" : ""}`} aria-hidden="true">{ready ? <Check size={18} /> : saving ? <Download size={18} /> : online ? <Wifi size={18} /> : <WifiOff size={18} />}</span>
        <div className="min-w-0 flex-1">
          <p role="status" aria-live="polite" className="text-[12px] font-semibold text-ink">{title}</p>
          <p className="mt-1 text-[11px] leading-5 text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
        {!ready && <button type="button" className="offline-action" disabled={saving || phase === "checking" || phase === "unsupported"} onClick={() => void saveOffline()}><Download size={14} />{saving ? "Saving…" : phase === "error" ? "Try again" : "Save offline"}</button>}
        {installed ? <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-forest"><Smartphone size={14} />Installed</span> : <button type="button" className="offline-action offline-action-secondary" aria-expanded={showHelp} aria-controls="install-help" onClick={() => void installApp()}><Smartphone size={14} />Install app</button>}
        {ready && <button type="button" className="text-button px-2 py-2" aria-expanded={showHelp} aria-controls="install-help" onClick={() => setShowHelp((visible) => !visible)}>Offline help</button>}
      </div>
      {saving && <progress className="offline-progress" max={progress.total || 1} value={progress.total ? progress.completed : undefined} aria-label="Offline download progress" />}
      {error && <p role="alert" className="offline-detail text-[11px] leading-5 text-[#95502a]">{error}</p>}
      {showHelp && <div id="install-help" className="offline-detail space-y-2 text-[11px] leading-5 text-muted">
        <p><strong className="text-ink">One-time setup:</strong> while online, tap <strong>Save offline</strong> and wait for <strong>Ready offline</strong>. This saves the app and the entire library, not just the current results.</p>
        <p><strong className="text-ink">iPhone / iPad:</strong> open in Safari, tap Share, then Add to Home Screen and Add. <strong className="text-ink">Android:</strong> open in Chrome, then use its menu → Install app or Add to Home screen.</p>
        <p>Open the home-screen app once while online and confirm <strong>Ready offline</strong>; tap Save offline there if needed. Then it can reopen and search in airplane mode. An embedded chat browser may not offer installation.</p>
        <p>Use a regular, non-private browser. Clearing site data or device storage cleanup can remove the saved copy, so check its status before going offline. External source websites still need a connection. Keep the same site address for your saved copy.</p>
      </div>}
    </section>
  );
}
