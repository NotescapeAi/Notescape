import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { getProfile, updateProfile, type ProfileData } from "../lib/api";

type UserState = {
  profile: ProfileData | null;
  loading: boolean;
  refresh: () => Promise<void>;
  saveProfile: (payload: { display_name?: string; avatar_url?: string | null }) => Promise<void>;
};

const UserContext = createContext<UserState | null>(null);

function mapFirebaseUser(user: FirebaseUser): ProfileData {
  const providerData = user.providerData?.[0];
  const providerId = providerData?.providerId ?? "google.com";
  const provider = providerId === "github.com" ? "github" : "google";
  return {
    id: user.uid,
    email: user.email ?? "",
    full_name: user.displayName ?? "",
    avatar_url: user.photoURL ?? null,
    provider,
    provider_id: providerData?.uid ?? user.uid,
    display_name: user.displayName ?? user.email ?? "",
  };
}

function mergeProfiles(current: ProfileData | null, incoming: ProfileData): ProfileData {
  if (!current) return incoming;
  return {
    ...incoming,
    email: incoming.email || current.email,
    full_name: incoming.full_name || current.full_name,
    avatar_url: incoming.avatar_url || current.avatar_url,
    display_name: incoming.display_name || current.display_name,
    provider: incoming.provider || current.provider,
    provider_id: incoming.provider_id || current.provider_id,
  };
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getProfile();
      setProfile((prev) => mergeProfiles(prev, p));
    } catch {
      setProfile((prev) => prev ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProfile = useCallback(async (payload: { display_name?: string; avatar_url?: string | null }) => {
    const updated = await updateProfile(payload);
    setProfile(updated);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(mapFirebaseUser(user));
      await refresh();
    });
    return () => unsub();
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
