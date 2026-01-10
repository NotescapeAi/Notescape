import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getProfile,
  getSettings,
  updateProfile,
  updateSettings,
  type ProfileData,
} from "../lib/api";

type UserState = {
  profile: ProfileData | null;
  darkMode: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  saveProfile: (payload: { display_name?: string; avatar_url?: string | null }) => Promise<void>;
  saveSettings: (payload: { dark_mode: boolean }) => Promise<void>;
};

const UserContext = createContext<UserState | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([getProfile(), getSettings()]);
      setProfile(p);
      setDarkMode(!!s.dark_mode);
    } catch {
      setProfile(null);
      setDarkMode(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProfile = useCallback(async (payload: { display_name?: string; avatar_url?: string | null }) => {
    const updated = await updateProfile(payload);
    setProfile(updated);
  }, []);

  const saveSettings = useCallback(async (payload: { dark_mode: boolean }) => {
    const updated = await updateSettings(payload);
    setDarkMode(!!updated.dark_mode);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ profile, darkMode, loading, refresh, saveProfile, saveSettings }),
    [profile, darkMode, loading, refresh, saveProfile, saveSettings]
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
