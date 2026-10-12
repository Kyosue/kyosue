#!/usr/bin/env node
/**
 * Generates a flat (front-facing) GitHub contribution calendar SVG.
 * Usage: node generate-contrib-svg.js <username> <output-path>
 * Auth: STREAK_TOKEN or GITHUB_TOKEN env var
 */
const fs = require("fs");
const path = require("path");

const username = process.argv[2] || process.env.USERNAME || "Kyosue";
const outPath = process.argv[3] || "profile/contrib.svg";
const token =
  process.env.STREAK_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!token) {
  console.error("STREAK_TOKEN or GITHUB_TOKEN is required");
  process.exit(1);
}

const COLORS = {
  bg: "#0D1117",
  border: "#30363D",
  empty: "#161B22",
  levels: {
    NONE: "#161B22",
    FIRST_QUARTILE: "#0E4429",
    SECOND_QUARTILE: "#006D32",
    THIRD_QUARTILE: "#26A641",
    FOURTH_QUARTILE: "#39D353",
  },
  label: "#8B949E",
  text: "#C9D1D9",
  accent: "#F97316",
};

const CELL = 11;
const GAP = 3;
const PAD_X = 36;
const PAD_Y = 16;
const HEADER_H = 26;
const MONTH_LABEL_H = 16;
const FOOTER_H = 24;

const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            firstDay
            contributionDays {
              contributionCount
              contributionLevel
              date
              weekday
            }
          }
        }
      }
    }
  }
`;

async function fetchCalendar(login) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "kyosue-contrib-svg",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data.user.contributionsCollection.contributionCalendar;
}

function monthLabel(dateStr) {
  return new Date(dateStr + "T00:00:00Z").toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

function buildSvg(calendar) {
  const weeks = calendar.weeks;
  const weekCount = weeks.length;
  const width = PAD_X + weekCount * (CELL + GAP) - GAP + 16;
  const calendarTop = PAD_Y + HEADER_H;
  const cellsTop = calendarTop + MONTH_LABEL_H;
  const height = cellsTop + 7 * (CELL + GAP) - GAP + FOOTER_H;

  const dayLabels = [
    { i: 1, text: "Mon" },
    { i: 3, text: "Wed" },
    { i: 5, text: "Fri" },
  ];

  let monthLabels = "";
  let lastMonth = "";
  weeks.forEach((week, wi) => {
    const first = week.contributionDays[0];
    if (!first) return;
    const m = monthLabel(first.date);
    if (m !== lastMonth) {
      lastMonth = m;
      const x = PAD_X + wi * (CELL + GAP);
      if (x + 28 < width) {
        monthLabels += `<text x="${x}" y="${calendarTop + 10}" class="label">${m}</text>`;
      }
    }
  });

  const dayLabelSvg = dayLabels
    .map(({ i, text }) => {
      const y = cellsTop + i * (CELL + GAP) + CELL - 2;
      return `<text x="0" y="${y}" class="label">${text}</text>`;
    })
    .join("");

  let cells = "";
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day) => {
      const x = PAD_X + wi * (CELL + GAP);
      const y = cellsTop + day.weekday * (CELL + GAP);
      const fill = COLORS.levels[day.contributionLevel] || COLORS.empty;
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${fill}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`;
    });
  });

  // Legend at bottom right
  const legendLevels = [
    COLORS.levels.NONE,
    COLORS.levels.FIRST_QUARTILE,
    COLORS.levels.SECOND_QUARTILE,
    COLORS.levels.THIRD_QUARTILE,
    COLORS.levels.FOURTH_QUARTILE,
  ];
  const legendY = height - 12;
  const legendBoxY = height - 19;
  const legendX = width - 16 - (legendLevels.length * (CELL + 3) + 38);

  let legendBoxes = "";
  legendLevels.forEach((color, idx) => {
    const bx = legendX + 28 + idx * (CELL + 3);
    legendBoxes += `<rect x="${bx}" y="${legendBoxY}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${color}"/>`;
  });

  const totalText = `${calendar.totalContributions.toLocaleString()} contributions in the last year`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${username}'s GitHub contribution graph">
  <style>
    .title { fill: ${COLORS.text}; font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .handle { fill: ${COLORS.accent}; font: 600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .label { fill: ${COLORS.label}; font: 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .legend-text { fill: ${COLORS.label}; font: 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  </style>
  <rect width="100%" height="100%" fill="${COLORS.bg}" rx="6"/>
  <text x="${PAD_X}" y="${PAD_Y + 12}" class="title">${totalText}</text>
  <text x="${width - 16}" y="${PAD_Y + 12}" text-anchor="end" class="handle">@${username}</text>
  ${monthLabels}
  ${dayLabelSvg}
  ${cells}
  <text x="${legendX}" y="${legendY}" class="legend-text">Less</text>
  ${legendBoxes}
  <text x="${legendX + 28 + legendLevels.length * (CELL + 3) + 4}" y="${legendY}" class="legend-text">More</text>
</svg>
`;
}

(async () => {
  const calendar = await fetchCalendar(username);
  const svg = buildSvg(calendar);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg);
  console.log(`Wrote ${outPath} (${calendar.weeks.length} weeks, ${calendar.totalContributions} contributions)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
