import type { Express } from "express";
import { Readable } from "node:stream";

export function registerImageProxy(app: Express) {
  app.get("/images/:fileId", async (req, res) => {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(500).send("BOT_TOKEN missing");

    const fileId = req.params.fileId;

    try {
      const r1 = await fetch(
        "https://api.telegram.org/bot" + token + "/getFile?file_id=" + encodeURIComponent(fileId)
      );
      const j1 = (await r1.json()) as any;
      if (!j1.ok) return res.status(404).send("Not found");

      const filePath = j1.result.file_path as string;
      const fileUrl = "https://api.telegram.org/file/bot" + token + "/" + filePath;

      const r2 = await fetch(fileUrl);
      if (!r2.ok || !r2.body) return res.status(404).send("Not found");

      res.setHeader("Content-Type", r2.headers.get("content-type") ?? "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");

      // Node 18+: convert Web ReadableStream -> Node Readable
      Readable.fromWeb(r2.body as any).pipe(res);
    } catch (e) {
      console.error(e);
      res.status(500).send("ERR");
    }
  });
}
