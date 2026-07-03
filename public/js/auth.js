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
    localStorage.setItem(USERS_KEY, JSON.stringify(users || []));
  }

  function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase();
  }

  function validatePassword(password) {
    return String(password || "").length ? "" : "Enter a password.";
  }

  async function requestAuth(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || `Auth request failed with ${response.status}`);
    }
    return payload;
  }

  async function fetchUsers() {
    try {
      const payload = await requestAuth(`/api/auth?t=${Date.now()}`);
      saveUsers(payload.users || []);
      return payload.users || [];
    } catch (error) {
      console.warn("Using cached users because /api/auth is unavailable", error);
      return getUsers();
    }
  }

  async function signUp({ displayName, username, password, confirmPassword, adminCode }) {
    const cleanUsername = normalizeUsername(username);
    const cleanName = String(displayName || "").trim();
    if (!cleanName) return { success: false, error: "Enter your display name." };
    if (!cleanUsername) return { success: false, error: "Enter a username." };
    if (password !== confirmPassword) return { success: false, error: "Passwords do not match." };
    const passwordError = validatePassword(password);
    if (passwordError) return { success: false, error: passwordError };

    try {
      const result = await requestAuth("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          action: "signup",
          displayName: cleanName,
          username: cleanUsername,
          password,
          adminCode,
        }),
      });
      await fetchUsers();
      setSession(result.user);
      renderAuthNav();
      return result;
    } catch (error) {
      return { success: false, error: error.message || "Account could not be created." };
    }
  }

  async function adminSaveUser({ id, displayName, username, role, password }) {
    const cleanName = String(displayName || "").trim().slice(0, 80);
    const cleanUsername = normalizeUsername(username);
    if (!cleanName) return { success: false, error: "Display name is required." };
    if (!cleanUsername) return { success: false, error: "Username is required." };
    if (!id || password) {
      const passwordError = validatePassword(password);
      if (passwordError) return { success: false, error: passwordError };
    }

    try {
      const result = await requestAuth("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          action: "adminSaveUser",
          id,
          displayName: cleanName,
          username: cleanUsername,
          role,
          password,
        }),
      });
      await fetchUsers();
      return result;
    } catch (error) {
      return { success: false, error: error.message || "User could not be saved." };
    }
  }

  async function deleteUser(userId) {
    const currentUser = getCurrentUser();
    if (currentUser?.id === userId) {
      return { success: false, error: "You cannot delete your current admin account." };
    }
    try {
      const result = await requestAuth("/api/auth", {
        method: "DELETE",
        body: JSON.stringify({ id: userId }),
      });
      await fetchUsers();
      return result;
    } catch (error) {
      return { success: false, error: error.message || "User could not be deleted." };
    }
  }

  async function login({ username, password }) {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername || !password) return { success: false, error: "Username or password is incorrect." };

    try {
      const result = await requestAuth("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          action: "login",
          username: cleanUsername,
          password,
        }),
      });
      await fetchUsers();
      setSession(result.user);
      renderAuthNav();
      return result;
    } catch (error) {
      return { success: false, error: error.message || "Username or password is incorrect." };
    }
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      displayName: user.displayName,
      username: user.username || user.email,
      email: user.email || user.username,
      role: user.role || "user",
    };
  }

  function setSession(user) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        userId: user.id,
        username: user.username || user.email,
        email: user.email || user.username,
        user: publicUser(user),
        startedAt: new Date().toISOString(),
      })
    );
  }

  function getCurrentUser() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (!session?.userId) return null;
      if (session.user) return publicUser(session.user);
      const user = getUsers().find((item) => item.id === session.userId);
      return publicUser(user);
    } catch (error) {
      return null;
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    renderAuthNav();
    renderProtectedNavLinks();
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
    renderProtectedNavLinks();
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
      if (location.pathname.endsWith("admin.html") || location.pathname.endsWith("leaderboard.html") || location.pathname.endsWith("points.html")) {
        location.href = "index.html";
      }
    });
  }

  function renderProtectedNavLinks() {
    const isLoggedIn = Boolean(getCurrentUser());
    document.querySelectorAll("[data-auth-required]").forEach((link) => {
      link.hidden = !isLoggedIn;
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

  document.addEventListener("DOMContentLoaded", async () => {
    renderAuthNav();
    if (getCurrentUser()) await fetchUsers();
    renderAuthNav();
  });

  window.WCAuth = {
    ADMIN_INVITE_CODE,
    getUsers,
    fetchUsers,
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
    renderProtectedNavLinks,
  };
})();
