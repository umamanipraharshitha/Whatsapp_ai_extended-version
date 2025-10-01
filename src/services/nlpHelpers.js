// src/services/nlpHelpers.js
// Very small, heuristic-based parser. Improve over time.
export function parseMedicationRequest(text) {
  text = text.toLowerCase();

  // Examples it can parse:
  // "Remind me to take 1 tablet of aspirin at 9am daily"
  // "Take metformin 500mg at 8:00 every day"
  // "remind me tomorrow at 6pm to take insulin"

  if (!/(remind me|take|set reminder|reminder to)/i.test(text)) return null;

  // get med name + dose: "take 1 tablet of aspirin" -> dose: "1 tablet", med: "aspirin"
  const doseMatch = text.match(/(\b\d+\s*(mg|ml|tablets|tablet|capsule|capsules|pills)?\b)/i);
  const medMatch = text.match(/(?:of\s+)?([a-zA-Z0-9\- ]{2,40})(?:\sat|\sat\s|$|,)/i);

  // time: 9am, 09:00, 6pm, tomorrow at 6pm
  const timeMatch = text.match(/(\b\d{1,2}(:\d{2})?\s*(am|pm)?\b)/i);
  const dateMatch = text.match(/\b(tomorrow|today|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);

  // frequency
  let freq = null;
  if (/\bdaily|every day|each day\b/.test(text)) freq = "daily";
  if (/\bweekly|every week|each week\b/.test(text)) freq = "weekly";
  if (/\bonce|one time|tomorrow\b/.test(text) || /on \d{4}-\d{2}-\d{2}/.test(text)) freq = "once";

  // medName: try to extract word before "at" or after "take ... of"
  let medName = null;
  const m2 = text.match(/(?:take|remind me to take|remind me to)\s+(.+?)(?:\sat|\sat\s|,|$)/i);
  if (m2 && m2[1]) {
    medName = m2[1].replace(/^\d+\s*(mg|ml|tablet|tablets|capsule|capsules)?\s*/, "").trim();
    // remove trailing "daily" etc
    medName = medName.replace(/\b(daily|every day|weekly|tomorrow|today)\b/g, "").trim();
  } else if (medMatch) {
    medName = medMatch[1].trim();
  }

  const dose = doseMatch ? doseMatch[0].trim() : null;
  const time = timeMatch ? timeMatch[0].trim() : null;
  const date = dateMatch ? dateMatch[0].trim() : null;

  // Normalize example: "9am" -> "09:00"
  let normTime = null;
  if (time) {
    const t = time.toLowerCase().replace(/\s+/g, "");
    const ampm = t.includes("am") || t.includes("pm");
    if (ampm) {
      const m = t.match(/(\d{1,2})(?::(\d{2}))?(am|pm)/);
      if (m) {
        let hh = parseInt(m[1], 10);
        const mm = m[2] || "00";
        const ampm2 = m[3];
        if (ampm2 === "pm" && hh !== 12) hh += 12;
        if (ampm2 === "am" && hh === 12) hh = 0;
        normTime = `${String(hh).padStart(2, "0")}:${mm}`;
      }
    } else if (t.includes(":")) {
      const mm = t.split(":")[1].padEnd(2, "0");
      const hh = String(t.split(":")[0]).padStart(2, "0");
      normTime = `${hh}:${mm}`;
    } else {
      const hh = String(parseInt(t, 10)).padStart(2, "0");
      normTime = `${hh}:00`;
    }
  }

  // Build a result
  return {
    intent: "schedule_med",
    medName: medName || "medication",
    dose,
    time: normTime, // "09:00"
    date: (date === "today" ? new Date().toISOString().slice(0,10) : (date === "tomorrow" ? new Date(Date.now()+86400000).toISOString().slice(0,10) : (/\d{4}-\d{2}-\d{2}/.test(date||"") ? date : null))),
    freq: freq || (date ? "once" : "daily")
  };
}

// Build a cron expression for daily schedules from "HH:MM" etc.
// options: { time: "09:00", tz: "Asia/Kolkata", freq: "daily"|"weekly" }
export function buildCronFromParts({ time = "09:00", tz, freq = "daily" }) {
  // BullMQ cron format: minute hour day month dayOfWeek
  const [hh, mm] = (time || "09:00").split(":").map(s => s.padStart(2, "0"));
  if (freq === "daily") {
    return `${mm} ${hh} * * *`; // every day at hh:mm
  }
  if (freq === "weekly") {
    return `${mm} ${hh} * * 1`; // every Monday at hh:mm (simple default)
  }
  // fallback daily
  return `${mm} ${hh} * * *`;
}
