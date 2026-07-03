document.addEventListener("DOMContentLoaded", async () => {
  const state = { overall: [], query: "", sort: "points" };
  const top10El = document.querySelector("[data-top10]");
  const overallEl = document.querySelector("[data-overall]");
  const searchInput = document.querySelector("[data-leaderboard-search]");
  const sortSelect = document.querySelector("[data-leaderboard-sort]");

  top10El.innerHTML = `<div class="loading-card">Loading leaderboard...</div>`;
  overallEl.innerHTML = `<div class="loading-card">Loading rankings...</div>`;

  const payload = await WCApp.fetchLeaderboard();
  state.overall = payload.overall;
  renderTop10(top10El, payload.top10);
  renderOverall(overallEl, state);

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value.trim().toLowerCase();
    renderOverall(overallEl, state);
  });
  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    renderOverall(overallEl, state);
  });
});

function renderTop10(container, rows) {
  container.innerHTML = rows
    .map((row) => `
      <article class="leader-card rank-${row.rank <= 3 ? row.rank : "standard"}">
        <span class="rank-badge">#${row.rank}</span>
        <div>
          <h3>${WCApp.escapeHtml(row.displayName)}</h3>
          <p>${row.points} points</p>
        </div>
        <dl>
          <div><dt>Winners</dt><dd>${row.correctWinners}</dd></div>
          <div><dt>Exact</dt><dd>${row.exactScores}</dd></div>
        </dl>
      </article>
    `)
    .join("");
}

function renderOverall(container, state) {
  const sorted = [...state.overall]
    .filter((row) => row.displayName.toLowerCase().includes(state.query))
    .sort((a, b) => {
      const key = state.sort;
      if (b[key] !== a[key]) return b[key] - a[key];
      return a.displayName.localeCompare(b.displayName);
    });

  if (!sorted.length) {
    container.innerHTML = `<div class="empty-card">No predictors match your search.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Name</th>
            <th>Points</th>
            <th>Correct winners</th>
            <th>Exact scores</th>
            <th>Total predictions</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((row, index) => `
              <tr>
                <td>#${index + 1}</td>
                <td>${WCApp.escapeHtml(row.displayName)}</td>
                <td><strong>${row.points}</strong></td>
                <td>${row.correctWinners}</td>
                <td>${row.exactScores}</td>
                <td>${row.totalPredictions}</td>
              </tr>
            `)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
