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
    const { headers = {}, ...fetchOptions } = options;
    const response = await fetch(url, {
      cache: "no-store",
      ...fetchOptions,
      headers: { "Content-Type": "application/json", ...headers },
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
    const cleanName = String(displayName || cleanUsername).trim();
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
      setSession(result.user, result.token);
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

  function setSession(user, token = "") {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        userId: user.id,
        username: user.username || user.email,
        email: user.email || user.username,
        user: publicUser(user),
        token,
        startedAt: new Date().toISOString(),
      })
    );
  }

  function getCurrentUser() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (!session?.userId) return null;
      if (!session.token) return null;
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

  function getSessionToken() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return session?.token || "";
    } catch (error) {
      return "";
    }
  }

  function authHeaders() {
    const token = getSessionToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function requestProtectedJson(url) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }
    return payload;
  }

  async function fetchNotificationData() {
    const [predictionPayload, matchPayload] = await Promise.all([
      requestProtectedJson(`/api/predictions?t=${Date.now()}`),
      requestProtectedJson(`/api/matches?t=${Date.now()}`),
    ]);
    const matches = Array.isArray(matchPayload) ? matchPayload : matchPayload.matches || [];
    return {
      predictions: predictionPayload.predictions || [],
      matchesById: new Map(matches.map((match) => [String(match.id), match])),
    };
  }

  async function refreshNotificationCount(nav) {
    const countEl = nav.querySelector("[data-notification-count]");
    if (!countEl) return;
    try {
      const { predictions } = await fetchNotificationData();
      countEl.textContent = String(Math.min(predictions.length, 99));
    } catch (error) {
      countEl.textContent = "0";
    }
  }

  async function openNotifications(menu) {
    const button = menu.querySelector("[data-notification-toggle]");
    const panel = menu.querySelector("[data-notification-panel]");
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    panel.innerHTML = `<div class="notification-empty">Loading predictions...</div>`;

    try {
      const { predictions, matchesById } = await fetchNotificationData();
      const recent = predictions
        .slice()
        .sort((a, b) => new Date(b.submittedAt || b.savedAt || 0) - new Date(a.submittedAt || a.savedAt || 0))
        .slice(0, 10);
      panel.innerHTML = renderNotificationList(recent, matchesById);
      const countEl = menu.querySelector("[data-notification-count]");
      if (countEl) countEl.textContent = String(Math.min(predictions.length, 99));
    } catch (error) {
      panel.innerHTML = `<div class="notification-empty">Notifications could not be loaded.</div>`;
    }
  }

  function closeNotifications(menu) {
    const button = menu.querySelector("[data-notification-toggle]");
    const panel = menu.querySelector("[data-notification-panel]");
    if (!panel) return;
    panel.hidden = true;
    button?.setAttribute("aria-expanded", "false");
  }

  function renderNotificationList(predictions, matchesById) {
    if (!predictions.length) {
      return `<div class="notification-empty">No predictions have been submitted yet.</div>`;
    }

    return `
      <div class="notification-list">
        ${predictions
          .map((prediction) => {
            const match = matchesById.get(String(prediction.matchId));
            const matchLabel = match
              ? `${match.homeTeam?.name || "TBD"} vs ${match.awayTeam?.name || "TBD"}`
              : `Match ${prediction.matchId}`;
            return `
              <article class="notification-item">
                <strong>${escapeHtml(prediction.displayName || prediction.username || prediction.userEmail || "Unknown user")}</strong>
                <p>${escapeHtml(matchLabel)}</p>
                <span>${escapeHtml(prediction.predictedWinner || "Prediction")} ${escapeHtml(prediction.homeScore)}-${escapeHtml(prediction.awayScore)}</span>
                <time>${escapeHtml(formatNotificationTime(prediction.submittedAt || prediction.savedAt))}</time>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function formatNotificationTime(value) {
    if (!value) return "Time unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time unavailable";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
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
    const navLinks = document.querySelector(".nav-links");
    renderProtectedNavLinks();
    if (!nav) return;
    const user = getCurrentUser();
    document.querySelectorAll("[data-admin-nav]").forEach((link) => link.remove());
    if (!user) {
      nav.innerHTML = `
        <a href="login.html">Login</a>
        <a href="signup.html">Sign Up</a>
      `;
      return;
    }
    const hasAdminLink = Boolean(document.querySelector('.nav-links a[href="admin.html"]'));
    if (user.role === "admin" && !hasAdminLink && navLinks) {
      const adminLink = document.createElement("a");
      adminLink.href = "admin.html";
      adminLink.dataset.adminNav = "true";
      adminLink.textContent = "Admin";
      navLinks.insertBefore(adminLink, nav);
    }
    nav.innerHTML = `
      <span class="notification-menu" data-notification-menu>
        <button class="nav-button notification-button" type="button" data-notification-toggle aria-expanded="false">
          Notifications <span class="notification-count" data-notification-count>0</span>
        </button>
        <span class="notification-panel" data-notification-panel hidden></span>
      </span>
      <span class="nav-user">${escapeHtml(user.displayName)}</span>
      <button class="nav-button" type="button" data-logout>Logout</button>
    `;
    const notificationMenu = nav.querySelector("[data-notification-menu]");
    notificationMenu?.querySelector("[data-notification-toggle]")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      const panel = notificationMenu.querySelector("[data-notification-panel]");
      if (panel.hidden) {
        await openNotifications(notificationMenu);
      } else {
        closeNotifications(notificationMenu);
      }
    });
    refreshNotificationCount(nav);
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

  function initAutoHideHeader() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    let lastY = window.scrollY || 0;
    let ticking = false;
    const topThreshold = 80;
    const deltaThreshold = 8;

    function showHeader() {
      header.classList.remove("header-hidden");
      header.classList.toggle("header-visible", window.scrollY > topThreshold);
    }

    function hideHeader() {
      if (header.matches(":focus-within")) return;
      header.classList.add("header-hidden");
      header.classList.remove("header-visible");
    }

    function updateHeader() {
      const currentY = Math.max(0, window.scrollY || 0);
      const delta = currentY - lastY;

      if (currentY <= topThreshold || delta < -deltaThreshold) {
        showHeader();
      } else if (delta > deltaThreshold) {
        hideHeader();
      }

      lastY = currentY;
      ticking = false;
    }

    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateHeader);
      },
      { passive: true }
    );

    window.addEventListener("resize", showHeader);
    header.addEventListener("focusin", showHeader);
    showHeader();
  }

  document.addEventListener("click", (event) => {
    document.querySelectorAll("[data-notification-menu]").forEach((menu) => {
      if (!menu.contains(event.target)) closeNotifications(menu);
    });
  });

  document.addEventListener("wc:predictions-changed", () => {
    const nav = document.querySelector("[data-auth-nav]");
    if (nav && getCurrentUser()) refreshNotificationCount(nav);
  });

  document.addEventListener("DOMContentLoaded", async () => {
    initAutoHideHeader();
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
    getSessionToken,
    authHeaders,
    isAdmin,
    requireAuth,
    requireAdmin,
    renderAuthNav,
    renderProtectedNavLinks,
  };
})();
