/**
 * Database access. The function uses the service role; tables have RLS on and
 * no public policies, so this file is the only way in.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import type { Doc } from "./knowledge.ts";
import type { Gap, Store, Ticket } from "./tools.ts";

export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async loadDocs(): Promise<Doc[]> {
    const [docs, sections] = await Promise.all([
      this.db.from("policy_documents").select("doc_id, title, summary").order("doc_id"),
      this.db.from("policy_sections").select("doc_id, heading, body, position").order("position"),
    ]);
    if (docs.error) throw docs.error;
    if (sections.error) throw sections.error;
    return docs.data.map((d) => ({
      ...d,
      sections: sections.data
        .filter((s) => s.doc_id === d.doc_id)
        .map((s) => ({ doc_id: s.doc_id, title: d.title, heading: s.heading, body: s.body })),
    }));
  }

  async getOrder(orderId: string) {
    const { data, error } = await this.db
      .from("orders")
      .select("data")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    return (data?.data as Record<string, unknown>) ?? null;
  }

  async createTicket(t: Ticket) {
    const { error } = await this.db.from("tickets").insert(t);
    if (error) throw error;
  }

  async logGap(g: Gap) {
    const { error } = await this.db.from("knowledge_gaps").insert(g);
    if (error) throw error;
  }

  async listGaps(limit = 200) {
    const { data, error } = await this.db
      .from("knowledge_gaps")
      .select("created_at, store_id, question, status, decline_reason, searches, answer, ticket_id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  /** Records the request and returns false when the client is over the limit. */
  async allowAsk(client: string, perMinute: number, perDay: number): Promise<boolean> {
    const { data, error } = await this.db.rpc("allow_ask", {
      p_client: client,
      per_minute: perMinute,
      per_day: perDay,
    });
    if (error) throw error;
    return data === true;
  }
}
