import type { Context } from "telegraf";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Step = "TITLE" | "PRICE" | "STOCK" | "PHOTO";
type State = { step: Step; title?: string; price?: number; stock?: number };

const addState = new Map<number, State>(); // chat.id -> state

export function addProductHandlers(bot: any) {
  bot.command("addproduct", async (ctx: Context) => {
    const admin = await prisma.admin.findUnique({ where: { tgChatId: BigInt(ctx.chat!.id) } });
    if (!admin) return ctx.reply("⛔ Нет доступа. Сначала /admin");

    addState.set(ctx.chat!.id, { step: "TITLE" });
    return ctx.reply("🆕 Добавление товара\n\n1) Отправь название товара:");
  });

  bot.on("message", async (ctx: any) => {
    const st = addState.get(ctx.chat.id);
    if (!st) return;

    const admin = await prisma.admin.findUnique({ where: { tgChatId: BigInt(ctx.chat.id) } });
    if (!admin) return;

    if (st.step === "TITLE") {
      const title = ctx.message?.text?.trim();
      if (!title) return ctx.reply("Отправь название текстом.");
      st.title = title;
      st.step = "PRICE";
      addState.set(ctx.chat.id, st);
      return ctx.reply("2) Теперь отправь цену (числом), например: 3200");
    }

    if (st.step === "PRICE") {
      const price = Number(ctx.message?.text);
      if (!Number.isInteger(price) || price < 0) return ctx.reply("Цена должна быть целым числом, например 550");
      st.price = price;
      st.step = "STOCK";
      addState.set(ctx.chat.id, st);
      return ctx.reply("3) Отправь остаток (числом), например: 20");
    }

    if (st.step === "STOCK") {
      const stock = Number(ctx.message?.text);
      if (!Number.isInteger(stock) || stock < 0) return ctx.reply("Остаток — целое число >= 0");
      st.stock = stock;
      st.step = "PHOTO";
      addState.set(ctx.chat.id, st);
      return ctx.reply("4) Отправь фото товара (картинкой). Или напиши /skip чтобы без фото.");
    }

    if (st.step === "PHOTO") {
      const txt = ctx.message?.text?.trim();
      if (txt === "/skip") {
        const p = await prisma.product.create({
          data: { title: st.title!, price: st.price!, stock: st.stock!, isActive: true }
        });
        addState.delete(ctx.chat.id);
        return ctx.reply(`✅ Товар создан: #${p.id} ${p.title}`);
      }

      const photos = ctx.message?.photo;
      if (!photos?.length) return ctx.reply("Отправь фото как изображение, или /skip.");
      const best = photos[photos.length - 1];
      const fileId = best.file_id as string;

      const p = await prisma.product.create({
        data: {
          title: st.title!,
          price: st.price!,
          stock: st.stock!,
          isActive: true,
          imageFileId: fileId
        }
      });

      addState.delete(ctx.chat.id);
      return ctx.reply(`✅ Товар создан с фото: #${p.id} ${p.title}`);
    }
  });
}
