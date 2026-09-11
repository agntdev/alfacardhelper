import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
const composer = new Composer<Ctx>();
const help = "Нажмите «Оформить карту», чтобы оставить заявку. В «Акции» — текущие условия. Готовое сообщение можно скопировать одной кнопкой.";
const back = inlineKeyboard([[inlineButton("В меню", "menu:main")]]);
composer.command("help", async (ctx) => { await ctx.reply(help, { reply_markup: back }); });
composer.callbackQuery("menu:help", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(help, { reply_markup: back }); });
export default composer;
