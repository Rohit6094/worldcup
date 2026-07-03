document.addEventListener("DOMContentLoaded", async () => {
  if (!WCAuth.requireAdmin()) return;

  const users = WCAuth.getUsers();
  const serverPredictions = await WCApp.fetchPredictions();
  const localPredictions = WCApp.getSavedPredictions();
  const predictions = mergePredictions(serverPredictions, localPredictions);
  const matches = await WCApp.fetchMatches();

  renderAdminStats(users, predictions, matches);
  renderPredictionTable(predictions, matches);
  renderUserTable(users);
});

function mergePredictions(primary, fallback) {
  const map = new Map();
  [...fallback, ...primary].forEach((prediction) => {
    const key = `${prediction.userId || prediction.userEmail || prediction.displayName}:${prediction.matchId}`;
    map.set(key, prediction);
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
}

function renderAdminStats(users, predictions, matches) {
  const stats = document.querySelector("[data-admin-stats]");
  stats.innerHTML = `
    <article class="info-card"><strong>${users.length}</strong><p>Registered users</p></article>
    <article class="info-card"><strong>${predictions.length}</strong><p>Saved predictions</p></article>
    <article class="info-card"><strong>${matches.length}</strong><p>Loaded fixtures</p></article>
    <article class="info-card"><strong>2 / 3</strong><p>Winner / exact score points</p></article>
  `;
}

function renderPredictionTable(predictions, matches) {
  const container = document.querySelector("[data-admin-predictions]");
  if (!predictions.length) {
    container.innerHTML = `<div class="empty-card">No predictions have been submitted in this browser.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Match</th>
            <th>Winner</th>
            <th>Score</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          ${predictions.map((prediction) => {
            const match = matches.find((item) => item.id === prediction.matchId);
            const label = match ? `${match.homeTeam.name} vs ${match.awayTeam.name}` : prediction.matchId;
            return `
              <tr>
                <td>${WCApp.escapeHtml(prediction.displayName || prediction.userEmail || "Unknown")}</td>
                <td>${WCApp.escapeHtml(label)}</td>
                <td>${WCApp.escapeHtml(prediction.predictedWinner)}</td>
                <td>${prediction.homeScore}-${prediction.awayScore}</td>
                <td>${WCApp.escapeHtml(WCApp.formatDateTime(prediction.submittedAt))}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderUserTable(users) {
  const container = document.querySelector("[data-admin-users]");
  if (!users.length) {
    container.innerHTML = `<div class="empty-card">No local users exist yet.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${users.map((user) => `
            <tr>
              <td>${WCApp.escapeHtml(user.displayName)}</td>
              <td>${WCApp.escapeHtml(user.email)}</td>
              <td>${WCApp.escapeHtml(user.role || "user")}</td>
              <td>${WCApp.escapeHtml(WCApp.formatDateTime(user.createdAt))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}
