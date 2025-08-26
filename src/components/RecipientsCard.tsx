// src/components/RecipientsCard.tsx
import React from "react";

type Recipient = { fullName: string; email: string };

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

export default function RecipientsCard() {
  const [recipients, setRecipients] = React.useState<Recipient[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Add Recipient Modal
  const [showAdd, setShowAdd] = React.useState(false);
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");

  // --------- IO helpers wired to /api/recipients ----------
  async function loadRecipients() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/recipients");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = await r.json();
      setRecipients(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveRecipients(next: Recipient[], showNotice = false) {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const list: Recipient[] = Array.isArray(j?.recipients) ? j.recipients : next;
      setRecipients(list);
      if (showNotice) setNotice("Recipients saved.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadRecipients();
      if (!cancelled) {
        /* no-op */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --------- Actions ----------
  async function importFromTautulli() {
    setError(null);
    setNotice(null);
    try {
      const r = await fetch("/api/tautulli/users");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const fetched: Recipient[] = Array.isArray(j?.users)
        ? j.users.map((u: any) => ({
            fullName: String(u?.name || "").trim() || String(u?.email || "").trim(),
            email: String(u?.email || "").trim().toLowerCase(),
          }))
        : [];

      // Merge unique by email
      const byEmail = new Map<string, Recipient>();
      for (const rec of recipients) {
        if (isEmail(rec.email)) byEmail.set(rec.email.trim().toLowerCase(), rec);
      }

      let added = 0;
      for (const u of fetched) {
        if (!isEmail(u.email)) continue;
        const key = u.email.toLowerCase();
        if (!byEmail.has(key)) {
          byEmail.set(key, { fullName: u.fullName || u.email, email: u.email });
          added++;
        } else {
          const existing = byEmail.get(key)!;
          if (!existing.fullName && u.fullName) existing.fullName = u.fullName;
        }
      }

      const next = Array.from(byEmail.values()).sort((a, b) =>
        (a.fullName || a.email).localeCompare(b.fullName || b.email, undefined, { sensitivity: "base" })
      );

      await saveRecipients(next, false); // autosave
      setNotice(`Imported ${added} new recipient${added === 1 ? "" : "s"} from Tautulli.`);
    } catch (e: any) {
      setError(`Import failed: ${e?.message || String(e)}`);
    }
  }

  function openAdd() {
    setFullName("");
    setEmail("");
    setShowAdd(true);
  }
  function closeAdd() {
    setShowAdd(false);
  }
  async function saveAdd() {
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (!isEmail(mail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (recipients.some((r) => r.email.trim().toLowerCase() === mail)) {
      setError("That email is already in the list.");
      return;
    }
    const next = [...recipients, { fullName: name || mail, email: mail }];
    await saveRecipients(next, false); // autosave
    setShowAdd(false);
  }

  function removeRecipient(idx: number) {
    const next = recipients.slice();
    next.splice(idx, 1);
    saveRecipients(next, false); // autosave
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">Add people who will receive the newsletter.</div>
        {loading || saving ? <span className="loading loading-spinner loading-sm" /> : null}
      </div>

      {notice && <div className="p-2 rounded bg-green-500/15 text-green-700 text-sm">{notice}</div>}
      {error && <div className="p-2 rounded bg-red-500/15 text-red-700 text-sm">{error}</div>}

      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" onClick={openAdd}>Add Recipient</button>
        <button className="btn btn-sm" onClick={importFromTautulli} disabled={saving}>Import from Tautulli</button>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Email Address</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {recipients.length === 0 ? (
              <tr>
                <td colSpan={3} className="opacity-70">No recipients yet.</td>
              </tr>
            ) : (
              recipients.map((r, i) => (
                <tr key={`${r.email}-${i}`}>
                  <td className="whitespace-nowrap">{r.fullName || "—"}</td>
                  <td className="whitespace-nowrap">{r.email}</td>
                  <td className="text-right">
                    <button className="btn btn-xs btn-ghost" onClick={() => removeRecipient(i)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Recipient Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeAdd} aria-hidden />
          <div className="absolute inset-0 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Add Recipient">
            <div className="card bg-base-100 shadow-xl w-full max-w-md">
              <div className="card-body">
                <h3 className="card-title">Add Recipient</h3>

                <label className="form-control mt-2">
                  <div className="label"><span className="label-text">Full Name</span></div>
                  <input
                    type="text"
                    className="input input-bordered"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </label>

                <label className="form-control mt-2">
                  <div className="label"><span className="label-text">Email Address</span></div>
                  <input
                    type="email"
                    className="input input-bordered"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                  />
                </label>

                <div className="mt-4 flex items-center justify-between">
                  <button className="btn" onClick={closeAdd}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveAdd} disabled={saving}>Save</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
