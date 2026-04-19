import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import { useUser } from "../hooks/useUser";
import {
  getQuizAnalyticsSummary,
  getQuizDailyStreak,
  uploadAvatar,
  type QuizAnalyticsSummary,
  type QuizDailyStreakItem,
} from "../lib/api";
import ImageCropper from "../components/ImageCropper";
import ActivityHeatmap from "../components/ActivityHeatmap";

const MAX_DISPLAY_NAME_LEN = 120;

export default function Profile() {
  const { profile, loading, saveProfile, refresh } = useUser();
  const [quizStreakDays, setQuizStreakDays] = useState<QuizDailyStreakItem[]>([]);
  const [quizSummary, setQuizSummary] = useState<QuizAnalyticsSummary>({
    total_attempts: 0,
    passed_attempts: 0,
    failed_attempts: 0,
  });
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [secondaryEmail, setSecondaryEmail] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || "");
      setSecondaryEmail(profile.secondary_email || "");
      setAvatarUrl(profile.avatar_url || "");
      setSaveError(null);
    }
  }, [profile]);

  useEffect(() => {
    async function loadHistory() {
      try {
        const [streakData, summaryData] = await Promise.all([
          getQuizDailyStreak(),
          getQuizAnalyticsSummary(),
        ]);
        setQuizStreakDays(streakData);
        setQuizSummary(summaryData);
      } catch (err) {
        console.error("Failed to load quiz activity", err);
      } finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(e.target.value);
    setIsDirty(true);
    setSaveError(null);
  };

  const handleSecondaryEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSecondaryEmail(e.target.value);
    setIsDirty(true);
    setSaveError(null);
  };

  async function handleSave() {
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) {
      setSaveError("Display name cannot be empty.");
      return;
    }
    if (trimmedDisplayName.length > MAX_DISPLAY_NAME_LEN) {
      setSaveError(`Display name must be ${MAX_DISPLAY_NAME_LEN} characters or fewer.`);
      return;
    }

    try {
      setSaveError(null);
      const updated = await saveProfile({
        display_name: trimmedDisplayName,
        secondary_email: secondaryEmail.trim() || null,
      });
      setDisplayName((updated.display_name || trimmedDisplayName).trim());
      setSecondaryEmail(updated.secondary_email || "");
      setAvatarUrl(updated.avatar_url || "");
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to save profile", err);
      const message = err instanceof Error ? err.message : "Failed to save changes.";
      setSaveError(message);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setCropImageSrc(reader.result?.toString() || null);
    });
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleCropComplete(croppedBlob: Blob) {
    setCropImageSrc(null);
    setUploading(true);
    try {
      const file = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });
      const updated = await uploadAvatar(file);
      setAvatarUrl(updated.avatar_url || "");
      await refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to upload avatar. Please try a smaller image or different format.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!confirm("Are you sure you want to remove your custom profile picture?")) return;
    try {
      setUploading(true);
      await saveProfile({ avatar_url: null });
      await refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to remove avatar.");
    } finally {
      setUploading(false);
    }
  }

  const initials = useMemo(() => {
    const name = displayName || profile?.email || "User";
    return name.trim().slice(0, 1).toUpperCase();
  }, [displayName, profile]);

  return (
    <AppShell title="Profile">
      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageSrc(null)}
        />
      )}

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="surface rounded-2xl border border-token p-6 shadow-sm md:p-8">
          {loading ? (
            <div className="py-12 text-center text-muted">Loading profile...</div>
          ) : (
            <div className="flex flex-col-reverse items-start gap-8 md:grid md:grid-cols-[1fr_auto] md:gap-12">
              <div className="flex w-full flex-col gap-5">
                <div className="grid max-w-md gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={handleNameChange}
                      placeholder="e.g. John Doe"
                      maxLength={MAX_DISPLAY_NAME_LEN}
                      className="h-10 w-full rounded-lg border border-token bg-transparent px-3 text-sm text-main placeholder:text-muted/50 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Primary Email
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={profile?.email || ""}
                        readOnly
                        className="h-10 w-full cursor-not-allowed rounded-lg border border-token bg-surface-hover/50 px-3 text-sm text-muted outline-none"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="lucide lucide-lock"
                        >
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Secondary Email <span className="font-normal normal-case text-muted/50">(Optional)</span>
                    </label>
                    <input
                      type="email"
                      value={secondaryEmail}
                      onChange={handleSecondaryEmailChange}
                      placeholder="backup@example.com"
                      className="h-10 w-full rounded-lg border border-token bg-transparent px-3 text-sm text-main placeholder:text-muted/50 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="pt-1">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Member Since
                      </span>
                      <span className="text-sm font-medium text-main">
                        {profile?.created_at
                          ? new Date(profile.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              year: "numeric",
                            })
                          : "--"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-4">
                  <div className="flex items-center gap-3">
                    <Button variant="primary" onClick={handleSave} disabled={!isDirty || !displayName.trim()}>
                      Save Changes
                    </Button>
                    {isDirty && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setDisplayName(profile?.display_name || "");
                          setSecondaryEmail(profile?.secondary_email || "");
                          setIsDirty(false);
                          setSaveError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 pt-2">
                <div className="group relative">
                  <div
                    className={`relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-surface-hover shadow-md ${
                      uploading ? "opacity-80" : ""
                    }`}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="select-none text-3xl font-bold text-muted">{initials}</div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    {uploading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex w-full flex-col items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  {avatarUrl && (
                    <button
                      onClick={handleRemoveAvatar}
                      disabled={uploading}
                      className="text-xs text-muted transition-colors hover:text-red-500"
                    >
                      Remove picture
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="surface rounded-2xl border border-token p-6 shadow-sm md:p-8">
          {loadingHistory ? (
            <div className="py-8 text-center text-muted">Loading activity...</div>
          ) : (
            <ActivityHeatmap summary={quizSummary} streakDays={quizStreakDays} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
