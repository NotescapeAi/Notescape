import { useEffect, useState } from "react";
import AppShell from "../layouts/AppShell";
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
    <AppShell title="Profile" breadcrumbs={["Profile"]} subtitle="Manage your account details.">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="max-w-2xl rounded-[24px] bg-white p-6 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0F1020] text-sm font-semibold text-white">
              {userData.name.trim().slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-lg font-semibold text-[#0F1020]">{userData.name}</div>
              <div className="text-sm text-[#6B5CA5]">{userData.email}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 text-sm text-[#5A4B92]">
            <div>
              <div className="text-xs font-semibold text-[#6B5CA5]">Full name</div>
              <div className="mt-1 text-[#0F1020]">{userData.name}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-[#6B5CA5]">Email</div>
              <div className="mt-1 text-[#0F1020]">{userData.email}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-[#6B5CA5]">Location</div>
              <div className="mt-1 text-[#0F1020]">{userData.location || "Not set"}</div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end">
            <Button onClick={() => setIsEditing(true)}>Edit profile</Button>
          </div>
        </div>
      </div>

      {isEditing && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1020]/40 p-4"
          onClick={handleCancel}
        >
          <div
            className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-[#0F1020]">Edit profile</div>
            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-semibold text-[#6B5CA5]">Full name</label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-[#EFE7FF] px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6B5CA5]">Email</label>
                <input
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-[#EFE7FF] px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6B5CA5]">Location</label>
                <input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-[#EFE7FF] px-3 text-sm"
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
    </AppShell>
  );
}
