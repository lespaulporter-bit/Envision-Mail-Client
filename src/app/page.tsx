import Link from "next/link";

const features = [
  { title: "New Senders", body: "Screen first-time senders. Allow into MoneyBox $, Newsstand, or Receipts — or block." },
  { title: "MoneyBox $", body: "Fresh mail on top, Day Cover for what’s already seen, Clear New to knock them out." },
  { title: "Snooze & On Hold", body: "Park replies for later or hold a thread without losing it." },
  { title: "Calendar + Day Cover", body: "Events, habits, countdowns, and Teams invites alongside your mail." },
  { title: "HTML signatures", body: "Paste your Outlook/Gmail signature — formatting and links stay intact." },
  { title: "Easy uninstall", body: "Envision Mail menu → Uninstall — removes the app and local data only." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(165deg,#e7f7f3_0%,#f4fbf8_45%,#fff9f2_100%)] text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white shadow-sm"
            style={{ background: "var(--envision-logo)" }}
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <path d="M6 10.5c0-2.2 1.8-4 4-4h12c2.2 0 4 1.8 4 4v.4L16 17.2 6 10.9v-.4Z" fill="white" fillOpacity="0.95" />
              <path d="M6 12.4 16 18.8l10-6.4V21.5c0 2.2-1.8 4-4 4H10c-2.2 0-4-1.8-4-4V12.4Z" fill="white" fillOpacity="0.82" />
            </svg>
          </span>
          <span
            className="font-display text-2xl tracking-tight"
            style={{
              backgroundImage: "var(--envision-logo)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Envision Mail
          </span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <a href="#features" className="font-medium text-teal hover:text-ink">
            Features
          </a>
          <Link
            href="/app/"
            className="rounded-lg border border-teal/30 bg-white px-3.5 py-2 font-semibold text-teal shadow-sm hover:bg-[#e6f7f3]"
          >
            Open app
          </Link>
          <Link
            href="/app/"
            className="rounded-lg px-3.5 py-2 font-semibold text-white shadow-sm hover:brightness-105"
            style={{ background: "linear-gradient(135deg,#0d9488,#0f766e)", color: "#ffffff" }}
          >
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-10 md:grid-cols-2 md:pt-16">
          <div className="animate-slide-up">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-teal">EnvisionMail Version 2.3</p>
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
              Email you control — with a calendar that helps
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted">
              MoneyBox $ focus for real IMAP/SMTP accounts. Screen who can reach you. Separate important mail from noise.
              Sync and send for real.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/app/"
                className="rounded-xl px-5 py-3 font-semibold text-white shadow-md transition hover:brightness-105"
                style={{ background: "linear-gradient(135deg,#0d9488,#0f766e)", color: "#ffffff" }}
              >
                Open Envision Mail
              </Link>
              <a
                href="#how"
                className="rounded-xl bg-white px-5 py-3 font-semibold text-ink ring-1 ring-line hover:ring-teal/40"
              >
                See how it works
              </a>
            </div>
          </div>
          <div
            className="animate-cover-rise relative overflow-hidden rounded-[28px] p-1 shadow-2xl"
            style={{ background: "linear-gradient(145deg,#2dd4bf,#0f766e)" }}
          >
            <div className="rounded-[24px] bg-white/95 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-display text-2xl text-teal">MoneyBox $</span>
                <span className="rounded-full bg-[#e6f7f3] px-2 py-1 text-xs font-semibold text-teal">Live IMAP</span>
              </div>
              {[
                ["Maya Chen", "Design review Thursday?", "2:14 PM"],
                ["Sam Rivera", "Contract countersigned", "11:02 AM"],
                ["Priya Nair", "Pricing page copy — blocking deploy", "Yesterday"],
              ].map(([name, subject, time]) => (
                <div key={subject} className="border-t border-line py-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <strong>{name}</strong>
                    <span className="text-muted">{time}</span>
                  </div>
                  <div className="text-sm text-muted">{subject}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="border-y border-line bg-white/70 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="font-display text-4xl">How Envision Mail works</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {[
                ["MoneyBox $", "Important email from people and services you want to hear from."],
                ["Newsstand", "Newsletters already open — scroll when you feel like it."],
                ["Receipts", "Confirmations and invoices waiting when you need them."],
              ].map(([title, body]) => (
                <article key={title} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                  <h3 className="font-display text-2xl text-teal">{title}</h3>
                  <p className="mt-2 text-muted">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-16">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="font-display text-4xl">Built in</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {features.map((f) => (
                <article key={f.title} className="rounded-2xl border border-line bg-white/90 p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-ink">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-6 py-8 text-center text-sm text-muted">
        Envision Mail — local-first email for Envision DMS. Thank you for using Envision DMS.
      </footer>
    </div>
  );
}
