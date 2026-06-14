import { startDashboardServer } from "./server.js";

async function main(): Promise<void> {
  const portValue = process.env.SENTINELOPS_DASHBOARD_PORT;
  const parsedPort = portValue ? Number(portValue) : 4100;
  const port = Number.isFinite(parsedPort) ? parsedPort : 4100;
  const server = await startDashboardServer({ port });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        command: "dashboard.start",
        baseUrl: server.baseUrl
      },
      null,
      2
    )}\n`
  );

  const shutdown = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        command: "dashboard.start",
        error: {
          code: "DASHBOARD_START_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
});
