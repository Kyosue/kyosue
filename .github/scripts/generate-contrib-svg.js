#!/usr/bin/env node
/**
 * Generates a flat (front-facing) GitHub contribution calendar SVG.
 * Usage: node generate-contrib-svg.js <username> <output-path>
 * Auth: GITHUB_TOKEN env var
 */
const fs = require("fs");
const path = require("path");

const username = process.argv[2] || process.env.USERNAME || "Kyosue";
const outPath = process.argv[3] || "profile/contrib.svg";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const COLORS = {
  bg: "#0D1117",
  empty: "#161B22",
  levels: {
    NONE: "#161B22",
    FIRST_QUARTILE: "#0E4429",
    SECOND_QUARTILE: "#006D32",
    THIRD_QUARTILE: "#26A641",
    FOURTH_QUARTILE: "#39D353",
  },
  label: "#8B949E",
};

const CELL = 11;
const GAP = 3;
const PAD_X = 36;
const PAD_Y = 20;
const MONTH_LABEL_H = 16;

const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
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
  const width = PAD_X + weekCount * (CELL + GAP) - GAP + 12;
  const height = PAD_Y + MONTH_LABEL_H + 7 * (CELL + GAP) - GAP + 8;

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
      // Skip cramped labels near the end
      if (x + 28 < width) {
        monthLabels += `<text x="${x}" y="${PAD_Y + 10}" class="label">${m}</text>`;
      }
    }
  });

  let dayLabelSvg = dayLabels
    .map(({ i, text }) => {
      const y = PAD_Y + MONTH_LABEL_H + i * (CELL + GAP) + CELL - 2;
      return `<text x="0" y="${y}" class="label">${text}</text>`;
    })
    .join("");

  let cells = "";
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day) => {
      const x = PAD_X + wi * (CELL + GAP);
      const y = PAD_Y + MONTH_LABEL_H + day.weekday * (CELL + GAP);
      const fill = COLORS.levels[day.contributionLevel] || COLORS.empty;
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${fill}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`;
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${username}'s GitHub contribution graph">
  <style>
    .label { fill: ${COLORS.label}; font: 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  </style>
  <rect width="100%" height="100%" fill="${COLORS.bg}" rx="6"/>
  ${monthLabels}
  ${dayLabelSvg}
  ${cells}
</svg>
`;
}

(async () => {
  const calendar = await fetchCalendar(username);
  const svg = buildSvg(calendar);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg);
  console.log(`Wrote ${outPath} (${calendar.weeks.length} weeks)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
