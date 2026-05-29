import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { RpaUser } from '@/types';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: RpaUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<RpaUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async (authUserId: string): Promise<RpaUser | null> => {
    // First try by auth_user_id
    const { data, error } = await supabase
      .from('rpa_users')
      .select('*')
      .eq('auth_user_id', authUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (!error && data) {
      setUser(data as RpaUser);
      return data as RpaUser;
    }

    // If not found by auth_user_id, try matching by email from auth session
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.email) {
      const { data: emailMatch, error: emailErr } = await supabase
        .from('rpa_users')
        .select('*')
        .ilike('email', authUser.email)
        .eq('is_active', true)
        .maybeSingle();

      if (!emailErr && emailMatch) {
        // Auto-link the auth_user_id
        await supabase
          .from('rpa_users')
          .update({ auth_user_id: authUserId, email: authUser.email.toLowerCase() })
          .eq('id', emailMatch.id);

        setUser(emailMatch as RpaUser);
        return emailMatch as RpaUser;
      }
    }

    console.error('No rpa_users profile found for auth user:', authUserId);
    setUser(null);
    return null;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user?.id) {
        fetchUserProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user?.id) {
        fetchUserProfile(s.user.id);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

  const signIn = async (email: string, password: string) => {
    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      if (error.message === 'Invalid login credentials') {
        return { error: 'Invalid login credentials. If this user was just created, check the email inbox for a verification/confirmation email, then try again.' };
      }
      return { error: error.message };
    }

    // Now fetch user profile
    if (data.user) {
      const profile = await fetchUserProfile(data.user.id);
      if (!profile) {
        // Auth succeeded but no profile found — auto-create admin profile for first user
        const { count } = await supabase.from('rpa_users').select('*', { count: 'exact', head: true });
        
        if (count === 0 || count === null) {
          // First user ever = make them HS-ADMIN with all branches
          const allBranches = ['LMIT-HS-MILAN', 'LMIT-HS-BOLOGNA', 'LMIT-HS-TORINO', 'LMIT-HS-PADOVA', 'LMIT-HS-ROME', 'LMIT-HS-NAPLES', 'LMIT-HS-PALERMO', 'LMIT-HS-BARI'];
          const { data: newUser, error: insertErr } = await supabase
            .from('rpa_users')
            .insert({
              auth_user_id: data.user.id,
              username: email.split('@')[0],
              full_name: 'Administrator',
              email: email.trim().toLowerCase(),
              role: 'HS-ADMIN',
              branches: allBranches,
              is_active: true,
            })
            .select()
            .single();

          if (!insertErr && newUser) {
            setUser(newUser as RpaUser);
            return { error: null };
          }
        }

        await supabase.auth.signOut();
        return { error: 'Login successful but no user profile found. Ask an admin to create your profile in rpa_users table, or run the setup SQL.' };
      }
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
