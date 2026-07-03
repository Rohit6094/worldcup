const adminState = {
  users: [],
  predictions: [],
  matches: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!WCAuth.requireAdmin()) return;
  await loadAdminData();
  bindAdminForms();
  renderAdmin();
});

async function loadAdminData() {
  adminState.users = await WCAuth.fetchUsers();
  const serverPredictions = await WCApp.fetchPredictions();
  const localPredictions = WCApp.getSavedPredictions();
  adminState.predictions = mergePredictions(serverPredictions, localPredictions);
  adminState.matches = await WCApp.fetchMatches();
}

function bindAdminForms() {
  document.querySelector("[data-user-form]").addEventListener("submit", saveUserFromForm);
  document.querySelector("[data-reset-user-form]").addEventListener("click", resetUserForm);
  document.querySelector("[data-prediction-form-admin]").addEventListener("submit", savePredictionFromForm);
  document.querySelector("[data-reset-prediction-form]").addEventListener("click", resetPredictionForm);
}

function renderAdmin() {
  renderAdminStats();
  renderUserOptions();
  renderMatchOptions();
  renderPredictionTable();
  renderUserTable();
}

function mergePredictions(primary, fallback) {
  const map = new Map();
  [...fallback, ...primary].forEach((prediction) => {
    const key = `${prediction.userId || prediction.username || prediction.userEmail || prediction.displayName}:${prediction.matchId}`;
    map.set(key, prediction);
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
}

function renderAdminStats() {
  const stats = document.querySelector("[data-admin-stats]");
  stats.innerHTML = `
    <article class="info-card"><strong>${adminState.users.length}</strong><p>Registered users</p></article>
    <article class="info-card"><strong>${adminState.predictions.length}</strong><p>Saved predictions</p></article>
    <article class="info-card"><strong>${adminState.matches.length}</strong><p>Loaded fixtures</p></article>
    <article class="info-card"><strong>1 / 3</strong><p>Winner / exact score points</p></article>
  `;
}

function renderUserOptions() {
  const select = document.querySelector("[data-prediction-user]");
  select.innerHTML = `<option value="">Select user</option>${adminState.users
    .map((user) => `<option value="${WCApp.escapeHtml(user.id)}">${WCApp.escapeHtml(user.displayName)} (${WCApp.escapeHtml(user.username || user.email || "no username")})</option>`)
    .join("")}`;
}

function renderMatchOptions() {
  const select = document.querySelector("[data-prediction-match]");
  select.innerHTML = `<option value="">Select match</option>${adminState.matches
    .map((match) => `<option value="${WCApp.escapeHtml(match.id)}">${WCApp.escapeHtml(match.stage)} - ${WCApp.escapeHtml(match.homeTeam.name)} vs ${WCApp.escapeHtml(match.awayTeam.name)}</option>`)
    .join("")}`;
}

async function saveUserFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = await WCAuth.adminSaveUser({
    id: form.elements.userId.value,
    displayName: form.elements.displayName.value,
    username: form.elements.username.value,
    role: form.elements.role.value,
    password: form.elements.password.value,
  });

  const errorEl = form.querySelector("[data-form-error]");
  errorEl.textContent = "";
  if (!result.success) {
    errorEl.textContent = result.error;
    return;
  }

  resetUserForm();
  adminState.users = await WCAuth.fetchUsers();
  renderAdmin();
  WCApp.showToast("User saved.");
}

function resetUserForm() {
  const form = document.querySelector("[data-user-form]");
  form.reset();
  form.elements.userId.value = "";
  form.querySelector("[data-user-form-title]").textContent = "Create User";
  form.querySelector("[data-user-password-label]").textContent = "Temporary password";
  form.querySelector("[data-form-error]").textContent = "";
}

function editUser(userId) {
  const user = adminState.users.find((item) => item.id === userId);
  if (!user) return;
  const form = document.querySelector("[data-user-form]");
  form.elements.userId.value = user.id;
  form.elements.displayName.value = user.displayName;
  form.elements.username.value = user.username || user.email || "";
  form.elements.role.value = user.role || "user";
  form.elements.password.value = "";
  form.querySelector("[data-user-form-title]").textContent = "Edit User";
  form.querySelector("[data-user-password-label]").textContent = "New password";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function removeUser(userId) {
  const user = adminState.users.find((item) => item.id === userId);
  if (!confirm("Delete this user and all of their predictions?")) return;
  const result = await WCAuth.deleteUser(userId);
  if (!result.success) {
    WCApp.showToast(result.error, "error");
    return;
  }
  const identifiers = new Set(
    [userId, user?.username, user?.email, user?.displayName]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase())
  );
  const belongsToDeletedUser = (prediction) => {
    const values = [prediction.userId, prediction.username, prediction.userEmail, prediction.displayName]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    return values.some((value) => identifiers.has(value));
  };
  const predictions = WCApp.getSavedPredictions().filter((prediction) => !belongsToDeletedUser(prediction));
  localStorage.setItem("wc2026_predictions", JSON.stringify(predictions));
  adminState.users = await WCAuth.fetchUsers();
  adminState.predictions = adminState.predictions.filter((prediction) => !belongsToDeletedUser(prediction));
  renderAdmin();
  WCApp.showToast(`User deleted. Removed ${result.deletedPredictions || 0} associated prediction${result.deletedPredictions === 1 ? "" : "s"}.`);
}

async function savePredictionFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const user = adminState.users.find((item) => item.id === form.elements.userId.value);
  const match = adminState.matches.find((item) => item.id === form.elements.matchId.value);
  const errorEl = form.querySelector("[data-form-error]");
  errorEl.textContent = "";

  if (!user || !match) {
    errorEl.textContent = "Select a user and match.";
    return;
  }

  const homeScore = Number(form.elements.homeScore.value);
  const awayScore = Number(form.elements.awayScore.value);
  if (!Number.isInteger(homeScore) || homeScore < 0 || !Number.isInteger(awayScore) || awayScore < 0) {
    errorEl.textContent = "Scores must be non-negative whole numbers.";
    return;
  }

  const prediction = {
    matchId: match.id,
    userId: user.id,
    userEmail: user.username || user.email,
    username: user.username || user.email,
    displayName: user.displayName,
    predictedWinner: form.elements.predictedWinner.value,
    advancingTeam: form.elements.advancingTeam.value,
    homeScore,
    awayScore,
    submittedAt: new Date().toISOString(),
  };

  if (!prediction.predictedWinner) {
    errorEl.textContent = "Enter a predicted winner.";
    return;
  }
  if (prediction.predictedWinner === "Draw / Penalties" && !prediction.advancingTeam) {
    errorEl.textContent = "Enter the advancing team for penalty predictions.";
    return;
  }
  if (prediction.predictedWinner === "Draw / Penalties" && homeScore !== awayScore) {
    errorEl.textContent = "A draw / penalties prediction should use a tied score.";
    return;
  }
  if (prediction.predictedWinner !== "Draw / Penalties" && !prediction.advancingTeam) {
    prediction.advancingTeam = prediction.predictedWinner;
  }
  const homeName = match.homeTeam?.name || "Home team";
  const awayName = match.awayTeam?.name || "Away team";
  if (prediction.predictedWinner !== "Draw / Penalties" && ![homeName, awayName].includes(prediction.predictedWinner)) {
    errorEl.textContent = "Predicted winner must match one of the match teams or Draw / Penalties.";
    return;
  }
  if (prediction.predictedWinner === "Draw / Penalties" && ![homeName, awayName].includes(prediction.advancingTeam)) {
    errorEl.textContent = "Advancing team must match one of the match teams.";
    return;
  }
  if (prediction.predictedWinner === homeName && homeScore <= awayScore) {
    errorEl.textContent = `${homeName} goals must be greater than ${awayName} goals.`;
    return;
  }
  if (prediction.predictedWinner === awayName && awayScore <= homeScore) {
    errorEl.textContent = `${awayName} goals must be greater than ${homeName} goals.`;
    return;
  }

  const result = await WCApp.submitPrediction(prediction);
  if (!result.success) {
    errorEl.textContent = result.error || "Prediction could not be saved.";
    return;
  }

  WCApp.removePredictionLocally(prediction);
  const saved = result.prediction || prediction;
  const current = WCApp.getSavedPredictions();
  current.push(saved);
  localStorage.setItem("wc2026_predictions", JSON.stringify(current));
  adminState.predictions = mergePredictions([saved], adminState.predictions);
  resetPredictionForm();
  renderAdmin();
  WCApp.showToast("Prediction saved.");
}

function resetPredictionForm() {
  const form = document.querySelector("[data-prediction-form-admin]");
  form.reset();
  form.querySelector("[data-form-error]").textContent = "";
  form.querySelector("[data-prediction-form-title]").textContent = "Create Prediction";
}

function editPrediction(index) {
  const prediction = adminState.predictions[index];
  if (!prediction) return;
  const form = document.querySelector("[data-prediction-form-admin]");
  form.elements.userId.value = prediction.userId || "";
  form.elements.matchId.value = prediction.matchId || "";
  form.elements.predictedWinner.value = prediction.predictedWinner || "";
  form.elements.advancingTeam.value = prediction.advancingTeam || "";
  form.elements.homeScore.value = prediction.homeScore ?? "";
  form.elements.awayScore.value = prediction.awayScore ?? "";
  form.querySelector("[data-prediction-form-title]").textContent = "Edit Prediction";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function removePrediction(index) {
  const prediction = adminState.predictions[index];
  if (!prediction || !confirm("Delete this prediction?")) return;
  await WCApp.deletePrediction(prediction);
  WCApp.removePredictionLocally(prediction);
  adminState.predictions = adminState.predictions.filter((_, itemIndex) => itemIndex !== index);
  renderAdmin();
  WCApp.showToast("Prediction deleted.");
}

function renderPredictionTable() {
  const container = document.querySelector("[data-admin-predictions]");
  if (!adminState.predictions.length) {
    container.innerHTML = `<div class="empty-card">No predictions have been submitted yet.</div>`;
    return;
  }

  const rows = WCApp.buildPredictionRows(adminState.predictions, adminState.matches);
  container.innerHTML = `
    <div class="table-wrap">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Match</th>
            <th>Winner</th>
            <th>Advancing</th>
            <th>Score</th>
            <th>Points</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((prediction, index) => {
            const matchLabel = prediction.match ? `${prediction.match.homeTeam.name} vs ${prediction.match.awayTeam.name}` : prediction.matchId;
            return `
              <tr>
                <td>${WCApp.escapeHtml(prediction.displayName || prediction.username || prediction.userEmail || "Unknown")}</td>
                <td>${WCApp.escapeHtml(matchLabel)}</td>
                <td>${WCApp.escapeHtml(prediction.predictedWinner)}</td>
                <td>${WCApp.escapeHtml(prediction.advancingTeam || "TBD")}</td>
                <td>${WCApp.escapeHtml(WCApp.predictionScoreText(prediction))}</td>
                <td><strong>${prediction.points}</strong></td>
                <td class="table-actions">
                  <button class="btn btn-small btn-ghost" type="button" data-edit-prediction="${index}">Edit</button>
                  <button class="btn btn-small btn-ghost danger-action" type="button" data-delete-prediction="${index}">Delete</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("[data-edit-prediction]").forEach((button) => {
    button.addEventListener("click", () => editPrediction(Number(button.dataset.editPrediction)));
  });
  container.querySelectorAll("[data-delete-prediction]").forEach((button) => {
    button.addEventListener("click", () => removePrediction(Number(button.dataset.deletePrediction)));
  });
}

function renderUserTable() {
  const container = document.querySelector("[data-admin-users]");
  if (!adminState.users.length) {
    container.innerHTML = `<div class="empty-card">No users exist yet.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Role</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${adminState.users.map((user) => `
            <tr>
              <td>${WCApp.escapeHtml(user.displayName)}</td>
              <td>${WCApp.escapeHtml(user.username || user.email || "")}</td>
              <td>${WCApp.escapeHtml(user.role || "user")}</td>
              <td>${WCApp.escapeHtml(WCApp.formatDateTime(user.createdAt))}</td>
              <td class="table-actions">
                <button class="btn btn-small btn-ghost" type="button" data-edit-user="${WCApp.escapeHtml(user.id)}">Edit</button>
                <button class="btn btn-small btn-ghost danger-action" type="button" data-delete-user="${WCApp.escapeHtml(user.id)}">Delete</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => editUser(button.dataset.editUser));
  });
  container.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => removeUser(button.dataset.deleteUser));
  });
}
