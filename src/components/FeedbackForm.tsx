// src/components/FeedbackForm.tsx
import { useState } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";

// Where the backend lives. In dev, Vite proxies /api to the backend (see
// vite.config.ts). In production set VITE_API_BASE to your API's URL.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type Status = "idle" | "sending" | "sent" | "error";

const MAX_MESSAGE = 2000;

export function FeedbackForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const emailLooksValid = email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSend = message.trim().length > 0 && emailLooksValid && status !== "sending";

  const submit = async () => {
    if (!canSend) return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim() || null,
          message: message.trim(),
        }),
      });
      if (res.status === 429) {
        setStatus("error");
        setError("You're sending feedback too quickly — please wait a moment and try again.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setStatus("error");
        setError(data?.detail ?? "Something went wrong sending your feedback. Please try again.");
        return;
      }
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  };

  if (status === "sent") {
    return (
      <div className="mt-8 rounded-lg border border-accent/20 bg-accent/[0.04] p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
          <Check className="h-5 w-5 text-accent" />
        </div>
        <p className="mt-3 text-[15px] font-medium text-gray-900 dark:text-gray-50">Thanks for the feedback.</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">It's been received. We read everything that comes in.</p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm font-medium text-accent hover:underline"
        >
          Send more
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-xl">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Name
            </span>
            <input
              type="text"
              value={name}
              required
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              disabled={status === "sending"}
              className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:border-accent focus:outline-none disabled:opacity-50"
              placeholder="Your name"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Email <span className="font-normal normal-case text-gray-400 dark:text-gray-500">(optional)</span>
            </span>
            <input
              type="email"
              value={email}
              maxLength={200}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
              className={[
                "w-full rounded-md border bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none disabled:opacity-50",
                emailLooksValid ? "border-gray-200 dark:border-gray-700 focus:border-accent" : "border-red-300 dark:border-red-800 focus:border-red-400",
              ].join(" ")}
              placeholder="you@example.com"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Message
          </span>
          <textarea
            value={message}
            maxLength={MAX_MESSAGE}
            onChange={(e) => setMessage(e.target.value)}
            disabled={status === "sending"}
            rows={5}
            className="w-full resize-y rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm leading-relaxed text-gray-800 dark:text-gray-100 focus:border-accent focus:outline-none disabled:opacity-50"
            placeholder="What's working, what's broken, what you'd like to see…"
          />
          <span className="mt-1 block text-right text-xs text-gray-400 dark:text-gray-500">
            {message.length}/{MAX_MESSAGE}
          </span>
        </label>

        {error && (
          <p className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={!canSend}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500"
          >
            {status === "sending" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
              </span>
            ) : (
              "Send feedback"
            )}
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Only the message is required. Email is used solely to reply to you.
          </p>
        </div>
      </div>
    </div>
  );
}
