<<<<<<< Updated upstream
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/firebase";
import { signOut, deleteUser } from "firebase/auth";
import "./NotescapeStartPage.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // Logout handler
  const handleLogout = async (): Promise<void> => {
    setError("");
    setLoading(true);
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err: unknown) {
      console.error(
        "Logout error:",
        err instanceof Error ? err.message : String(err)
      );
      setError("Failed to logout. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // Delete account handler
  const handleDeleteAccount = async (): Promise<void> => {
    setError("");
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setError("No user found. Please log in again.");
        return;
      }

      await deleteUser(user);
      console.log("Account deleted successfully");
      navigate("/signup");
    } catch (err: unknown) {
      console.error(
        "Delete account error:",
        err instanceof Error ? err.message : String(err)
      );

      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "auth/requires-recent-login"
      ) {
        setError("Please log out and log in again before deleting your account.");
      } else {
        setError("Failed to delete account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <header className="logo">
        <img src="/logo1.png" alt="Notescape logo" width={70} height={50} />
        <h1>Dashboard</h1>
      </header>

      <div className="login-container">
        {error && <p className="error">{error}</p>}

        <button
          className="login-btn"
          onClick={handleLogout}
          disabled={loading}
        >
          {loading ? "Logging out..." : "Logout"}
        </button>

        <button
          className="login-btn delete-btn"
          onClick={handleDeleteAccount}
          disabled={loading}
        >
          {loading ? "Deleting..." : "Delete Account"}
        </button>
      </div>
    </main>
=======
// src/pages/Dashboard.tsx
import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FaBook,
  FaTasks,
  FaLayerGroup,
  FaCog,
  FaSignOutAlt,
  FaUserGraduate,
  FaRegCalendarAlt,
  FaCheckCircle,
} from "react-icons/fa";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

/* -------------------------
   Small reusable components
   -------------------------*/

type SidebarItemProps = {
  to: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
};
const SidebarItem: React.FC<SidebarItemProps> = ({ to, icon, label, active }) => {
  return (
    <Link to={to} className="block">
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium ${
          active
            ? "bg-indigo-100 text-indigo-700 shadow-inner"
            : "text-gray-600 hover:bg-gray-50 hover:text-indigo-600"
        }`}
      >
        <div className="text-lg">{icon}</div>
        <div className="hidden xl:block">{label}</div>
      </div>
    </Link>
  );
};

const StatCard: React.FC<{ title: string; value: string; sub?: string }> = ({ title, value, sub }) => (
  <motion.div whileHover={{ y: -4 }} className="bg-white rounded-2xl p-4 shadow-sm border border-indigo-50">
    <p className="text-xs text-gray-500">{title}</p>
    <p className="text-xl font-semibold text-gray-800 mt-1">{value}</p>
    {sub && <p className="text-xs text-green-500 mt-1">{sub}</p>}
  </motion.div>
);

/* -------------------------
   Dashboard main component
   -------------------------*/
export default function Dashboard(): JSX.Element {
  const location = useLocation();

  // Chart data (Line)
  const lineData = useMemo(
    () => ({
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      datasets: [
        {
          label: "Hours",
          data: [1.5, 2.0, 2.8, 1.0, 2.5, 3.6, 2.9],
          borderColor: "#4F46E5",
          backgroundColor: "rgba(79,70,229,0.12)",
          fill: true,
          tension: 0.38,
          pointRadius: 3,
        },
      ],
    }),
    []
  );

  const lineOptions = useMemo(
    () => ({
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#6B7280" } },
        y: { grid: { color: "#EEF2FF" }, ticks: { color: "#6B7280", stepSize: 1 } },
      },
    }),
    []
  );

  // Small Doughnut (smaller size)
  const donutData = useMemo(
    () => ({
      labels: ["Completed", "In Progress", "Pending"],
      datasets: [
        {
          data: [62, 28, 10],
          backgroundColor: ["#4F46E5", "#9333EA", "#A5B4FC"],
          hoverBackgroundColor: ["#4338CA", "#7C3AED", "#9096F4"],
          borderWidth: 0,
        },
      ],
    }),
    []
  );

  const donutOptions = useMemo(
    () => ({
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      cutout: "70%",
    }),
    []
  );

  // Recent activity sample
  const recent = [
    { text: "Completed Physics Quiz", when: "2 hrs ago", icon: <FaCheckCircle className="text-green-500" /> },
    { text: "Reviewed 20 Flashcards (Math)", when: "6 hrs ago", icon: <FaLayerGroup className="text-indigo-500" /> },
    { text: "Started Focus Session (45m)", when: "Yesterday", icon: <FaRegCalendarAlt className="text-indigo-400" /> },
  ];

  return (
    <div className="min-h-screen flex bg-gray-50 text-gray-800">
      {/* ====== SIDEBAR (fixed visible) ====== */}
      <aside className="w-64 xl:w-64 bg-gradient-to-b from-indigo-600 to-violet-500 text-white flex flex-col justify-between p-5 sticky top-0 h-screen">
        {/* Brand */}
        <div>
          <Link to="/dashboard" className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg">N</div>
            <div className="hidden xl:block">
              <div className="text-lg font-semibold">Notescape</div>
              <div className="text-xs opacity-80">Focus • Learn • Achieve</div>
            </div>
          </Link>

          {/* Nav */}
          <nav className="space-y-2 mt-6">
            <SidebarItem to="/classes" icon={<FaBook />} label="Classes" active={location.pathname === "/classes"} />
            <SidebarItem to="/quizzes" icon={<FaTasks />} label="Quizzes" active={location.pathname === "/quizzes"} />
            <SidebarItem to="/flashcards" icon={<FaLayerGroup />} label="Flashcards" active={location.pathname === "/flashcards"} />
            <SidebarItem to="/settings" icon={<FaCog />} label="Settings" active={location.pathname === "/settings"} />
          </nav>
        </div>

        {/* bottom actions */}
        <div className="space-y-3">
          <Link to="/logout" className="block">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-black/10 hover:bg-white/20 transition">
              <div className="text-lg">
                <FaSignOutAlt />
              </div>
              <div className="hidden xl:block">Logout</div>
            </div>
          </Link>
          <div className="text-xs text-white/80 text-center mt-3 hidden xl:block">v1.0 • pastel UI</div>
        </div>
      </aside>

      {/* ====== MAIN AREA ====== */}
      <main className="flex-1 p-8 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Your weekly summary and recent activity</p>
          </div>

          {/* Placeholder profile (female style) */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <div className="text-sm text-gray-500">Good evening</div>
              <div className="text-sm font-semibold">Mahnum Zahid</div>
            </div>

            {/* female placeholder avatar */}
            <div
              aria-hidden
              className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-200 via-violet-200 to-indigo-200 flex items-center justify-center shadow-md text-2xl"
              title="Profile"
            >
              👩
            </div>
          </div>
        </div>

        {/* Top stats row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <StatCard title="Study Hours (This Week)" value="17.4 hrs" sub="+12% vs last week" />
          <StatCard title="Active Courses" value="5" sub="2 completed" />
          <StatCard title="Average Quiz Score" value="89%" sub="+4% improvement" />
        </div>

        {/* Analytics + donut area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Line chart large */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-5 shadow-sm border border-indigo-50 col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Weekly Study Trend</h3>
                <p className="text-xs text-gray-500 mt-1">Hours per day</p>
              </div>
              <div className="text-xs text-gray-500">This Week</div>
            </div>

            <div className="h-48">
              <Line data={lineData as any} options={lineOptions as any} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm text-gray-600">
              <div>
                <div className="text-xs">Focus Sessions</div>
                <div className="font-semibold text-gray-800">12</div>
              </div>
              <div>
                <div className="text-xs">Longest Streak</div>
                <div className="font-semibold text-gray-800">8 days</div>
              </div>
              <div>
                <div className="text-xs">Avg Session</div>
                <div className="font-semibold text-gray-800">46 min</div>
              </div>
            </div>
          </motion.div>

          {/* small donut + quick stats */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-4 shadow-sm border border-indigo-50">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-800">Performance</h4>
              <span className="text-xs text-gray-500">Monthly</span>
            </div>

            {/* smaller donut container */}
            <div className="flex items-center gap-4">
              <div className="w-28 h-28">
                <Doughnut data={donutData as any} options={donutOptions as any} />
              </div>

              <div className="flex-1">
                <div className="text-sm text-gray-600">Completed</div>
                <div className="text-2xl font-semibold text-gray-800 mt-1">62%</div>
                <div className="mt-3 text-xs text-gray-500">Keep consistent to reach 80% monthly goal.</div>

                <div className="mt-4">
                  <Link to="/planner" className="text-indigo-600 text-sm font-medium hover:underline">Adjust plan</Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* New Row: Goals + Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Study Goals Tracker (wide) */}
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-sm border border-indigo-50 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Study Goals</h3>
                <p className="text-xs text-gray-500 mt-1">Weekly target & progress</p>
              </div>
              <div className="text-xs text-gray-500">Goal: 20 hrs</div>
            </div>

            {/* Goals */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Weekly Study</span>
                  <span className="font-semibold text-gray-800">17.4 / 20 hrs</span>
                </div>
                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                  <div className="h-3 rounded-full bg-indigo-600 transition-all" style={{ width: "87%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Flashcards Goal</span>
                  <span className="font-semibold text-gray-800">420 / 500</span>
                </div>
                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                  <div className="h-3 rounded-full bg-violet-500 transition-all" style={{ width: "84%" }} />
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium">Start Focus Session</button>
                <Link to="/goals" className="px-4 py-2 border border-indigo-100 rounded-lg text-sm hover:bg-gray-50">Manage Goals</Link>
              </div>
            </div>
          </motion.section>

          {/* Recent Activity */}
          <motion.aside initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-4 shadow-sm border border-indigo-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-800">Recent Activity</h4>
              <Link to="/activity" className="text-xs text-indigo-600 hover:underline">See all</Link>
            </div>

            <div className="space-y-3">
              {recent.map((r, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    {r.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-800 font-medium">{r.text}</div>
                    <div className="text-xs text-gray-500 mt-1">{r.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.aside>
        </div>

        {/* Footer small note */}
        <div className="text-xs text-gray-400 text-center mt-8">Need more polish? I can connect real data endpoints, add dark mode or animate counts.</div>
      </main>
    </div>
>>>>>>> Stashed changes
  );
}
