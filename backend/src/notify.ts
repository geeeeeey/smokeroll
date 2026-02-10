import { PrismaClient } from "@prisma/client";
import { Telegraf } from "telegraf";

const prisma = new PrismaClient();

function getBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing");
  return new Telegraf(token);
}

export async function notifyAdmins(payload: {
  orderId: number;
  tgUserId: string;
  tgUsername?: string;
  total: number;
  lines: { title: string; qty: number; price: number }[];
}) {
  const admins = await prisma.admin.findMany();
  if (admins.length === 0) return;

  const bot = getBot();

  const user = payload.tgUsername ? `@${payload.tgUsername}` : `id:${payload.tgUserId}`;
  const itemsText = payload.lines
    .map((l) => `— ${l.title} ×${l.qty} (${l.price}₽)`)
    .join("\n");

  const text =
    `🛒 Новый заказ #${payload.orderId}\n` +
    `Покупатель: ${user} (id ${payload.tgUserId})\n` +
    `${itemsText}\n` +
    `Итого: ${payload.total}₽`;

  for (const a of admins) {
    await bot.telegram.sendMessage(Number(a.tgChatId), text);
  }
}
