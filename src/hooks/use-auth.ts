"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    // Safety net: 3s is plenty for localStorage reads. If it hangs here,
    // something else is wrong (likely storage permissions in an iframe).
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn("[useAuth] getSession() timed out after 3s, clearing loading state");
        setLoading(false);
      }
    }, 3000);

    const fetchProfile = async (userId: string) => {
      try {
        // profiles.user_id (NOT profiles.id) references auth.users.id
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) {
          console.error("[useAuth] fetchProfile error:", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          });
          return;
        }

        if (data && mounted) {
          setProfile(data);
        }
      } catch (err) {
        console.error("[useAuth] fetchProfile threw:", err);
      }
    };

    const init = async () => {
      try {
        // getSession() reads from localStorage — instant, no network call.
        // The middleware already validates the JWT server-side with getUser()
        // on every request, and RLS enforces authorization at the DB level,
        // so the client can trust the local session for UI purposes.
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("[useAuth] getSession error:", error.message);
        }

        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          await fetchProfile(currentUser.id);
        }
      } catch (err) {
        console.error("[useAuth] init threw:", err);
      } finally {
        if (mounted) setLoading(false);
        clearTimeout(safetyTimer);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchProfile(currentUser.id);
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
    // Intentionally run once on mount — createClient() is a singleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = "/login";
  }, []);

  return { user, profile, loading, signOut };
}
