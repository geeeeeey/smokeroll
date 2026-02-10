import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { registerImageProxy } from "./telegramImageProxy.js";
import { notifyAdmins } from "./notify.js";

const prisma = new PrismaClient();

type OrderPayload = {
  tgUserId: string | number;
  tgUsername?: string;
  items: { productId: number; qty: number }[];
};

export function startServer(port: number) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  registerImageProxy(app);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/products", async (_req, res) => {
    const base = process.env.PUBLIC_BASE_URL || "";
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, title: true, price: true, stock: true, imageFileId: true }
    });

    res.json(
      products.map((p) => ({
        id: p.id,
        title: p.title,
        price: p.price,
        stock: p.stock,
        imageUrl: p.imageFileId ? `${base}/images/${encodeURIComponent(p.imageFileId)}` : null
      }))
    );
  });

  app.post("/orders", async (req, res) => {
    const { tgUserId, tgUsername, items } = req.body as OrderPayload;

    if (!tgUserId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    for (const it of items) {
      if (!Number.isInteger(it.productId) || !Number.isInteger(it.qty) || it.qty <= 0) {
        return res.status(400).json({ error: "Invalid items" });
      }
    }

    try {
      const order = await prisma.$transaction(async (tx) => {
        const productIds = items.map((i) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, isActive: true }
        });

        const byId = new Map(products.map((p) => [p.id, p] as const));
        let total = 0;

        for (const it of items) {
          const p = byId.get(it.productId);
          if (!p) throw new Error(`PRODUCT_NOT_FOUND:${it.productId}`);
          if (p.stock < it.qty) throw new Error(`OUT_OF_STOCK:${p.id}`);
          total += p.price * it.qty;
        }

        for (const it of items) {
          await tx.product.update({
            where: { id: it.productId },
            data: { stock: { decrement: it.qty } }
          });
        }

        return tx.order.create({
          data: {
            tgUserId: BigInt(tgUserId),
            tgUsername: tgUsername ?? null,
            total,
            items: {
              create: items.map((it) => ({
                productId: it.productId,
                qty: it.qty,
                price: byId.get(it.productId)!.price
              }))
            }
          },
          include: { items: { include: { product: true } } }
        });
      });

      await notifyAdmins({
        orderId: order.id,
        tgUserId: order.tgUserId.toString(),
        tgUsername: order.tgUsername ?? undefined,
        total: order.total,
        lines: order.items.map((it) => ({
          title: it.product.title,
          qty: it.qty,
          price: it.price
        }))
      });

      res.json({ ok: true, orderId: order.id });
    } catch (e: any) {
      const msg = String(e?.message || "ERR");
      if (msg.startsWith("OUT_OF_STOCK:")) return res.status(409).json({ error: "OUT_OF_STOCK" });
      if (msg.startsWith("PRODUCT_NOT_FOUND:")) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      console.error(e);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  app.listen(port, () => {
    console.log(`API on http://localhost:${port}`);
  });
}
