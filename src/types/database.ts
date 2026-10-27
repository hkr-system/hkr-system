
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "account_assignments": {
                  Row: {
                    "account_id": string,"created_at": string,"created_by": string | null,"id": string,"role_on_account": Database["public"]['Enums']["account_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"role_on_account": Database["public"]['Enums']["account_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"role_on_account"?: Database["public"]['Enums']["account_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_assignments_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "account_assignments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"accounts": {
                  Row: {
                    "billing_entity": Database["public"]['Enums']["billing_entity"],"code": string,"country": string | null,"created_at": string,"created_by": string | null,"currency": Database["public"]['Enums']["currency_code"],"delivery_setup": Database["public"]['Enums']["delivery_setup"],"drive_folder_url": string | null,"id": string,"intermediary_id": string | null,"invoice_format": NonNullable<Json>,"is_demo": boolean,"language": string,"legal_name": string | null,"market": Database["public"]['Enums']["market"] | null,"name": string,"notes": string | null,"payment_method": Database["public"]['Enums']["payment_method"],"status": Database["public"]['Enums']["account_status"],"tier": string | null,"updated_at": string,"vat_eori": string | null,"whatsapp_group_note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_entity"?: Database["public"]['Enums']["billing_entity"],"code": string,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"],"delivery_setup"?: Database["public"]['Enums']["delivery_setup"],"drive_folder_url"?: string | null,"id"?: string,"intermediary_id"?: string | null,"invoice_format"?: NonNullable<Json>,"is_demo"?: boolean,"language"?: string,"legal_name"?: string | null,"market"?: Database["public"]['Enums']["market"] | null,"name": string,"notes"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"status"?: Database["public"]['Enums']["account_status"],"tier"?: string | null,"updated_at"?: string,"vat_eori"?: string | null,"whatsapp_group_note"?: string | null
                  }
                  Update: {
                    "billing_entity"?: Database["public"]['Enums']["billing_entity"],"code"?: string,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"],"delivery_setup"?: Database["public"]['Enums']["delivery_setup"],"drive_folder_url"?: string | null,"id"?: string,"intermediary_id"?: string | null,"invoice_format"?: NonNullable<Json>,"is_demo"?: boolean,"language"?: string,"legal_name"?: string | null,"market"?: Database["public"]['Enums']["market"] | null,"name"?: string,"notes"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"status"?: Database["public"]['Enums']["account_status"],"tier"?: string | null,"updated_at"?: string,"vat_eori"?: string | null,"whatsapp_group_note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_intermediary_id_fkey"
      columns: ["intermediary_id"]
isOneToOne: false
      referencedRelation: "intermediaries"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"at": string,"diff": Json | null,"id": number,"row_id": string | null,"table_name": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"at"?: string,"diff"?: Json | null,"id"?: never,"row_id"?: string | null,"table_name": string,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"at"?: string,"diff"?: Json | null,"id"?: never,"row_id"?: string | null,"table_name"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"brevo_lists": {
                  Row: {
                    "brevo_list_id": number,"created_at": string,"created_by": string | null,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brevo_list_id": number,"created_at"?: string,"created_by"?: string | null,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "brevo_list_id"?: number,"created_at"?: string,"created_by"?: string | null,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contacts": {
                  Row: {
                    "account_id": string | null,"created_at": string,"created_by": string | null,"email": string | null,"id": string,"language": string,"lead_id": string | null,"name": string,"phone_e164": string | null,"role": string | null,"updated_at": string,"whatsapp_opt_in": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"language"?: string,"lead_id"?: string | null,"name": string,"phone_e164"?: string | null,"role"?: string | null,"updated_at"?: string,"whatsapp_opt_in"?: boolean
                  }
                  Update: {
                    "account_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"language"?: string,"lead_id"?: string | null,"name"?: string,"phone_e164"?: string | null,"role"?: string | null,"updated_at"?: string,"whatsapp_opt_in"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contacts_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"files": {
                  Row: {
                    "account_id": string,"created_at": string,"created_by": string | null,"file_name": string,"id": string,"kind": Database["public"]['Enums']["file_kind"],"mime_type": string | null,"owner_id": string | null,"owner_table": string,"size_bytes": number | null,"storage_path": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"created_by"?: string | null,"file_name": string,"id"?: string,"kind"?: Database["public"]['Enums']["file_kind"],"mime_type"?: string | null,"owner_id"?: string | null,"owner_table"?: string,"size_bytes"?: number | null,"storage_path": string,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"created_by"?: string | null,"file_name"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["file_kind"],"mime_type"?: string | null,"owner_id"?: string | null,"owner_table"?: string,"size_bytes"?: number | null,"storage_path"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "files_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"imei_master": {
                  Row: {
                    "account_id": string,"created_at": string,"created_by": string | null,"id": string,"imei": string,"order_id": string | null,"shipped_at": string | null,"sku_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"imei": string,"order_id"?: string | null,"shipped_at"?: string | null,"sku_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"imei"?: string,"order_id"?: string | null,"shipped_at"?: string | null,"sku_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "imei_master_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imei_master_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imei_master_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imei_master_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    }
                  ]
                },"intermediaries": {
                  Row: {
                    "address": string | null,"contact": string | null,"country": string | null,"created_at": string,"created_by": string | null,"default_cutoff_weekday": number | null,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"contact"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_cutoff_weekday"?: number | null,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"contact"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_cutoff_weekday"?: number | null,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lead_events": {
                  Row: {
                    "body": string | null,"created_at": string,"created_by": string | null,"data": Json | null,"id": string,"kind": Database["public"]['Enums']["lead_event_kind"],"lead_id": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"data"?: Json | null,"id"?: string,"kind": Database["public"]['Enums']["lead_event_kind"],"lead_id": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"data"?: Json | null,"id"?: string,"kind"?: Database["public"]['Enums']["lead_event_kind"],"lead_id"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_events_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_form_submissions": {
                  Row: {
                    "computed_score": number,"created_at": string,"created_by": string | null,"disqualified": boolean,"heard_other": string | null,"id": string,"ip": string | null,"lead_id": string | null,"merged": boolean,"raw": NonNullable<Json>,"ref": string | null,"ref_no": number,"reviewed_at": string | null,"reviewed_by": string | null,"src": string | null,"submitted_at": string,"tier": Database["public"]['Enums']["lead_tier"] | null,"updated_at": string,"user_agent": string | null,"utm": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "computed_score"?: number,"created_at"?: string,"created_by"?: string | null,"disqualified"?: boolean,"heard_other"?: string | null,"id"?: string,"ip"?: string | null,"lead_id"?: string | null,"merged"?: boolean,"raw": NonNullable<Json>,"ref"?: string | null,"ref_no"?: number,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"src"?: string | null,"submitted_at"?: string,"tier"?: Database["public"]['Enums']["lead_tier"] | null,"updated_at"?: string,"user_agent"?: string | null,"utm"?: NonNullable<Json>
                  }
                  Update: {
                    "computed_score"?: number,"created_at"?: string,"created_by"?: string | null,"disqualified"?: boolean,"heard_other"?: string | null,"id"?: string,"ip"?: string | null,"lead_id"?: string | null,"merged"?: boolean,"raw"?: NonNullable<Json>,"ref"?: string | null,"ref_no"?: number,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"src"?: string | null,"submitted_at"?: string,"tier"?: Database["public"]['Enums']["lead_tier"] | null,"updated_at"?: string,"user_agent"?: string | null,"utm"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_form_submissions_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_import_batches": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_name": string | null,"id": string,"rows_created": number,"rows_merged": number,"rows_skipped": number,"rows_total": number,"source": string,"undone_at": string | null,"undone_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"id"?: string,"rows_created"?: number,"rows_merged"?: number,"rows_skipped"?: number,"rows_total"?: number,"source": string,"undone_at"?: string | null,"undone_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_name"?: string | null,"id"?: string,"rows_created"?: number,"rows_merged"?: number,"rows_skipped"?: number,"rows_total"?: number,"source"?: string,"undone_at"?: string | null,"undone_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"leads": {
                  Row: {
                    "brevo_contact_id": number | null,"brevo_list": string | null,"brevo_synced_at": string | null,"business_type": string | null,"city": string | null,"company": string,"contact_name": string | null,"country": string | null,"created_at": string,"created_by": string | null,"disqualified": boolean,"disqualify_reason": string | null,"email": string | null,"email_opt_out": boolean,"heard_about": string | null,"id": string,"import_batch_id": string | null,"language": string,"last_touch_at": string | null,"linkedin_url": string | null,"lost_reason": string | null,"market": Database["public"]['Enums']["market"] | null,"next_action": string | null,"next_action_date": string | null,"owner_user_id": string | null,"phone_e164": string | null,"score": number,"sells_iphones": boolean | null,"sells_refurbished": boolean | null,"source": string,"stage": Database["public"]['Enums']["lead_stage"],"stage_changed_at": string,"tier": Database["public"]['Enums']["lead_tier"] | null,"title": string | null,"updated_at": string,"volume_range": string | null,"volume_units_month": number | null,"website": string | null,"whatsapp_opt_in": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "brevo_contact_id"?: number | null,"brevo_list"?: string | null,"brevo_synced_at"?: string | null,"business_type"?: string | null,"city"?: string | null,"company": string,"contact_name"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"disqualified"?: boolean,"disqualify_reason"?: string | null,"email"?: string | null,"email_opt_out"?: boolean,"heard_about"?: string | null,"id"?: string,"import_batch_id"?: string | null,"language"?: string,"last_touch_at"?: string | null,"linkedin_url"?: string | null,"lost_reason"?: string | null,"market"?: Database["public"]['Enums']["market"] | null,"next_action"?: string | null,"next_action_date"?: string | null,"owner_user_id"?: string | null,"phone_e164"?: string | null,"score"?: number,"sells_iphones"?: boolean | null,"sells_refurbished"?: boolean | null,"source"?: string,"stage"?: Database["public"]['Enums']["lead_stage"],"stage_changed_at"?: string,"tier"?: Database["public"]['Enums']["lead_tier"] | null,"title"?: string | null,"updated_at"?: string,"volume_range"?: string | null,"volume_units_month"?: number | null,"website"?: string | null,"whatsapp_opt_in"?: boolean
                  }
                  Update: {
                    "brevo_contact_id"?: number | null,"brevo_list"?: string | null,"brevo_synced_at"?: string | null,"business_type"?: string | null,"city"?: string | null,"company"?: string,"contact_name"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"disqualified"?: boolean,"disqualify_reason"?: string | null,"email"?: string | null,"email_opt_out"?: boolean,"heard_about"?: string | null,"id"?: string,"import_batch_id"?: string | null,"language"?: string,"last_touch_at"?: string | null,"linkedin_url"?: string | null,"lost_reason"?: string | null,"market"?: Database["public"]['Enums']["market"] | null,"next_action"?: string | null,"next_action_date"?: string | null,"owner_user_id"?: string | null,"phone_e164"?: string | null,"score"?: number,"sells_iphones"?: boolean | null,"sells_refurbished"?: boolean | null,"source"?: string,"stage"?: Database["public"]['Enums']["lead_stage"],"stage_changed_at"?: string,"tier"?: Database["public"]['Enums']["lead_tier"] | null,"title"?: string | null,"updated_at"?: string,"volume_range"?: string | null,"volume_units_month"?: number | null,"website"?: string | null,"whatsapp_opt_in"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_import_batch_id_fkey"
      columns: ["import_batch_id"]
isOneToOne: false
      referencedRelation: "lead_import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_owner_user_id_fkey"
      columns: ["owner_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"created_by": string | null,"emailed_at": string | null,"id": string,"kind": string,"link": string | null,"read_at": string | null,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"emailed_at"?: string | null,"id"?: string,"kind": string,"link"?: string | null,"read_at"?: string | null,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"emailed_at"?: string | null,"id"?: string,"kind"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"order_events": {
                  Row: {
                    "account_id": string,"body": string | null,"created_at": string,"created_by": string | null,"file_id": string | null,"from_status": Database["public"]['Enums']["order_status"] | null,"id": string,"kind": string,"order_id": string,"to_status": Database["public"]['Enums']["order_status"] | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"body"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_id"?: string | null,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: string,"kind": string,"order_id": string,"to_status"?: Database["public"]['Enums']["order_status"] | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"body"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_id"?: string | null,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: string,"kind"?: string,"order_id"?: string,"to_status"?: Database["public"]['Enums']["order_status"] | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_file_fk"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_lines": {
                  Row: {
                    "account_id": string,"battery_new": boolean,"battery_unit_usd": number,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"order_id": string,"qty": number,"sku_id": string | null,"sort_order": number,"unit_price_usd": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"battery_new"?: boolean,"battery_unit_usd"?: number,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"order_id": string,"qty": number,"sku_id"?: string | null,"sort_order"?: number,"unit_price_usd": number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"battery_new"?: boolean,"battery_unit_usd"?: number,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"order_id"?: string,"qty"?: number,"sku_id"?: string | null,"sort_order"?: number,"unit_price_usd"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    }
                  ]
                },"order_lines_finance": {
                  Row: {
                    "base_price_usd": number | null,"created_at": string,"created_by": string | null,"order_line_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_price_usd"?: number | null,"created_at"?: string,"created_by"?: string | null,"order_line_id": string,"updated_at"?: string
                  }
                  Update: {
                    "base_price_usd"?: number | null,"created_at"?: string,"created_by"?: string | null,"order_line_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_lines_finance_order_line_id_fkey"
      columns: ["order_line_id"]
isOneToOne: true
      referencedRelation: "order_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "account_id": string,"balance_due_usd": number,"battery_line_usd": number,"courier": string | null,"created_at": string,"created_by": string | null,"customs_usd": number,"delivered_date": string | null,"delivery_setup": Database["public"]['Enums']["delivery_setup"],"deposit_due_usd": number,"eta_date": string | null,"freight_usd": number,"hk_invoice_no": string | null,"id": string,"notes": string | null,"number": string,"order_date": string,"partner_invoice_eur": number | null,"partner_invoice_no": string | null,"payment_method": Database["public"]['Enums']["payment_method"],"pieces": number,"rma_discount_usd": number,"ship_date": string | null,"ship_to": NonNullable<Json>,"status": Database["public"]['Enums']["order_status"],"subtotal_usd": number,"total_usd": number,"tracking": string | null,"updated_at": string,"usdt_fee_usd": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"balance_due_usd"?: number,"battery_line_usd"?: number,"courier"?: string | null,"created_at"?: string,"created_by"?: string | null,"customs_usd"?: number,"delivered_date"?: string | null,"delivery_setup"?: Database["public"]['Enums']["delivery_setup"],"deposit_due_usd"?: number,"eta_date"?: string | null,"freight_usd"?: number,"hk_invoice_no"?: string | null,"id"?: string,"notes"?: string | null,"number": string,"order_date"?: string,"partner_invoice_eur"?: number | null,"partner_invoice_no"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"pieces"?: number,"rma_discount_usd"?: number,"ship_date"?: string | null,"ship_to"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["order_status"],"subtotal_usd"?: number,"total_usd"?: number,"tracking"?: string | null,"updated_at"?: string,"usdt_fee_usd"?: number
                  }
                  Update: {
                    "account_id"?: string,"balance_due_usd"?: number,"battery_line_usd"?: number,"courier"?: string | null,"created_at"?: string,"created_by"?: string | null,"customs_usd"?: number,"delivered_date"?: string | null,"delivery_setup"?: Database["public"]['Enums']["delivery_setup"],"deposit_due_usd"?: number,"eta_date"?: string | null,"freight_usd"?: number,"hk_invoice_no"?: string | null,"id"?: string,"notes"?: string | null,"number"?: string,"order_date"?: string,"partner_invoice_eur"?: number | null,"partner_invoice_no"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"pieces"?: number,"rma_discount_usd"?: number,"ship_date"?: string | null,"ship_to"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["order_status"],"subtotal_usd"?: number,"total_usd"?: number,"tracking"?: string | null,"updated_at"?: string,"usdt_fee_usd"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"orders_finance": {
                  Row: {
                    "base_cost_usd": number | null,"created_at": string,"created_by": string | null,"margin_pct": number | null,"order_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_cost_usd"?: number | null,"created_at"?: string,"created_by"?: string | null,"margin_pct"?: number | null,"order_id": string,"updated_at"?: string
                  }
                  Update: {
                    "base_cost_usd"?: number | null,"created_at"?: string,"created_by"?: string | null,"margin_pct"?: number | null,"order_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_finance_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_finance_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "account_id": string,"amount": number,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"created_by": string | null,"currency": Database["public"]['Enums']["currency_code"],"difference": number | null,"difference_reason": string | null,"expected_amount": number | null,"id": string,"method": Database["public"]['Enums']["payment_method"],"notes": string | null,"order_id": string,"proof_file_id": string | null,"received_at": string,"reference": string | null,"status": Database["public"]['Enums']["payment_status"],"type": Database["public"]['Enums']["payment_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount": number,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"],"difference"?: number | null,"difference_reason"?: string | null,"expected_amount"?: number | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"order_id": string,"proof_file_id"?: string | null,"received_at"?: string,"reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"type": Database["public"]['Enums']["payment_type"],"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"],"difference"?: number | null,"difference_reason"?: string | null,"expected_amount"?: number | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"order_id"?: string,"proof_file_id"?: string | null,"received_at"?: string,"reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"type"?: Database["public"]['Enums']["payment_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_proof_file_fk"
      columns: ["proof_file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"email": string,"full_name": string,"role": Database["public"]['Enums']["app_role"] | null,"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"email": string,"full_name"?: string,"role"?: Database["public"]['Enums']["app_role"] | null,"timezone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"email"?: string,"full_name"?: string,"role"?: Database["public"]['Enums']["app_role"] | null,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"scoring_rules": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"disqualify": boolean,"field": string,"id": string,"label": string,"operator": string,"points": number,"sort_order": number,"updated_at": string,"value": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"disqualify"?: boolean,"field": string,"id"?: string,"label": string,"operator": string,"points"?: number,"sort_order"?: number,"updated_at"?: string,"value"?: Json | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"disqualify"?: boolean,"field"?: string,"id"?: string,"label"?: string,"operator"?: string,"points"?: number,"sort_order"?: number,"updated_at"?: string,"value"?: Json | null
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "category": string,"confidential": boolean,"created_at": string,"created_by": string | null,"description": string | null,"key": string,"label": string,"sort_order": number,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"confidential"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"key": string,"label": string,"sort_order"?: number,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "category"?: string,"confidential"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"key"?: string,"label"?: string,"sort_order"?: number,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"skus": {
                  Row: {
                    "battery_eligible": boolean,"color": string,"created_at": string,"created_by": string | null,"grade": string,"id": string,"model": string,"storage_gb": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "battery_eligible"?: boolean,"color": string,"created_at"?: string,"created_by"?: string | null,"grade"?: string,"id"?: string,"model": string,"storage_gb": number,"updated_at"?: string
                  }
                  Update: {
                    "battery_eligible"?: boolean,"color"?: string,"created_at"?: string,"created_by"?: string | null,"grade"?: string,"id"?: string,"model"?: string,"storage_gb"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"wa_broadcast_recipients": {
                  Row: {
                    "broadcast_id": string,"created_at": string,"created_by": string | null,"error_title": string | null,"id": string,"lead_id": string | null,"message_id": string | null,"phone": string,"sent_at": string | null,"skip_reason": string | null,"status": Database["public"]['Enums']["wa_recipient_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "broadcast_id": string,"created_at"?: string,"created_by"?: string | null,"error_title"?: string | null,"id"?: string,"lead_id"?: string | null,"message_id"?: string | null,"phone": string,"sent_at"?: string | null,"skip_reason"?: string | null,"status"?: Database["public"]['Enums']["wa_recipient_status"],"updated_at"?: string
                  }
                  Update: {
                    "broadcast_id"?: string,"created_at"?: string,"created_by"?: string | null,"error_title"?: string | null,"id"?: string,"lead_id"?: string | null,"message_id"?: string | null,"phone"?: string,"sent_at"?: string | null,"skip_reason"?: string | null,"status"?: Database["public"]['Enums']["wa_recipient_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wa_broadcast_recipients_broadcast_id_fkey"
      columns: ["broadcast_id"]
isOneToOne: false
      referencedRelation: "wa_broadcasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wa_broadcast_recipients_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wa_broadcast_recipients_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "wa_messages"
      referencedColumns: ["id"]
    }
                  ]
                },"wa_broadcasts": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"count_delivered": number,"count_failed": number,"count_queued": number,"count_read": number,"count_sent": number,"count_skipped": number,"created_at": string,"created_by": string | null,"header_filename": string | null,"header_media_id": string | null,"id": string,"name": string,"scheduled_at": string | null,"segment": NonNullable<Json>,"status": Database["public"]['Enums']["wa_broadcast_status"],"template_id": string,"updated_at": string,"variables": NonNullable<Json>,"wa_number_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"count_delivered"?: number,"count_failed"?: number,"count_queued"?: number,"count_read"?: number,"count_sent"?: number,"count_skipped"?: number,"created_at"?: string,"created_by"?: string | null,"header_filename"?: string | null,"header_media_id"?: string | null,"id"?: string,"name": string,"scheduled_at"?: string | null,"segment"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["wa_broadcast_status"],"template_id": string,"updated_at"?: string,"variables"?: NonNullable<Json>,"wa_number_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"count_delivered"?: number,"count_failed"?: number,"count_queued"?: number,"count_read"?: number,"count_sent"?: number,"count_skipped"?: number,"created_at"?: string,"created_by"?: string | null,"header_filename"?: string | null,"header_media_id"?: string | null,"id"?: string,"name"?: string,"scheduled_at"?: string | null,"segment"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["wa_broadcast_status"],"template_id"?: string,"updated_at"?: string,"variables"?: NonNullable<Json>,"wa_number_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wa_broadcasts_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "wa_templates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wa_broadcasts_wa_number_id_fkey"
      columns: ["wa_number_id"]
isOneToOne: false
      referencedRelation: "wa_numbers"
      referencedColumns: ["id"]
    }
                  ]
                },"wa_conversations": {
                  Row: {
                    "account_id": string | null,"assigned_user_id": string | null,"contact_name": string | null,"contact_phone": string,"created_at": string,"created_by": string | null,"id": string,"last_inbound_at": string | null,"last_message_at": string | null,"last_message_preview": string | null,"last_outbound_at": string | null,"lead_id": string | null,"status": Database["public"]['Enums']["wa_conversation_status"],"updated_at": string,"wa_number_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"assigned_user_id"?: string | null,"contact_name"?: string | null,"contact_phone": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_inbound_at"?: string | null,"last_message_at"?: string | null,"last_message_preview"?: string | null,"last_outbound_at"?: string | null,"lead_id"?: string | null,"status"?: Database["public"]['Enums']["wa_conversation_status"],"updated_at"?: string,"wa_number_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"assigned_user_id"?: string | null,"contact_name"?: string | null,"contact_phone"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"last_inbound_at"?: string | null,"last_message_at"?: string | null,"last_message_preview"?: string | null,"last_outbound_at"?: string | null,"lead_id"?: string | null,"status"?: Database["public"]['Enums']["wa_conversation_status"],"updated_at"?: string,"wa_number_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wa_conversations_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wa_conversations_assigned_user_id_fkey"
      columns: ["assigned_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "wa_conversations_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wa_conversations_wa_number_id_fkey"
      columns: ["wa_number_id"]
isOneToOne: false
      referencedRelation: "wa_numbers"
      referencedColumns: ["id"]
    }
                  ]
                },"wa_messages": {
                  Row: {
                    "body": string | null,"broadcast_id": string | null,"conversation_id": string,"cost_category": Database["public"]['Enums']["wa_cost_category"],"created_at": string,"created_by": string | null,"delivered_at": string | null,"direction": Database["public"]['Enums']["wa_direction"],"error_code": string | null,"error_title": string | null,"id": string,"media_filename": string | null,"media_id": string | null,"media_mime": string | null,"media_path": string | null,"meta_message_id": string | null,"meta_timestamp": string | null,"read_at": string | null,"sent_at": string | null,"sent_by": string | null,"status": Database["public"]['Enums']["wa_message_status"],"template_language": string | null,"template_name": string | null,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"broadcast_id"?: string | null,"conversation_id": string,"cost_category"?: Database["public"]['Enums']["wa_cost_category"],"created_at"?: string,"created_by"?: string | null,"delivered_at"?: string | null,"direction": Database["public"]['Enums']["wa_direction"],"error_code"?: string | null,"error_title"?: string | null,"id"?: string,"media_filename"?: string | null,"media_id"?: string | null,"media_mime"?: string | null,"media_path"?: string | null,"meta_message_id"?: string | null,"meta_timestamp"?: string | null,"read_at"?: string | null,"sent_at"?: string | null,"sent_by"?: string | null,"status": Database["public"]['Enums']["wa_message_status"],"template_language"?: string | null,"template_name"?: string | null,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string | null,"broadcast_id"?: string | null,"conversation_id"?: string,"cost_category"?: Database["public"]['Enums']["wa_cost_category"],"created_at"?: string,"created_by"?: string | null,"delivered_at"?: string | null,"direction"?: Database["public"]['Enums']["wa_direction"],"error_code"?: string | null,"error_title"?: string | null,"id"?: string,"media_filename"?: string | null,"media_id"?: string | null,"media_mime"?: string | null,"media_path"?: string | null,"meta_message_id"?: string | null,"meta_timestamp"?: string | null,"read_at"?: string | null,"sent_at"?: string | null,"sent_by"?: string | null,"status"?: Database["public"]['Enums']["wa_message_status"],"template_language"?: string | null,"template_name"?: string | null,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wa_messages_broadcast_fk"
      columns: ["broadcast_id"]
isOneToOne: false
      referencedRelation: "wa_broadcasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wa_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "wa_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"wa_numbers": {
                  Row: {
                    "active": boolean,"broadcasts_paused": boolean,"created_at": string,"created_by": string | null,"daily_broadcast_limit": number,"display_phone": string,"id": string,"is_demo": boolean,"label": string | null,"market": Database["public"]['Enums']["market"] | null,"messaging_tier": string | null,"paused_reason": string | null,"phone_number_id": string,"quality_checked_at": string | null,"quality_rating": string | null,"updated_at": string,"verified_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"broadcasts_paused"?: boolean,"created_at"?: string,"created_by"?: string | null,"daily_broadcast_limit"?: number,"display_phone": string,"id"?: string,"is_demo"?: boolean,"label"?: string | null,"market"?: Database["public"]['Enums']["market"] | null,"messaging_tier"?: string | null,"paused_reason"?: string | null,"phone_number_id": string,"quality_checked_at"?: string | null,"quality_rating"?: string | null,"updated_at"?: string,"verified_name"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"broadcasts_paused"?: boolean,"created_at"?: string,"created_by"?: string | null,"daily_broadcast_limit"?: number,"display_phone"?: string,"id"?: string,"is_demo"?: boolean,"label"?: string | null,"market"?: Database["public"]['Enums']["market"] | null,"messaging_tier"?: string | null,"paused_reason"?: string | null,"phone_number_id"?: string,"quality_checked_at"?: string | null,"quality_rating"?: string | null,"updated_at"?: string,"verified_name"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"wa_templates": {
                  Row: {
                    "category": string,"components": NonNullable<Json>,"created_at": string,"created_by": string | null,"id": string,"language": string,"meta_id": string | null,"name": string,"status": string,"synced_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"components"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"id"?: string,"language": string,"meta_id"?: string | null,"name": string,"status": string,"synced_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"components"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"id"?: string,"language"?: string,"meta_id"?: string | null,"name"?: string,"status"?: string,"synced_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"wa_webhook_events": {
                  Row: {
                    "created_at": string,"created_by": string | null,"error": string | null,"id": number,"payload": NonNullable<Json>,"received_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"error"?: string | null,"id"?: never,"payload": NonNullable<Json>,"received_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"error"?: string | null,"id"?: never,"payload"?: NonNullable<Json>,"received_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "order_overview": {
                  Row: {
                    "account_code": string,"account_id": string,"account_name": string,"balance_confirmed": number | null,"balance_ok": boolean | null,"deposit_confirmed": number | null,"deposit_payable": number | null,"id": string,"imei_count": number | null,"label_ok": boolean | null,"market": Database["public"]['Enums']["market"] | null,"number": string,"payable_total": number | null,"payment_awaiting": boolean | null,"pays_in_eur": boolean | null,"status": Database["public"]['Enums']["order_status"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "orders_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "can_see_contact_owner":
{ Args: { "p_account": string,"p_lead": string }; Returns: boolean
                           },
"can_see_conversation":
{ Args: { "p_id": string }; Returns: boolean
                           },
"can_see_finance":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_work_leads":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"current_app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"has_account_access":
{ Args: { "p_account_id": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"lead_funnel":
{ Args: { "p_since"?: string }; Returns: {
              "current": number,"reached": number,"stage": Database["public"]['Enums']["lead_stage"]
            }[]
                           },
"notify_upsert":
{ Args: { "p_body": string,"p_kind": string,"p_link": string,"p_title": string,"p_user": string }; Returns: undefined
                           },
"order_finance_recalc":
{ Args: { "p_order": string }; Returns: undefined
                           },
"order_recalc":
{ Args: { "p_order": string }; Returns: undefined
                           },
"security_check":
{ Args: Record<PropertyKey, never>; Returns: {
              "problem": string,"table_name": string
            }[]
                           },
"setting_num":
{ Args: { "p_default": number,"p_key": string }; Returns: number
                           },
"setup_table":
{ Args: { "p_pk"?: string,"p_table": unknown }; Returns: undefined
                           },
"storage_account_access":
{ Args: { "p_name": string }; Returns: boolean
                           },
"undo_lead_import":
{ Args: { "p_batch_id": string }; Returns: {
              "kept": number,"removed": number
            }[]
                           },
"wa_ingest":
{ Args: { "payload": Json }; Returns: Json
                           },
"wa_refresh_broadcast_counts":
{ Args: { "p_id": string }; Returns: undefined
                           },
"wa_status_rank":
{ Args: { "s": Database["public"]['Enums']["wa_message_status"] }; Returns: number
                           },
"wa_worker_tick":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           }
          }
          Enums: {
            "account_role": "owner"|"specialist","account_status": "onboarding"|"active"|"paused"|"closed","app_role": "admin"|"bd"|"account_specialist","billing_entity": "ever_state"|"streamline_fze","currency_code": "USD"|"EUR","delivery_setup": "client_label"|"our_booking","file_kind": "INV-HK"|"INV-EU"|"PP-DEP"|"PP-BAL"|"IMEI"|"LABEL"|"TRK-HK"|"TRK-EU"|"POD"|"CN"|"OTHER","lead_event_kind": "created"|"stage_change"|"owner_change"|"note"|"contact"|"form"|"import"|"email"|"whatsapp"|"brevo","lead_stage": "New"|"Contacted"|"Replied"|"Qualified"|"Meeting"|"Sample/Proposal"|"Won"|"Lost","lead_tier": "A"|"B"|"C","market": "EU"|"LATAM"|"US"|"ROW","order_status": "quoted"|"invoiced"|"deposit_paid"|"in_preparation"|"ready_to_ship"|"balance_paid"|"shipped"|"delivered"|"closed","payment_method": "wire"|"usdt","payment_status": "awaiting_confirmation"|"confirmed","payment_type": "deposit"|"balance"|"other","wa_broadcast_status": "draft"|"pending_approval"|"approved"|"sending"|"done"|"cancelled"|"paused","wa_conversation_status": "open"|"pending"|"resolved","wa_cost_category": "service"|"utility"|"marketing"|"authentication"|"none","wa_direction": "inbound"|"outbound","wa_message_status": "received"|"queued"|"sent"|"delivered"|"read"|"failed","wa_recipient_status": "queued"|"sent"|"delivered"|"read"|"failed"|"skipped"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_role": ["owner", "specialist"],"account_status": ["onboarding", "active", "paused", "closed"],"app_role": ["admin", "bd", "account_specialist"],"billing_entity": ["ever_state", "streamline_fze"],"currency_code": ["USD", "EUR"],"delivery_setup": ["client_label", "our_booking"],"file_kind": ["INV-HK", "INV-EU", "PP-DEP", "PP-BAL", "IMEI", "LABEL", "TRK-HK", "TRK-EU", "POD", "CN", "OTHER"],"lead_event_kind": ["created", "stage_change", "owner_change", "note", "contact", "form", "import", "email", "whatsapp", "brevo"],"lead_stage": ["New", "Contacted", "Replied", "Qualified", "Meeting", "Sample/Proposal", "Won", "Lost"],"lead_tier": ["A", "B", "C"],"market": ["EU", "LATAM", "US", "ROW"],"order_status": ["quoted", "invoiced", "deposit_paid", "in_preparation", "ready_to_ship", "balance_paid", "shipped", "delivered", "closed"],"payment_method": ["wire", "usdt"],"payment_status": ["awaiting_confirmation", "confirmed"],"payment_type": ["deposit", "balance", "other"],"wa_broadcast_status": ["draft", "pending_approval", "approved", "sending", "done", "cancelled", "paused"],"wa_conversation_status": ["open", "pending", "resolved"],"wa_cost_category": ["service", "utility", "marketing", "authentication", "none"],"wa_direction": ["inbound", "outbound"],"wa_message_status": ["received", "queued", "sent", "delivered", "read", "failed"],"wa_recipient_status": ["queued", "sent", "delivered", "read", "failed", "skipped"]
          }
        }
} as const
