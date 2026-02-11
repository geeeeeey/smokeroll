import { Telegraf, Markup } from "telegraf";
import { PrismaClient } from "@prisma/client";
import { addProductHandlers } from "./flows/addProductFlow.js";
import { editProductHandlers } from "./flows/editProductFlow.js";

const prisma = new PrismaClient();

/** ADMIN: whitelist by user_id (NOT chat_id) */
function getAdminIds(): Set<string> {
  const raw = process.env.ADMIN_IDS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function isAdmin(ctx: any) {
  const adminIds = getAdminIds();
  const userId = ctx.from?.id;
  if (!userId) return false;
  return adminIds.has(String(userId));
}

async function requireAdmin(ctx: any) {
  if (!isAdmin(ctx)) {
    await ctx.reply("⛔ Нет доступа (ты не в списке ADMIN_IDS).");
    return false;
  }
  return true;
}

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

  /**
   * /admin — теперь НЕ “сделай меня админом”
   * а “привяжи этот чат для уведомлений о заказах”
   * (и это может сделать только настоящий админ из ADMIN_IDS)
   */
  bot.command("admin", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    // сохраняем чат, куда слать заказы
    await prisma.admin.upsert({
      where: { tgChatId: BigInt(ctx.chat.id) },
      update: {},
      create: { tgChatId: BigInt(ctx.chat.id) },
    });

    await ctx.reply("✅ Чат привязан как админский. Заказы будут приходить сюда.");
  });

  bot.command("stock", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const products = await prisma.product.findMany({
      orderBy: { id: "asc" },
      select: { id: true, title: true, stock: true, price: true, isActive: true },
    });

    if (products.length === 0) return ctx.reply("Товаров пока нет.");

    const lines = products.map(
      (p) => `#${p.id} ${p.isActive ? "✅" : "🚫"} ${p.title} — ${p.price}₽ — остаток: ${p.stock}`
    );

    await ctx.reply(lines.join("\n"));
  });

  bot.command("setstock", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

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
    if (!(await requireAdmin(ctx))) return;

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
    if (!(await requireAdmin(ctx))) return;

    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { items: { include: { product: true } } },
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

  // flows: защищаем их тоже
  // (если внутри flow у тебя уже есть проверки — ок, но лучше тут “железно” закрыть)
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text || "";
    // команды админских flow
    if (text.startsWith("/addproduct") || text.startsWith("/editproduct")) {
      if (!(await requireAdmin(ctx))) return;
    }
    return next();
  });

  addProductHandlers(bot);
  editProductHandlers(bot);

  bot.launch();
  console.log("Bot launched ✅");
}
