from .config import CORRECT_WINNER_POINTS, EXACT_SCORE_POINTS


def score_prediction(prediction, match):
    if not match or match.get("status") != "completed":
        return {"points": 0, "correctWinner": False, "exactScore": False}

    score = match.get("score") or {}
    home_score = score.get("home")
    away_score = score.get("away")
    if not isinstance(home_score, int) or not isinstance(away_score, int):
        return {"points": 0, "correctWinner": False, "exactScore": False}

    exact_score = prediction.get("homeScore") == home_score and prediction.get("awayScore") == away_score
    predicted_winner = prediction.get("advancingTeam") if prediction.get("predictedWinner") == "Draw / Penalties" else prediction.get("predictedWinner")
    actual_winner = match.get("winner")
    correct_winner = bool(actual_winner and predicted_winner == actual_winner)

    points = 0
    if correct_winner:
        points += CORRECT_WINNER_POINTS
    if exact_score:
        points += EXACT_SCORE_POINTS

    return {"points": points, "correctWinner": correct_winner, "exactScore": exact_score}
