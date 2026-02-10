import { Telegraf, Markup } from "telegraf";
import { PrismaClient } from "@prisma/client";
import { addProductHandlers } from "./flows/addProductFlow.js";
import { editProductHandlers } from "./flows/editProductFlow.js";

const prisma = new PrismaClient();

export function startBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN missing");

  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const webappUrl = process.env.WEBAPP_URL;
    if (!webappUrl) return ctx.reply("WEBAPP_URL missing in .env");

    const text =
      "🛍 Магазин\n\n" +
      "Нажми кнопку ниже, чтобы открыть каталог.\n\n" +
      "⚠️ 18+ (подтверждение будет внутри магазина).";

    await ctx.reply(
      text,
      Markup.inlineKeyboard([Markup.button.webApp("🛍 Открыть магазин", webappUrl)])
    );
  });

  bot.command("admin", async (ctx) => {
    await prisma.admin.upsert({
      where: { tgChatId: BigInt(ctx.chat.id) },
      update: {},
      create: { tgChatId: BigInt(ctx.chat.id) }
    });
    await ctx.reply("✅ Ты добавлен как админ. Теперь заказы будут приходить сюда.");
  });

  bot.command("stock", async (ctx) => {
    const isAdmin = await prisma.admin.findUnique({ where: { tgChatId: BigInt(ctx.chat.id) } });
    if (!isAdmin) return ctx.reply("⛔ Нет доступа. Сначала /admin");

    const products = await prisma.product.findMany({
      orderBy: { id: "asc" },
      select: { id: true, title: true, stock: true, price: true, isActive: true }
    });

    const lines = products.map(
      (p) => `#${p.id} ${p.isActive ? "✅" : "🚫"} ${p.title} — ${p.price}₽ — остаток: ${p.stock}`
    );

    await ctx.reply(lines.join("\n"));
  });

  bot.command("setstock", async (ctx) => {
    const isAdmin = await prisma.admin.findUnique({ where: { tgChatId: BigInt(ctx.chat.id) } });
    if (!isAdmin) return ctx.reply("⛔ Нет доступа. Сначала /admin");

    const [idStr, stockStr] = ctx.message.text.split(" ").slice(1);
    const id = Number(idStr);
    const stock = Number(stockStr);
    if (!Number.isInteger(id) || !Number.isInteger(stock) || stock < 0) {
      return ctx.reply("Формат: /setstock <id> <число>");
    }

    await prisma.product.update({ where: { id }, data: { stock } });
    await ctx.reply(`✅ Остаток товара #${id} = ${stock}`);
  });

  bot.command("setprice", async (ctx) => {
    const isAdmin = await prisma.admin.findUnique({ where: { tgChatId: BigInt(ctx.chat.id) } });
    if (!isAdmin) return ctx.reply("⛔ Нет доступа. Сначала /admin");

    const [idStr, priceStr] = ctx.message.text.split(" ").slice(1);
    const id = Number(idStr);
    const price = Number(priceStr);
    if (!Number.isInteger(id) || !Number.isInteger(price) || price < 0) {
      return ctx.reply("Формат: /setprice <id> <число>");
    }

    await prisma.product.update({ where: { id }, data: { price } });
    await ctx.reply(`✅ Цена товара #${id} = ${price}₽`);
  });

  bot.command("orders", async (ctx) => {
    const isAdmin = await prisma.admin.findUnique({ where: { tgChatId: BigInt(ctx.chat.id) } });
    if (!isAdmin) return ctx.reply("⛔ Нет доступа. Сначала /admin");

    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { items: { include: { product: true } } }
    });

    if (orders.length === 0) return ctx.reply("Пока заказов нет.");

    const msg = orders
      .map((o) => {
        const user = o.tgUsername ? `@${o.tgUsername}` : `id:${o.tgUserId}`;
        const items = o.items.map((it) => `${it.product.title}×${it.qty}`).join(", ");
        return `#${o.id} — ${user} — ${items} — ${o.total}₽`;
      })
      .join("\n");

    await ctx.reply(msg);
  });

  // flows
  addProductHandlers(bot);
  editProductHandlers(bot);

  bot.launch();
  console.log("Bot launched ✅");
}
