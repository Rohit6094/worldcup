const SHARED_SECRET = "replace_with_GOOGLE_SHEETS_WEBHOOK_SECRET";
const SHEET_NAME = "predictions";

function doPost(event) {
  const payload = JSON.parse(event.postData.contents || "{}");
  if (payload.secret !== SHARED_SECRET) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const prediction = payload.prediction || {};
  const sheet = getSheet();
  sheet.appendRow([
    new Date(),
    prediction.matchId || "",
    prediction.userId || "",
    prediction.userEmail || "",
    prediction.displayName || "",
    prediction.predictedWinner || "",
    prediction.advancingTeam || "",
    prediction.homeScore,
    prediction.awayScore,
    prediction.submittedAt || "",
    prediction.storage || "",
  ]);

  return jsonResponse({ success: true }, 200);
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "receivedAt",
      "matchId",
      "userId",
      "userEmail",
      "displayName",
      "predictedWinner",
      "advancingTeam",
      "homeScore",
      "awayScore",
      "submittedAt",
      "storage",
    ]);
  }
  return sheet;
}

function jsonResponse(payload, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...payload, statusCode }))
    .setMimeType(ContentService.MimeType.JSON);
}
