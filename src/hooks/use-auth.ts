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

    // Safety net: if something hangs, surface it instead of an infinite spinner.
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn("[useAuth] getUser() timed out after 10s, clearing loading state");
        setLoading(false);
      }
    }, 10000);

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
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          // AuthSessionMissingError is expected when not logged in — don't log as error
          if (error.name !== "AuthSessionMissingError") {
            console.error("[useAuth] getUser error:", error.message);
          }
        }

        if (!mounted) return;
        setUser(user);

        if (user) {
          await fetchProfile(user.id);
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
