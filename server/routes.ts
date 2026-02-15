import type { Express } from "express";
import { createServer, type Server } from "http";
import { runLendingFlow } from "./xrpl-flow";
import type { SSEEvent } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/run-flow", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const emit = (event: SSEEvent) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // connection closed
      }
    };

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    runLendingFlow(emit)
      .then(() => {
        if (!closed) {
          res.end();
        }
      })
      .catch(() => {
        if (!closed) {
          res.end();
        }
      });
  });

  return httpServer;
}
