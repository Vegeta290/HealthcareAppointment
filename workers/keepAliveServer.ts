import { createServer } from "http";

// Render's free tier only exists as a "Web Service" (spins down after 15 min
// with no HTTP traffic, wakes on the next request) — their persistent
// "Background Worker" service type requires a paid plan. This tiny server
// gives the worker process something to respond to a health check with, so
// it can run as a free Web Service instead: pair it with an external pinger
// (UptimeRobot, cron-job.org — both free, no card) hitting this endpoint
// every ~10 minutes to prevent the 15-minute sleep.
//
// Does nothing else — no routes, no relation to the actual job processing,
// which happens entirely via the BullMQ workers started in index.ts.
export function startKeepAliveServer(): void {
  const port = process.env.PORT;
  if (!port) return; // not running on a platform that expects an HTTP port (e.g. Fly.io, local dev)

  createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Background workers are running.\n");
  }).listen(Number(port), () => {
    console.log(`Keep-alive HTTP server listening on port ${port}`);
  });
}
