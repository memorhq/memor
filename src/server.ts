import * as http from "http";

export function startAppServer(
  html: string,
  port: number,
  onReady: (url: string) => void
): void {
  const server = http.createServer((_req, res) => {
    if (_req.url === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(html);
  });

  server.listen(port, () => {
    onReady(`http://localhost:${port}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`  Port ${port} is in use. Try --port <number>`);
      process.exit(1);
    }
    throw err;
  });

  process.on("SIGINT", () => {
    server.close();
    console.log("\n  Memor stopped.");
    process.exit(0);
  });
}
