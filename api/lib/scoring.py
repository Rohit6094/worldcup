from .config import CORRECT_WINNER_POINTS, EXACT_SCORE_POINTS


SCORING_STAGES = {"Round of 16", "Quarter-finals", "Semi-finals", "Third-place", "Final"}


def score_prediction(prediction, match):
    scoring_eligible = bool(match and match.get("stage") in SCORING_STAGES)
    if not scoring_eligible or match.get("status") != "completed":
        return {"points": 0, "correctWinner": False, "exactScore": False, "scoringEligible": scoring_eligible}

    score = match.get("score") or {}
    home_score = score.get("home")
    away_score = score.get("away")
    if not isinstance(home_score, int) or not isinstance(away_score, int):
        return {"points": 0, "correctWinner": False, "exactScore": False, "scoringEligible": scoring_eligible}

    predicted_winner = prediction.get("advancingTeam") if prediction.get("predictedWinner") == "Draw / Penalties" else prediction.get("predictedWinner")
    actual_winner = match.get("winner")
    correct_winner = bool(actual_winner and predicted_winner == actual_winner)
    exact_score = correct_winner and prediction.get("homeScore") == home_score and prediction.get("awayScore") == away_score

    if exact_score:
        points = EXACT_SCORE_POINTS
    elif correct_winner:
        points = CORRECT_WINNER_POINTS
    else:
        points = 0

    return {"points": points, "correctWinner": correct_winner, "exactScore": exact_score, "scoringEligible": scoring_eligible}
