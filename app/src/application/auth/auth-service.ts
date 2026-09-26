import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../infra/supabase/client";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export async function getCurrentSession(): Promise<Session | null> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<Session> {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password
  });

  if (error) throw error;
  if (!data.session) throw new Error("No session returned after sign in");
  return data.session;
}

export function buildAuthRedirectUrl(origin: string, baseUrl: string): string {
  return new URL(baseUrl, origin).toString();
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ session: Session | null; needsEmailConfirmation: boolean }> {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: buildAuthRedirectUrl(
        window.location.origin,
        import.meta.env.BASE_URL
      )
    }
  });

  if (error) throw error;

  return {
    session: data.session,
    needsEmailConfirmation: data.session === null
  };
}

export async function signOut(): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
