import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   OUTBREAK FIT  —  Calisthenics RPG + Zombie Survival
   Train for real -> earn XP -> level up -> unlock gear ->
   fight zombies in The Outbreak. Your reps power your fighter.
   ============================================================ */

const C = {
  base:    "#13160E",
  surface: "#1E2316",
  surface2:"#272D1C",
  line:    "#3A4226",
  bone:    "#ECE7D6",
  mute:    "#9AA083",
  xp:      "#B6FF3D",  // toxic lime — XP / progress
  amber:   "#FFA51E",  // hazard — rewards / coins
  blood:   "#D8402F",  // danger / zombies
  blue:    "#5BC8E8",
};

const merge = (...o) => Object.assign({}, ...o);

/* hash a password (SHA-256). NOTE: client-side hashing is a prototype gate,
   not real security. Real verification happens server-side (Supabase) in the
   production build — see README. */
async function hashPw(s) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return "f" + (h >>> 0).toString(16);
  }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* dev-only features (e.g. the cheat). True in `npm run dev` and in this
   preview; compiled OUT of production builds (import.meta.env.DEV === false). */
const DEV_CHEATS = (() => {
  try { return import.meta.env ? !!import.meta.env.DEV : true; } catch (e) { return true; }
})();

/* ------------------------------------------------------------------
   Auth + save backend.
   The game talks to this interface only. The default LOCAL_BACKEND keeps
   everything on-device (used in this preview). The production build injects
   a Supabase-backed implementation via window.OUTBREAK_BACKEND for real
   cross-device accounts, email verification and password reset.
------------------------------------------------------------------- */
const LOCAL_BACKEND = {
  mode: "local",
  async getSession() {
    try {
      const r = await window.storage.get("ofit_auth_v1");
      if (r && r.value) { const a = JSON.parse(r.value); return a.loggedIn ? { email: a.email } : null; }
    } catch (e) {}
    return null;
  },
  async signUp(email, pw) {
    const hash = await hashPw(pw);
    try { await window.storage.set("ofit_auth_v1", JSON.stringify({ email, hash, loggedIn: true })); } catch (e) {}
    return { ok: true };
  },
  async signIn(email, pw) {
    try {
      const r = await window.storage.get("ofit_auth_v1");
      const a = r && r.value ? JSON.parse(r.value) : null;
      if (!a || !a.email) return { ok: false, error: "No account on this device yet — sign up first." };
      const hash = await hashPw(pw);
      if (a.email !== email || a.hash !== hash) return { ok: false, error: "Email or password is incorrect." };
      await window.storage.set("ofit_auth_v1", JSON.stringify(merge(a, { loggedIn: true })));
      return { ok: true };
    } catch (e) { return { ok: false, error: "Something went wrong. Try again." }; }
  },
  async signOut() {
    try {
      const r = await window.storage.get("ofit_auth_v1");
      const a = r && r.value ? JSON.parse(r.value) : {};
      await window.storage.set("ofit_auth_v1", JSON.stringify(merge(a, { loggedIn: false })));
    } catch (e) {}
  },
  async resetPassword() {
    return { ok: false, error: "Password reset needs the online version (Supabase)." };
  },
  async loadSave() {
    try { const r = await window.storage.get("ofit_save_v1"); return r && r.value ? JSON.parse(r.value) : null; } catch (e) { return null; }
  },
  async saveSave(obj) {
    try { await window.storage.set("ofit_save_v1", JSON.stringify(obj)); } catch (e) {}
  },
};
const getBackend = () => (typeof window !== "undefined" && window.OUTBREAK_BACKEND) || LOCAL_BACKEND;

const FONT_DISP = "'Oswald', 'Arial Narrow', system-ui, sans-serif";
const FONT_MONO = "'Share Tech Mono', ui-monospace, Menlo, monospace";

/* ---------- progression ---------- */
const xpForLevel = (lvl) => Math.round(90 + (lvl - 1) * 55 * Math.pow(1.06, lvl - 1));

/* ---------- exercises (real calisthenics) ---------- */
const EXERCISES = [
  { id: "pushup",  name: "Push-ups",      stat: "STR", tier: "Core",     unit: "reps", xp: 2,   icon: "💪" },
  { id: "squat",   name: "Squats",        stat: "LEG", tier: "Core",     unit: "reps", xp: 1.5, icon: "🦵" },
  { id: "plank",   name: "Plank",         stat: "CORE",tier: "Core",     unit: "sec",  xp: 0.8, icon: "🧱" },
  { id: "lunge",   name: "Lunges",        stat: "LEG", tier: "Core",     unit: "reps", xp: 1.6, icon: "🚶" },
  { id: "dip",     name: "Dips",          stat: "STR", tier: "Advanced", unit: "reps", xp: 3,   icon: "🔻" },
  { id: "burpee",  name: "Burpees",       stat: "STA", tier: "Advanced", unit: "reps", xp: 4,   icon: "🔥" },
  { id: "pullup",  name: "Pull-ups",      stat: "STR", tier: "Advanced", unit: "reps", xp: 5,   icon: "🆙" },
  { id: "pike",    name: "Pike Push-ups", stat: "STR", tier: "Elite",    unit: "reps", xp: 4.5, icon: "📐" },
  { id: "handstand", name: "Handstand",   stat: "STR", tier: "Elite",    unit: "sec",  xp: 1.5, icon: "🤸" },
];

/* ---------- weapons (loadout for the Outbreak) ---------- */
const WEAPONS = [
  { id: "bat",     name: "Baseball Bat", dmg: 1, auto: 0,    unlockLvl: 1, cost: 0,   icon: "🏏", note: "Starter. Reliable. Loud." },
  { id: "pistol",  name: "9mm Pistol",   dmg: 2, auto: 0,    unlockLvl: 2, cost: 120, icon: "🔫", note: "Double tap damage." },
  { id: "shotgun", name: "Shotgun",      dmg: 5, auto: 0,    unlockLvl: 4, cost: 350, icon: "💥", note: "Heavy hits up close." },
  { id: "smg",     name: "SMG Turret",   dmg: 2, auto: 650,  unlockLvl: 6, cost: 600, icon: "⚙️", note: "Auto-fires at the nearest walker." },
  { id: "rifle",   name: "Marksman Rifle",dmg: 8, auto: 0,   unlockLvl: 9, cost: 1100,icon: "🎯", note: "One tap, one drop." },
];

/* ---------- derived combat stats from training ---------- */
const fighterStats = (save) => {
  const str = save.stats.STR, sta = save.stats.STA, core = save.stats.CORE;
  return {
    dmgBonus: Math.floor(str / 80),
    baseHP: 100 + Math.floor(sta / 12) * 6 + Math.floor(core / 20) * 4,
  };
};

const NEW_SAVE = {
  name: "Survivor",
  level: 1,
  xp: 0,
  coins: 0,
  stats: { STR: 0, LEG: 0, CORE: 0, STA: 0 },
  totalReps: 0,
  unlocked: ["bat"],
  equipped: "bat",
  bestWave: 0,
  powerups: { overcharge: 0, armor: 0, health: 0, shield: 0 },
  lastFreeCrate: 0,
  acceptedDisclaimer: false,
};

const FREE_CRATE_MS = 24 * 60 * 60 * 1000; // one free Supply Crate per day

/* full kit with safe defaults (older saves may miss new fields) */
const getKit = (s) => merge({ overcharge: 0, armor: 0, health: 0, shield: 0 }, s.powerups || {});

/* buyable active consumables (used mid-run) */
const KIT_DEFS = {
  health: { name: "Health Pack", icon: "🩹", cost: 120, heal: 35, note: "Tap mid-fight to heal 35 HP." },
  shield: { name: "Shield",      icon: "🛡", cost: 160, amount: 50, note: "Tap mid-fight for 50 shield that soaks damage first." },
};

/* ---------- loot crates (bought with earned coins · odds disclosed) ---------- */
const CRATES = [
  {
    id: "supply", name: "Supply Crate", cost: 250, icon: "📦", color: C.blue,
    blurb: "Standard drop. Reliable scraps.",
    drops: [
      { type: "coins", p: 0.40, min: 80, max: 200, label: "Coin Stash",        icon: "◈", rarity: "Common" },
      { type: "xp",    p: 0.22, amount: 50,         label: "XP Pack",           icon: "✦", rarity: "Common" },
      { type: "overcharge", p: 0.14, n: 1,          label: "Overcharge +2 DMG", icon: "⚔", rarity: "Rare" },
      { type: "armor", p: 0.10, n: 1,               label: "Plating +20 HP",    icon: "🦺", rarity: "Rare" },
      { type: "health",p: 0.09, n: 1,               label: "Health Pack",       icon: "🩹", rarity: "Rare" },
      { type: "shield",p: 0.05, n: 1,               label: "Shield",            icon: "🛡", rarity: "Rare" },
    ],
  },
  {
    id: "reinforced", name: "Reinforced Crate", cost: 700, icon: "🧰", color: C.amber,
    blurb: "Heavy crate. Better odds, bigger hauls.",
    drops: [
      { type: "coins", p: 0.28, min: 250, max: 550, label: "Coin Haul",         icon: "◈", rarity: "Common" },
      { type: "xp",    p: 0.20, amount: 130,        label: "Big XP Pack",        icon: "✦", rarity: "Common" },
      { type: "overcharge", p: 0.16, n: 2,          label: "Overcharge +4 DMG",  icon: "⚔", rarity: "Rare" },
      { type: "armor", p: 0.12, n: 2,               label: "Plating +40 HP",     icon: "🦺", rarity: "Rare" },
      { type: "health",p: 0.12, n: 2,               label: "Health Pack x2",     icon: "🩹", rarity: "Rare" },
      { type: "shield",p: 0.07, n: 1,               label: "Shield",             icon: "🛡", rarity: "Rare" },
      { type: "weapon",p: 0.05,                     label: "Weapon Cache",       icon: "🎁", rarity: "Legendary" },
    ],
  },
];
const RARITY_COLOR = { Common: C.mute, Rare: C.blue, Legendary: C.amber };
const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

export default function App() {
  const [save, setSave] = useState(NEW_SAVE);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState("home"); // home | train | armory | crates | game
  const [levelUps, setLevelUps] = useState([]); // queue of new levels reached
  const [active, setActive] = useState(null);   // active workout exercise
  const [reveal, setReveal] = useState(null);    // loot crate result
  const [saveStatus, setSaveStatus] = useState("saved"); // saved | saving
  const [confirmReset, setConfirmReset] = useState(false);
  const [session, setSession] = useState(null); // { email } | null
  const sessionRef = useRef(null);
  sessionRef.current = session;
  const saveRef = useRef(save);
  saveRef.current = save;

  /* load existing session + that user's save through the backend */
  useEffect(() => {
    (async () => {
      const be = getBackend();
      try {
        const sess = await be.getSession();
        if (sess) {
          setSession(sess);
          const sv = await be.loadSave();
          if (sv) setSave(merge(NEW_SAVE, sv));
        }
      } catch (e) { /* not logged in */ }
      setLoaded(true);
    })();
  }, []);

  /* called after a successful login/signup: adopt session, pull cloud save */
  const handleAuthed = async (sess) => {
    setSession(sess);
    try {
      const sv = await getBackend().loadSave();
      setSave(sv ? merge(NEW_SAVE, sv) : NEW_SAVE);
    } catch (e) { setSave(NEW_SAVE); }
    setScreen("home");
  };

  /* save on every change (only while logged in), with a visible status */
  useEffect(() => {
    if (!loaded || !session) return;
    setSaveStatus("saving");
    let cancelled = false;
    (async () => {
      try {
        await getBackend().saveSave(save);
        if (!cancelled) setSaveStatus("saved");
      } catch (e) { if (!cancelled) setSaveStatus("saved"); }
    })();
    return () => { cancelled = true; };
  }, [save, loaded, session]);

  /* safety net: flush the latest progress if the app is backgrounded or closed */
  useEffect(() => {
    const flush = () => {
      if (!sessionRef.current) return;
      try { getBackend().saveSave(saveRef.current); } catch (e) {}
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  /* award XP + handle level ups */
  const grantXP = useCallback((amount, stat, reps) => {
    setSave((s) => {
      let xp = s.xp + amount;
      let level = s.level;
      let coins = s.coins;
      const reached = [];
      while (xp >= xpForLevel(level)) {
        xp -= xpForLevel(level);
        level += 1;
        coins += 50 + level * 20;
        reached.push(level);
      }
      const stats = merge(s.stats, { [stat]: s.stats[stat] + Math.round(amount) });
      const unlocked = s.unlocked.slice();
      WEAPONS.forEach((w) => {
        if (level >= w.unlockLvl && w.cost === 0 && !unlocked.includes(w.id)) unlocked.push(w.id);
      });
      if (reached.length) setLevelUps((q) => q.concat(reached));
      return merge(s, { xp, level, coins, stats, unlocked, totalReps: s.totalReps + (reps || 0) });
    });
  }, []);

  const buyWeapon = (w) => setSave((s) =>
    s.coins < w.cost || s.unlocked.includes(w.id) ? s
    : merge(s, { coins: s.coins - w.cost, unlocked: s.unlocked.concat(w.id), equipped: w.id }));

  const equip = (id) => setSave((s) => merge(s, { equipped: id }));

  /* open a loot crate; if `free`, skip the coin cost (used by the daily drop) */
  const openCrate = (crate, free = false) => {
    if (!free && save.coins < crate.cost) return;
    const roll = Math.random();
    let acc = 0, picked = crate.drops[crate.drops.length - 1];
    for (const o of crate.drops) { acc += o.p; if (roll <= acc) { picked = o; break; } }

    if (!free) setSave((s) => merge(s, { coins: s.coins - crate.cost }));
    const result = { icon: picked.icon, label: picked.label, rarity: picked.rarity, pool: crate.drops };

    if (picked.type === "coins") {
      const amt = rand(picked.min, picked.max);
      setSave((s) => merge(s, { coins: s.coins + amt }));
      result.detail = "+◈ " + amt;
    } else if (picked.type === "xp") {
      grantXP(picked.amount, "STA", 0);
      result.detail = "+" + picked.amount + " XP";
    } else if (picked.type === "overcharge") {
      setSave((s) => merge(s, { powerups: merge(getKit(s), { overcharge: getKit(s).overcharge + picked.n }) }));
      result.detail = "Primed for next run";
    } else if (picked.type === "armor") {
      setSave((s) => merge(s, { powerups: merge(getKit(s), { armor: getKit(s).armor + picked.n }) }));
      result.detail = "Primed for next run";
    } else if (picked.type === "health" || picked.type === "shield") {
      const n = picked.n || 1;
      setSave((s) => merge(s, { powerups: merge(getKit(s), { [picked.type]: getKit(s)[picked.type] + n }) }));
      result.detail = "+" + n + " added to field kit";
    } else if (picked.type === "weapon") {
      const cand = WEAPONS.find((w) => w.cost > 0 && save.level >= w.unlockLvl && !save.unlocked.includes(w.id));
      if (cand) {
        setSave((s) => merge(s, { unlocked: s.unlocked.concat(cand.id) }));
        result.icon = cand.icon; result.label = cand.name; result.detail = "Weapon unlocked!";
      } else {
        setSave((s) => merge(s, { coins: s.coins + 400 }));
        result.icon = "◈"; result.label = "Duplicate Cache"; result.rarity = "Common"; result.detail = "+◈ 400";
      }
    }
    setReveal(result);
  };

  /* claim the free daily Supply Crate (no coins needed) */
  const claimFreeCrate = () => {
    if (Date.now() - (save.lastFreeCrate || 0) < FREE_CRATE_MS) return;
    setSave((s) => merge(s, { lastFreeCrate: Date.now() }));
    openCrate(CRATES[0], true);
  };

  /* only pre-run buffs (overcharge/plating) are spent on deploy; health/shield are kept for active use */
  const consumePowerups = () => setSave((s) => merge(s, { powerups: merge(getKit(s), { overcharge: 0, armor: 0 }) }));

  /* buy an active consumable with coins */
  const buyKit = (type) => setSave((s) => {
    const d = KIT_DEFS[type];
    if (!d || s.coins < d.cost) return s;
    const k = getKit(s);
    return merge(s, { coins: s.coins - d.cost, powerups: merge(k, { [type]: k[type] + 1 }) });
  });

  /* spend one active consumable (called mid-run) */
  const useItem = (type) => setSave((s) => {
    const k = getKit(s);
    if (k[type] <= 0) return s;
    return merge(s, { powerups: merge(k, { [type]: k[type] - 1 }) });
  });

  /* DEV cheat: tap the title 5x fast -> +10000 coins & +100 levels (dev builds only) */
  const cheatCoins = () => {
    if (!DEV_CHEATS) return;
    setSave((s) => {
      const level = s.level + 100;
      const unlocked = s.unlocked.slice();
      WEAPONS.forEach((w) => {
        if (level >= w.unlockLvl && w.cost === 0 && !unlocked.includes(w.id)) unlocked.push(w.id);
      });
      return merge(s, { coins: s.coins + 10000, level, unlocked });
    });
  };

  const endGame = (wave, coinsEarned) => setSave((s) =>
    merge(s, { coins: s.coins + coinsEarned, bestWave: Math.max(s.bestWave, wave) }));

  const resetAll = () => { setSave(NEW_SAVE); setScreen("home"); };

  const acceptDisclaimer = () => setSave((s) => merge(s, { acceptedDisclaimer: true }));

  const logout = async () => {
    try { await getBackend().signOut(); } catch (e) {}
    setSession(null);
    setSave(NEW_SAVE);
    setScreen("home");
  };

  if (!loaded) return <Boot />;

  /* gate: must log in before the game is reachable */
  if (!session) {
    return <Auth backend={getBackend()} onAuthed={handleAuthed} />;
  }

  /* one-time health disclaimer (required for a fitness app) */
  if (!save.acceptedDisclaimer) {
    return <Disclaimer onAccept={acceptDisclaimer} />;
  }

  return (
    <div style={styles.app}>
      <FontInject />
      <div style={styles.frame}>
        {screen === "home" &&  <Home save={save} go={setScreen} saveStatus={saveStatus} cheat={cheatCoins} email={session.email} />}
        {screen === "train" && <Train save={save} grantXP={grantXP} back={() => setScreen("home")} active={active} setActive={setActive} />}
        {screen === "armory" &&<Armory save={save} buy={buyWeapon} equip={equip} buyKit={buyKit} back={() => setScreen("home")} />}
        {screen === "crates" &&<Crates save={save} open={openCrate} claimFree={claimFreeCrate} back={() => setScreen("home")} />}
        {screen === "game" &&  <Outbreak save={save} consume={consumePowerups} useItem={useItem} onExit={(w, c) => { endGame(w, c); setScreen("home"); }} />}
      </div>

      {levelUps.length > 0 &&
        <LevelUpModal level={levelUps[0]} onClose={() => setLevelUps((q) => q.slice(1))} />}

      {reveal &&
        <CrateReveal result={reveal} onClose={() => setReveal(null)} />}

      {screen === "home" && !confirmReset &&
        <div style={styles.footerRow}>
          <button style={styles.footerLink} onClick={logout}>log out</button>
          <button style={styles.footerLink} onClick={() => setConfirmReset(true)}>reset progress</button>
        </div>}

      {confirmReset &&
        <div style={styles.modalWrap} onClick={() => setConfirmReset(false)}>
          <div style={merge(styles.modal, { borderColor: C.blood })} onClick={(e) => e.stopPropagation()}>
            <div style={styles.revealIcon}>⚠️</div>
            <div style={styles.revealLabel}>Wipe all progress?</div>
            <div style={merge(styles.note, { textAlign: "center", marginTop: 8 })}>
              This deletes your level, coins, gear and stats. Can't be undone.
            </div>
            <button style={merge(styles.bigBtn, { background: C.blood, color: C.bone, marginTop: 10 })}
              onClick={() => { resetAll(); setConfirmReset(false); }}>
              YES, WIPE IT
            </button>
            <button style={merge(styles.halfBtn, { width: "100%", marginTop: 10, borderColor: C.line, color: C.mute })}
              onClick={() => setConfirmReset(false)}>
              keep my progress
            </button>
          </div>
        </div>}
    </div>
  );
}

/* =================== HOME / HQ =================== */
function Home({ save, go, saveStatus, cheat }) {
  const need = xpForLevel(save.level);
  const pct = Math.min(100, (save.xp / need) * 100);
  const fs = fighterStats(save);
  const eq = WEAPONS.find((w) => w.id === save.equipped);

  /* dev cheat: 5 quick taps on the title */
  const tapRef = useRef({ n: 0, t: 0 });
  const [cheatFlash, setCheatFlash] = useState(false);
  const onTitleTap = () => {
    if (!DEV_CHEATS) return;
    const now = Date.now();
    const r = tapRef.current;
    r.n = now - r.t < 600 ? r.n + 1 : 1;
    r.t = now;
    if (r.n >= 5) {
      r.n = 0;
      cheat();
      setCheatFlash(true);
      setTimeout(() => setCheatFlash(false), 1400);
    }
  };

  return (
    <div style={styles.screen}>
      <div style={styles.rowBetween}>
        <div style={styles.hqTag}>SAFEHOUSE · SECTOR 7</div>
        <div style={styles.saveTag}>
          {saveStatus === "saving" ? "◌ saving" : "◉ progress saved"}
        </div>
      </div>
      <h1 style={styles.title} onClick={onTitleTap}>OUTBREAK <span style={{ color: C.blood }}>FIT</span></h1>
      <div style={styles.sub}>Train to survive. Survive to train.</div>

      {cheatFlash &&
        <div style={styles.cheatFlash}>⚡ DEV CHEAT — +◈ 10,000 · +100 LV</div>}

      <div style={styles.card}>
        <div style={styles.rowBetween}>
          <div>
            <div style={styles.label}>SURVIVOR</div>
            <div style={styles.name}>{save.name}</div>
          </div>
          <div style={styles.lvlBadge}>
            <div style={styles.lvlNum}>{save.level}</div>
            <div style={styles.lvlWord}>LEVEL</div>
          </div>
        </div>

        <div style={styles.xpTrack}>
          <div style={merge(styles.xpFill, { width: pct + "%" })} />
        </div>
        <div style={styles.rowBetween}>
          <span style={styles.tiny}>XP {Math.floor(save.xp)} / {need}</span>
          <span style={merge(styles.tiny, { color: C.amber })}>◈ {save.coins}</span>
        </div>
      </div>

      <div style={styles.statGrid}>
        <Stat label="STRENGTH" v={save.stats.STR} color={C.blood} />
        <Stat label="STAMINA"  v={save.stats.STA} color={C.amber} />
        <Stat label="CORE"     v={save.stats.CORE} color={C.xp} />
        <Stat label="LEGS"     v={save.stats.LEG} color={C.blue} />
      </div>

      <div style={styles.combatCard}>
        <span style={styles.tiny}>COMBAT READINESS</span>
        <div style={styles.rowBetween}>
          <span style={styles.combatVal}>❤ {fs.baseHP} HP</span>
          <span style={styles.combatVal}>⚔ +{fs.dmgBonus} DMG</span>
          <span style={styles.combatVal}>🏆 W{save.bestWave}</span>
        </div>
        <div style={merge(styles.tiny, { marginTop: 6, color: C.mute })}>
          Loadout: {eq ? eq.icon + " " + eq.name : "—"}
        </div>
        <KitLine save={save} />
      </div>

      <button style={merge(styles.bigBtn, { background: C.xp, color: C.base })} onClick={() => go("train")}>
        ▶ TRAIN
      </button>
      <div style={styles.btnRow}>
        <button style={merge(styles.halfBtn, { borderColor: C.amber, color: C.amber })} onClick={() => go("armory")}>
          🛠 ARMORY
        </button>
        <button style={merge(styles.halfBtn, { borderColor: C.blood, color: C.blood })} onClick={() => go("game")}>
          ☣ THE OUTBREAK
        </button>
      </div>
      <button style={merge(styles.halfBtn, { width: "100%", marginTop: 10, borderColor: C.blue, color: C.blue })} onClick={() => go("crates")}>
        🎁 SUPPLY DROPS
      </button>
    </div>
  );
}

function KitLine({ save }) {
  const k = getKit(save);
  const parts = [];
  if (k.overcharge) parts.push("⚔ +" + k.overcharge * 2 + " DMG");
  if (k.armor) parts.push("🦺 +" + k.armor * 20 + " HP");
  if (k.health) parts.push("🩹 ×" + k.health);
  if (k.shield) parts.push("🛡 ×" + k.shield);
  if (!parts.length) return null;
  return <div style={merge(styles.tiny, { marginTop: 4, color: C.xp })}>Kit: {parts.join("   ")}</div>;
}

function Stat({ label, v, color }) {
  return (
    <div style={styles.statBox}>
      <div style={merge(styles.statV, { color })}>{v}</div>
      <div style={styles.statL}>{label}</div>
    </div>
  );
}

/* =================== TRAIN =================== */
function Train({ save, grantXP, back, active, setActive }) {
  if (active) return <Workout ex={active} grantXP={grantXP} done={() => setActive(null)} />;
  return (
    <div style={styles.screen}>
      <Header title="TRAINING" back={back} right={"◈ " + save.coins} />
      <div style={styles.note}>Log real sets. Every rep is XP — and XP is firepower.</div>
      {["Core", "Advanced", "Elite"].map((tier) => (
        <div key={tier}>
          <div style={styles.tierLabel}>{tier.toUpperCase()}</div>
          {EXERCISES.filter((e) => e.tier === tier).map((e) => (
            <button key={e.id} style={styles.exRow} onClick={() => setActive(e)}>
              <span style={styles.exIcon}>{e.icon}</span>
              <span style={styles.exName}>{e.name}</span>
              <span style={styles.exMeta}>{e.stat} · {e.xp}xp/{e.unit === "sec" ? "s" : "rep"}</span>
              <span style={styles.exGo}>›</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Workout({ ex, grantXP, done }) {
  const timed = ex.unit === "sec";
  const [count, setCount] = useState(timed ? 0 : 10);
  const [running, setRunning] = useState(false);
  const [rest, setRest] = useState(0);
  const timerRef = useRef(null);

  /* timed exercise (plank) */
  useEffect(() => {
    if (timed && running) {
      timerRef.current = setInterval(() => setCount((c) => c + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [timed, running]);

  /* rest countdown */
  useEffect(() => {
    if (rest > 0) {
      const t = setTimeout(() => setRest((r) => r - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [rest]);

  const earned = Math.round(count * ex.xp);

  const logSet = () => {
    if (count <= 0) return;
    grantXP(earned, ex.stat, count);
    setRest(45);
    setCount(timed ? 0 : 10);
    setRunning(false);
  };

  return (
    <div style={styles.screen}>
      <Header title={ex.name.toUpperCase()} back={done} right={ex.stat} />
      <div style={styles.workoutIcon}>{ex.icon}</div>

      <div style={styles.counterWrap}>
        <div style={styles.counterNum}>{count}</div>
        <div style={styles.counterUnit}>{timed ? "SECONDS" : "REPS"}</div>
      </div>

      {timed ? (
        <button
          style={merge(styles.bigBtn, { background: running ? C.blood : C.xp, color: C.base })}
          onClick={() => setRunning((r) => !r)}
        >
          {running ? "⏸ HOLD..." : "▶ START HOLD"}
        </button>
      ) : (
        <div style={styles.stepRow}>
          <button style={styles.stepBtn} onClick={() => setCount((c) => Math.max(0, c - 5))}>−5</button>
          <button style={styles.stepBtn} onClick={() => setCount((c) => Math.max(0, c - 1))}>−1</button>
          <button style={styles.stepBtn} onClick={() => setCount((c) => c + 1)}>+1</button>
          <button style={styles.stepBtn} onClick={() => setCount((c) => c + 5)}>+5</button>
        </div>
      )}

      <div style={styles.earnPreview}>
        Banking this set: <span style={{ color: C.xp }}>+{earned} XP</span>
      </div>

      <button
        style={merge(styles.bigBtn, { background: C.amber, color: C.base, opacity: count > 0 ? 1 : 0.4 })}
        onClick={logSet}
      >
        ✔ LOG SET
      </button>

      {rest > 0 &&
        <div style={styles.restBar}>RESTING · {rest}s — shake it out</div>}
    </div>
  );
}

/* =================== ARMORY =================== */
function Armory({ save, buy, equip, buyKit, back }) {
  const kit = getKit(save);
  return (
    <div style={styles.screen}>
      <Header title="ARMORY" back={back} right={"◈ " + save.coins} />
      <div style={styles.note}>Level up to unlock. Spend coins to claim. Equip your loadout.</div>
      <div style={styles.tierLabel}>WEAPONS</div>
      {WEAPONS.map((w) => {
        const owned = save.unlocked.includes(w.id);
        const equipped = save.equipped === w.id;
        const lvlLocked = save.level < w.unlockLvl;
        const canBuy = !owned && !lvlLocked && save.coins >= w.cost;
        return (
          <div key={w.id} style={merge(styles.wpnRow, equipped ? { borderColor: C.xp } : {})}>
            <span style={styles.wpnIcon}>{w.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={styles.wpnName}>{w.name}</div>
              <div style={styles.wpnNote}>{w.note}</div>
              <div style={styles.wpnStats}>⚔ {w.dmg} dmg{w.auto ? " · 🔁 auto" : ""}</div>
            </div>
            {lvlLocked ? (
              <span style={styles.wpnLock}>🔒 Lv {w.unlockLvl}</span>
            ) : owned ? (
              <button
                style={merge(styles.wpnBtn, equipped ? { background: C.xp, color: C.base } : {})}
                onClick={() => equip(w.id)}
              >
                {equipped ? "EQUIPPED" : "EQUIP"}
              </button>
            ) : (
              <button
                style={merge(styles.wpnBtn, { borderColor: C.amber, color: canBuy ? C.amber : C.mute })}
                onClick={() => canBuy && buy(w)}
              >
                ◈ {w.cost}
              </button>
            )}
          </div>
        );
      })}

      <div style={styles.tierLabel}>FIELD KIT</div>
      <div style={merge(styles.note, { marginTop: 0 })}>Active items — tap to use them during a fight.</div>
      {Object.keys(KIT_DEFS).map((type) => {
        const d = KIT_DEFS[type];
        const canBuy = save.coins >= d.cost;
        return (
          <div key={type} style={styles.wpnRow}>
            <span style={styles.wpnIcon}>{d.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={styles.wpnName}>{d.name} <span style={styles.kitOwned}>×{kit[type]}</span></div>
              <div style={styles.wpnNote}>{d.note}</div>
            </div>
            <button
              style={merge(styles.wpnBtn, { borderColor: C.blue, color: canBuy ? C.blue : C.mute })}
              onClick={() => canBuy && buyKit(type)}
            >
              ◈ {d.cost}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* =================== CRATES (loot, bought with earned coins) =================== */
function Crates({ save, open, claimFree, back }) {
  const elapsed = Date.now() - (save.lastFreeCrate || 0);
  const ready = elapsed >= FREE_CRATE_MS;
  const remainMs = FREE_CRATE_MS - elapsed;
  const remainH = Math.floor(remainMs / 3600000);
  const remainM = Math.floor((remainMs % 3600000) / 60000);
  return (
    <div style={styles.screen}>
      <Header title="SUPPLY DROPS" back={back} right={"◈ " + save.coins} />
      <div style={styles.note}>Spend coins you earned training. Odds are shown — what you get is luck of the drop.</div>

      <div style={merge(styles.crateCard, { borderColor: C.xp })}>
        <div style={styles.crateHead}>
          <span style={styles.crateIcon}>🎁</span>
          <div style={{ flex: 1 }}>
            <div style={styles.crateName}>Free Daily Drop</div>
            <div style={styles.crateBlurb}>One free Supply Crate every day. No coins needed.</div>
          </div>
        </div>
        <button
          style={merge(styles.crateBtn, { background: ready ? C.xp : C.surface2, color: ready ? C.base : C.mute })}
          onClick={() => ready && claimFree()}
        >
          {ready ? "CLAIM FREE CRATE" : "NEXT DROP IN " + remainH + "h " + remainM + "m"}
        </button>
      </div>

      {CRATES.map((cr) => {
        const afford = save.coins >= cr.cost;
        return (
          <div key={cr.id} style={merge(styles.crateCard, { borderColor: cr.color })}>
            <div style={styles.crateHead}>
              <span style={styles.crateIcon}>{cr.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={styles.crateName}>{cr.name}</div>
                <div style={styles.crateBlurb}>{cr.blurb}</div>
              </div>
            </div>
            <div style={styles.oddsBox}>
              {cr.drops.map((d, i) => (
                <div key={i} style={styles.oddsRow}>
                  <span style={{ color: RARITY_COLOR[d.rarity] }}>{d.icon} {d.label}</span>
                  <span style={styles.oddsPct}>{Math.round(d.p * 100)}%</span>
                </div>
              ))}
            </div>
            <button
              style={merge(styles.crateBtn, { background: afford ? cr.color : C.surface2, color: afford ? C.base : C.mute })}
              onClick={() => afford && open(cr)}
            >
              OPEN · ◈ {cr.cost}
            </button>
          </div>
        );
      })}
      <div style={styles.fairNote}>No real-money purchases. Crates only cost coins you earn by training.</div>
    </div>
  );
}

function CrateReveal({ result, onClose }) {
  const ITEM = 84;       // px per cell
  const WINDOW = 268;    // visible window width
  const WIN_INDEX = 34;  // where the winning item sits in the strip
  const SPIN_MS = 3600;
  const pool = result.pool && result.pool.length ? result.pool : [result];

  const [strip] = useState(() => {
    const arr = [];
    for (let i = 0; i < 42; i++) {
      if (i === WIN_INDEX) { arr.push({ icon: result.icon, rarity: result.rarity }); }
      else { const d = pool[Math.floor(Math.random() * pool.length)]; arr.push({ icon: d.icon, rarity: d.rarity }); }
    }
    return arr;
  });
  const [offset, setOffset] = useState(0);
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    const center = WINDOW / 2 - ITEM / 2;
    // small random jitter so it doesn't always land dead-center
    const jitter = Math.round((Math.random() - 0.5) * (ITEM * 0.5));
    const final = -(WIN_INDEX * ITEM) + center + jitter;
    const t1 = setTimeout(() => setOffset(final), 80);
    const t2 = setTimeout(() => setSpinning(false), 80 + SPIN_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line

  const col = RARITY_COLOR[result.rarity] || C.bone;
  const stripStyle = merge(styles.reelStrip, {
    transform: "translateX(" + offset + "px)",
    transition: spinning ? "transform " + SPIN_MS + "ms cubic-bezier(.10,.72,.13,1)" : "none",
  });

  return (
    <div style={styles.modalWrap} onClick={spinning ? undefined : onClose}>
      <div style={merge(styles.modal, { borderColor: spinning ? C.line : col, maxWidth: 320 })} onClick={(e) => e.stopPropagation()}>
        <div style={merge(styles.luWord, { color: spinning ? C.mute : col })}>
          {spinning ? "OPENING…" : result.rarity.toUpperCase()}
        </div>

        <div style={styles.reelWindow}>
          <div style={styles.reelFadeL} />
          <div style={styles.reelFadeR} />
          <div style={stripStyle}>
            {strip.map((it, i) => (
              <div key={i} style={styles.reelCell}>
                <div style={styles.reelIcon}>{it.icon}</div>
                <div style={merge(styles.reelBar, { background: RARITY_COLOR[it.rarity] || C.mute })} />
              </div>
            ))}
          </div>
          <div style={merge(styles.reelMarker, { background: spinning ? C.amber : col, boxShadow: "0 0 10px " + (spinning ? C.amber : col) })} />
        </div>

        {spinning
          ? <div style={merge(styles.tiny, { color: C.mute, marginTop: 14 })}>good luck…</div>
          : <RevealResult result={result} col={col} onClose={onClose} />}
      </div>
    </div>
  );
}

function RevealResult({ result, col, onClose }) {
  return (
    <div style={{ animation: "pop .3s ease" }}>
      <div style={merge(styles.revealLabel, { marginTop: 8 })}>{result.label}</div>
      {result.detail && <div style={merge(styles.luReward, { color: col })}>{result.detail}</div>}
      <button style={merge(styles.bigBtn, { background: col, color: C.base, marginTop: 16 })} onClick={onClose}>
        NICE
      </button>
    </div>
  );
}


function Outbreak({ save, consume, useItem, onExit }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [hud, setHud] = useState({ hp: 0, wave: 1, kills: 0, coins: 0, over: false, shield: 0, boss: false });
  const fs = fighterStats(save);
  const pu = getKit(save);
  const runHP = fs.baseHP + pu.armor * 20;
  const weapon = WEAPONS.find((w) => w.id === save.equipped) || WEAPONS[0];
  const tapDmg = weapon.dmg + fs.dmgBonus + pu.overcharge * 2;
  const [kit, setKit] = useState({ health: pu.health, shield: pu.shield });

  /* pre-run buffs (overcharge / plating) are spent the moment you deploy */
  useEffect(() => { if (pu.overcharge || pu.armor) consume(); }, []); // eslint-disable-line

  const useHealth = () => {
    const S = stateRef.current;
    if (!S || S.over || kit.health <= 0) return;
    setKit((k) => merge(k, { health: k.health - 1 }));
    useItem("health");
    S.hp = Math.min(S.maxHp, S.hp + KIT_DEFS.health.heal);
    S.heal = 1;
  };
  const useShield = () => {
    const S = stateRef.current;
    if (!S || S.over || kit.shield <= 0) return;
    setKit((k) => merge(k, { shield: k.shield - 1 }));
    useItem("shield");
    S.shield += KIT_DEFS.shield.amount;
  };

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv.getContext("2d");
    let raf;
    const W = () => cv.width, H = () => cv.height;

    const resize = () => {
      const r = cv.getBoundingClientRect();
      cv.width = r.width; cv.height = r.height;
    };
    resize();
    window.addEventListener("resize", resize);

    const S = {
      hp: runHP, maxHp: runHP, shield: 0, wave: 1, kills: 0, coins: 0,
      zombies: [], toSpawn: 6, spawnTimer: 0, lastAuto: 0, over: false, particles: [],
      flash: 0, heal: 0, bossSpawned: false, t0: performance.now(),
    };
    stateRef.current = S;

    const isBossWave = () => S.wave % 10 === 0;

    const spawn = () => {
      if (isBossWave() && !S.bossSpawned) { spawnBoss(); return; }
      // regular walkers get tougher every wave
      const tough = 1 + (S.wave - 1) * 0.55;
      const hp = Math.round((4 + Math.random() * 4) * tough);
      S.zombies.push({
        x: 24 + Math.random() * (W() - 48),
        y: -20,
        hp, maxHp: hp,
        speed: (0.22 + Math.random() * 0.24) * (1 + S.wave * 0.05),
        r: 15 + Math.random() * 6,
        hit: 0, boss: false,
      });
      S.toSpawn -= 1;
    };

    const spawnBoss = () => {
      const hp = 80 + S.wave * 28;
      S.zombies.push({
        x: W() / 2,
        y: -40,
        hp, maxHp: hp,
        speed: 0.10 + S.wave * 0.003,
        r: 40,
        hit: 0, boss: true,
      });
      S.bossSpawned = true;
      S.toSpawn -= 1;
    };

    const burst = (x, y, col) => {
      for (let i = 0; i < 8; i++)
        S.particles.push({ x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 1, col });
    };

    /* damage line sits well back, deep toward the bottom — more room to fight */
    const baseY = () => H() - 24;

    const loop = (now) => {
      const dt = Math.min(40, now - (S._last || now));
      S._last = now;
      ctx.clearRect(0, 0, W(), H());

      /* ground / barricade */
      ctx.fillStyle = C.surface2;
      ctx.fillRect(0, baseY(), W(), H() - baseY());
      ctx.fillStyle = C.line;
      for (let i = 0; i < W(); i += 22) ctx.fillRect(i, baseY(), 11, 6);
      /* shield barrier */
      if (S.shield > 0) {
        ctx.fillStyle = "rgba(91,200,232,0.18)";
        ctx.fillRect(0, baseY() - 8, W(), 8);
        ctx.fillStyle = C.blue;
        ctx.fillRect(0, baseY() - 8, W(), 2);
      }
      /* danger line — cross it and they hit you */
      ctx.strokeStyle = "rgba(216,64,47,0.75)";
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.moveTo(0, baseY()); ctx.lineTo(W(), baseY()); ctx.stroke();
      ctx.setLineDash([]);

      if (!S.over) {
        /* spawning */
        S.spawnTimer -= dt;
        if (S.toSpawn > 0 && S.spawnTimer <= 0) { spawn(); S.spawnTimer = Math.max(280, 900 - S.wave * 40); }

        /* auto weapon */
        if (weapon.auto) {
          S.lastAuto += dt;
          if (S.lastAuto >= weapon.auto && S.zombies.length) {
            S.lastAuto = 0;
            let near = S.zombies.reduce((a, b) => (b.y > a.y ? b : a), S.zombies[0]);
            near.hp -= tapDmg; near.hit = 1;
            ctx.strokeStyle = C.amber; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(W() / 2, baseY()); ctx.lineTo(near.x, near.y); ctx.stroke();
          }
        }

        /* move + draw zombies */
        for (let i = S.zombies.length - 1; i >= 0; i--) {
          const z = S.zombies[i];
          z.y += z.speed * dt * 0.22;
          z.hit = Math.max(0, z.hit - 0.08);

          if (z.hp <= 0) {
            if (z.boss) {
              for (let b = 0; b < 5; b++) burst(z.x + (Math.random() - 0.5) * 40, z.y, C.blood);
              S.coins += 60 + S.wave * 6;
            } else {
              burst(z.x, z.y, C.blood);
              S.coins += 3 + S.wave;
            }
            S.kills += 1;
            S.zombies.splice(i, 1);
            continue;
          }
          if (z.y >= baseY()) {
            let dmg = z.boss ? 30 : 8;
            if (S.shield > 0) { const a = Math.min(S.shield, dmg); S.shield -= a; dmg -= a; }
            if (dmg > 0) S.hp -= dmg;
            S.flash = 1;
            burst(z.x, baseY(), S.shield > 0 ? C.blue : C.amber);
            S.zombies.splice(i, 1);
            if (S.hp <= 0) { S.hp = 0; S.over = true; }
            continue;
          }
          if (z.boss) {
            /* boss body */
            ctx.fillStyle = z.hit > 0 ? "#fff" : "#7A1F12";
            ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
            ctx.strokeStyle = C.blood; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.stroke();
            ctx.fillStyle = z.hit > 0 ? "#fff" : "#D8402F";
            ctx.beginPath(); ctx.arc(z.x - 12, z.y - 6, 5, 0, 7); ctx.arc(z.x + 12, z.y - 6, 5, 0, 7); ctx.fill();
            ctx.fillStyle = C.bone; ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
            ctx.fillText("☠", z.x, z.y + 6);
            /* boss hp bar */
            ctx.fillStyle = "#000"; ctx.fillRect(z.x - z.r, z.y - z.r - 12, z.r * 2, 6);
            ctx.fillStyle = C.blood; ctx.fillRect(z.x - z.r, z.y - z.r - 12, z.r * 2 * (z.hp / z.maxHp), 6);
          } else {
            /* body */
            ctx.fillStyle = z.hit > 0 ? "#fff" : "#6E8B3D";
            ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
            ctx.fillStyle = z.hit > 0 ? "#fff" : "#42541F";
            ctx.beginPath(); ctx.arc(z.x - 5, z.y - 3, 3, 0, 7); ctx.arc(z.x + 5, z.y - 3, 3, 0, 7); ctx.fill();
            /* hp bar */
            ctx.fillStyle = "#000"; ctx.fillRect(z.x - z.r, z.y - z.r - 8, z.r * 2, 4);
            ctx.fillStyle = C.blood; ctx.fillRect(z.x - z.r, z.y - z.r - 8, z.r * 2 * (z.hp / z.maxHp), 4);
          }
        }

        /* wave clear */
        if (S.toSpawn <= 0 && S.zombies.length === 0) {
          S.wave += 1; S.bossSpawned = false;
          S.toSpawn = (S.wave % 10 === 0) ? 4 : 5 + S.wave * 2;
          S.hp = Math.min(S.maxHp, S.hp + 12);
        }
      }

      /* particles */
      for (let i = S.particles.length - 1; i >= 0; i--) {
        const p = S.particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.04;
        if (p.life <= 0) { S.particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; ctx.fillStyle = p.col;
        ctx.fillRect(p.x, p.y, 3, 3); ctx.globalAlpha = 1;
      }

      /* hit flash */
      if (S.flash > 0) {
        ctx.fillStyle = "rgba(216,64,47," + (S.flash * 0.3) + ")";
        ctx.fillRect(0, 0, W(), H()); S.flash = Math.max(0, S.flash - 0.05);
      }
      /* heal flash */
      if (S.heal > 0) {
        ctx.fillStyle = "rgba(182,255,61," + (S.heal * 0.25) + ")";
        ctx.fillRect(0, 0, W(), H()); S.heal = Math.max(0, S.heal - 0.05);
      }

      setHud({ hp: S.hp, wave: S.wave, kills: S.kills, coins: S.coins, over: S.over, shield: S.shield, boss: S.zombies.some((z) => z.boss) });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []); // eslint-disable-line

  const shoot = (e) => {
    const S = stateRef.current;
    if (!S || S.over) return;
    const cv = canvasRef.current;
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left), y = (e.clientY - r.top);
    /* hit topmost (closest to base) zombie within radius */
    let best = -1, bestY = -1;
    S.zombies.forEach((z, i) => {
      const d = Math.hypot(z.x - x, z.y - y);
      if (d <= z.r + 12 && z.y > bestY) { best = i; bestY = z.y; }
    });
    if (best >= 0) { S.zombies[best].hp -= tapDmg; S.zombies[best].hit = 1; }
  };

  return (
    <div style={styles.screen}>
      <div style={styles.gameHud}>
        <span style={{ color: C.blood }}>❤ {Math.round(hud.hp)}</span>
        {hud.shield > 0 && <span style={{ color: C.blue }}>🛡 {Math.round(hud.shield)}</span>}
        <span style={{ color: C.bone }}>WAVE {hud.wave}</span>
        <span style={{ color: C.amber }}>◈ {hud.coins}</span>
      </div>
      <div style={styles.gameWeapon}>{weapon.icon} {weapon.name} · ⚔ {tapDmg}{weapon.auto ? " · auto" : ""}</div>

      <div style={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onPointerDown={shoot}
        />
        {hud.boss && !hud.over &&
          <div style={styles.bossBanner}>☠ BOSS — WAVE {hud.wave}</div>}
        {hud.over &&
          <div style={styles.gameOver}>
            <div style={styles.goTitle}>OVERRUN</div>
            <div style={styles.goLine}>Reached <b style={{ color: C.bone }}>Wave {hud.wave}</b></div>
            <div style={styles.goLine}>{hud.kills} walkers down</div>
            <div style={merge(styles.goLine, { color: C.amber, fontSize: 22 })}>◈ {hud.coins} salvaged</div>
            <button style={merge(styles.bigBtn, { background: C.xp, color: C.base, marginTop: 18 })}
              onClick={() => onExit(hud.wave, hud.coins)}>
              CLAIM & RETREAT
            </button>
          </div>}
      </div>

      {!hud.over &&
        <div style={styles.itemBar}>
          <button
            style={merge(styles.itemBtn, { borderColor: C.xp, color: kit.health > 0 ? C.xp : C.mute, opacity: kit.health > 0 ? 1 : 0.45 })}
            onClick={useHealth}
          >
            🩹 Heal ×{kit.health}
          </button>
          <button
            style={merge(styles.itemBtn, { borderColor: C.blue, color: kit.shield > 0 ? C.blue : C.mute, opacity: kit.shield > 0 ? 1 : 0.45 })}
            onClick={useShield}
          >
            🛡 Shield ×{kit.shield}
          </button>
        </div>}

      {!hud.over &&
        <div style={styles.gameHint}>Tap walkers to fire. Tap your kit to heal or shield.</div>}
      {!hud.over &&
        <button style={styles.fleeBtn} onClick={() => onExit(hud.wave, hud.coins)}>↩ flee with ◈ {hud.coins}</button>}
    </div>
  );
}

/* =================== shared bits =================== */
function Header({ title, back, right }) {
  return (
    <div style={styles.header}>
      <button style={styles.backBtn} onClick={back}>‹ back</button>
      <span style={styles.headerTitle}>{title}</span>
      <span style={styles.headerRight}>{right}</span>
    </div>
  );
}

function LevelUpModal({ level, onClose }) {
  const w = WEAPONS.find((x) => x.unlockLvl === level && x.cost === 0);
  return (
    <div style={styles.modalWrap} onClick={onClose}>
      <div style={styles.modal}>
        <div style={styles.luSpark}>▲</div>
        <div style={styles.luWord}>LEVEL UP</div>
        <div style={styles.luLvl}>{level}</div>
        <div style={styles.luReward}>+◈ {50 + level * 20} coins</div>
        {w && <div style={merge(styles.luReward, { color: C.xp })}>Unlocked: {w.icon} {w.name}</div>}
        <button style={merge(styles.bigBtn, { background: C.xp, color: C.base, marginTop: 16 })} onClick={onClose}>
          KEEP GOING
        </button>
      </div>
    </div>
  );
}

function Auth({ backend, onAuthed }) {
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setErr(""); setMsg(""); };

  const submit = async () => {
    reset();
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) { setErr("Enter a valid email address."); return; }
    if (mode !== "reset") {
      if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; }
      if (mode === "signup" && pw !== pw2) { setErr("Passwords don't match."); return; }
    }
    setBusy(true);
    try {
      if (mode === "reset") {
        const res = await backend.resetPassword(mail);
        if (res.ok) setMsg("Password reset link sent — check your email.");
        else setErr(res.error || "Couldn't send reset email.");
      } else if (mode === "login") {
        const res = await backend.signIn(mail, pw);
        if (res.ok) { onAuthed({ email: mail }); return; }
        setErr(res.error || "Login failed.");
      } else {
        const res = await backend.signUp(mail, pw);
        if (!res.ok) { setErr(res.error || "Sign up failed."); }
        else if (res.needsConfirm) { setMode("login"); setMsg("Account created — check your email to confirm, then log in."); }
        else { onAuthed({ email: mail }); return; }
      }
    } finally {
      setBusy(false);
    }
  };

  const heading = mode === "login" ? "Welcome back, survivor."
    : mode === "signup" ? "Register to enter the safehouse."
    : "Reset your password.";
  const cta = busy ? "…" : mode === "login" ? "LOG IN" : mode === "signup" ? "CREATE ACCOUNT" : "SEND RESET LINK";

  return (
    <div style={styles.app}>
      <FontInject />
      <div style={merge(styles.frame, { justifyContent: "center", padding: "24px 22px" })}>
        <div style={styles.hqTag}>SAFEHOUSE · SECTOR 7</div>
        <h1 style={styles.title}>OUTBREAK <span style={{ color: C.blood }}>FIT</span></h1>
        <div style={merge(styles.sub, { marginBottom: 24 })}>{heading}</div>

        <div style={styles.card}>
          <div style={styles.label}>EMAIL</div>
          <input
            style={styles.input}
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {mode !== "reset" &&
            <>
              <div style={merge(styles.label, { marginTop: 14 })}>PASSWORD</div>
              <input
                style={styles.input}
                type="password"
                placeholder="••••••"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </>}
          {mode === "signup" &&
            <>
              <div style={merge(styles.label, { marginTop: 14 })}>CONFIRM PASSWORD</div>
              <input
                style={styles.input}
                type="password"
                placeholder="••••••"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </>}

          {err && <div style={styles.authErr}>{err}</div>}
          {msg && <div style={merge(styles.authErr, { color: C.xp })}>{msg}</div>}

          <button
            style={merge(styles.bigBtn, { background: C.xp, color: C.base, marginTop: 18, opacity: busy ? 0.6 : 1 })}
            onClick={busy ? undefined : submit}
          >
            {cta}
          </button>

          {mode === "login" &&
            <button style={merge(styles.linkBtn, { marginTop: 12 })} onClick={() => { reset(); setMode("reset"); }}>
              Forgot password?
            </button>}
        </div>

        <button
          style={merge(styles.linkBtn, { margin: "16px auto 0" })}
          onClick={() => { reset(); setMode(mode === "login" ? "signup" : "login"); }}
        >
          {mode === "login" ? "Need an account? Sign up" : "Already registered? Log in"}
        </button>
      </div>
    </div>
  );
}

function Disclaimer({ onAccept }) {
  return (
    <div style={styles.app}>
      <FontInject />
      <div style={merge(styles.frame, { justifyContent: "center", padding: "24px 22px" })}>
        <div style={merge(styles.card, { borderColor: C.amber })}>
          <div style={merge(styles.revealLabel, { textAlign: "center" })}>⚠️ Before you train</div>
          <div style={merge(styles.note, { marginTop: 12, lineHeight: 1.5 })}>
            Outbreak Fit is a fitness game. Exercise carries risk. Consult a doctor
            before starting a new exercise program, warm up properly, use good form,
            and stop if you feel pain, dizziness or discomfort. You train at your own
            risk and are responsible for your own safety.
          </div>
          <button style={merge(styles.bigBtn, { background: C.xp, color: C.base, marginTop: 18 })} onClick={onAccept}>
            I UNDERSTAND
          </button>
        </div>
      </div>
    </div>
  );
}

function Boot() {
  return <div style={merge(styles.app, { display: "flex", alignItems: "center", justifyContent: "center" })}>
    <FontInject /><span style={{ color: C.xp, fontFamily: FONT_MONO }}>loading safehouse…</span>
  </div>;
}

function FontInject() {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Share+Tech+Mono&display=swap');
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    button { cursor: pointer; font-family: ${FONT_DISP}; }
    ::-webkit-scrollbar { width: 0; }
    @keyframes pop { 0%{transform:scale(.6);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
  `}</style>;
}

/* =================== styles =================== */
const styles = {
  app: { minHeight: "100vh", background: C.base, color: C.bone, fontFamily: FONT_DISP, position: "relative" },
  frame: { maxWidth: 460, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" },
  screen: { padding: "20px 18px 40px", flex: 1, display: "flex", flexDirection: "column" },

  hqTag: { fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 3, color: C.xp, marginBottom: 4 },
  saveTag: { fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 1, color: C.mute },
  cheatFlash: { background: C.amber, color: C.base, fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, letterSpacing: 1, textAlign: "center", padding: "8px", borderRadius: 6, marginBottom: 12, animation: "pop .3s ease" },
  title: { fontSize: 44, fontWeight: 700, letterSpacing: 2, margin: 0, lineHeight: 0.95 },
  sub: { color: C.mute, fontSize: 13, letterSpacing: 1, marginBottom: 18 },

  card: { background: C.surface, border: "1px solid " + C.line, borderRadius: 10, padding: 16, marginBottom: 14 },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  label: { fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2, color: C.mute },
  name: { fontSize: 24, fontWeight: 600, letterSpacing: 1 },
  lvlBadge: { textAlign: "center", border: "1px solid " + C.xp, borderRadius: 8, padding: "6px 12px" },
  lvlNum: { fontSize: 28, fontWeight: 700, color: C.xp, lineHeight: 1 },
  lvlWord: { fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 2, color: C.mute },

  xpTrack: { height: 12, background: C.base, borderRadius: 6, overflow: "hidden", margin: "14px 0 6px", border: "1px solid " + C.line },
  xpFill: { height: "100%", background: C.xp, transition: "width .4s ease", boxShadow: "0 0 12px " + C.xp },
  tiny: { fontFamily: FONT_MONO, fontSize: 11, color: C.bone },

  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 },
  statBox: { background: C.surface, border: "1px solid " + C.line, borderRadius: 8, padding: "10px 12px" },
  statV: { fontSize: 26, fontWeight: 700, lineHeight: 1 },
  statL: { fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2, color: C.mute, marginTop: 2 },

  combatCard: { background: C.surface, border: "1px dashed " + C.blood, borderRadius: 8, padding: "12px 14px", marginBottom: 20 },
  combatVal: { fontFamily: FONT_MONO, fontSize: 14, color: C.bone },

  bigBtn: { width: "100%", padding: "16px", border: "none", borderRadius: 8, fontSize: 18, fontWeight: 700, letterSpacing: 2, marginTop: 6 },
  btnRow: { display: "flex", gap: 10, marginTop: 10 },
  halfBtn: { flex: 1, padding: "15px 0", background: "transparent", border: "1.5px solid", borderRadius: 8, fontSize: 14, fontWeight: 600, letterSpacing: 1 },

  resetBtn: { position: "fixed", bottom: 8, left: "50%", transform: "translateX(-50%)", background: "none", border: "none", color: C.line, fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2 },
  footerRow: { position: "fixed", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 24 },
  footerLink: { background: "none", border: "none", color: C.line, fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2 },
  input: { width: "100%", padding: "13px 14px", marginTop: 6, background: C.base, border: "1px solid " + C.line, borderRadius: 8, color: C.bone, fontFamily: FONT_MONO, fontSize: 16, outline: "none" },
  authErr: { color: C.blood, fontFamily: FONT_MONO, fontSize: 12, marginTop: 12, textAlign: "center" },
  linkBtn: { display: "block", width: "100%", background: "none", border: "none", color: C.mute, fontFamily: FONT_MONO, fontSize: 12, letterSpacing: 1, textAlign: "center" },

  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  backBtn: { background: "none", border: "none", color: C.mute, fontSize: 15, letterSpacing: 1 },
  headerTitle: { fontSize: 20, fontWeight: 700, letterSpacing: 2 },
  headerRight: { fontFamily: FONT_MONO, fontSize: 13, color: C.amber, minWidth: 50, textAlign: "right" },
  note: { color: C.mute, fontSize: 13, marginBottom: 16, lineHeight: 1.4 },

  tierLabel: { fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 3, color: C.xp, margin: "14px 0 8px" },
  exRow: { width: "100%", display: "flex", alignItems: "center", gap: 12, background: C.surface, border: "1px solid " + C.line, borderRadius: 8, padding: "12px 14px", marginBottom: 8, color: C.bone, textAlign: "left" },
  exIcon: { fontSize: 22 },
  exName: { fontSize: 17, fontWeight: 600, flex: 1, letterSpacing: 0.5 },
  exMeta: { fontFamily: FONT_MONO, fontSize: 11, color: C.mute },
  exGo: { fontSize: 22, color: C.mute },

  workoutIcon: { fontSize: 64, textAlign: "center", margin: "10px 0" },
  counterWrap: { textAlign: "center", margin: "10px 0 22px" },
  counterNum: { fontSize: 84, fontWeight: 700, color: C.xp, lineHeight: 1 },
  counterUnit: { fontFamily: FONT_MONO, fontSize: 13, letterSpacing: 4, color: C.mute },
  stepRow: { display: "flex", gap: 8 },
  stepBtn: { flex: 1, padding: "16px 0", background: C.surface2, border: "1px solid " + C.line, borderRadius: 8, color: C.bone, fontSize: 18, fontWeight: 700 },
  earnPreview: { textAlign: "center", fontFamily: FONT_MONO, fontSize: 14, color: C.mute, margin: "18px 0" },
  restBar: { textAlign: "center", fontFamily: FONT_MONO, fontSize: 13, letterSpacing: 1, color: C.amber, marginTop: 14, padding: "10px", border: "1px dashed " + C.amber, borderRadius: 8 },

  wpnRow: { display: "flex", alignItems: "center", gap: 12, background: C.surface, border: "1px solid " + C.line, borderRadius: 8, padding: 12, marginBottom: 8 },
  wpnIcon: { fontSize: 30 },
  wpnName: { fontSize: 16, fontWeight: 600, letterSpacing: 0.5 },
  wpnNote: { fontSize: 12, color: C.mute },
  wpnStats: { fontFamily: FONT_MONO, fontSize: 11, color: C.blood, marginTop: 2 },
  wpnLock: { fontFamily: FONT_MONO, fontSize: 12, color: C.mute },
  kitOwned: { fontFamily: FONT_MONO, fontSize: 13, color: C.xp },
  itemBar: { display: "flex", gap: 10, marginTop: 10 },
  itemBtn: { flex: 1, padding: "13px 0", background: C.surface, border: "1.5px solid", borderRadius: 8, fontSize: 14, fontWeight: 700, letterSpacing: 1, fontFamily: FONT_MONO },
  bossBanner: { position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: C.blood, color: C.bone, fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, letterSpacing: 2, padding: "6px 16px", borderRadius: 6, zIndex: 4, boxShadow: "0 0 14px " + C.blood },
  wpnBtn: { padding: "10px 14px", background: "transparent", border: "1.5px solid " + C.xp, borderRadius: 7, color: C.xp, fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, letterSpacing: 1 },

  crateCard: { background: C.surface, border: "1.5px solid", borderRadius: 10, padding: 14, marginBottom: 14 },
  crateHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 },
  crateIcon: { fontSize: 34 },
  crateName: { fontSize: 19, fontWeight: 700, letterSpacing: 1 },
  crateBlurb: { fontSize: 12, color: C.mute },
  oddsBox: { background: C.base, borderRadius: 7, padding: "8px 10px", marginBottom: 10 },
  oddsRow: { display: "flex", justifyContent: "space-between", fontFamily: FONT_MONO, fontSize: 12, padding: "3px 0" },
  oddsPct: { color: C.mute },
  crateBtn: { width: "100%", padding: "13px", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, letterSpacing: 2 },
  fairNote: { fontFamily: FONT_MONO, fontSize: 11, color: C.mute, textAlign: "center", marginTop: 6, lineHeight: 1.5 },
  revealIcon: { fontSize: 70, margin: "6px 0" },
  revealLabel: { fontSize: 22, fontWeight: 700, letterSpacing: 1 },
  reelWindow: { position: "relative", width: 268, height: 92, margin: "12px auto 4px", overflow: "hidden", border: "1px solid " + C.line, borderRadius: 8, background: C.base },
  reelStrip: { display: "flex", height: "100%", willChange: "transform" },
  reelCell: { width: 84, flex: "0 0 84px", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: "1px solid " + C.surface2 },
  reelIcon: { fontSize: 34, lineHeight: 1 },
  reelBar: { width: 38, height: 4, borderRadius: 2, marginTop: 8 },
  reelMarker: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 2, transform: "translateX(-1px)", zIndex: 3 },
  reelFadeL: { position: "absolute", top: 0, bottom: 0, left: 0, width: 46, zIndex: 2, background: "linear-gradient(90deg," + C.base + ",transparent)", pointerEvents: "none" },
  reelFadeR: { position: "absolute", top: 0, bottom: 0, right: 0, width: 46, zIndex: 2, background: "linear-gradient(270deg," + C.base + ",transparent)", pointerEvents: "none" },

  gameHud: { display: "flex", justifyContent: "space-between", fontFamily: FONT_MONO, fontSize: 18, letterSpacing: 1, marginBottom: 4 },
  gameWeapon: { fontFamily: FONT_MONO, fontSize: 12, color: C.mute, textAlign: "center", marginBottom: 8 },
  canvasWrap: { position: "relative", flex: 1, borderRadius: 10, overflow: "hidden", border: "1px solid " + C.line, background: "#0C0E07", minHeight: 380 },
  canvas: { width: "100%", height: "100%", display: "block", touchAction: "none" },
  gameOver: { position: "absolute", inset: 0, background: "rgba(12,14,7,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 },
  goTitle: { fontSize: 40, fontWeight: 700, color: C.blood, letterSpacing: 3 },
  goLine: { fontFamily: FONT_MONO, fontSize: 15, color: C.mute, marginTop: 6 },
  gameHint: { fontFamily: FONT_MONO, fontSize: 12, color: C.mute, textAlign: "center", marginTop: 10 },
  fleeBtn: { background: "none", border: "none", color: C.mute, fontFamily: FONT_MONO, fontSize: 12, letterSpacing: 1, marginTop: 8 },

  modalWrap: { position: "fixed", inset: 0, background: "rgba(12,14,7,.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 },
  modal: { background: C.surface, border: "1px solid " + C.xp, borderRadius: 14, padding: "30px 26px", textAlign: "center", width: "100%", maxWidth: 320, animation: "pop .35s ease" },
  luSpark: { color: C.xp, fontSize: 22 },
  luWord: { fontFamily: FONT_MONO, fontSize: 14, letterSpacing: 5, color: C.mute, marginTop: 4 },
  luLvl: { fontSize: 72, fontWeight: 700, color: C.xp, lineHeight: 1, margin: "4px 0" },
  luReward: { fontFamily: FONT_MONO, fontSize: 14, color: C.amber, marginTop: 4 },
};
