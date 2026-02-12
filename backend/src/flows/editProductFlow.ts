import type { Telegraf } from "telegraf";
import type { PrismaClient } from "@prisma/client";

type Step = "choose" | "title" | "price" | "stock" | "photo" | "active";

type Session = {
  step: Step;
  productId: number;
};

const sessions = new Map<number, Session>(); // key = tg user id

function getText(ctx: any) {
  const msg = ctx.message;
  if (!msg) return "";
  if (typeof msg.text === "string") return msg.text;
  if (typeof msg.caption === "string") return msg.caption;
  return "";
}

export function editProductHandlers(bot: Telegraf, prisma: PrismaClient, isAdmin: (ctx: any) => boolean) {
  // /editproduct <id>
  bot.command("editproduct", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply("⛔ Нет доступа.");

    const text = getText(ctx);
    const idStr = text.trim().split(/\s+/)[1];
    const id = Number(idStr);
    if (!Number.isInteger(id)) return ctx.reply("Формат: /editproduct <id>");

    const p = await prisma.product.findUnique({ where: { id } });
    if (!p) return ctx.reply("❌ Товар не найден");

    sessions.set(ctx.from.id, { step: "choose", productId: id });

    return ctx.reply(
      `✏️ Редактирование #${p.id}\n` +
        `${p.title}\nЦена: ${p.price}₽\nОстаток: ${p.stock}\nАктивен: ${p.isActive ? "✅" : "🚫"}\n\n` +
        `Выбери что менять:\n` +
        `1) Название — отправь: title\n` +
        `2) Цена — отправь: price\n` +
        `3) Остаток — отправь: stock\n` +
        `4) Фото — отправь: photo (потом пришли фото)\n` +
        `5) Активность — отправь: active\n\n` +
        `Отмена: cancel`
    );
  });

  // обработчик сообщений внутри “сессии”
  bot.on("message", async (ctx, next) => {
    if (!ctx.from?.id) return next();
    const s = sessions.get(ctx.from.id);
    if (!s) return next();
    if (!isAdmin(ctx)) {
      sessions.delete(ctx.from.id);
      return ctx.reply("⛔ Нет доступа.");
    }

    const text = getText(ctx).trim().toLowerCase();

    if (text === "cancel") {
      sessions.delete(ctx.from.id);
      return ctx.reply("Ок, отменено.");
    }

    const p = await prisma.product.findUnique({ where: { id: s.productId } });
    if (!p) {
      sessions.delete(ctx.from.id);
      return ctx.reply("❌ Товар не найден (сессия закрыта).");
    }

    if (s.step === "choose") {
      if (text === "title") {
        sessions.set(ctx.from.id, { ...s, step: "title" });
        return ctx.reply("Ок, отправь новое название:");
      }
      if (text === "price") {
        sessions.set(ctx.from.id, { ...s, step: "price" });
        return ctx.reply("Ок, отправь новую цену (число):");
      }
      if (text === "stock") {
        sessions.set(ctx.from.id, { ...s, step: "stock" });
        return ctx.reply("Ок, отправь новый остаток (число):");
      }
      if (text === "photo") {
        sessions.set(ctx.from.id, { ...s, step: "photo" });
        return ctx.reply("Ок, пришли фото товарa (как фото, не как файл). Или напиши /skip");
      }
      if (text === "active") {
        sessions.set(ctx.from.id, { ...s, step: "active" });
        return ctx.reply("Напиши: on или off");
      }

      return ctx.reply("Не понял. Напиши: title / price / stock / photo / active или cancel");
    }

    if (s.step === "title") {
      const newTitle = getText(ctx).trim();
      if (!newTitle) return ctx.reply("Название пустое. Отправь текстом.");
      await prisma.product.update({ where: { id: s.productId }, data: { title: newTitle } });
      sessions.set(ctx.from.id, { ...s, step: "choose" });
      return ctx.reply("✅ Название обновлено. Выбери дальше: title/price/stock/photo/active или cancel");
    }

    if (s.step === "price") {
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0) return ctx.reply("Цена должна быть числом >= 0");
      await prisma.product.update({ where: { id: s.productId }, data: { price: Math.round(n) } });
      sessions.set(ctx.from.id, { ...s, step: "choose" });
      return ctx.reply("✅ Цена обновлена. Выбери дальше: title/price/stock/photo/active или cancel");
    }

    if (s.step === "stock") {
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0) return ctx.reply("Остаток должен быть числом >= 0");
      await prisma.product.update({ where: { id: s.productId }, data: { stock: Math.round(n) } });
      sessions.set(ctx.from.id, { ...s, step: "choose" });
      return ctx.reply("✅ Остаток обновлён. Выбери дальше: title/price/stock/photo/active или cancel");
    }

    if (s.step === "active") {
      if (text !== "on" && text !== "off") return ctx.reply("Напиши on или off");
      await prisma.product.update({ where: { id: s.productId }, data: { isActive: text === "on" } });
      sessions.set(ctx.from.id, { ...s, step: "choose" });
      return ctx.reply("✅ Обновлено. Выбери дальше: title/price/stock/photo/active или cancel");
    }

    if (s.step === "photo") {
      // allow skip
      if (text === "/skip") {
        await prisma.product.update({ where: { id: s.productId }, data: { imageFileId: null } });
        sessions.set(ctx.from.id, { ...s, step: "choose" });
        return ctx.reply("✅ Фото очищено. Выбери дальше: title/price/stock/photo/active или cancel");
      }

      const photo = (ctx.message as any)?.photo?.at?.(-1);
      const fileId = photo?.file_id;

      if (!fileId) return ctx.reply("Пришли фото как *Photo* (не как Document). Или /skip");

      // важно: твой фронт/бэк уже умеют /images/:fileId через telegramImageProxy
      const url = `/images/${fileId}`;
      await prisma.product.update({ where: { id: s.productId }, data: { imageFileId: fileId } });

      sessions.set(ctx.from.id, { ...s, step: "choose" });
      return ctx.reply("✅ Фото обновлено. Выбери дальше: title/price/stock/photo/active или cancel");
    }

    return next();
  });
}
