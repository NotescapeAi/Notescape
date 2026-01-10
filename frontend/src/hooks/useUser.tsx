import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getProfile, updateProfile, type ProfileData } from "../lib/api";

type UserState = {
  profile: ProfileData | null;
  loading: boolean;
  refresh: () => Promise<void>;
  saveProfile: (payload: { display_name?: string; avatar_url?: string | null }) => Promise<void>;
};

const UserContext = createContext<UserState | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getProfile();
      setProfile(p);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProfile = useCallback(async (payload: { display_name?: string; avatar_url?: string | null }) => {
    const updated = await updateProfile(payload);
    setProfile(updated);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ profile, loading, refresh, saveProfile }),
    [profile, loading, refresh, saveProfile]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserState {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within UserProvider");
  }
  return ctx;
}
