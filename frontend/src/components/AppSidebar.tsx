import { NavLink } from "react-router-dom";

const item =
  "flex items-center gap-3 px-4 py-2.5 rounded-xl text-[15px] font-semibold text-slate-700 hover:bg-slate-100 transition";
const active =
  "relative bg-violet-50 text-violet-700 ring-1 ring-violet-200 before:absolute before:left-2 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1.5 before:rounded-full before:bg-violet-600";


export default function AppSidebar() {
  return (
    <aside className="w-64 shrink-0 border-r bg-white min-h-screen">
      {/* brand */}
      {/* <div className="h-14 flex items-center px-4 border-b">
        <span className="text-xl font-extrabold tracking-tight">Notescape</span>
      </div> */}

      <nav className="p-3 space-y-1 bg-[#DBD1F3]">
        <NavLink to="/dashboard"
          className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/flashcards"
          className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>Flashcards</span>
        </NavLink>
        <NavLink to="/quizzes"
          className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>Quizzes</span>
        </NavLink>
        <NavLink to="/calendar"
          className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>Calendar</span>
        </NavLink>
        <NavLink to="/progress"
          className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>Progress</span>
        </NavLink>
        <NavLink to="/assistant"
          className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>AI Assistant</span>
        </NavLink>
        <NavLink to="/classes"
          className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>My Classes</span>
        </NavLink>

        {/* bottom section */}
        <div className="pt-6 mt-6 border-t space-y-1">
          <NavLink to="/settings"
            className={({isActive}) => `${item} ${isActive ? active : ""}`}>
            <span>Setting</span>
          </NavLink>
          <NavLink to="/logout" className={({isActive}) => `${item} ${isActive ? active : ""}`}>
          <span>Logout</span>
          </NavLink>

        </div>
      </nav>
    </aside>
  );
}
