import Link from "next/link";

const features = [
  { title: "Real IMAP / SMTP", body: "Connect Gmail, Outlook, iCloud, Yahoo, Fastmail, or custom servers. Test, sync, and send for real." },
  { title: "The Screener", body: "Screen first-time senders. Yes → MoneyBox $/Feed/Paper Trail. No → blocked." },
  { title: "MoneyBox $", body: "New For You, Cover Art, Power Through New, bundling, Bubble Up." },
  { title: "Reply Later + Focus & Reply", body: "Park replies, then knock them out without distractions." },
  { title: "Calendar", body: "Day/week/month, habits, journal, day labels, countdowns, Sometime This Week." },
  { title: "Easy uninstall", body: "Envision Mail menu → Uninstall, or run Uninstall Envision Mail.command — removes the app and local data." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen text-ink">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_#ebe4ff_0%,_#fbfcfd_45%,_#eef6ff_100%)]" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="font-display text-4xl" style={{ backgroundImage: "var(--hey-gradient)", WebkitBackgroundClip: "text", color: "transparent" }}>
          Envision Mail
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <a href="#features" className="text-muted hover:text-ink">
            Features
          </a>
          <Link href="/app/" className="rounded-lg bg-ink px-3 py-2 text-white">
            Open app
          </Link>
          <Link href="/app/" className="rounded-lg bg-blurple px-3 py-2 font-medium text-white shadow-sm">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-10 md:grid-cols-2 md:pt-16">
          <div className="animate-slide-up">
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
              Email you control — with a calendar that helps
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted">
              Envision Mail brings MoneyBox-style focus to your real IMAP/SMTP accounts. Screen who can reach you. Separate important mail from noise. Sync and send for real.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app/" className="rounded-xl bg-salmon px-5 py-3 font-semibold text-white shadow-md transition hover:brightness-105">
                Open Envision Mail
              </Link>
              <a href="#how" className="rounded-xl bg-white px-5 py-3 font-semibold text-ink ring-1 ring-line">
                See how it works
              </a>
            </div>
          </div>
          <div className="animate-cover-rise relative overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#0074e4,#5522fa)] p-1 shadow-2xl">
            <div className="rounded-[24px] bg-white/95 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-display text-2xl text-blurple">MoneyBox $</span>
                <span className="rounded-full bg-soft px-2 py-1 text-xs font-semibold text-muted">Live IMAP</span>
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
                ["The Feed", "Newsletters already open — scroll when you feel like it."],
                ["Paper Trail", "Receipts and confirmations waiting when you need them."],
              ].map(([title, body]) => (
                <article key={title} className="rounded-2xl border border-line bg-white p-6">
                  <h3 className="font-display text-2xl">{title}</h3>
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
                <article key={f.title} className="rounded-2xl border border-line bg-white/80 p-5">
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-6 py-8 text-center text-sm text-muted">
        Envision Mail — local-first email client. Not affiliated with HEY / 37signals.
      </footer>
    </div>
  );
}
