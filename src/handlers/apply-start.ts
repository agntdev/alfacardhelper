import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { createLead, markNotified, now } from "../lead-store.js";

type Method = "phone" | "email" | "none";
type Draft = { method?: Method; contact?: string; question?: string };
type ApplySession = { apply?: { step: "contact" | "question" | "review"; draft: Draft } };
const composer = new Composer<Ctx>();
registerMainMenuItem({ label: "Оформить карту", data: "apply:start", order: 10 });

function session(ctx: Ctx): ApplySession { return ctx.session as ApplySession; }
function handle(ctx: Ctx): string | undefined {
  const value = (ctx as Ctx & { env?: Record<string, unknown> }).env?.OWNER_HANDLE ?? (typeof process === "undefined" ? undefined : process.env.OWNER_HANDLE);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function ownerMessage(ctx: Ctx): string { return `Здравствуйте! Хочу оформить карту Альфа. Подскажите, пожалуйста, дальнейшие шаги.${handle(ctx) ? ` Связь: ${handle(ctx)}` : ""}`; }
function copyButton(ctx: Ctx) { return { text: "Скопировать сообщение", copy_text: { text: ownerMessage(ctx) } }; }
function methodKeyboard(ctx: Ctx) { return inlineKeyboard([[inlineButton("Телефон", "apply:phone"), inlineButton("Email", "apply:email")], [inlineButton("Не оставлять", "apply:none")], [copyButton(ctx) as never], [inlineButton("В меню", "menu:main")]]); }
function questionKeyboard() { return inlineKeyboard([[inlineButton("Задать вопрос", "apply:question"), inlineButton("Без вопроса", "apply:skipq")]]); }
function valid(method: Method, value: string): boolean { return method === "phone" ? /^\+?[0-9()\-\s]{7,20}$/.test(value) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function review(ctx: Ctx): string {
  const d = session(ctx).apply?.draft ?? {};
  const contact = d.method === "none" ? "не оставлен" : d.contact ?? "не оставлен";
  return `Проверьте заявку:\nКонтакт: ${contact}\nВопрос: ${d.question ?? "не указан"}`;
}

composer.callbackQuery("apply:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  session(ctx).apply = { step: "contact", draft: {} };
  await ctx.reply(`Оформление начинается у владельца. Скопируйте сообщение и выберите, как с вами связаться.\n\n${ownerMessage(ctx)}`, { reply_markup: methodKeyboard(ctx) });
});
for (const [data, method] of [["apply:phone", "phone"], ["apply:email", "email"]] as const) composer.callbackQuery(data, async (ctx) => {
  await ctx.answerCallbackQuery();
  session(ctx).apply = { step: "contact", draft: { method } };
  await ctx.reply(method === "phone" ? "Введите телефон для связи." : "Введите email для связи.", { reply_markup: { force_reply: true, input_field_placeholder: method === "phone" ? "+7 999 123-45-67" : "name@example.com" } });
});
composer.callbackQuery("apply:none", async (ctx) => { await ctx.answerCallbackQuery(); session(ctx).apply = { step: "question", draft: { method: "none" } }; await ctx.reply("Если есть вопрос, напишите его. Или продолжите без вопроса.", { reply_markup: questionKeyboard() }); });
composer.callbackQuery("apply:question", async (ctx) => { await ctx.answerCallbackQuery(); const a = session(ctx).apply; if (!a) return; a.step = "question"; await ctx.reply("Напишите ваш вопрос.", { reply_markup: { force_reply: true, input_field_placeholder: "Например: как оформить карту?" } }); });
composer.callbackQuery("apply:skipq", async (ctx) => { await ctx.answerCallbackQuery(); const a = session(ctx).apply; if (!a) return; a.draft.question = undefined; a.step = "review"; await ctx.reply(review(ctx), { reply_markup: inlineKeyboard([[inlineButton("Отправить заявку", "apply:send"), inlineButton("В меню", "menu:main")]]) }); });
composer.on("message:text", async (ctx, next) => {
  const a = session(ctx).apply;
  if (!a || ctx.message.text.startsWith("/")) return next();
  const text = ctx.message.text.trim().slice(0, 1000);
  if (!text) { await ctx.reply("Введите текст, чтобы продолжить."); return; }
  if (a.step === "contact") {
    if (!a.draft.method || a.draft.method === "none") return next();
    if (!valid(a.draft.method, text)) { await ctx.reply(a.draft.method === "phone" ? "Не удалось распознать телефон. Введите номер ещё раз." : "Не удалось распознать email. Введите адрес ещё раз."); return; }
    a.draft.contact = text; a.step = "question";
    await ctx.reply("Контакт сохранён. Хотите задать вопрос?", { reply_markup: questionKeyboard() }); return;
  }
  if (a.step === "question") { a.draft.question = text; a.step = "review"; await ctx.reply(review(ctx), { reply_markup: inlineKeyboard([[inlineButton("Отправить заявку", "apply:send"), inlineButton("В меню", "menu:main")]]) }); return; }
  return next();
});
composer.callbackQuery("apply:send", async (ctx) => {
  await ctx.answerCallbackQuery();
  const a = session(ctx).apply;
  if (!a?.draft.method || a.step !== "review" || !ctx.from) { await ctx.reply("Начните заявку заново — данные формы больше не доступны."); return; }
  const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "Пользователь";
  const leadBase = { lead_id: crypto.randomUUID(), user_id: ctx.from.id, username: ctx.from.username ? `@${ctx.from.username}` : undefined, user_name: name, preferred_contact_method: a.draft.method, contact_value: a.draft.contact, message_text: a.draft.question, timestamp: now().toISOString(), notified_admin: false };
  let lead;
  try { lead = await createLead(ctx, leadBase); } catch { await ctx.reply("Не удалось сохранить заявку. Попробуйте ещё раз немного позже."); return; }
  const admin = adminChatId(ctx as { env?: Record<string, unknown> });
  let delivered = false;
  if (admin) try {
    const user = lead.username ?? `${lead.user_name} (ID ${lead.user_id})`;
    await ctx.api.sendMessage(admin, `Новая заявка\nПользователь: ${user}\nКонтакт: ${lead.contact_value ?? "не оставлен"}\nКарта: ${lead.chosen_card ?? "не выбрана"}\nВопрос: ${lead.message_text ?? "не указан"}\nВремя: ${lead.timestamp}${lead.possible_duplicate ? "\nВозможный дубль: да" : ""}`);
    await markNotified(ctx, lead.lead_id); delivered = true;
  } catch { delivered = false; }
  delete session(ctx).apply;
  const contact = handle(ctx) ? `Связаться с владельцем: ${handle(ctx)}.` : "Контакт владельца пока не настроен.";
  await ctx.reply(delivered ? `Спасибо, заявка отправлена. Владелец свяжется с вами по указанным данным. ${contact}` : `Заявка сохранена, но владелец пока не получил сообщение. ${contact}`);
});
export default composer;
