import { useMemo, useState } from "react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import { useUser } from "../hooks/useUser";

export default function Profile() {
  const { profile, loading, saveProfile } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const initials = useMemo(() => {
    const name = profile?.display_name || profile?.full_name || profile?.email || "User";
    return name.trim().slice(0, 1).toUpperCase();
  }, [profile]);

  function beginEdit() {
    setDisplayName(profile?.display_name || "");
    setAvatarUrl(profile?.avatar_url || "");
    setIsEditing(true);
  }

  async function handleSave() {
    await saveProfile({ display_name: displayName.trim(), avatar_url: avatarUrl.trim() || null });
    setIsEditing(false);
  }

  const isEditable = profile?.provider === "dev";

  return (
    <AppShell title="Profile" breadcrumbs={["Profile"]} subtitle="Manage your workspace identity.">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="max-w-2xl rounded-[24px] surface p-6 shadow-[0_12px_30px_rgba(15,16,32,0.08)]">
          {loading ? (
            <div className="text-sm text-muted">Loading profile...</div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name || "Profile"}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-inverse text-sm font-semibold text-inverse">
                    {initials}
                  </div>
                )}
                <div>
                  <div className="text-lg font-semibold text-main">
                    {profile?.display_name || profile?.full_name || "Your profile"}
                  </div>
                  <div className="text-sm text-muted">{profile?.email}</div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 text-sm text-muted">
                <div>
                  <div className="text-xs font-semibold text-muted">Display name</div>
                  <div className="mt-1 text-main">{profile?.display_name}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted">Email</div>
                  <div className="mt-1 text-main">{profile?.email}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted">Provider</div>
                  <div className="mt-1 inline-flex rounded-full border border-token px-3 py-1 text-xs text-[var(--primary)]">
                    {profile?.provider}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted">Account created</div>
                  <div className="mt-1 text-main">
                    {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "--"}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                {!isEditable && (
                  <div className="text-xs text-muted">
                    Profile is managed by your sign-in provider.
                  </div>
                )}
                <Button onClick={beginEdit} disabled={!isEditable}>
                  Edit profile
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {isEditing && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          onClick={() => setIsEditing(false)}
        >
          <div
            className="w-full max-w-md rounded-[24px] surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-main">Edit profile</div>
            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-semibold text-muted">Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-token surface px-3 text-sm text-main placeholder:text-muted"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted">Email</label>
                <input
                  type="email"
                  value={profile?.email || ""}
                  readOnly
                  className="mt-1 h-10 w-full rounded-lg border border-token surface px-3 text-sm text-main placeholder:text-muted"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted">Avatar URL</label>
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-token surface px-3 text-sm text-main placeholder:text-muted"
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button onClick={() => setIsEditing(false)}>Cancel</Button>
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
