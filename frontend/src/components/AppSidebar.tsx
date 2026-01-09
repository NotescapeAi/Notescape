import { NavLink } from "react-router-dom";

const item =
  "flex items-center gap-3 px-4 py-2.5 rounded-xl text-[15px] font-semibold text-slate-700 hover:bg-slate-100 transition";
const active =
  "relative bg-slate-100 text-slate-900 ring-1 ring-slate-200 before:absolute before:left-2 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1.5 before:rounded-full before:bg-slate-900";


export default function AppSidebar() {
  return (
    <aside className="w-64 shrink-0 border-r bg-white min-h-screen">
      {/* brand */}
      <div className="h-14 flex items-center px-4 border-b">
        <span className="text-xl font-extrabold tracking-tight">Notescape</span>
      </div>

      <nav className="p-3 space-y-1">
        <NavLink to="/dashboard" className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/classes" className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>Classes</span>
        </NavLink>
        <NavLink to="/chatbot" className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>Chat</span>
        </NavLink>

        <div className="pt-6 mt-6 border-t space-y-1">
          <NavLink to="/settings" className={({isActive}) => `${item} ${isActive ? active : ""}`}>
            <span>Settings</span>
          </NavLink>
          <NavLink to="/profile" className={({isActive}) => `${item} ${isActive ? active : ""}`}>
            <span>Profile</span>
          </NavLink>
          <NavLink to="/logout" className={({isActive}) => `${item} ${isActive ? active : ""}`}>
            <span>Logout</span>
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}
