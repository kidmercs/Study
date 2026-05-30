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
  user: AppUser;
  setUser: (user: AppUser) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AppUser>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const id = stored ? parseInt(stored, 10) : 1;
    return USERS.find((u) => u.id === id) ?? USERS[0];
  });

  const setUser = useCallback((next: AppUser) => {
    localStorage.setItem(STORAGE_KEY, String(next.id));
    setUserState(next);
  }, []);

  // Register header getter so every API request carries X-User-Id
  useEffect(() => {
    setExtraHeadersGetter(() => ({ "x-user-id": String(user.id) }));
    return () => setExtraHeadersGetter(null);
  }, [user.id]);

  return (
    <UserContext.Provider value={{ user, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
