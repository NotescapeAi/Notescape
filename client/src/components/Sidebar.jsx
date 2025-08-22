import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <div className="w-64 h-screen bg-purple-600 text-white flex flex-col">
      <div className="p-4 text-2xl font-bold">Notescape</div>
      <nav className="flex-1 p-2 space-y-2">
        <NavLink to="/classes" className="block p-2 rounded hover:bg-purple-500">My Classes</NavLink>
        <NavLink to="/flashcards" className="block p-2 rounded hover:bg-purple-500">Flashcards</NavLink>
        <NavLink to="/progress" className="block p-2 rounded hover:bg-purple-500">Progress</NavLink>
        <NavLink to="/settings" className="block p-2 rounded hover:bg-purple-500">Settings</NavLink>
      </nav>
      <button className="p-3 hover:bg-purple-500">Logout</button>
    </div>
  );
}
