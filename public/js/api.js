(function () {
  const STORAGE_KEY = "wc2026_predictions";
  const MATCH_CACHE_KEY = "wc2026_matches_cache";
  const MATCH_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  let lastMatchesMeta = { source: "unknown" };
  let matchRefreshPromise = null;

  const teamCountryCodes = {
    Algeria: "dz",
    Argentina: "ar",
    Australia: "au",
    Austria: "at",
    Belgium: "be",
    "Bosnia-Herzegovina": "ba",
    "Bosnia and Herzegovina": "ba",
    Brazil: "br",
    Cameroon: "cm",
    Canada: "ca",
    "Cape Verde": "cv",
    "Cape Verde Islands": "cv",
    Chile: "cl",
    Colombia: "co",
    "Congo DR": "cd",
    "Costa Rica": "cr",
    Croatia: "hr",
    Denmark: "dk",
    Ecuador: "ec",
    Egypt: "eg",
    England: "gb-eng",
    France: "fr",
    Germany: "de",
    Ghana: "gh",
    Haiti: "ht",
    Iran: "ir",
    "IR Iran": "ir",
    Italy: "it",
    "Ivory Coast": "ci",
    Jamaica: "jm",
    Japan: "jp",
    "Korea Republic": "kr",
    Mexico: "mx",
    Morocco: "ma",
    Netherlands: "nl",
    "New Zealand": "nz",
    Nigeria: "ng",
    Norway: "no",
    Panama: "pa",
    Paraguay: "py",
    Poland: "pl",
    Portugal: "pt",
    Qatar: "qa",
    "Saudi Arabia": "sa",
    Scotland: "gb-sct",
    Senegal: "sn",
    Serbia: "rs",
    "South Africa": "za",
    Spain: "es",
    Sweden: "se",
    "South Korea": "kr",
    Switzerland: "ch",
    Tunisia: "tn",
    Turkey: "tr",
    Ukraine: "ua",
    "United States": "us",
    USA: "us",
    Uruguay: "uy",
    Wales: "gb-wls",
  };

  const fallbackFlag =
    "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2228%22 viewBox=%220 0 40 28%22%3E%3Crect width=%2240%22 height=%2228%22 rx=%224%22 fill=%22%23e5e7eb%22/%3E%3Cpath d=%22M9 18h22M9 10h22%22 stroke=%22%239ca3af%22 stroke-width=%222%22 stroke-linecap=%22round%22/%3E%3C/svg%3E";

  const fallbackMatches = [
    {
      id: "r32-001",
      stage: "Round of 32",
      homeTeam: { name: "United States", code: "us", flag: "https://flagcdn.com/w40/us.png" },
      awayTeam: { name: "Japan", code: "jp", flag: "https://flagcdn.com/w40/jp.png" },
      date: "2026-06-28T19:00:00Z",
      venue: "MetLife Stadium",
      city: "East Rutherford",
      status: "completed",
      score: { home: 2, away: 1 },
      winner: "United States",
      goals: [
        { team: "United States", player: "Christian Pulisic", minute: 18 },
        { team: "Japan", player: "Takefusa Kubo", minute: 54 },
        { team: "United States", player: "Folarin Balogun", minute: 78 },
      ],
    },
    {
      id: "r32-002",
      stage: "Round of 32",
      homeTeam: { name: "Brazil", code: "br", flag: "https://flagcdn.com/w40/br.png" },
      awayTeam: { name: "Morocco", code: "ma", flag: "https://flagcdn.com/w40/ma.png" },
      date: "2026-06-28T23:00:00Z",
      venue: "AT&T Stadium",
      city: "Arlington",
      status: "completed",
      score: { home: 1, away: 0 },
      winner: "Brazil",
      goals: [{ team: "Brazil", player: "Vinicius Junior", minute: 66 }],
    },
    {
      id: "r32-003",
      stage: "Round of 32",
      homeTeam: { name: "France", code: "fr", flag: "https://flagcdn.com/w40/fr.png" },
      awayTeam: { name: "Mexico", code: "mx", flag: "https://flagcdn.com/w40/mx.png" },
      date: "2026-06-29T19:00:00Z",
      venue: "Estadio Azteca",
      city: "Mexico City",
      status: "completed",
      score: { home: 3, away: 1 },
      winner: "France",
      goals: [
        { team: "France", player: "Kylian Mbappe", minute: 12 },
        { team: "Mexico", player: "Santiago Gimenez", minute: 37 },
        { team: "France", player: "Antoine Griezmann", minute: 61 },
      ],
    },
    {
      id: "r32-004",
      stage: "Round of 32",
      homeTeam: { name: "England", code: "gb-eng", flag: "https://flagcdn.com/w40/gb-eng.png" },
      awayTeam: { name: "Senegal", code: "sn", flag: "https://flagcdn.com/w40/sn.png" },
      date: "2026-06-29T23:00:00Z",
      venue: "BC Place",
      city: "Vancouver",
      status: "completed",
      score: { home: 2, away: 2 },
      winner: "England",
      goals: [
        { team: "England", player: "Harry Kane", minute: 25 },
        { team: "Senegal", player: "Ismaila Sarr", minute: 41 },
        { team: "Senegal", player: "Nicolas Jackson", minute: 70 },
        { team: "England", player: "Jude Bellingham", minute: 89 },
      ],
    },
    {
      id: "r32-005",
      stage: "Round of 32",
      homeTeam: { name: "Spain", code: "es", flag: "https://flagcdn.com/w40/es.png" },
      awayTeam: { name: "South Korea", code: "kr", flag: "https://flagcdn.com/w40/kr.png" },
      date: "2026-06-30T18:00:00Z",
      venue: "Lumen Field",
      city: "Seattle",
      status: "completed",
      score: { home: 2, away: 0 },
      winner: "Spain",
      goals: [
        { team: "Spain", player: "Pedri", minute: 33 },
        { team: "Spain", player: "Alvaro Morata", minute: 74 },
      ],
    },
    {
      id: "r32-006",
      stage: "Round of 32",
      homeTeam: { name: "Argentina", code: "ar", flag: "https://flagcdn.com/w40/ar.png" },
      awayTeam: { name: "Croatia", code: "hr", flag: "https://flagcdn.com/w40/hr.png" },
      date: "2026-06-30T22:00:00Z",
      venue: "SoFi Stadium",
      city: "Inglewood",
      status: "completed",
      score: { home: 1, away: 1 },
      winner: "Argentina",
      goals: [
        { team: "Croatia", player: "Luka Modric", minute: 29 },
        { team: "Argentina", player: "Julian Alvarez", minute: 63 },
      ],
    },
    {
      id: "r32-007",
      stage: "Round of 32",
      homeTeam: { name: "Portugal", code: "pt", flag: "https://flagcdn.com/w40/pt.png" },
      awayTeam: { name: "Ghana", code: "gh", flag: "https://flagcdn.com/w40/gh.png" },
      date: "2026-07-01T18:00:00Z",
      venue: "Hard Rock Stadium",
      city: "Miami",
      status: "completed",
      score: { home: 2, away: 1 },
      winner: "Portugal",
      goals: [
        { team: "Portugal", player: "Bruno Fernandes", minute: 20 },
        { team: "Ghana", player: "Mohammed Kudus", minute: 47 },
        { team: "Portugal", player: "Rafael Leao", minute: 81 },
      ],
    },
    {
      id: "r32-008",
      stage: "Round of 32",
      homeTeam: { name: "Germany", code: "de", flag: "https://flagcdn.com/w40/de.png" },
      awayTeam: { name: "Netherlands", code: "nl", flag: "https://flagcdn.com/w40/nl.png" },
      date: "2026-07-01T22:00:00Z",
      venue: "Mercedes-Benz Stadium",
      city: "Atlanta",
      status: "completed",
      score: { home: 3, away: 2 },
      winner: "Germany",
      goals: [
        { team: "Netherlands", player: "Cody Gakpo", minute: 9 },
        { team: "Germany", player: "Jamal Musiala", minute: 31 },
        { team: "Germany", player: "Kai Havertz", minute: 55 },
        { team: "Netherlands", player: "Xavi Simons", minute: 73 },
        { team: "Germany", player: "Florian Wirtz", minute: 87 },
      ],
    },
    {
      id: "r16-001",
      stage: "Round of 16",
      homeTeam: { name: "United States", code: "us", flag: "https://flagcdn.com/w40/us.png" },
      awayTeam: { name: "Brazil", code: "br", flag: "https://flagcdn.com/w40/br.png" },
      date: "2026-07-03T20:00:00Z",
      venue: "Levi's Stadium",
      city: "Santa Clara",
      status: "upcoming",
      score: { home: null, away: null },
      winner: null,
      goals: [],
    },
    {
      id: "r16-002",
      stage: "Round of 16",
      homeTeam: { name: "France", code: "fr", flag: "https://flagcdn.com/w40/fr.png" },
      awayTeam: { name: "England", code: "gb-eng", flag: "https://flagcdn.com/w40/gb-eng.png" },
      date: "2026-07-04T00:00:00Z",
      venue: "Gillette Stadium",
      city: "Foxborough",
      status: "upcoming",
      score: { home: null, away: null },
      winner: null,
      goals: [],
    },
    {
      id: "r16-003",
      stage: "Round of 16",
      homeTeam: { name: "Spain", code: "es", flag: "https://flagcdn.com/w40/es.png" },
      awayTeam: { name: "Argentina", code: "ar", flag: "https://flagcdn.com/w40/ar.png" },
      date: "2026-07-04T20:00:00Z",
      venue: "NRG Stadium",
      city: "Houston",
      status: "upcoming",
      score: { home: null, away: null },
      winner: null,
      goals: [],
    },
    {
      id: "r16-004",
      stage: "Round of 16",
      homeTeam: { name: "Portugal", code: "pt", flag: "https://flagcdn.com/w40/pt.png" },
      awayTeam: { name: "Germany", code: "de", flag: "https://flagcdn.com/w40/de.png" },
      date: "2026-07-05T00:00:00Z",
      venue: "Arrowhead Stadium",
      city: "Kansas City",
      status: "upcoming",
      score: { home: null, away: null },
      winner: null,
      goals: [],
    },
    {
      id: "qf-001",
      stage: "Quarter-finals",
      homeTeam: { name: "Winner R16 1", code: "", flag: "" },
      awayTeam: { name: "Winner R16 2", code: "", flag: "" },
      date: "2026-07-09T21:00:00Z",
      venue: "MetLife Stadium",
      city: "East Rutherford",
      status: "upcoming",
      score: { home: null, away: null },
      winner: null,
      goals: [],
    },
    {
      id: "qf-002",
      stage: "Quarter-finals",
      homeTeam: { name: "Winner R16 3", code: "", flag: "" },
      awayTeam: { name: "Winner R16 4", code: "", flag: "" },
      date: "2026-07-10T01:00:00Z",
      venue: "AT&T Stadium",
      city: "Arlington",
      status: "upcoming",
      score: { home: null, away: null },
      winner: null,
      goals: [],
    },
    {
      id: "sf-001",
      stage: "Semi-finals",
      homeTeam: { name: "Winner QF 1", code: "", flag: "" },
      awayTeam: { name: "Winner QF 2", code: "", flag: "" },
      date: "2026-07-14T23:00:00Z",
      venue: "AT&T Stadium",
      city: "Arlington",
      status: "upcoming",
      score: { home: null, away: null },
      winner: null,
      goals: [],
    },
    {
      id: "tp-001",
      stage: "Third-place",
      homeTeam: { name: "Loser SF 1", code: "", flag: "" },
      awayTeam: { name: "Loser SF 2", code: "", flag: "" },
      date: "2026-07-18T20:00:00Z",
      venue: "Hard Rock Stadium",
      city: "Miami",
      status: "upcoming",
      score: { home: null, away: null },
      winner: null,
      goals: [],
    },
    {
      id: "final-001",
      stage: "Final",
      homeTeam: { name: "Winner SF 1", code: "", flag: "" },
      awayTeam: { name: "Winner SF 2", code: "", flag: "" },
      date: "2026-07-19T19:00:00Z",
      venue: "MetLife Stadium",
      city: "East Rutherford",
      status: "upcoming",
      score: { home: null, away: null },
      winner: null,
      goals: [],
    },
  ];

  const fallbackLeaderboard = [];

  async function requestJson(url, options = {}) {
    const authHeaders = window.WCAuth?.authHeaders?.() || {};
    const { headers = {}, cache = "no-store", ...fetchOptions } = options;
    const response = await fetch(url, {
      ...fetchOptions,
      headers: { "Content-Type": "application/json", ...authHeaders, ...headers },
      cache,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }
    return response.json();
  }

  async function fetchStaticFallback(path, fallbackValue) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`Static fallback failed with ${response.status}`);
      return response.json();
    } catch (error) {
      return fallbackValue;
    }
  }

  function readCachedMatches() {
    try {
      const cached = JSON.parse(localStorage.getItem(MATCH_CACHE_KEY) || "null");
      if (!cached?.matches?.length) return null;
      return cached;
    } catch (error) {
      return null;
    }
  }

  function writeCachedMatches(matches, meta) {
    try {
      localStorage.setItem(
        MATCH_CACHE_KEY,
        JSON.stringify({
          matches,
          meta,
          cachedAt: Date.now(),
        })
      );
    } catch (error) {
      // Cache writes can fail in private mode or storage pressure; live data still works.
    }
  }

  function applyMatchesPayload(payload, cacheStatus = "") {
    if (Array.isArray(payload)) {
      lastMatchesMeta = { source: "api", cacheStatus };
      writeCachedMatches(payload, lastMatchesMeta);
      return payload;
    }

    lastMatchesMeta = {
      source: payload.source || "unknown",
      fallbackReason: payload.fallbackReason || "",
      totalFixtures: payload.totalFixtures,
      knockoutFixtures: payload.knockoutFixtures,
      cacheStatus: payload.cacheStatus || cacheStatus,
    };
    const matches = payload.matches || fallbackMatches;
    writeCachedMatches(matches, lastMatchesMeta);
    return matches;
  }

  async function fetchMatchesFromNetwork(refresh = false) {
    const refreshQuery = refresh ? `?refresh=1&t=${Date.now()}` : "";
    const payload = await requestJson(`/api/matches${refreshQuery}`, { cache: "no-store" });
    return applyMatchesPayload(payload, refresh ? "manual-refresh" : "");
  }

  function revalidateMatchesInBackground() {
    if (matchRefreshPromise) return matchRefreshPromise;
    matchRefreshPromise = fetchMatchesFromNetwork(false)
      .then((matches) => {
        document.dispatchEvent(new CustomEvent("wc:matches-updated", {
          detail: { matches, meta: getMatchesMeta() },
        }));
        return matches;
      })
      .catch((error) => {
        console.warn("Background match refresh failed", error);
        return null;
      })
      .finally(() => {
        matchRefreshPromise = null;
      });
    return matchRefreshPromise;
  }

  async function fetchMatches(options = {}) {
    const cached = readCachedMatches();
    const cacheAge = cached ? Date.now() - Number(cached.cachedAt || 0) : Infinity;

    if (!options.refresh && cached?.matches?.length) {
      lastMatchesMeta = {
        ...(cached.meta || {}),
        cacheStatus: cacheAge <= MATCH_CACHE_MAX_AGE_MS ? "browser-cache" : "browser-stale",
      };
      revalidateMatchesInBackground();
      return cached.matches;
    }

    try {
      return await fetchMatchesFromNetwork(Boolean(options.refresh));
    } catch (error) {
      console.warn("Using local fallback matches", error);
      if (cached?.matches?.length) {
        lastMatchesMeta = {
          ...(cached.meta || {}),
          cacheStatus: "browser-stale",
          fallbackReason: "Showing cached matches while live data is unavailable.",
        };
        return cached.matches;
      }
      lastMatchesMeta = {
        source: "browser-fallback",
        fallbackReason: "Could not reach /api/matches from this page.",
      };
      return fetchStaticFallback("data/mock_matches.json", fallbackMatches);
    }
  }

  function getMatchesMeta() {
    return { ...lastMatchesMeta };
  }

  async function fetchMatchDetails(matchId) {
    if (!matchId) throw new Error("Match id is required");
    const payload = await requestJson(`/api/match_details?id=${encodeURIComponent(matchId)}&refresh=1&t=${Date.now()}`, { cache: "no-store" });
    return payload;
  }

  async function fetchLeaderboard() {
    try {
      const payload = await requestJson("/api/leaderboard");
      const overall = payload.overall || fallbackLeaderboard;
      return { top10: payload.top10 || overall.slice(0, 10), overall };
    } catch (error) {
      console.warn("Using local fallback leaderboard", error);
      const overall = await fetchStaticFallback("data/mock_leaderboard.json", fallbackLeaderboard);
      return { top10: overall.slice(0, 10), overall };
    }
  }

  async function submitPrediction(prediction) {
    try {
      return await requestJson("/api/submit_prediction", {
        method: "POST",
        body: JSON.stringify(prediction),
      });
    } catch (error) {
      console.warn("Prediction could not be saved", error);
      return { success: false, error: error.message || "Prediction could not be saved." };
    }
  }

  async function fetchPredictions() {
    try {
      const payload = await requestJson("/api/predictions");
      return payload.predictions || [];
    } catch (error) {
      console.warn("Using local predictions only", error);
      return [];
    }
  }

  async function deletePrediction(prediction) {
    try {
      return await requestJson("/api/predictions", {
        method: "DELETE",
        body: JSON.stringify({
          matchId: prediction.matchId,
          userId: prediction.userId || "",
          username: prediction.username || "",
          userEmail: prediction.userEmail || "",
          displayName: prediction.displayName || "",
        }),
      });
    } catch (error) {
      console.warn("Prediction could not be deleted", error);
      return { success: false, error: error.message || "Prediction could not be deleted." };
    }
  }

  function removePredictionLocally(prediction) {
    const predictions = getSavedPredictions().filter((item) => !samePredictionRecord(item, prediction));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(predictions));
    document.dispatchEvent(new CustomEvent("wc:predictions-changed"));
  }

  function scorePrediction(prediction, match) {
    if (!match || match.status !== "completed") {
      return { points: 0, correctWinner: false, exactScore: false };
    }
    const home = match.score?.home;
    const away = match.score?.away;
    const predictedWinner = prediction.predictedWinner === "Draw / Penalties" ? prediction.advancingTeam : prediction.predictedWinner;
    const correctWinner = Boolean(match.winner && predictedWinner === match.winner);
    const exactScore = correctWinner && Number.isInteger(home) && Number.isInteger(away) && prediction.homeScore === home && prediction.awayScore === away;
    return {
      points: exactScore ? 3 : correctWinner ? 1 : 0,
      correctWinner,
      exactScore,
    };
  }

  function buildPredictionRows(predictions, matches) {
    const matchesById = new Map(matches.map((match) => [match.id, match]));
    return predictions.map((prediction) => {
      const match = matchesById.get(prediction.matchId);
      const scored = scorePrediction(prediction, match);
      return { ...prediction, match, ...scored };
    });
  }

  function buildLeaderboardFromPredictions(predictions, matches, users = []) {
    const rows = new Map();
    const identityIndex = new Map();
    users.forEach((user) => {
      const key = user.id || user.username || user.email || user.displayName;
      if (!key) return;
      rows.set(key, {
        userId: user.id,
        displayName: user.displayName,
        points: 0,
        correctWinners: 0,
        exactScores: 0,
        totalPredictions: 0,
      });
      predictionIdentityValues(currentUserPredictionTarget(user)).forEach((identity) => {
        identityIndex.set(identity, key);
      });
    });

    buildPredictionRows(predictions, matches).forEach((prediction) => {
      const identities = predictionIdentityValues(prediction);
      const existingKey = identities.map((identity) => identityIndex.get(identity)).find(Boolean);
      const key = existingKey || prediction.userId || prediction.username || prediction.userEmail || prediction.displayName || "anonymous";
      const row = rows.get(key) || {
        userId: prediction.userId || "",
        displayName: prediction.displayName || prediction.username || prediction.userEmail || "Unknown",
        points: 0,
        correctWinners: 0,
        exactScores: 0,
        totalPredictions: 0,
      };
      row.displayName = row.displayName || prediction.displayName || "Unknown";
      row.points += prediction.points;
      row.correctWinners += prediction.correctWinner ? 1 : 0;
      row.exactScores += prediction.exactScore ? 1 : 0;
      row.totalPredictions += 1;
      rows.set(key, row);
      identities.forEach((identity) => identityIndex.set(identity, key));
    });

    return assignLeaderboardRanks(
      Array.from(rows.values()).sort((a, b) => b.points - a.points || b.exactScores - a.exactScores || b.correctWinners - a.correctWinners || a.displayName.localeCompare(b.displayName))
    );
  }

  function assignLeaderboardRanks(rows) {
    let previousPoints = null;
    let currentRank = 0;
    return rows.map((row, index) => {
      if (previousPoints === null || row.points !== previousPoints) {
        currentRank = index + 1;
        previousPoints = row.points;
      }
      return { ...row, rank: currentRank };
    });
  }

  function getTeamCode(team) {
    return team?.code || teamCountryCodes[team?.name] || "";
  }

  function getFlagUrl(team) {
    const code = getTeamCode(team);
    return team?.flag || (code ? `https://flagcdn.com/w40/${code}.png` : fallbackFlag);
  }

  function teamMarkup(team, compact = false) {
    const name = team?.name || "TBD";
    return `
      <span class="team ${compact ? "team-compact" : ""}">
        <img src="${getFlagUrl(team)}" alt="" loading="lazy" onerror="this.src='${fallbackFlag}'">
        <span>${escapeHtml(name)}</span>
      </span>
    `;
  }

  function formatDateTime(value) {
    if (!value) return "Date TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date TBD";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatFullDateTime(value) {
    if (!value) return "Date TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date TBD";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function getSavedPredictions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (error) {
      return [];
    }
  }

  function normalizeIdentity(value) {
    return String(value || "").trim().toLowerCase();
  }

  function predictionIdentityValues(prediction) {
    return [prediction?.userId, prediction?.username, prediction?.userEmail, prediction?.displayName]
      .map(normalizeIdentity)
      .filter(Boolean);
  }

  function currentUserPredictionTarget(user) {
    return {
      userId: user?.id || "",
      username: user?.username || user?.email || "",
      userEmail: user?.email || user?.username || "",
      displayName: user?.displayName || "",
    };
  }

  function samePredictionOwner(left, right) {
    const leftValues = new Set(predictionIdentityValues(left));
    return predictionIdentityValues(right).some((value) => leftValues.has(value));
  }

  function samePredictionRecord(left, right) {
    return String(left?.matchId || "") === String(right?.matchId || "") && samePredictionOwner(left, right);
  }

  function savePredictionLocally(prediction) {
    const user = window.WCAuth?.getCurrentUser?.();
    const target = user ? { ...prediction, ...currentUserPredictionTarget(user) } : prediction;
    const predictions = getSavedPredictions().filter((item) => !samePredictionRecord(item, target));
    predictions.push(prediction);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(predictions));
    document.dispatchEvent(new CustomEvent("wc:predictions-changed"));
  }

  function getPredictionForMatch(matchId) {
    const user = window.WCAuth?.getCurrentUser?.();
    const target = user ? currentUserPredictionTarget(user) : {};
    return getSavedPredictions().find((prediction) => {
      if (user) return String(prediction.matchId) === String(matchId) && samePredictionOwner(prediction, target);
      return prediction.matchId === matchId && !prediction.userId;
    });
  }

  function predictionCutoff(match) {
    if (!match?.date) return null;
    const kickoff = new Date(match.date);
    if (Number.isNaN(kickoff.getTime())) return null;
    return new Date(kickoff.getTime() - 60 * 60 * 1000);
  }

  function isPredictionOpen(match) {
    const cutoff = predictionCutoff(match);
    return match?.status === "upcoming" && Boolean(cutoff) && Date.now() < cutoff.getTime();
  }

  function predictionLockText(match) {
    if (match?.status !== "upcoming") return "Predictions closed";
    const cutoff = predictionCutoff(match);
    if (!cutoff) return "Prediction unavailable";
    if (Date.now() >= cutoff.getTime()) return "Predictions closed";
    return `Open until ${formatDateTime(cutoff.toISOString())}`;
  }

  function timeLeftText(match) {
    if (!match) return "Match timing unavailable";
    if (match.status === "completed") return "Match completed";
    if (match.status === "live") return "Live now";
    if (!match.date) return "Kickoff TBD";

    const kickoff = new Date(match.date);
    if (Number.isNaN(kickoff.getTime())) return "Kickoff TBD";
    const diff = kickoff.getTime() - Date.now();
    if (diff <= 0) return "Starting soon";

    const totalMinutes = Math.ceil(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `Kickoff in ${days}d ${hours}h`;
    if (hours > 0) return `Kickoff in ${hours}h ${minutes}m`;
    return `Kickoff in ${minutes}m`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message, type = "success") {
    const toast = document.querySelector("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    window.setTimeout(() => {
      toast.className = "toast";
    }, 3200);
  }

  function ensurePredictionModal() {
    let modal = document.querySelector("[data-prediction-modal]");
    if (modal) return modal;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div class="modal-backdrop" data-prediction-modal hidden>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="prediction-title">
          <button class="modal-close" type="button" data-close-modal aria-label="Close prediction form">&times;</button>
          <div class="modal-header">
            <p class="eyebrow" data-modal-stage></p>
            <h2 id="prediction-title">Submit Prediction</h2>
          </div>
          <div class="modal-teams" data-modal-teams></div>
          <form class="prediction-form" data-prediction-form>
            <label>
              Display name
              <input type="text" name="displayName" maxlength="80" placeholder="Your name" required readonly>
            </label>
            <label>
              Predicted winner
              <select name="predictedWinner" required></select>
            </label>
            <label data-advancing-wrap hidden>
              Advancing team after penalties
              <select name="advancingTeam"></select>
            </label>
            <div class="score-inputs">
              <label>
                <span data-home-score-label>Home goals</span>
                <input type="number" name="homeScore" min="0" step="1" inputmode="numeric" required>
              </label>
              <label>
                <span data-away-score-label>Away goals</span>
                <input type="number" name="awayScore" min="0" step="1" inputmode="numeric" required>
              </label>
            </div>
            <p class="form-error" data-form-error role="alert"></p>
            <button class="btn btn-primary" type="submit">Save Prediction</button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper.firstElementChild);
    modal = document.querySelector("[data-prediction-modal]");
    modal.addEventListener("click", (event) => {
      if (event.target.matches("[data-prediction-modal], [data-close-modal]")) {
        closePredictionModal();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closePredictionModal();
    });
    return modal;
  }

  function openPredictionModal(match, onSaved, existingPrediction = null) {
    const currentUser = window.WCAuth?.getCurrentUser?.();
    if (!currentUser) {
      showToast("Login or create an account to save predictions.", "error");
      window.setTimeout(() => {
        const next = encodeURIComponent(`${location.pathname}${location.search}`);
        location.href = `login.html?next=${next}`;
      }, 700);
      return;
    }

    if (!isPredictionOpen(match)) {
      showToast("Predictions close one hour before kickoff.", "error");
      return;
    }

    const modal = ensurePredictionModal();
    const existing = existingPrediction || getPredictionForMatch(match.id) || {};
    const form = modal.querySelector("[data-prediction-form]");
    const winnerSelect = form.elements.predictedWinner;
    const displayName = currentUser.displayName;

    modal.querySelector("[data-modal-stage]").textContent = match.stage || "Knockout match";
    modal.querySelector("[data-modal-teams]").innerHTML = `
      ${teamMarkup(match.homeTeam)}
      <span class="versus">vs</span>
      ${teamMarkup(match.awayTeam)}
    `;
    winnerSelect.innerHTML = `
      <option value="">Select winner</option>
      <option value="${escapeHtml(match.homeTeam?.name)}">${escapeHtml(match.homeTeam?.name || "Home team")}</option>
      <option value="${escapeHtml(match.awayTeam?.name)}">${escapeHtml(match.awayTeam?.name || "Away team")}</option>
      <option value="Draw / Penalties">Draw / Penalties</option>
    `;
    form.elements.advancingTeam.innerHTML = `
      <option value="">Select advancing team</option>
      <option value="${escapeHtml(match.homeTeam?.name)}">${escapeHtml(match.homeTeam?.name || "Home team")}</option>
      <option value="${escapeHtml(match.awayTeam?.name)}">${escapeHtml(match.awayTeam?.name || "Away team")}</option>
    `;
    form.elements.displayName.value = displayName;
    form.elements.predictedWinner.value = existing.predictedWinner || "";
    form.elements.advancingTeam.value = existing.advancingTeam || "";
    form.elements.homeScore.value = existing.homeScore ?? "";
    form.elements.awayScore.value = existing.awayScore ?? "";
    form.querySelector("[data-home-score-label]").textContent = `${match.homeTeam?.name || "Home"} goals`;
    form.querySelector("[data-away-score-label]").textContent = `${match.awayTeam?.name || "Away"} goals`;
    form.dataset.matchId = match.id;
    form.querySelector("[data-form-error]").textContent = "";
    updateAdvancingVisibility(form);

    winnerSelect.onchange = () => updateAdvancingVisibility(form);

    form.onsubmit = async (event) => {
      event.preventDefault();
      const homeScore = Number(form.elements.homeScore.value);
      const awayScore = Number(form.elements.awayScore.value);
      const errorEl = form.querySelector("[data-form-error]");

      if (!form.elements.predictedWinner.value || !form.elements.displayName.value.trim()) {
        errorEl.textContent = "Please enter your name and predicted winner.";
        return;
      }
      if (!Number.isInteger(homeScore) || homeScore < 0 || !Number.isInteger(awayScore) || awayScore < 0) {
        errorEl.textContent = "Scores must be non-negative whole numbers.";
        return;
      }
      if (form.elements.predictedWinner.value === "Draw / Penalties" && homeScore !== awayScore) {
        errorEl.textContent = "A draw / penalties prediction should use a tied score.";
        return;
      }
      if (form.elements.predictedWinner.value === "Draw / Penalties" && !form.elements.advancingTeam.value) {
        errorEl.textContent = "Select the team advancing after penalties.";
        return;
      }
      if (form.elements.predictedWinner.value !== "Draw / Penalties") {
        const homeName = match.homeTeam?.name || "Home team";
        const awayName = match.awayTeam?.name || "Away team";
        if (form.elements.predictedWinner.value === homeName && homeScore <= awayScore) {
          errorEl.textContent = `${homeName} goals must be greater than ${awayName} goals.`;
          return;
        }
        if (form.elements.predictedWinner.value === awayName && awayScore <= homeScore) {
          errorEl.textContent = `${awayName} goals must be greater than ${homeName} goals.`;
          return;
        }
      }
      const prediction = {
        matchId: match.id,
        userId: currentUser.id,
        userEmail: currentUser.username || currentUser.email,
        username: currentUser.username || currentUser.email,
        displayName: currentUser.displayName,
        predictedWinner: form.elements.predictedWinner.value,
        advancingTeam: form.elements.predictedWinner.value === "Draw / Penalties" ? form.elements.advancingTeam.value : form.elements.predictedWinner.value,
        homeScore,
        awayScore,
        submittedAt: new Date().toISOString(),
      };

      const submitButton = form.querySelector("button[type='submit']");
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
      const result = await submitPrediction(prediction);
      submitButton.disabled = false;
      submitButton.textContent = "Save Prediction";

      if (!result.success) {
        errorEl.textContent = result.error || "Prediction could not be saved.";
        return;
      }

      savePredictionLocally(result.prediction || prediction);
      closePredictionModal();
      showToast(result.localOnly ? "Prediction saved in this browser." : "Prediction submitted.");
      if (typeof onSaved === "function") onSaved(prediction);
    };

    modal.hidden = false;
    document.body.classList.add("modal-open");
    window.setTimeout(() => form.elements.predictedWinner.focus(), 0);
  }

  function closePredictionModal() {
    const modal = document.querySelector("[data-prediction-modal]");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function updateAdvancingVisibility(form) {
    const wrap = form.querySelector("[data-advancing-wrap]");
    const needsAdvancingTeam = form.elements.predictedWinner.value === "Draw / Penalties";
    wrap.hidden = !needsAdvancingTeam;
    form.elements.advancingTeam.required = needsAdvancingTeam;
    if (!needsAdvancingTeam) form.elements.advancingTeam.value = "";
  }

  function scoreText(match) {
    const home = match?.score?.home;
    const away = match?.score?.away;
    return Number.isInteger(home) && Number.isInteger(away) ? `${home} - ${away}` : "vs";
  }

  function predictionScoreText(prediction) {
    if (!prediction) return "";
    const baseScore = `${prediction.homeScore}-${prediction.awayScore}`;
    return baseScore;
  }

  window.WCApp = {
    fallbackFlag,
    teamCountryCodes,
    fetchMatches,
    fetchMatchDetails,
    getMatchesMeta,
    fetchLeaderboard,
    submitPrediction,
    fetchPredictions,
    deletePrediction,
    removePredictionLocally,
    savePredictionLocally,
    scorePrediction,
    assignLeaderboardRanks,
    buildPredictionRows,
    buildLeaderboardFromPredictions,
    getFlagUrl,
    teamMarkup,
    formatDateTime,
    formatFullDateTime,
    getSavedPredictions,
    getPredictionForMatch,
    predictionIdentityValues,
    samePredictionOwner,
    samePredictionRecord,
    isPredictionOpen,
    predictionLockText,
    timeLeftText,
    openPredictionModal,
    showToast,
    scoreText,
    predictionScoreText,
    escapeHtml,
  };
})();
