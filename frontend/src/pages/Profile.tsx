import { useMemo, useState, useRef, useEffect } from "react";
import AppShell from "../layouts/AppShell";
import Button from "../components/Button";
import { useUser } from "../hooks/useUser";
import { uploadAvatar, getQuizHistory, getQuizDailyStreak, type QuizHistoryItem, type QuizDailyStreakItem } from "../lib/api";
import ImageCropper from "../components/ImageCropper";
import ActivityHeatmap from "../components/ActivityHeatmap";

const MAX_DISPLAY_NAME_LEN = 120;

export default function Profile() {
  const { profile, loading, saveProfile, refresh } = useUser();
  const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([]);
  const [quizStreakDays, setQuizStreakDays] = useState<QuizDailyStreakItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Local state for form fields
  const [displayName, setDisplayName] = useState("");
  const [secondaryEmail, setSecondaryEmail] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Crop state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  // Initialize state when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || "");
      setSecondaryEmail(profile.secondary_email || "");
      setAvatarUrl(profile.avatar_url || "");
      setSaveError(null);
    }
  }, [profile]);

  // Load quiz history for heatmap
  useEffect(() => {
    async function loadHistory() {
      try {
        const [historyData, streakData] = await Promise.all([
          getQuizHistory(),
          getQuizDailyStreak(),
        ]);
        setQuizHistory(historyData);
        setQuizStreakDays(streakData);
      } catch (err) {
        console.error("Failed to load quiz activity", err);
      } finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
  }, []);



  // Handle input changes
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

  // Save changes
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

  // Handle avatar upload - step 1: open cropper
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    
    // Read file as DataURL for cropper
    const reader = new FileReader();
    reader.addEventListener("load", () => {
        setCropImageSrc(reader.result?.toString() || null);
    });
    reader.readAsDataURL(file);
    // clear input so same file can be selected again
    e.target.value = "";
  }

  // Handle avatar upload - step 2: upload cropped image
  async function handleCropComplete(croppedBlob: Blob) {
    setCropImageSrc(null); // Close modal
    setUploading(true);
    try {
      const file = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });
      const updated = await uploadAvatar(file);
      setAvatarUrl(updated.avatar_url || "");
      // Refresh context to sync everywhere
      await refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to upload avatar. Please try a smaller image or different format.");
    } finally {
      setUploading(false);
    }
  }

  // Handle avatar removal
  async function handleRemoveAvatar() {
    if (!confirm("Are you sure you want to remove your custom profile picture?")) return;
    try {
      setUploading(true);
      // Set avatar_url to null to signal removal to backend
      await saveProfile({ avatar_url: null }); 
      
      // We expect the backend to revert to provider_avatar_url if custom is cleared
      // But saveProfile returns the updated profile, so we should use that
      await refresh(); // Re-fetch ensures we get the provider url back
      
      // We can also optimistically reset it if we knew the provider URL, 
      // but refresh is safer.
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
    <AppShell title="Profile" breadcrumbs={["Profile"]} subtitle="Manage your personal information and preferences.">
      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        
        {/* Main Profile Card */}
        <div className="surface rounded-2xl shadow-sm border border-token p-6 md:p-8">
          {loading ? (
             <div className="py-12 text-center text-muted">Loading profile...</div>
          ) : (
            <div className="flex flex-col-reverse gap-8 md:grid md:grid-cols-[1fr_auto] md:gap-12 items-start">
              
              {/* Left Column: Form Fields */}
              <div className="flex flex-col gap-5 w-full">
                <div>
                  <h3 className="text-lg font-semibold text-main mb-1">Personal Information</h3>
                  <p className="text-xs text-muted">Update your photo and personal details here.</p>
                </div>

                <div className="grid gap-4 max-w-md">
                  {/* Display Name */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={handleNameChange}
                      placeholder="e.g. John Doe"
                      maxLength={MAX_DISPLAY_NAME_LEN}
                      className="h-10 w-full rounded-lg border border-token bg-transparent px-3 text-sm text-main placeholder:text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    />
                    {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                  </div>

                  {/* Primary Email (Read-Only) */}
                  <div className="flex flex-col gap-1.5">
                     <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Primary Email</label>
                     <div className="relative">
                        <input
                          type="email"
                          value={profile?.email || ""}
                          readOnly
                          className="h-10 w-full rounded-lg border border-token bg-surface-hover/50 px-3 text-sm text-muted cursor-not-allowed outline-none"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        </div>
                     </div>
                  </div>

                  {/* Secondary Email */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Secondary Email <span className="text-muted/50 font-normal normal-case">(Optional)</span></label>
                    <input
                      type="email"
                      value={secondaryEmail}
                      onChange={handleSecondaryEmailChange}
                      placeholder="backup@example.com"
                      className="h-10 w-full rounded-lg border border-token bg-transparent px-3 text-sm text-main placeholder:text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    />
                  </div>

                  {/* Account Info */}
                  <div className="grid grid-cols-2 gap-4 pt-1">
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Provider</span>
                        <span className="text-sm font-medium text-main capitalize flex items-center gap-1.5">
                           {profile?.provider === 'google' && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-main"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
                           )}
                           {profile?.provider}
                        </span>
                     </div>
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Member Since</span>
                        <span className="text-sm font-medium text-main">
                           {profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : "--"}
                        </span>
                     </div>
                  </div>
                </div>

                <div className="pt-4 mt-2">
                  <div className="flex items-center gap-3">
                     <Button variant="primary" onClick={handleSave} disabled={!isDirty || !displayName.trim()}>
                        Save Changes
                     </Button>
                     {isDirty && (
                        <Button variant="ghost" onClick={() => {
                           setDisplayName(profile?.display_name || "");
                           setSecondaryEmail(profile?.secondary_email || "");
                           setIsDirty(false);
                           setSaveError(null);
                        }}>
                           Cancel
                        </Button>
                     )}
                  </div>
                </div>
              </div>

              {/* Right Column: Avatar */}
              <div className="flex flex-col items-center gap-4 pt-2">
                 <div className="relative group">
                    <div 
                        className={`h-32 w-32 rounded-full border-4 border-surface shadow-md overflow-hidden bg-surface-hover flex items-center justify-center cursor-pointer relative ${uploading ? 'opacity-80' : ''}`}
                        onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                       {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Profile"
                            className="h-full w-full object-cover"
                          />
                       ) : (
                          <div className="text-3xl font-bold text-muted select-none">
                             {initials}
                          </div>
                       )}
                       
                       {/* Overlay on hover */}
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                       </div>
                       
                       {/* Loading Spinner overlay */}
                       {uploading && (
                         <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                            <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                         </div>
                       )}
                    </div>
                 </div>

                 <div className="flex flex-col gap-2 w-full items-center">
                    <input 
                       type="file" 
                       ref={fileInputRef} 
                       onChange={handleUpload} 
                       accept="image/*" 
                       className="hidden" 
                    />
                    
                    {/* Only show Remove if we have a custom avatar (implied by checking if avatarUrl is different from provider default or just simply if it exists and we want to allow reset) 
                        Actually, simplest is: if avatarUrl exists, show Remove. 
                        If it's the provider avatar, removing it might just reset to initials or keep it. 
                        Ideally we only show Remove if it is a CUSTOM avatar. 
                        But the frontend doesn't strictly know if it's custom or provider without checking `profile.custom_avatar_url`. 
                        Let's just show it if there is an URL. Removing provider avatar effectively does nothing or resets to itself in our backend logic if we want, 
                        BUT the requirement is "fall back to Gmail". 
                        So "Remove" means "Clear Custom Avatar".
                    */}
                    {avatarUrl && (
                       <button 
                          onClick={handleRemoveAvatar}
                          disabled={uploading}
                          className="text-xs text-muted hover:text-red-500 transition-colors"
                       >
                          Remove picture
                       </button>
                    )}
                 </div>
              </div>

            </div>
          )}
        </div>

        {/* Activity Heatmap Card */}
        <div className="surface rounded-2xl shadow-sm border border-token p-6 md:p-8">
           {loadingHistory ? (
              <div className="py-8 text-center text-muted">Loading activity...</div>
           ) : (
              <ActivityHeatmap history={quizHistory} streakDays={quizStreakDays} />
           )}
        </div>
      </div>
    </AppShell>
  );
}

