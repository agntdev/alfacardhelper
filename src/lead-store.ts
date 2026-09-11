/** Persistent CRM data. In Workers this uses the platform D1 binding. */
export interface Lead {
  lead_id: string;
  user_id: number;
  username?: string;
  user_name: string;
  preferred_contact_method: "phone" | "email" | "none";
  contact_value?: string;
  message_text?: string;
  chosen_card?: string;
  timestamp: string;
  notified_admin: boolean;
  possible_duplicate: boolean;
}

export interface CardOffer {
  offer_id: string;
  text: string;
  updated_by_admin_id: number;
  updated_at: string;
}

type Statement = { bind(...values: unknown[]): Statement; run(): Promise<unknown>; first<T>(): Promise<T | null>; all<T>(): Promise<{ results?: T[] }> };
type D1 = { prepare(sql: string): Statement; exec(sql: string): Promise<unknown> };
type StoreCtx = object;

/** One injectable clock seam for every timestamp and duplicate-window decision. */
export let now = (): Date => new Date();
export function setNowForTests(clock: () => Date): void { now = clock; }

function database(ctx: StoreCtx): D1 {
  const db = (ctx as { env?: { DB?: unknown } }).env?.DB as D1 | undefined;
  if (!db) throw new Error("persistent store unavailable");
  return db;
}

async function ready(ctx: StoreCtx): Promise<D1> {
  const db = database(ctx);
  await db.exec(`CREATE TABLE IF NOT EXISTS card_offers (
    offer_id TEXT PRIMARY KEY, text TEXT NOT NULL, updated_by_admin_id INTEGER NOT NULL, updated_at TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS leads (
    lead_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, username TEXT, user_name TEXT NOT NULL,
    preferred_contact_method TEXT NOT NULL, contact_value TEXT, message_text TEXT, chosen_card TEXT,
    timestamp TEXT NOT NULL, notified_admin INTEGER NOT NULL, possible_duplicate INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS leads_recent ON leads(timestamp DESC); CREATE INDEX IF NOT EXISTS leads_by_user_time ON leads(user_id, timestamp DESC);`);
  return db;
}

function leadFromRow(row: Record<string, unknown>): Lead {
  return { ...row, user_id: Number(row.user_id), notified_admin: Boolean(row.notified_admin), possible_duplicate: Boolean(row.possible_duplicate) } as Lead;
}

export async function getOffer(ctx: StoreCtx): Promise<CardOffer | undefined> {
  // A missing D1 binding is a valid first-run configuration for the read-only
  // offer screen: it has no offer to show yet. Writes still fail loudly rather
  // than pretending durable storage exists.
  if (!(ctx as { env?: { DB?: unknown } }).env?.DB) return undefined;
  const row = await (await ready(ctx)).prepare("SELECT offer_id, text, updated_by_admin_id, updated_at FROM card_offers ORDER BY updated_at DESC LIMIT 1").first<CardOffer>();
  return row ?? undefined;
}

export async function saveOffer(ctx: StoreCtx, offer: CardOffer): Promise<void> {
  const db = await ready(ctx);
  await db.prepare("DELETE FROM card_offers").run();
  await db.prepare("INSERT INTO card_offers (offer_id,text,updated_by_admin_id,updated_at) VALUES (?,?,?,?)").bind(offer.offer_id, offer.text, offer.updated_by_admin_id, offer.updated_at).run();
}

export async function createLead(ctx: StoreCtx, lead: Omit<Lead, "possible_duplicate">): Promise<Lead> {
  const db = await ready(ctx);
  const cutoff = new Date(now().getTime() - 5 * 60_000).toISOString();
  const duplicate = await db.prepare("SELECT lead_id FROM leads WHERE user_id = ? AND timestamp >= ? LIMIT 1").bind(lead.user_id, cutoff).first<{ lead_id: string }>();
  const saved: Lead = { ...lead, possible_duplicate: duplicate !== null };
  await db.prepare("INSERT INTO leads (lead_id,user_id,username,user_name,preferred_contact_method,contact_value,message_text,chosen_card,timestamp,notified_admin,possible_duplicate) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(saved.lead_id, saved.user_id, saved.username ?? null, saved.user_name, saved.preferred_contact_method, saved.contact_value ?? null, saved.message_text ?? null, saved.chosen_card ?? null, saved.timestamp, saved.notified_admin ? 1 : 0, saved.possible_duplicate ? 1 : 0).run();
  return saved;
}

export async function markNotified(ctx: StoreCtx, leadId: string): Promise<void> {
  await (await ready(ctx)).prepare("UPDATE leads SET notified_admin = 1 WHERE lead_id = ?").bind(leadId).run();
}

export async function listLeads(ctx: StoreCtx, page: number): Promise<{ items: Lead[]; total: number }> {
  const db = await ready(ctx);
  const count = await db.prepare("SELECT COUNT(*) AS total FROM leads").first<{ total: number }>();
  const rows = await db.prepare("SELECT * FROM leads ORDER BY timestamp DESC LIMIT 10 OFFSET ?").bind(Math.max(0, page) * 10).all<Record<string, unknown>>();
  return { items: (rows.results ?? []).map(leadFromRow), total: Number(count?.total ?? 0) };
}

export async function getLead(ctx: StoreCtx, leadId: string): Promise<Lead | undefined> {
  const row = await (await ready(ctx)).prepare("SELECT * FROM leads WHERE lead_id = ?").bind(leadId).first<Record<string, unknown>>();
  return row ? leadFromRow(row) : undefined;
}

export async function deleteLead(ctx: StoreCtx, leadId: string): Promise<void> {
  await (await ready(ctx)).prepare("DELETE FROM leads WHERE lead_id = ?").bind(leadId).run();
}

/** Bounded export page. Callers send pages separately instead of loading an unbounded table. */
export async function exportLeads(ctx: StoreCtx, offset: number): Promise<Lead[]> {
  const rows = await (await ready(ctx)).prepare("SELECT * FROM leads ORDER BY timestamp DESC LIMIT 500 OFFSET ?").bind(Math.max(0, offset)).all<Record<string, unknown>>();
  return (rows.results ?? []).map(leadFromRow);
}
