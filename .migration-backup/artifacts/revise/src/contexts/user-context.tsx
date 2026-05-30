import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { setExtraHeadersGetter } from "@workspace/api-client-react";

export interface AppUser {
  id: number;
  name: string;
}

export const USERS: AppUser[] = [
  { id: 1, name: "Mirco" },
  { id: 2, name: "Makayla" },
  { id: 3, name: "Emelia" },
];

const STORAGE_KEY = "revise_user_id";

interface UserContextValue {
  user: AppUser | null;
  setUser: (user: AppUser) => void;
  clearUser: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AppUser | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const id = parseInt(stored, 10);
    return USERS.find((u) => u.id === id) ?? null;
  });

  const setUser = useCallback((next: AppUser) => {
    localStorage.setItem(STORAGE_KEY, String(next.id));
    setUserState(next);
  }, []);

  const clearUser = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUserState(null);
  }, []);

  useEffect(() => {
    if (!user) {
      setExtraHeadersGetter(null);
      return;
    }
    setExtraHeadersGetter(() => ({ "x-user-id": String(user.id) }));
    return () => setExtraHeadersGetter(null);
  }, [user]);

  return (
    <UserContext.Provider value={{ user, setUser, clearUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
