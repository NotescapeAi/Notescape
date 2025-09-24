import DashboardShell from "../layouts/DashboardShell";
import { Link } from "react-router-dom";

export default function Dashboard() {
  return (
    <DashboardShell>
      {/* page title row */}

      <div className="flex items-center justify-end gap-3">
        <input
          className="h-10 w-[520px] max-w-[60vw] rounded-full border border-slate-200 bg-white px-4 text-[15px] shadow-sm"
          placeholder="Search…"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            /* noop */
          }}
        />
        <button className="h-10 rounded-full bg-violet-600 px-4 text-white font-semibold hover:bg-violet-700">
          Create Flashcard Set
        </button>
      </div>

      {/* toolbar spacer */}
      <div className="mt-6"></div>

      {/* Recent Flashcards */}
      <section>
        <h2 className="text-sm font-bold text-slate-600">Recent Flashcards</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((i: number) => (
            <article
              key={i}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="text-lg font-extrabold">Mathematics</div>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                Calculus Derivatives
              </p>
              <p className="mt-3 text-sm text-slate-500">
                Master the rules and applications of derivatives in calculus.
              </p>
              <div className="mt-5 flex gap-3">
                <button className="rounded-full bg-violet-600 text-white text-sm font-semibold px-4 py-1.5 hover:bg-violet-700">
                  Study
                </button>
                <button className="rounded-full border border-slate-300 text-sm font-semibold px-4 py-1.5 hover:bg-slate-50">
                  Preview
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* middle placeholders */}
      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="h-48 rounded-2xl border border-slate-200 bg-white/70 shadow-sm"></div>
        <div className="h-48 rounded-2xl border border-slate-200 bg-white/70 shadow-sm"></div>
        <div className="h-48 rounded-2xl border border-slate-200 bg-white/70 shadow-sm"></div>
      </section>

      {/* bottom row: streak + mastery */}
      <section className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-56 rounded-2xl border border-slate-200 bg-white/70 shadow-sm p-6">
          <div className="text-sm font-bold text-slate-600">Weekly Streak</div>
          {/* …add chart later… */}
        </div>
        <div className="h-56 rounded-2xl border border-slate-200 bg-white/70 shadow-sm p-6">
          <div className="text-sm font-bold text-slate-600">
            Mastery Progress
          </div>
          {/* …add bars later… */}
        </div>
      </section>

      {/* quick access row (optional) */}
      <div className="mt-10 text-center">
        <Link
          to="/classes"
          className="text-violet-700 font-semibold hover:underline"
        >
          Go to My Classes →
        </Link>
      </div>
    </DashboardShell>
  );
}
