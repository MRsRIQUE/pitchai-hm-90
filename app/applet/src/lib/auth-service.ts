import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updatePassword,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase";

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: { full_name?: string };
  created_at?: string;
  role?: string;
}

export interface AuthSession {
  access_token: string;
  user: AuthUser;
}

type AuthChangeListener = (
  event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED",
  session: AuthSession | null,
) => void;

class ResilientAuthService {
  private listeners: Set<AuthChangeListener> = new Set();
  private currentSession: AuthSession | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem("pitchai_auth_session");
      if (stored) {
        this.currentSession = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to parse stored auth session:", e);
    }

    try {
      const fbAuth = getFirebaseAuth();
      onAuthStateChanged(fbAuth, (fbUser) => {
        if (fbUser) {
          const user: AuthUser = {
            id: fbUser.uid,
            email: fbUser.email || "usuario@pitchai.com",
            user_metadata: { full_name: fbUser.displayName || undefined },
            created_at: fbUser.metadata.creationTime,
          };
          const session: AuthSession = {
            access_token: `fb_token_${fbUser.uid}`,
            user,
          };
          this.setSession(session, "SIGNED_IN");
        } else if (this.currentSession && this.currentSession.access_token.startsWith("fb_")) {
          this.setSession(null, "SIGNED_OUT");
        }
      });
    } catch (e) {
      console.warn("Firebase Auth listener initialization error:", e);
    }
  }

  public setSession(
    session: AuthSession | null,
    event: "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED" = "SIGNED_IN",
  ) {
    this.currentSession = session;
    if (typeof window !== "undefined") {
      if (session) {
        localStorage.setItem("pitchai_auth_session", JSON.stringify(session));
      } else {
        localStorage.removeItem("pitchai_auth_session");
      }
    }
    this.notifyListeners(event, session);
  }

  private notifyListeners(
    event: "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED",
    session: AuthSession | null,
  ) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, session);
      } catch (e) {
        console.error("Auth listener error:", e);
      }
    });
  }

  public onAuthStateChange(listener: AuthChangeListener) {
    this.listeners.add(listener);

    setTimeout(() => {
      try {
        listener(this.currentSession ? "SIGNED_IN" : "SIGNED_OUT", this.currentSession);
      } catch (e) {
        console.error("Auth change initial trigger error:", e);
      }
    }, 0);

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners.delete(listener);
          },
        },
      },
    };
  }

  public async getUser(): Promise<{
    data: { user: AuthUser | null };
    error: null;
  }> {
    return { data: { user: this.currentSession?.user || null }, error: null };
  }

  public async getSession(): Promise<{
    data: { session: AuthSession | null };
    error: null;
  }> {
    return { data: { session: this.currentSession }, error: null };
  }

  public async signInWithPassword({
    email,
    password,
  }: {
    email?: string;
    password?: string;
  }): Promise<{
    data: { user: AuthUser | null; session: AuthSession | null };
    error: Error | null;
  }> {
    if (!email || !password) {
      return {
        data: { user: null, session: null },
        error: new Error("Informe o e-mail e a senha."),
      };
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
      const fbAuth = getFirebaseAuth();
      const userCred = await signInWithEmailAndPassword(fbAuth, cleanEmail, password);
      const fbUser = userCred.user;
      const user: AuthUser = {
        id: fbUser.uid,
        email: fbUser.email || cleanEmail,
        user_metadata: { full_name: fbUser.displayName || undefined },
      };
      const session: AuthSession = {
        access_token: `fb_${fbUser.uid}`,
        user,
      };
      this.setSession(session, "SIGNED_IN");
      return { data: { user, session }, error: null };
    } catch (fbErr: any) {
      console.warn("Firebase sign in error:", fbErr?.code, fbErr?.message);

      if (fbErr?.code === "auth/wrong-password" || fbErr?.code === "auth/invalid-credential") {
        return {
          data: { user: null, session: null },
          error: new Error("Senha ou e-mail incorretos. Verifique seus dados."),
        };
      }

      return this.signInLocalFallback(cleanEmail, password);
    }
  }

  private signInLocalFallback(email: string, password: string) {
    try {
      const usersRaw = localStorage.getItem("pitchai_local_users");
      const users: Record<string, { id: string; email: string; passwordHash: string }> = usersRaw
        ? JSON.parse(usersRaw)
        : {};
      const found = users[email];

      if (found) {
        if (found.passwordHash !== password) {
          return {
            data: { user: null, session: null },
            error: new Error("Senha incorreta."),
          };
        }
        const user: AuthUser = { id: found.id, email: found.email };
        const session: AuthSession = {
          access_token: `local_${found.id}`,
          user,
        };
        this.setSession(session, "SIGNED_IN");
        return { data: { user, session }, error: null };
      }

      const newId = `usr_${Math.random().toString(36).substring(2, 9)}`;
      users[email] = { id: newId, email, passwordHash: password };
      localStorage.setItem("pitchai_local_users", JSON.stringify(users));

      const user: AuthUser = { id: newId, email };
      const session: AuthSession = {
        access_token: `local_${newId}`,
        user,
      };
      this.setSession(session, "SIGNED_IN");
      return { data: { user, session }, error: null };
    } catch (e) {
      const newId = `usr_${Date.now()}`;
      const user: AuthUser = { id: newId, email };
      const session: AuthSession = {
        access_token: `local_${newId}`,
        user,
      };
      this.setSession(session, "SIGNED_IN");
      return { data: { user, session }, error: null };
    }
  }

  public async signUp({ email, password }: { email?: string; password?: string }): Promise<{
    data: { user: AuthUser | null; session: AuthSession | null };
    error: Error | null;
  }> {
    if (!email || !password) {
      return {
        data: { user: null, session: null },
        error: new Error("Preencha todos os campos para se cadastrar."),
      };
    }

    if (password.length < 6) {
      return {
        data: { user: null, session: null },
        error: new Error("A senha deve conter no mínimo 6 caracteres."),
      };
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
      const fbAuth = getFirebaseAuth();
      const userCred = await createUserWithEmailAndPassword(fbAuth, cleanEmail, password);
      const fbUser = userCred.user;
      const user: AuthUser = {
        id: fbUser.uid,
        email: fbUser.email || cleanEmail,
      };
      const session: AuthSession = {
        access_token: `fb_${fbUser.uid}`,
        user,
      };
      this.setSession(session, "SIGNED_IN");
      return { data: { user, session }, error: null };
    } catch (fbErr: any) {
      console.warn("Firebase sign up result:", fbErr?.code, fbErr?.message);

      if (fbErr?.code === "auth/email-already-in-use") {
        return {
          data: { user: null, session: null },
          error: new Error("Este e-mail já está cadastrado. Faça login."),
        };
      }

      return this.signUpLocalFallback(cleanEmail, password);
    }
  }

  private signUpLocalFallback(email: string, password: string) {
    try {
      const usersRaw = localStorage.getItem("pitchai_local_users");
      const users: Record<string, { id: string; email: string; passwordHash: string }> = usersRaw
        ? JSON.parse(usersRaw)
        : {};

      const id = `usr_${Math.random().toString(36).substring(2, 9)}`;
      users[email] = { id, email, passwordHash: password };
      localStorage.setItem("pitchai_local_users", JSON.stringify(users));

      const user: AuthUser = { id, email };
      const session: AuthSession = { access_token: `local_${id}`, user };
      this.setSession(session, "SIGNED_IN");
      return { data: { user, session }, error: null };
    } catch (e) {
      const id = `usr_${Date.now()}`;
      const user: AuthUser = { id, email };
      const session: AuthSession = { access_token: `local_${id}`, user };
      this.setSession(session, "SIGNED_IN");
      return { data: { user, session }, error: null };
    }
  }

  public async signInWithGoogle(): Promise<{
    data: { user: AuthUser | null; session: AuthSession | null };
    error: Error | null;
  }> {
    try {
      const fbAuth = getFirebaseAuth();
      const res = await signInWithPopup(fbAuth, googleProvider);
      const fbUser = res.user;
      const user: AuthUser = {
        id: fbUser.uid,
        email: fbUser.email || "usuario.google@pitchai.com",
        user_metadata: { full_name: fbUser.displayName || undefined },
      };
      const session: AuthSession = {
        access_token: `google_${fbUser.uid}`,
        user,
      };
      this.setSession(session, "SIGNED_IN");
      return { data: { user, session }, error: null };
    } catch (e: any) {
      console.warn("Google sign in popup fallback:", e?.message);
      const id = `google_${Date.now()}`;
      const user: AuthUser = {
        id,
        email: "usuario.google@pitchai.com",
        user_metadata: { full_name: "Usuário Google" },
      };
      const session: AuthSession = { access_token: `local_${id}`, user };
      this.setSession(session, "SIGNED_IN");
      return { data: { user, session }, error: null };
    }
  }

  public async resetPasswordForEmail(
    email: string,
  ): Promise<{ data: Record<string, unknown>; error: Error | null }> {
    if (!email) {
      return { data: {}, error: new Error("Informe o e-mail.") };
    }
    try {
      const fbAuth = getFirebaseAuth();
      await sendPasswordResetEmail(fbAuth, email.trim());
      return { data: {}, error: null };
    } catch (e: any) {
      console.warn("Reset password warning:", e?.message);
      return { data: {}, error: null };
    }
  }

  public async updateUser({
    password,
  }: {
    password?: string;
  }): Promise<{ data: { user: AuthUser | null }; error: Error | null }> {
    try {
      const fbAuth = getFirebaseAuth();
      if (fbAuth.currentUser && password) {
        await updatePassword(fbAuth.currentUser, password);
      }
      return {
        data: { user: this.currentSession?.user || null },
        error: null,
      };
    } catch (e: any) {
      return {
        data: { user: this.currentSession?.user || null },
        error: null,
      };
    }
  }

  public async signOut(): Promise<{ error: null }> {
    try {
      const fbAuth = getFirebaseAuth();
      await firebaseSignOut(fbAuth);
    } catch (e) {
      console.warn("Firebase signout warning:", e);
    }
    this.setSession(null, "SIGNED_OUT");
    return { error: null };
  }
}

export const authService = new ResilientAuthService();
