document.addEventListener("DOMContentLoaded", async () => {
  const state = { matches: [] };
  const previousEl = document.querySelector("[data-previous-games]");
  const upcomingEl = document.querySelector("[data-upcoming-games]");
  const featuredEl = document.querySelector("[data-featured-matches]");
  const heroLeaderboardEl = document.querySelector("[data-hero-leaderboard]");
  const refreshButton = document.querySelector("[data-refresh-matches]");

  setLoading(previousEl);
  setLoading(upcomingEl);
  setLoading(featuredEl);
  setHeroLeaderboardLoading(heroLeaderboardEl);

  await Promise.all([
    loadDashboardMatches(state),
    loadHeroLeaderboard(heroLeaderboardEl),
  ]);

  document.addEventListener("wc:matches-updated", (event) => {
    if (!Array.isArray(event.detail?.matches)) return;
    state.matches = event.detail.matches;
    renderDataNotice(false);
    renderDashboard(state.matches);
  });

  refreshButton?.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing...";
    await loadDashboardMatches(state, true);
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh Live Data";
  });

  document.addEventListener("click", (event) => {
    const predictButton = event.target.closest("[data-predict-match]");
    if (predictButton) {
      const match = state.matches.find((item) => item.id === predictButton.dataset.predictMatch);
      if (match) WCApp.openPredictionModal(match, () => renderDashboard(state.matches));
    }

    const goalsButton = event.target.closest("[data-toggle-goals]");
    if (goalsButton) {
      const target = document.getElementById(goalsButton.dataset.toggleGoals);
      if (target) {
        target.hidden = !target.hidden;
        goalsButton.textContent = target.hidden ? "View Goal Details" : "Hide Goal Details";
      }
    }
  });
});

async function loadDashboardMatches(state, refresh = false) {
  const previousEl = document.querySelector("[data-previous-games]");
  const upcomingEl = document.querySelector("[data-upcoming-games]");
  const featuredEl = document.querySelector("[data-featured-matches]");

  setLoading(previousEl);
  setLoading(upcomingEl);
  setLoading(featuredEl);

  try {
    state.matches = await WCApp.fetchMatches({ refresh });
    renderAuthCallout();
    renderDataNotice(refresh);
    renderDashboard(state.matches);
    if (refresh) WCApp.showToast("Live match data refreshed.");
  } catch (error) {
    renderError(previousEl, "Matches could not be loaded.");
    renderError(upcomingEl, "Upcoming games could not be loaded.");
    renderError(featuredEl, "Prediction cards could not be loaded.");
  }
}

async function loadHeroLeaderboard(container) {
  if (!container) return;
  try {
    const payload = await WCApp.fetchLeaderboard();
    renderHeroLeaderboard(container, (payload.overall || payload.top10 || []).slice(0, 3));
  } catch (error) {
    container.innerHTML = `<div class="mini-empty">Leaderboard is unavailable.</div>`;
  }
}

function setHeroLeaderboardLoading(container) {
  if (container) container.innerHTML = `<div class="mini-loading">Loading rankings...</div>`;
}

function renderHeroLeaderboard(container, rows) {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<div class="mini-empty">Rankings appear after predictions are scored.</div>`;
    return;
  }

  container.innerHTML = rows
    .map((row) => `
      <div class="hero-leader-row">
        <span class="rank-chip">#${WCApp.escapeHtml(row.rank || "")}</span>
        <div>
          <strong>${WCApp.escapeHtml(row.displayName || "Player")}</strong>
          <span>${WCApp.escapeHtml(row.totalPredictions || 0)} predictions</span>
        </div>
        <b>${WCApp.escapeHtml(row.points || 0)}</b>
      </div>
    `)
    .join("");
}

function renderAuthCallout() {
  const callout = document.querySelector("[data-auth-callout]");
  if (!callout) return;
  callout.hidden = Boolean(WCAuth.getCurrentUser());
}

function renderDashboard(matches) {
  const completed = matches
    .filter((match) => match.status === "completed")
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 2);
  const upcoming = matches
    .filter((match) => match.status === "upcoming")
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 2);
  const featured = getFeaturedMatches(matches);

  renderSummaryList(document.querySelector("[data-previous-games]"), completed, "completed");
  renderSummaryList(document.querySelector("[data-upcoming-games]"), upcoming, "upcoming");
  renderFeaturedMatches(document.querySelector("[data-featured-matches]"), featured);
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

function getFeaturedMatches(matches) {
  const roundOf16 = matches
    .filter((match) => match.stage === "Round of 16")
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (roundOf16.length) return roundOf16;

  const preferred = ["Round of 32", "Quarter-finals", "Semi-finals", "Third-place", "Final"];
  for (const stage of preferred) {
    const stageMatches = matches
      .filter((match) => match.stage === stage)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (stageMatches.length) return stageMatches;
  }
  return matches;
}

function renderSummaryList(container, matches, type) {
  if (!container) return;
  if (!matches.length) {
    container.innerHTML = `<div class="empty-card">Fixtures will appear here once available.</div>`;
    return;
  }

  container.innerHTML = matches
    .map((match, index) => {
      const goalsId = `goals-${type}-${index}`;
      const isCompleted = type === "completed";
      const canPredict = WCApp.isPredictionOpen(match);
      return `
        <article class="mini-match-card">
          <div class="card-meta match-card-top">
            <span class="stage-chip">${WCApp.escapeHtml(match.stage)}</span>
            <span>${WCApp.formatDateTime(match.date)}</span>
          </div>
          <div class="summary-teams mini-scoreboard">
            ${WCApp.teamMarkup(match.homeTeam, true)}
            <strong class="score-pill">${isCompleted ? WCApp.scoreText(match) : "vs"}</strong>
            ${WCApp.teamMarkup(match.awayTeam, true)}
          </div>
          <p class="fixture-note">${WCApp.escapeHtml(match.venue || "Venue TBD")}${match.city ? `, ${WCApp.escapeHtml(match.city)}` : ""}</p>
          ${
            isCompleted
              ? `<button class="btn btn-small btn-ghost" type="button" data-toggle-goals="${goalsId}">View Goal Details</button>
                 <div class="goal-list" id="${goalsId}" hidden>${renderGoals(match)}</div>`
              : canPredict
                ? `<button class="btn btn-small btn-primary" type="button" data-predict-match="${match.id}">Predict Now</button>`
                : `<span class="prediction-status">${WCApp.escapeHtml(WCApp.predictionLockText(match))}</span>`
          }
          <div class="countdown-strip">${WCApp.escapeHtml(WCApp.timeLeftText(match))}</div>
        </article>
      `;
    })
    .join("");
}

function renderFeaturedMatches(container, matches) {
  if (!container) return;
  if (!matches.length) {
    container.innerHTML = `<div class="empty-card">Fixtures will appear here once available.</div>`;
    return;
  }

  container.innerHTML = matches
    .map((match) => {
      const prediction = WCApp.getPredictionForMatch(match.id);
      const canPredict = WCApp.isPredictionOpen(match);
      return `
        <article class="match-card prediction-card">
          <div class="card-meta match-card-top">
            <span class="stage-chip">${WCApp.escapeHtml(match.stage)}</span>
            <span class="status-badge ${match.status}">${WCApp.escapeHtml(match.status)}</span>
          </div>
          <div class="matchup">
            ${WCApp.teamMarkup(match.homeTeam)}
            <div class="score-pill">${match.status === "completed" ? WCApp.scoreText(match) : "vs"}</div>
            ${WCApp.teamMarkup(match.awayTeam)}
          </div>
          <div class="match-context">
            <span>${match.status === "completed" ? "Final score" : WCApp.formatFullDateTime(match.date)}</span>
            <span>${WCApp.escapeHtml(match.venue || "Venue TBD")}</span>
          </div>
          <div class="card-actions">
            <span class="prediction-status">${prediction ? "Prediction saved" : "No prediction yet"}</span>
            ${
              canPredict
                ? `<button class="btn btn-primary" type="button" data-predict-match="${match.id}">Predict</button>`
                : match.status === "upcoming"
                  ? `<span class="prediction-status">${WCApp.escapeHtml(WCApp.predictionLockText(match))}</span>`
                  : `<span class="result-badge">Winner: ${WCApp.escapeHtml(match.winner || "TBD")}</span>`
            }
          </div>
          <div class="countdown-strip">${WCApp.escapeHtml(WCApp.timeLeftText(match))}</div>
        </article>
      `;
    })
    .join("");
}

function renderGoals(match) {
  if (!match.goals || !match.goals.length) {
    return `<p class="muted">Goal details are not available yet.</p>`;
  }
  return `
    <ul>
      ${match.goals
        .map((goal) => `<li>${goal.minute ? `${goal.minute}' ` : ""}${WCApp.escapeHtml(goal.player)} (${WCApp.escapeHtml(goal.team)})</li>`)
        .join("")}
    </ul>
  `;
}

function setLoading(container) {
  if (container) container.innerHTML = `<div class="loading-card">Loading...</div>`;
}

function renderError(container, message) {
  if (container) container.innerHTML = `<div class="error-card">${message}</div>`;
}
