import { Composer, InputFile } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, isOwner } from "../toolkit/index.js";
import { deleteLead, exportLeads, getLead, listLeads, now, saveOffer } from "../lead-store.js";

type AdminSession = { admin?: { step: "offer" } };
const composer = new Composer<Ctx>();
function session(ctx: Ctx): AdminSession { return ctx.session as AdminSession; }
async function gate(ctx: Ctx): Promise<boolean> { const ownerCtx = ctx as Ctx & { env?: Record<string, unknown> }; if (isOwner(ownerCtx)) return true; await ctx.reply(adminChatId(ownerCtx) ? "Эта команда доступна только владельцу." : "Доступ владельца пока не настроен."); return false; }
function id(): string { return crypto.randomUUID(); }
async function showLeads(ctx: Ctx, page: number, edit = false): Promise<void> {
  try {
    const { items, total } = await listLeads(ctx, page);
    if (!total) { const text = "Заявок пока нет."; if (edit) await ctx.editMessageText(text); else await ctx.reply(text); return; }
    const pages = Math.ceil(total / 10); const lines = items.map((lead, n) => `${page * 10 + n + 1}. ${lead.user_name} — ${lead.contact_value ?? "без контакта"}`);
    const rows = items.map((lead) => [inlineButton("Открыть заявку", `lead:view:${lead.lead_id}`), inlineButton("Удалить", `lead:askdel:${lead.lead_id}`)]);
    const nav = []; if (page > 0) nav.push(inlineButton("Назад", `lead:page:${page - 1}`)); if (page + 1 < pages) nav.push(inlineButton("Далее", `lead:page:${page + 1}`)); if (nav.length) rows.push(nav);
    const text = `Заявки: ${total}. Страница ${page + 1} из ${pages}.\n${lines.join("\n")}`;
    if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) }); else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
  } catch { await ctx.reply("Не удалось загрузить заявки. Попробуйте ещё раз немного позже."); }
}
composer.command("set_reward", async (ctx) => { if (!(await gate(ctx))) return; session(ctx).admin = { step: "offer" }; await ctx.reply("Введите новый текст акции — до 300 символов.", { reply_markup: { force_reply: true, input_field_placeholder: "Текст акции" } }); });
composer.command("list_leads", async (ctx) => { if (await gate(ctx)) await showLeads(ctx, 0); });
composer.command("export_leads", async (ctx) => {
  if (!(await gate(ctx))) return;
  try {
    let offset = 0; let part = 1;
    for (;;) {
      const leads = await exportLeads(ctx, offset);
      if (!leads.length) { if (part === 1) await ctx.reply("Заявок пока нет."); break; }
      const csv = ["lead_id,user_id,username,contact_method,contact,message,timestamp,notified_admin", ...leads.map((lead) => [lead.lead_id, lead.user_id, lead.username ?? "", lead.preferred_contact_method, lead.contact_value ?? "", lead.message_text ?? "", lead.timestamp, lead.notified_admin].map((v) => `\"${String(v).replace(/\"/g, '\"\"')}\"`).join(","))].join("\n");
      await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(csv), `leads-${part}.csv`), { caption: `Экспорт заявок, часть ${part}.` });
      if (leads.length < 500) break;
      offset += leads.length; part += 1;
    }
  } catch { await ctx.reply("Не удалось подготовить экспорт. Попробуйте ещё раз немного позже."); }
});
composer.on("message:text", async (ctx, next) => { if (session(ctx).admin?.step !== "offer" || ctx.message.text.startsWith("/")) return next(); if (!(await gate(ctx))) return; const text = ctx.message.text.trim(); if (!text || text.length > 300) { await ctx.reply("Текст должен быть от 1 до 300 символов. Введите его ещё раз."); return; } try { await saveOffer(ctx, { offer_id: id(), text, updated_by_admin_id: ctx.from!.id, updated_at: now().toISOString() }); delete session(ctx).admin; await ctx.reply("Текст акции обновлён."); } catch { await ctx.reply("Не удалось обновить акцию. Попробуйте ещё раз немного позже."); } });
composer.callbackQuery(/^lead:page:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await showLeads(ctx, Number(ctx.match[1]), true); });
composer.callbackQuery(/^lead:view:([\w-]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; try { const lead = await getLead(ctx, ctx.match[1]); if (!lead) { await ctx.reply("Эта заявка уже удалена."); return; } await ctx.reply(`Заявка\nПользователь: ${lead.username ?? lead.user_name}\nКонтакт: ${lead.contact_value ?? "не оставлен"}\nКарта: ${lead.chosen_card ?? "не выбрана"}\nВопрос: ${lead.message_text ?? "не указан"}\nВремя: ${lead.timestamp}\nСтатус уведомления: ${lead.notified_admin ? "отправлено" : "не отправлено"}`); } catch { await ctx.reply("Не удалось открыть заявку."); } });
composer.callbackQuery(/^lead:askdel:([\w-]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; await ctx.reply("Удалить эту заявку? Это действие нельзя отменить.", { reply_markup: inlineKeyboard([[inlineButton("Удалить заявку", `lead:del:${ctx.match[1]}`), inlineButton("Отмена", "lead:cancel")]]) }); });
composer.callbackQuery("lead:cancel", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText("Удаление отменено."); });
composer.callbackQuery(/^lead:del:([\w-]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await gate(ctx))) return; try { await deleteLead(ctx, ctx.match[1]); await ctx.reply("Заявка удалена."); await showLeads(ctx, 0); } catch { await ctx.reply("Не удалось удалить заявку."); } });
export default composer;
