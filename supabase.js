import { createRoot } from "react-dom/client";
import App from "./OutbreakFit.jsx";
import { supabase } from "./supabase.js";

/* ------------------------------------------------------------------
   Storage shim (fallback persistence).
   The game's local backend uses `window.storage`. On a device that
   doesn't exist, so we back it with localStorage. Same async API.
------------------------------------------------------------------- */
if (!window.storage) {
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(key);
      return v === null ? null : { key, value: v, shared: false };
    },
    async set(key, value) {
      localStorage.setItem(key, String(value));
      return { key, value: String(value), shared: false };
    },
    async delete(key) {
      localStorage.removeItem(key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      return { keys, prefix, shared: false };
    },
  };
}

/* ------------------------------------------------------------------
   Supabase backend.
   Implements the same interface the game expects (window.OUTBREAK_BACKEND).
   Real accounts, email verification, password reset, and cloud saves that
   sync across devices. Only used when credentials are present in supabase.js.
   Requires a `saves` table — see README for the SQL.
------------------------------------------------------------------- */
function makeSupabaseBackend(sb) {
  const TABLE = "saves";
  return {
    mode: "supabase",
    async getSession() {
      const { data } = await sb.auth.getSession();
      const u = data.session && data.session.user;
      return u ? { email: u.email, id: u.id } : null;
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) return { ok: false, error: error.message };
      return { ok: true, needsConfirm: !data.session };
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async loadSave() {
      const { data: u } = await sb.auth.getUser();
      const user = u && u.user;
      if (!user) return null;
      const { data, error } = await sb
        .from(TABLE)
        .select("data")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data) return null;
      return data.data;
    },
    async saveSave(obj) {
      const { data: u } = await sb.auth.getUser();
      const user = u && u.user;
      if (!user) return;
      await sb.from(TABLE).upsert(
        { user_id: user.id, data: obj, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    },
  };
}

if (supabase) {
  window.OUTBREAK_BACKEND = makeSupabaseBackend(supabase);
}

/* PWA: register the service worker in production builds so the game is
   installable and works offline (auth/cloud-save still need a connection). */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")).render(<App />);
