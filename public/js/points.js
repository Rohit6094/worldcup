document.addEventListener("DOMContentLoaded", async () => {
  if (!WCAuth.requireAuth()) return;

  const currentUser = WCAuth.getCurrentUser();
  const matches = await WCApp.fetchMatches();
  const serverPredictions = await WCApp.fetchPredictions();
  const localPredictions = WCApp.getSavedPredictions();
  const predictions = mergePredictions(serverPredictions, localPredictions);
  const rows = WCApp.buildPredictionRows(predictions, matches);

  renderUserPredictions(rows, currentUser);
  renderOverallPredictions(rows);
});

function mergePredictions(primary, fallback) {
  const map = new Map();
  [...fallback, ...primary].forEach((prediction) => {
    const key = `${prediction.userId || prediction.username || prediction.userEmail || prediction.displayName}:${prediction.matchId}`;
    map.set(key, prediction);
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
}

function renderUserPredictions(rows, currentUser) {
  const container = document.querySelector("[data-user-points]");
  if (!currentUser) {
    container.innerHTML = `<div class="empty-card">Login to view your own prediction points.</div>`;
    return;
  }

  const userRows = rows.filter((row) => row.userId === currentUser.id || row.userEmail === currentUser.email || row.username === currentUser.username);
  renderPredictionTable(container, userRows, "You have not submitted predictions yet.");
}

function renderOverallPredictions(rows) {
  const container = document.querySelector("[data-overall-points]");
  renderPredictionTable(container, rows, "No predictions have been submitted yet.");
}

function renderPredictionTable(container, rows, emptyMessage) {
  if (!rows.length) {
    container.innerHTML = `<div class="empty-card">${emptyMessage}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Match</th>
            <th>Prediction</th>
            <th>Result</th>
            <th>Winner</th>
            <th>Exact</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const matchLabel = row.match ? `${row.match.homeTeam.name} vs ${row.match.awayTeam.name}` : row.matchId;
            const result = row.match && row.match.status === "completed" ? WCApp.scoreText(row.match) : "Pending";
            return `
              <tr>
                <td>${WCApp.escapeHtml(row.displayName || row.username || row.userEmail || "Unknown")}</td>
                <td>${WCApp.escapeHtml(matchLabel)}</td>
                <td>${WCApp.escapeHtml(row.predictedWinner)} (${WCApp.escapeHtml(WCApp.predictionScoreText(row))})</td>
                <td>${WCApp.escapeHtml(result)}</td>
                <td>${row.correctWinner ? "Yes" : "No"}</td>
                <td>${row.exactScore ? "Yes" : "No"}</td>
                <td><strong>${row.points}</strong></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}
