import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getOffer } from "../lead-store.js";

const composer = new Composer<Ctx>();
registerMainMenuItem({ label: "Акция", data: "reward:show", order: 20 });
function ownerMessage(ctx: Ctx): string {
  const value = (ctx as Ctx & { env?: Record<string, unknown> }).env?.OWNER_HANDLE ?? (typeof process === "undefined" ? undefined : process.env.OWNER_HANDLE);
  const handle = typeof value === "string" && value.trim() ? ` Связь: ${value.trim()}` : "";
  return `Здравствуйте! Хочу узнать про оформление карты Альфа.${handle}`;
}
function keyboard(ctx: Ctx) { return { inline_keyboard: [[{ text: "Скопировать сообщение", copy_text: { text: ownerMessage(ctx) } }], [inlineButton("Оформить карту", "apply:start")], [inlineButton("В меню", "menu:main")]] } as never; }
async function show(ctx: Ctx, edit = false): Promise<void> {
  let text: string;
  try { text = (await getOffer(ctx))?.text ?? "Акция пока не опубликована. Оформите заявку, и владелец подскажет актуальные условия."; }
  catch { text = "Не удалось загрузить акцию. Попробуйте ещё раз немного позже."; }
  if (edit) await ctx.editMessageText(text, { reply_markup: keyboard(ctx) });
  else await ctx.reply(text, { reply_markup: keyboard(ctx) });
}
composer.command("reward", (ctx) => show(ctx));
composer.callbackQuery("reward:show", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx, true); });
export default composer;
