const { randomUUID } = require("crypto");

/**
 * Build a Microsoft Teams-style meeting join URL.
 * Uses a generated meeting id so invites are unique; users can also paste a real Teams link.
 */
function generateTeamsMeetingUrl(title = "Envision Mail meeting") {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const slug = encodeURIComponent(title.slice(0, 40));
  return `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${id}%40thread.v2/0?context=%7b%22slug%22%3a%22${slug}%22%7d`;
}

function icsEscape(text = "") {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toIcsUtc(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function buildInviteIcs({
  uid,
  title,
  description,
  location,
  start,
  end,
  organizerEmail,
  organizerName,
  invitees = [],
  meetingUrl,
}) {
  const stamp = toIcsUtc(new Date().toISOString());
  const attendees = invitees
    .map(
      (p) =>
        `ATTENDEE;CN=${icsEscape(p.name || p.email)};RSVP=TRUE:mailto:${p.email}`,
    )
    .join("\r\n");

  const desc = [description || "", meetingUrl ? `Join: ${meetingUrl}` : ""].filter(Boolean).join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "PRODID:-//Envision Mail//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid || randomUUID()}@lesmail.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    location ? `LOCATION:${icsEscape(location)}` : null,
    meetingUrl ? `URL:${meetingUrl}` : null,
    `ORGANIZER;CN=${icsEscape(organizerName || organizerEmail)}:mailto:${organizerEmail}`,
    attendees || null,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

module.exports = { generateTeamsMeetingUrl, buildInviteIcs };

