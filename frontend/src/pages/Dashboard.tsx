import { useEffect, useMemo, useState } from "react";
import AppSidebar from "../components/AppSidebar";
import { listClasses, listFiles, getFlashcardProgress, type ClassRow } from "../lib/api";

export default function Dashboard() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [fileCount, setFileCount] = useState<number>(0);
  const [dueNow, setDueNow] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cs = await listClasses();
        setClasses(cs);
        const files = await Promise.all(cs.map((c) => listFiles(c.id)));
        setFileCount(files.flat().length);
        if (cs[0]) {
          const prog = await getFlashcardProgress(cs[0].id);
          setDueNow(prog?.due_now ?? 0);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const recentClasses = useMemo(() => classes.slice(0, 3), [classes]);

  return (
    <div className="min-h-screen flex bg-slate-50">
      <AppSidebar />
      <main className="flex-1 p-6 lg:p-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-slate-500">Overview of your study workspace</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-500">Classes</div>
            <div className="text-2xl font-semibold">{loading ? "..." : classes.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-500">Documents</div>
            <div className="text-2xl font-semibold">{loading ? "..." : fileCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-slate-500">Due flashcards</div>
            <div className="text-2xl font-semibold">{loading ? "..." : dueNow}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Recent activity</h2>
                <p className="text-xs text-slate-500">Latest updates across your classes</p>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {recentClasses.length === 0 ? (
                <div>No activity yet. Create a class to get started.</div>
              ) : (
                recentClasses.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    Added class <span className="font-semibold text-slate-800">{c.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Recent classes</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {recentClasses.length === 0 ? (
                <div>No classes yet.</div>
              ) : (
                recentClasses.map((c) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.subject ?? "General"}</div>
                    </div>
                    <span className="text-xs text-slate-400">#{c.id}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
