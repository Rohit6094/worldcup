const pointsState = {
  currentUser: null,
  matches: [],
  predictions: [],
  rows: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!WCAuth.requireAuth()) return;

  pointsState.currentUser = WCAuth.getCurrentUser();
  await loadPredictionPoints();

  document.addEventListener("wc:matches-updated", (event) => {
    if (!Array.isArray(event.detail?.matches)) return;
    pointsState.matches = event.detail.matches;
    pointsState.rows = WCApp.buildPredictionRows(pointsState.predictions, pointsState.matches);
    const userRows = getUserRows(pointsState.rows, pointsState.currentUser);
    renderPerformanceSummary(userRows);
    renderUserPredictions(userRows, pointsState.currentUser);
    renderOverallPredictions(pointsState.rows);
  });

  document.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-own-prediction]");
    if (editButton) {
      const row = pointsState.rows.find((item) => predictionKey(item) === editButton.dataset.editOwnPrediction);
      if (row?.match) {
        WCApp.openPredictionModal(row.match, loadPredictionPoints, row);
      }
      return;
    }

    const deleteButton = event.target.closest("[data-delete-own-prediction]");
    if (deleteButton) {
      const row = pointsState.rows.find((item) => predictionKey(item) === deleteButton.dataset.deleteOwnPrediction);
      if (!row || !confirm("Delete this prediction?")) return;

      deleteButton.disabled = true;
      deleteButton.textContent = "Deleting...";
      const result = await WCApp.deletePrediction(row);
      if (!result.success) {
        deleteButton.disabled = false;
        deleteButton.textContent = "Delete";
        WCApp.showToast(result.error || "Prediction could not be deleted.", "error");
        return;
      }

      WCApp.removePredictionLocally(row);
      WCApp.showToast("Prediction deleted.");
      await loadPredictionPoints();
    }
  });
});

async function loadPredictionPoints() {
  const performanceContainer = document.querySelector("[data-performance-summary]");
  const userContainer = document.querySelector("[data-user-points]");
  const overallContainer = document.querySelector("[data-overall-points]");
  performanceContainer.innerHTML = `<div class="loading-card">Loading performance...</div>`;
  userContainer.innerHTML = `<div class="loading-card">Loading your predictions...</div>`;
  overallContainer.innerHTML = `<div class="loading-card">Loading all predictions...</div>`;

  const matches = await WCApp.fetchMatches();
  const serverPredictions = await WCApp.fetchPredictions();
  const localPredictions = WCApp.getSavedPredictions();
  const predictions = mergePredictions(serverPredictions, localPredictions);
  const rows = WCApp.buildPredictionRows(predictions, matches);

  pointsState.currentUser = WCAuth.getCurrentUser();
  pointsState.matches = matches;
  pointsState.predictions = predictions;
  pointsState.rows = rows;

  const userRows = getUserRows(rows, pointsState.currentUser);
  renderPerformanceSummary(userRows);
  renderUserPredictions(userRows, pointsState.currentUser);
  renderOverallPredictions(rows);
}

function mergePredictions(primary, fallback) {
  const map = new Map();
  [...fallback, ...primary].forEach((prediction) => {
    const key = predictionKey(prediction);
    map.set(key, prediction);
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
}

function predictionKey(prediction) {
  return `${prediction.userId || prediction.username || prediction.userEmail || prediction.displayName}:${prediction.matchId}`;
}

function ownsPrediction(row, currentUser) {
  if (!currentUser) return false;
  const userValues = new Set(
    [currentUser.id, currentUser.username, currentUser.email]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase())
  );
  return [row.userId, row.username, row.userEmail]
    .filter(Boolean)
    .some((value) => userValues.has(String(value).trim().toLowerCase()));
}

function getUserRows(rows, currentUser) {
  return rows.filter((row) => ownsPrediction(row, currentUser));
}

function renderPerformanceSummary(userRows) {
  const container = document.querySelector("[data-performance-summary]");
  const totalPredictions = userRows.length;
  const completedRows = userRows.filter((row) => row.match?.status === "completed");
  const wins = completedRows.filter((row) => row.correctWinner).length;
  const losses = completedRows.length - wins;
  const exactScores = completedRows.filter((row) => row.exactScore).length;
  const pending = userRows.filter((row) => row.match?.status !== "completed").length;
  const totalPoints = userRows.reduce((sum, row) => sum + Number(row.points || 0), 0);
  const accuracy = completedRows.length ? Math.round((wins / completedRows.length) * 100) : 0;
  const averagePoints = totalPredictions ? (totalPoints / totalPredictions).toFixed(1) : "0.0";

  container.innerHTML = `
    ${performanceCard("Predictions", totalPredictions, "Total submitted picks")}
    ${performanceCard("Wins", wins, "Correct advancing winner")}
    ${performanceCard("Losses", losses, "Completed misses")}
    ${performanceCard("Exact Scores", exactScores, "Correct winner and score")}
    ${performanceCard("Total Points", totalPoints, "Leaderboard score")}
    ${performanceCard("Accuracy", `${accuracy}%`, "Winner accuracy")}
    ${performanceCard("Pending", pending, "Awaiting match results")}
    ${performanceCard("Avg Points", averagePoints, "Per prediction")}
  `;
}

function performanceCard(label, value, helper) {
  return `
    <article class="performance-card">
      <span>${WCApp.escapeHtml(label)}</span>
      <strong>${WCApp.escapeHtml(value)}</strong>
      <p>${WCApp.escapeHtml(helper)}</p>
    </article>
  `;
}

function renderUserPredictions(userRows, currentUser) {
  const container = document.querySelector("[data-user-points]");
  if (!currentUser) {
    container.innerHTML = `<div class="empty-card">Login to view your own prediction points.</div>`;
    return;
  }

  renderPredictionTable(container, userRows, "You have not submitted predictions yet.", { allowActions: true });
}

function renderOverallPredictions(rows) {
  const container = document.querySelector("[data-overall-points]");
  renderPredictionTable(container, rows, "No predictions have been submitted yet.", { allowActions: false });
}

function renderPredictionTable(container, rows, emptyMessage, options = {}) {
  if (!rows.length) {
    container.innerHTML = `<div class="empty-card">${emptyMessage}</div>`;
    return;
  }

  const allowActions = Boolean(options.allowActions);
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
            ${allowActions ? "<th>Actions</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => renderPredictionRow(row, allowActions)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPredictionRow(row, allowActions) {
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
      ${allowActions ? `<td class="table-actions">${renderPredictionActions(row)}</td>` : ""}
    </tr>
  `;
}

function renderPredictionActions(row) {
  if (!row.match) return `<span class="prediction-status">Unavailable</span>`;
  if (!WCApp.isPredictionOpen(row.match)) {
    return `<span class="prediction-status">${WCApp.escapeHtml(WCApp.predictionLockText(row.match))}</span>`;
  }

  const key = WCApp.escapeHtml(predictionKey(row));
  return `
    <button class="btn btn-small btn-ghost" type="button" data-edit-own-prediction="${key}">Edit</button>
    <button class="btn btn-small btn-ghost danger-action" type="button" data-delete-own-prediction="${key}">Delete</button>
  `;
}
