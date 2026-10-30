import { AuthForm } from "@/components/AuthForm";
import type { User } from "@/lib/kanban";

type LandingProps = {
  onAuthenticated: (user: User) => void;
  notice?: string;
};

const features = [
  {
    title: "Boards that fit your work",
    text: "Create as many boards as you need, with columns you can add, rename and remove.",
  },
  {
    title: "Cards with the details that matter",
    text: "Priorities, due dates, labels, checklists, assignees and comments, all on the card.",
  },
  {
    title: "Built for teams",
    text: "Share a board with teammates, edit together, and see your assigned cards across every board in My cards.",
  },
  {
    title: "An AI assistant on every board",
    text: "Ask in plain language and the assistant creates, edits and moves cards for you.",
  },
];

export const Landing = ({ onAuthenticated, notice }: LandingProps) => (
  <div className="relative min-h-screen overflow-hidden">
    <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
    <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

    <header className="relative flex items-center gap-3 border-b border-[var(--stroke)] bg-white/80 px-6 py-4 backdrop-blur">
      <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
      <span className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
        BoardWorkflow
      </span>
    </header>

    <main className="relative mx-auto max-w-6xl px-6 py-16">
      <section className="grid items-center gap-12 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary-blue)]">
            Project management, simplified
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold text-[var(--navy-dark)] sm:text-5xl">
            BoardWorkflow helps teams plan, track and finish their work.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[var(--gray-text)]">
            We make Kanban Studio, a visual project board where every task is a
            card you can drag from idea to done. Keep your projects in one
            place, share them with your team, and let the AI assistant handle
            the busywork.
          </p>
        </div>
        <AuthForm onAuthenticated={onAuthenticated} notice={notice} />
      </section>

      <section aria-labelledby="features-heading" className="mt-20">
        <h2
          id="features-heading"
          className="font-display text-2xl font-semibold text-[var(--navy-dark)]"
        >
          What you get
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-[24px] border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow)]"
            >
              <div className="h-1 w-8 rounded-full bg-[var(--accent-yellow)]" />
              <h3 className="mt-4 font-display text-lg font-semibold text-[var(--navy-dark)]">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--gray-text)]">
                {feature.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="about-heading" className="mt-20 max-w-3xl">
        <h2
          id="about-heading"
          className="font-display text-2xl font-semibold text-[var(--navy-dark)]"
        >
          About BoardWorkflow
        </h2>
        <p className="mt-4 text-[var(--gray-text)]">
          BoardWorkflow believes project management should be simple. Our tools
          stay out of the way so teams can see what is happening, decide what
          comes next, and get it done. Kanban Studio is free to try: create an
          account above and your first board is ready in seconds.
        </p>
      </section>
    </main>

    <footer className="relative border-t border-[var(--stroke)] px-6 py-6 text-center text-sm text-[var(--gray-text)]">
      BoardWorkflow - makers of Kanban Studio
    </footer>
  </div>
);
