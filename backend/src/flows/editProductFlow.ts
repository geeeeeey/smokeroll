import { PrismaClient } from "@prisma/client";
import { Markup } from "telegraf";

const prisma = new PrismaClient();

type EditState = { productId: number; field: "TITLE" | "PRICE" | "STOCK" | "PHOTO" | null };
const editState = new Map<number, EditState>();

export function editProductHandlers(bot: any) {
  bot.command("editproduct", async (ctx: any) => {
    const admin = await prisma.admin.findUnique({ where: { tgChatId: BigInt(ctx.chat.id) } });
    if (!admin) return ctx.reply("⛔ Нет доступа. Сначала /admin");

    const id = Number(ctx.message.text.split(" ")[1]);
    if (!Number.isInteger(id)) return ctx.reply("Формат: /editproduct <id>");

    const p = await prisma.product.findUnique({ where: { id } });
    if (!p) return ctx.reply("Товар не найден");

    editState.set(ctx.chat.id, { productId: id, field: null });

    return ctx.reply(
      `✏️ Редактирование #${p.id}\n${p.title}\nЦена: ${p.price}₽\nОстаток: ${p.stock}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Название", `ep:title:${id}`), Markup.button.callback("Цена", `ep:price:${id}`)],
        [Markup.button.callback("Остаток", `ep:stock:${id}`), Markup.button.callback("Фото", `ep:photo:${id}`)],
        [Markup.button.callback(p.isActive ? "Скрыть" : "Включить", `ep:toggle:${id}`)]
      ])
    );
  });

  bot.action(/ep:(title|price|stock|photo|toggle):(\d+)/, async (ctx: any) => {
    const admin = await prisma.admin.findUnique({ where: { tgChatId: BigInt(ctx.chat.id) } });
    if (!admin) return ctx.answerCbQuery("Нет доступа");

    const action = ctx.match[1] as string;
    const id = Number(ctx.match[2]);

    if (action === "toggle") {
      const p = await prisma.product.findUnique({ where: { id } });
      if (!p) return ctx.answerCbQuery("Не найдено");
      await prisma.product.update({ where: { id }, data: { isActive: !p.isActive } });
      await ctx.answerCbQuery("Ок");
      return ctx.editMessageText(`✅ Готово. Товар #${id} теперь ${!p.isActive ? "включен" : "скрыт"}.`);
    }

    if (action === "title") editState.set(ctx.chat.id, { productId: id, field: "TITLE" });
    if (action === "price") editState.set(ctx.chat.id, { productId: id, field: "PRICE" });
    if (action === "stock") editState.set(ctx.chat.id, { productId: id, field: "STOCK" });
    if (action === "photo") editState.set(ctx.chat.id, { productId: id, field: "PHOTO" });

    const prompt =
      action === "title" ? "Отправь новое название:" :
      action === "price" ? "Отправь новую цену (числом):" :
      action === "stock" ? "Отправь новый остаток (числом):" :
      "Отправь новое фото товара (картинкой).";

    await ctx.answerCbQuery("Ок");
    return ctx.reply(prompt);
  });

  bot.on("message", async (ctx: any) => {
    const st = editState.get(ctx.chat.id);
    if (!st?.field) return;

    const admin = await prisma.admin.findUnique({ where: { tgChatId: BigInt(ctx.chat.id) } });
    if (!admin) return;

    if (st.field === "TITLE") {
      const title = ctx.message.text?.trim();
      if (!title) return ctx.reply("Название текстом.");
      await prisma.product.update({ where: { id: st.productId }, data: { title } });
      editState.delete(ctx.chat.id);
      return ctx.reply("✅ Название обновлено");
    }

    if (st.field === "PRICE") {
      const price = Number(ctx.message.text);
      if (!Number.isInteger(price) || price < 0) return ctx.reply("Цена — целое число >= 0");
      await prisma.product.update({ where: { id: st.productId }, data: { price } });
      editState.delete(ctx.chat.id);
      return ctx.reply("✅ Цена обновлена");
    }

    if (st.field === "STOCK") {
      const stock = Number(ctx.message.text);
      if (!Number.isInteger(stock) || stock < 0) return ctx.reply("Остаток — целое число >= 0");
      await prisma.product.update({ where: { id: st.productId }, data: { stock } });
      editState.delete(ctx.chat.id);
      return ctx.reply("✅ Остаток обновлен");
    }

    if (st.field === "PHOTO") {
      const photos = ctx.message.photo;
      if (!photos?.length) return ctx.reply("Отправь фото как изображение.");
      const best = photos[photos.length - 1];
      await prisma.product.update({ where: { id: st.productId }, data: { imageFileId: best.file_id } });
      editState.delete(ctx.chat.id);
      return ctx.reply("✅ Фото обновлено");
    }
  });
}
