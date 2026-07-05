document.addEventListener("DOMContentLoaded", async () => {
  const state = { matches: [], stage: "Round of 16", status: "all", search: "" };
  const container = document.querySelector("[data-matches-container]");
  const stageFilter = document.querySelector("[data-stage-filter]");
  const statusFilter = document.querySelector("[data-status-filter]");
  const searchInput = document.querySelector("[data-team-search]");
  const refreshButton = document.querySelector("[data-refresh-matches]");

  container.innerHTML = `<div class="loading-card">Loading matches...</div>`;

  await loadMatchesPageData(state, container, stageFilter);

  document.addEventListener("wc:matches-updated", (event) => {
    if (!Array.isArray(event.detail?.matches)) return;
    state.matches = event.detail.matches;
    renderDataNotice(false);
    populateStageFilter(stageFilter, state.matches);
    if (state.stage !== "all" && !state.matches.some((match) => match.stage === state.stage)) {
      state.stage = "all";
    }
    stageFilter.value = state.stage;
    renderMatchesPage(container, state);
  });

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
    const predictButton = event.target.closest("[data-predict-match]");
    if (predictButton) {
      const match = state.matches.find((item) => item.id === predictButton.dataset.predictMatch);
      if (match) WCApp.openPredictionModal(match, () => renderMatchesPage(container, state));
      return;
    }

    const detailsButton = event.target.closest("[data-match-details]");
    if (detailsButton) {
      const match = state.matches.find((item) => item.id === detailsButton.dataset.matchDetails);
      if (match) openMatchDetailsModal(match, state);
    }
  });
});

async function loadMatchesPageData(state, container, stageFilter, refresh = false) {
  container.innerHTML = `<div class="loading-card">${refresh ? "Refreshing live data..." : "Loading matches..."}</div>`;
  state.matches = await WCApp.fetchMatches({ refresh });
  renderDataNotice(refresh);
  populateStageFilter(stageFilter, state.matches);
  if (state.stage === "Round of 16" && !state.matches.some((match) => match.stage === "Round of 16")) {
    state.stage = "all";
  }
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
  const canPredict = WCApp.isPredictionOpen(match);
  return `
    <article class="match-card detailed prediction-card">
      <div class="card-meta match-card-top">
        <span class="stage-chip">${WCApp.escapeHtml(match.stage)}</span>
        <span class="status-badge ${match.status}">${WCApp.escapeHtml(WCApp.matchStatusLabel(match.status))}</span>
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
      <div class="card-actions">
        <div class="match-action-buttons">
          <button class="btn btn-small btn-ghost" type="button" data-match-details="${match.id}">Details</button>
          ${
            canPredict
              ? `<button class="btn btn-small btn-primary" type="button" data-predict-match="${match.id}">Predict</button>`
              : match.status === "upcoming"
                ? `<span class="prediction-status">${WCApp.escapeHtml(WCApp.predictionLockText(match))}</span>`
                : match.status === "awaiting-result"
                  ? `<span class="prediction-status">Awaiting result update</span>`
                  : `<span class="result-badge">Result: ${WCApp.escapeHtml(match.winner || "Pending")}</span>`
          }
        </div>
        ${
          prediction
            ? `<span class="prediction-status saved">Prediction saved: ${WCApp.escapeHtml(prediction.predictedWinner)} ${WCApp.escapeHtml(WCApp.predictionScoreText(prediction))}</span>`
            : `<span class="prediction-status">No prediction yet</span>`
        }
      </div>
      <div class="countdown-strip">${WCApp.escapeHtml(WCApp.timeLeftText(match))}</div>
    </article>
  `;
}

function ensureMatchDetailsModal() {
  let modal = document.querySelector("[data-match-details-modal]");
  if (modal) return modal;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="modal-backdrop" data-match-details-modal hidden>
      <div class="modal match-detail-modal" role="dialog" aria-modal="true" aria-labelledby="match-detail-title">
        <button class="modal-close" type="button" data-close-match-details aria-label="Close match details">&times;</button>
        <div data-match-details-content></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper.firstElementChild);
  modal = document.querySelector("[data-match-details-modal]");

  modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-match-details-modal], [data-close-match-details]")) {
      closeMatchDetailsModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeMatchDetailsModal();
  });
  return modal;
}

async function openMatchDetailsModal(match, state) {
  const modal = ensureMatchDetailsModal();
  const content = modal.querySelector("[data-match-details-content]");
  content.innerHTML = `
    <div class="modal-header">
      <p class="eyebrow">${WCApp.escapeHtml(match.stage || "Knockout match")}</p>
      <h2 id="match-detail-title">Loading Match Details</h2>
    </div>
    <div class="loading-card">Fetching latest provider data...</div>
  `;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  modal.querySelector("[data-close-match-details]").focus();

  try {
    const payload = await WCApp.fetchMatchDetails(match.id);
    const freshMatch = payload.match || match;
    if (state && Array.isArray(state.matches)) {
      const index = state.matches.findIndex((item) => item.id === freshMatch.id);
      if (index >= 0) state.matches[index] = { ...state.matches[index], ...freshMatch };
    }
    renderMatchDetailsContent(content, freshMatch, payload.details || {}, payload.source || "");
  } catch (error) {
    renderMatchDetailsContent(content, match, {
      goalDataUnavailable: true,
      goalDataMessage: "Latest details could not be loaded. Showing the current card data.",
    }, "card data");
  }
}

function renderMatchDetailsContent(content, match, details, source) {
  const prediction = WCApp.getPredictionForMatch(match.id);
  const referees = details.referees || [];
  const scoreBreakdown = details.scoreBreakdown || {};
  content.innerHTML = `
    <div class="modal-header">
      <p class="eyebrow">${WCApp.escapeHtml(match.stage || "Knockout match")}</p>
      <h2 id="match-detail-title">Match Details</h2>
    </div>
    <div class="modal-teams">
      ${WCApp.teamMarkup(match.homeTeam)}
      <span class="versus">${match.status === "completed" || match.status === "live" ? WCApp.scoreText(match) : "vs"}</span>
      ${WCApp.teamMarkup(match.awayTeam)}
    </div>
    <dl class="match-details detail-modal-list">
      <div><dt>Status</dt><dd>${WCApp.escapeHtml(WCApp.matchStatusLabel(match.status))}</dd></div>
      <div><dt>Kickoff</dt><dd>${WCApp.escapeHtml(WCApp.formatFullDateTime(match.date))}</dd></div>
      <div><dt>Venue</dt><dd>${WCApp.escapeHtml(match.venue || "Venue TBD")}${match.city ? `, ${WCApp.escapeHtml(match.city)}` : ""}</dd></div>
      <div><dt>Winner</dt><dd>${WCApp.escapeHtml(match.winner || "TBD")}</dd></div>
      <div><dt>Your prediction</dt><dd>${prediction ? `${WCApp.escapeHtml(prediction.predictedWinner)} (${WCApp.escapeHtml(WCApp.predictionScoreText(prediction))})` : "Not submitted"}</dd></div>
      <div><dt>Half time</dt><dd>${formatScoreBreakdown(scoreBreakdown.halfTime)}</dd></div>
      <div><dt>Duration</dt><dd>${WCApp.escapeHtml(scoreBreakdown.duration || "TBD")}</dd></div>
      <div><dt>Referee</dt><dd>${referees.length ? WCApp.escapeHtml(referees.map((referee) => referee.name).join(", ")) : "TBD"}</dd></div>
      <div><dt>Last updated</dt><dd>${WCApp.escapeHtml(details.lastUpdated ? WCApp.formatFullDateTime(details.lastUpdated) : "Not provided")}</dd></div>
      <div><dt>Data source</dt><dd>${WCApp.escapeHtml(source || "match feed")}</dd></div>
    </dl>
    <div class="goal-list detail-goals">
      <p class="label">Goal scorers</p>
      ${renderGoals(match, details)}
    </div>
  `;
}

function closeMatchDetailsModal() {
  const modal = document.querySelector("[data-match-details-modal]");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function formatScoreBreakdown(score) {
  if (!score || !Number.isInteger(score.home) || !Number.isInteger(score.away)) return "TBD";
  return `${score.home} - ${score.away}`;
}

function renderGoals(match, details = {}) {
  if (!match.goals || !match.goals.length) {
    return `<p class="muted">${WCApp.escapeHtml(details.goalDataMessage || "Goal scorers unavailable.")}</p>`;
  }
  return `
    <ul>
      ${match.goals
        .map((goal) => `<li>${goal.minute ? `${goal.minute}' ` : ""}${WCApp.escapeHtml(goal.player)} (${WCApp.escapeHtml(goal.team)})</li>`)
        .join("")}
    </ul>
  `;
}
