(function () {
  const USERS_KEY = "wc2026_users";
  const SESSION_KEY = "wc2026_session";
  const ADMIN_INVITE_CODE = "WC26-ADMIN-DEMO";

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    } catch (error) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function generateId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function randomSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function sha256(value) {
    const encoded = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function hashPassword(password, salt) {
    return sha256(`${salt}:${password}`);
  }

  function validatePassword(password) {
    const value = String(password || "");
    if (value.length < 10) return "Use at least 10 characters.";
    if (!/[A-Z]/.test(value)) return "Add at least one uppercase letter.";
    if (!/[a-z]/.test(value)) return "Add at least one lowercase letter.";
    if (!/[0-9]/.test(value)) return "Add at least one number.";
    return "";
  }

  async function signUp({ displayName, email, password, confirmPassword, adminCode }) {
    const cleanEmail = normalizeEmail(email);
    const cleanName = String(displayName || "").trim();
    if (!cleanName) return { success: false, error: "Enter your display name." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { success: false, error: "Enter a valid email address." };
    if (password !== confirmPassword) return { success: false, error: "Passwords do not match." };
    const passwordError = validatePassword(password);
    if (passwordError) return { success: false, error: passwordError };

    const users = getUsers();
    if (users.some((user) => user.email === cleanEmail)) {
      return { success: false, error: "An account already exists for this email." };
    }

    const salt = randomSalt();
    const user = {
      id: generateId(),
      displayName: cleanName.slice(0, 80),
      email: cleanEmail,
      passwordHash: await hashPassword(password, salt),
      salt,
      role: String(adminCode || "").trim() === ADMIN_INVITE_CODE ? "admin" : "user",
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    setSession(user);
    return { success: true, user: publicUser(user) };
  }

  async function adminSaveUser({ id, displayName, email, role, password }) {
    const users = getUsers();
    const cleanName = String(displayName || "").trim().slice(0, 80);
    const cleanEmail = normalizeEmail(email);
    const cleanRole = role === "admin" ? "admin" : "user";
    if (!cleanName) return { success: false, error: "Display name is required." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { success: false, error: "Valid email is required." };

    const existing = id ? users.find((user) => user.id === id) : null;
    const emailTaken = users.some((user) => user.email === cleanEmail && user.id !== id);
    if (emailTaken) return { success: false, error: "That email is already in use." };

    if (existing) {
      existing.displayName = cleanName;
      existing.email = cleanEmail;
      existing.role = cleanRole;
      existing.updatedAt = new Date().toISOString();
      if (password) {
        const passwordError = validatePassword(password);
        if (passwordError) return { success: false, error: passwordError };
        existing.salt = randomSalt();
        existing.passwordHash = await hashPassword(password, existing.salt);
      }
      saveUsers(users);
      return { success: true, user: publicUser(existing) };
    }

    const passwordError = validatePassword(password);
    if (passwordError) return { success: false, error: passwordError };
    const salt = randomSalt();
    const user = {
      id: generateId(),
      displayName: cleanName,
      email: cleanEmail,
      passwordHash: await hashPassword(password, salt),
      salt,
      role: cleanRole,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    return { success: true, user: publicUser(user) };
  }

  function deleteUser(userId) {
    const currentUser = getCurrentUser();
    if (currentUser?.id === userId) {
      return { success: false, error: "You cannot delete your current admin account." };
    }
    const users = getUsers().filter((user) => user.id !== userId);
    saveUsers(users);
    return { success: true };
  }

  async function login({ email, password }) {
    const cleanEmail = normalizeEmail(email);
    const users = getUsers();
    const user = users.find((item) => item.email === cleanEmail);
    if (!user) return { success: false, error: "Email or password is incorrect." };
    const passwordHash = await hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) {
      return { success: false, error: "Email or password is incorrect." };
    }
    user.lastLoginAt = new Date().toISOString();
    saveUsers(users);
    setSession(user);
    return { success: true, user: publicUser(user) };
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role || "user",
    };
  }

  function setSession(user) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        userId: user.id,
        email: user.email,
        startedAt: new Date().toISOString(),
      })
    );
  }

  function getCurrentUser() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (!session?.userId) return null;
      const user = getUsers().find((item) => item.id === session.userId);
      return publicUser(user);
    } catch (error) {
      return null;
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    renderAuthNav();
  }

  function isAdmin() {
    return getCurrentUser()?.role === "admin";
  }

  function requireAuth() {
    if (getCurrentUser()) return true;
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    location.href = `login.html?next=${next}`;
    return false;
  }

  function requireAdmin() {
    if (isAdmin()) return true;
    location.href = "login.html?next=admin.html";
    return false;
  }

  function renderAuthNav() {
    const nav = document.querySelector("[data-auth-nav]");
    if (!nav) return;
    const user = getCurrentUser();
    if (!user) {
      nav.innerHTML = `
        <a href="login.html">Login</a>
        <a href="signup.html">Sign Up</a>
      `;
      return;
    }
    const hasAdminLink = Boolean(document.querySelector('.nav-links a[href="admin.html"]'));
    nav.innerHTML = `
      ${user.role === "admin" && !hasAdminLink ? '<a href="admin.html">Admin</a>' : ""}
      <span class="nav-user">${escapeHtml(user.displayName)}</span>
      <button class="nav-button" type="button" data-logout>Logout</button>
    `;
    nav.querySelector("[data-logout]")?.addEventListener("click", () => {
      logout();
      if (location.pathname.endsWith("admin.html")) location.href = "index.html";
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  document.addEventListener("DOMContentLoaded", renderAuthNav);

  window.WCAuth = {
    ADMIN_INVITE_CODE,
    getUsers,
    adminSaveUser,
    deleteUser,
    signUp,
    login,
    logout,
    getCurrentUser,
    isAdmin,
    requireAuth,
    requireAdmin,
    renderAuthNav,
  };
})();
