"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AuthProvider — wrap this around the dashboard layout.
 * Makes ONE getSession() call for the whole tree instead of one per
 * component, avoiding internal lock contention in the Supabase client.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn("[AuthProvider] getSession() timed out after 3s");
        setLoading(false);
      }
    }, 3000);

    const fetchProfile = async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) {
          console.error("[AuthProvider] fetchProfile error:", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          });
          return;
        }

        if (data && mounted) setProfile(data);
      } catch (err) {
        console.error("[AuthProvider] fetchProfile threw:", err);
      }
    };

    const init = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) console.error("[AuthProvider] getSession error:", error.message);

        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          // Don't block loading on profile fetch — let the UI render
          // with the user info we already have, profile enriches async.
          fetchProfile(currentUser.id);
        }
      } catch (err) {
        console.error("[AuthProvider] init threw:", err);
      } finally {
        if (mounted) setLoading(false);
        clearTimeout(safetyTimer);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — read the shared auth state from context.
 * Must be used inside an <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider (shouldn't
    // happen in normal flow, but don't crash the page).
    return {
      user: null,
      profile: null,
      loading: false,
      signOut: async () => {
        window.location.href = "/login";
      },
    };
  }
  return ctx;
}
