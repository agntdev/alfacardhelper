import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
const composer = new Composer<Ctx>();
function welcome(ctx: Ctx): string {
  const value = (ctx as Ctx & { env?: Record<string, unknown> }).env?.OWNER_HANDLE ?? (typeof process === "undefined" ? undefined : process.env.OWNER_HANDLE);
  const contact = typeof value === "string" && value.trim() ? ` Связь с владельцем: ${value.trim()}.` : " Контакт владельца пока не настроен.";
  return `Поможем оформить карту Альфа и передать заявку владельцу.${contact}`;
}
composer.command("start", async (ctx) => { await ctx.reply(welcome(ctx), { reply_markup: mainMenuKeyboard() }); });
composer.callbackQuery("menu:main", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(welcome(ctx), { reply_markup: mainMenuKeyboard() }); });
export default composer;
