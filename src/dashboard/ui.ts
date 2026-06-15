import { existsSync, readFileSync } from "node:fs";

interface DashboardHtmlOptions {
  incidentId?: string;
  routePath?: string;
}

const builtIndexUrl = new URL("../../web/dist/index.html", import.meta.url);

export function renderDashboardHtml(options?: DashboardHtmlOptions): string {
  const routePath = options?.routePath ?? "/";
  const bootstrap = JSON.stringify({
    routePath,
    incidentId: options?.incidentId ?? null
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SentinelOps Control Center</title>
    ${resolveDashboardAssetTags()}
  </head>
  <body>
    <noscript>SentinelOps Control Center requires JavaScript to load the React dashboard.</noscript>
    <div id="dashboard-root"></div>
    <script>window.__SENTINELOPS_DASHBOARD__ = ${bootstrap};</script>
  </body>
</html>`;
}

function resolveDashboardAssetTags(): string {
  if (existsSync(builtIndexUrl)) {
    const html = readFileSync(builtIndexUrl, "utf8");
    const assetTags = [
      ...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g),
      ...html.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/g)
    ]
      .map((match) => match[0])
      .join("\n    ");

    if (assetTags) {
      return assetTags;
    }
  }

  const devOrigin = process.env.SENTINELOPS_DASHBOARD_WEB_DEV_ORIGIN?.trim();
  const devScript = devOrigin
    ? `${devOrigin.replace(/\/$/, "")}/src/main.tsx`
    : "/src/main.tsx";

  return `<script type="module" src="${devScript}"></script>`;
}
