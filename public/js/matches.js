document.addEventListener("DOMContentLoaded", async () => {
  const state = { matches: [], stage: "all", status: "all", search: "" };
  const container = document.querySelector("[data-matches-container]");
  const stageFilter = document.querySelector("[data-stage-filter]");
  const statusFilter = document.querySelector("[data-status-filter]");
  const searchInput = document.querySelector("[data-team-search]");
  const refreshButton = document.querySelector("[data-refresh-matches]");

  container.innerHTML = `<div class="loading-card">Loading matches...</div>`;

  await loadMatchesPageData(state, container, stageFilter);

  stageFilter.addEventListener("change", () => {
    state.stage = stageFilter.value;
    renderMatchesPage(container, state);
  });
  statusFilter.addEventListener("change", () => {
    state.status = statusFilter.value;
    renderMatchesPage(container, state);
  });
  searchInput.addEventListener("input", () => {
    state.search = searchInput.value.trim().toLowerCase();
    renderMatchesPage(container, state);
  });
  refreshButton?.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing...";
    await loadMatchesPageData(state, container, stageFilter, true);
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh Live Data";
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-predict-match]");
    if (!button) return;
    const match = state.matches.find((item) => item.id === button.dataset.predictMatch);
    if (match) WCApp.openPredictionModal(match, () => renderMatchesPage(container, state));
  });
});

async function loadMatchesPageData(state, container, stageFilter, refresh = false) {
  container.innerHTML = `<div class="loading-card">${refresh ? "Refreshing live data..." : "Loading matches..."}</div>`;
  state.matches = await WCApp.fetchMatches({ refresh });
  renderDataNotice(refresh);
  populateStageFilter(stageFilter, state.matches);
  stageFilter.value = state.stage;
  renderMatchesPage(container, state);
  if (refresh) WCApp.showToast("Live match data refreshed.");
}

function renderDataNotice(wasRefreshed = false) {
  const notice = document.querySelector("[data-data-notice]");
  if (!notice) return;
  const meta = WCApp.getMatchesMeta();
  if (["football-data.org", "api-football"].includes(meta.source)) {
    notice.hidden = !wasRefreshed;
    notice.textContent = wasRefreshed
      ? `Showing latest ${meta.source} data. ${meta.knockoutFixtures || 0} knockout fixtures loaded.`
      : "";
    return;
  }
  notice.hidden = false;
  notice.textContent = meta.fallbackReason
    ? `Showing demo fixtures: ${meta.fallbackReason}`
    : "Showing demo fixtures until live World Cup data is available.";
}

const STAGES = ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Third-place", "Final"];

function populateStageFilter(select, matches) {
  const availableStages = STAGES.filter((stage) => matches.some((match) => match.stage === stage));
  select.innerHTML = `
    <option value="all">All stages</option>
    ${availableStages.map((stage) => `<option value="${WCApp.escapeHtml(stage)}">${WCApp.escapeHtml(stage)}</option>`).join("")}
  `;
}

function getFilteredMatches(state) {
  return state.matches.filter((match) => {
    const matchesStage = state.stage === "all" || match.stage === state.stage;
    const matchesStatus = state.status === "all" || match.status === state.status;
    const haystack = `${match.homeTeam?.name || ""} ${match.awayTeam?.name || ""}`.toLowerCase();
    const matchesSearch = !state.search || haystack.includes(state.search);
    return matchesStage && matchesStatus && matchesSearch;
  });
}

function renderMatchesPage(container, state) {
  const filtered = getFilteredMatches(state);
  container.innerHTML = STAGES.map((stage) => {
    if (state.stage !== "all" && state.stage !== stage) return "";
    const stageMatches = filtered.filter((match) => match.stage === stage);
    return `
      <section class="stage-section" aria-labelledby="${stage.toLowerCase().replaceAll(" ", "-")}">
        <div class="section-heading">
          <h2 id="${stage.toLowerCase().replaceAll(" ", "-")}">${stage}</h2>
          <span>${stageMatches.length} match${stageMatches.length === 1 ? "" : "es"}</span>
        </div>
        <div class="match-grid">
          ${
            stageMatches.length
              ? stageMatches.map(renderMatchCard).join("")
              : `<div class="empty-card">Fixtures will appear here once available.</div>`
          }
        </div>
      </section>
    `;
  }).join("");
}

function renderMatchCard(match) {
  const prediction = WCApp.getPredictionForMatch(match.id);
  return `
    <article class="match-card detailed prediction-card">
      <div class="card-meta match-card-top">
        <span class="stage-chip">${WCApp.escapeHtml(match.stage)}</span>
        <span class="status-badge ${match.status}">${WCApp.escapeHtml(match.status)}</span>
      </div>
      <div class="matchup">
        ${WCApp.teamMarkup(match.homeTeam)}
        <div class="score-pill">${match.status === "completed" || match.status === "live" ? WCApp.scoreText(match) : "vs"}</div>
        ${WCApp.teamMarkup(match.awayTeam)}
      </div>
      <div class="match-context">
        <span>${WCApp.formatFullDateTime(match.date)}</span>
        <span>${WCApp.escapeHtml(match.venue || "Venue TBD")}${match.city ? `, ${WCApp.escapeHtml(match.city)}` : ""}</span>
      </div>
      <dl class="match-details">
        <div><dt>Prediction</dt><dd>${prediction ? `${WCApp.escapeHtml(prediction.predictedWinner)} (${prediction.homeScore}-${prediction.awayScore})` : "Not submitted"}</dd></div>
      </dl>
      <div class="goal-list inline">${renderGoals(match)}</div>
      <div class="card-actions">
        ${
          match.status === "upcoming"
            ? `<button class="btn btn-primary" type="button" data-predict-match="${match.id}">Predict</button>`
            : `<span class="result-badge">Result: ${WCApp.escapeHtml(match.winner || "Pending")}</span>`
        }
      </div>
    </article>
  `;
}

function renderGoals(match) {
  if (!match.goals || !match.goals.length) return `<p class="muted">Goal scorers unavailable.</p>`;
  return `
    <p class="label">Goal scorers</p>
    <ul>
      ${match.goals
        .map((goal) => `<li>${goal.minute ? `${goal.minute}' ` : ""}${WCApp.escapeHtml(goal.player)} (${WCApp.escapeHtml(goal.team)})</li>`)
        .join("")}
    </ul>
  `;
}
