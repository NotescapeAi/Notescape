import { useEffect, useState } from "react";
import AppSidebar from "../components/AppSidebar";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";

export default function Profile() {
  const [userData, setUserData] = useState({
    name: "Student",
    email: "student@example.com",
    location: "",
  });
  const [formData, setFormData] = useState(userData);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("profileData");
    if (saved) {
      const parsed = JSON.parse(saved);
      setUserData(parsed);
      setFormData(parsed);
    }
  }, []);

  function handleSave() {
    localStorage.setItem("profileData", JSON.stringify(formData));
    setUserData(formData);
    setIsEditing(false);
  }

  function handleCancel() {
    setFormData(userData);
    setIsEditing(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AppSidebar />
      <main className="flex-1 p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
          <PageHeader title="Profile" subtitle="Manage your account details." />

          <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {userData.name.trim().slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-900">{userData.name}</div>
                <div className="text-sm text-slate-500">{userData.email}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 text-sm text-slate-600">
              <div>
                <div className="text-xs font-semibold text-slate-500">Full name</div>
                <div className="mt-1 text-slate-900">{userData.name}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Email</div>
                <div className="mt-1 text-slate-900">{userData.email}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Location</div>
                <div className="mt-1 text-slate-900">{userData.location || "Not set"}</div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <Button onClick={() => setIsEditing(true)}>Edit profile</Button>
            </div>
          </div>
        </div>
      </main>

      {isEditing && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={handleCancel}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-slate-900">Edit profile</div>
            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Full name</label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Email</label>
                <input
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Location</label>
                <input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button onClick={handleCancel}>Cancel</Button>
              <Button variant="primary" onClick={handleSave}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
