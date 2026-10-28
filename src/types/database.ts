
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
      foreignKeyName: "account_assignments_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
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
      foreignKeyName: "contacts_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contacts_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_note_lines": {
                  Row: {
                    "account_id": string,"created_at": string,"created_by": string | null,"credit_note_id": string,"description": string,"id": string,"qty": number,"sort_order": number,"unit_price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"created_by"?: string | null,"credit_note_id": string,"description": string,"id"?: string,"qty"?: number,"sort_order"?: number,"unit_price": number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"created_by"?: string | null,"credit_note_id"?: string,"description"?: string,"id"?: string,"qty"?: number,"sort_order"?: number,"unit_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_note_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_note_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_note_lines_credit_note_id_fkey"
      columns: ["credit_note_id"]
isOneToOne: false
      referencedRelation: "credit_notes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_note_lines_credit_note_id_fkey"
      columns: ["credit_note_id"]
isOneToOne: false
      referencedRelation: "portal_credit_notes"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_notes": {
                  Row: {
                    "account_id": string,"amount": number,"applied_invoice_no": string | null,"applied_on": string | null,"applied_order_id": string | null,"applied_to": Database["public"]['Enums']["credit_applied_to"],"approved_at": string | null,"approved_by": string | null,"created_at": string,"created_by": string | null,"currency": Database["public"]['Enums']["currency_code"],"id": string,"in_favor_of": string | null,"invoice_no": string | null,"issued_on": string | null,"notes": string | null,"number": string,"order_id": string | null,"pdf_file_id": string | null,"reason": string | null,"rma_id": string | null,"status": Database["public"]['Enums']["credit_note_status"],"updated_at": string,"xlsx_file_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount"?: number,"applied_invoice_no"?: string | null,"applied_on"?: string | null,"applied_order_id"?: string | null,"applied_to"?: Database["public"]['Enums']["credit_applied_to"],"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"],"id"?: string,"in_favor_of"?: string | null,"invoice_no"?: string | null,"issued_on"?: string | null,"notes"?: string | null,"number"?: string,"order_id"?: string | null,"pdf_file_id"?: string | null,"reason"?: string | null,"rma_id"?: string | null,"status"?: Database["public"]['Enums']["credit_note_status"],"updated_at"?: string,"xlsx_file_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"applied_invoice_no"?: string | null,"applied_on"?: string | null,"applied_order_id"?: string | null,"applied_to"?: Database["public"]['Enums']["credit_applied_to"],"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"],"id"?: string,"in_favor_of"?: string | null,"invoice_no"?: string | null,"issued_on"?: string | null,"notes"?: string | null,"number"?: string,"order_id"?: string | null,"pdf_file_id"?: string | null,"reason"?: string | null,"rma_id"?: string | null,"status"?: Database["public"]['Enums']["credit_note_status"],"updated_at"?: string,"xlsx_file_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_notes_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_applied_order_id_fkey"
      columns: ["applied_order_id"]
isOneToOne: false
      referencedRelation: "order_cycle"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_applied_order_id_fkey"
      columns: ["applied_order_id"]
isOneToOne: false
      referencedRelation: "order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_applied_order_id_fkey"
      columns: ["applied_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_applied_order_id_fkey"
      columns: ["applied_order_id"]
isOneToOne: false
      referencedRelation: "portal_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_cycle"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "portal_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_pdf_file_id_fkey"
      columns: ["pdf_file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_pdf_file_id_fkey"
      columns: ["pdf_file_id"]
isOneToOne: false
      referencedRelation: "portal_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "portal_rmas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "rma_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "rmas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_xlsx_file_id_fkey"
      columns: ["xlsx_file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_xlsx_file_id_fkey"
      columns: ["xlsx_file_id"]
isOneToOne: false
      referencedRelation: "portal_files"
      referencedColumns: ["id"]
    }
                  ]
                },"files": {
                  Row: {
                    "account_id": string,"created_at": string,"created_by": string | null,"file_name": string,"id": string,"kind": Database["public"]['Enums']["file_kind"],"mime_type": string | null,"owner_id": string | null,"owner_table": string,"rma_unit_id": string | null,"size_bytes": number | null,"storage_path": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"created_by"?: string | null,"file_name": string,"id"?: string,"kind"?: Database["public"]['Enums']["file_kind"],"mime_type"?: string | null,"owner_id"?: string | null,"owner_table"?: string,"rma_unit_id"?: string | null,"size_bytes"?: number | null,"storage_path": string,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"created_by"?: string | null,"file_name"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["file_kind"],"mime_type"?: string | null,"owner_id"?: string | null,"owner_table"?: string,"rma_unit_id"?: string | null,"size_bytes"?: number | null,"storage_path"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "files_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_rma_unit_id_fkey"
      columns: ["rma_unit_id"]
isOneToOne: false
      referencedRelation: "portal_rma_units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_rma_unit_id_fkey"
      columns: ["rma_unit_id"]
isOneToOne: false
      referencedRelation: "rma_units"
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
      foreignKeyName: "imei_master_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imei_master_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_cycle"
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
      foreignKeyName: "imei_master_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "portal_orders"
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
      foreignKeyName: "order_events_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_file_fk"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_file_fk"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "portal_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_cycle"
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
    },{
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "portal_orders"
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
      foreignKeyName: "order_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_cycle"
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
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "portal_orders"
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
                    "account_id": string,"balance_due_usd"?: number,"battery_line_usd"?: number,"courier"?: string | null,"created_at"?: string,"created_by"?: string | null,"customs_usd"?: number,"delivered_date"?: string | null,"delivery_setup"?: Database["public"]['Enums']["delivery_setup"],"deposit_due_usd"?: number,"eta_date"?: string | null,"freight_usd"?: number,"hk_invoice_no"?: string | null,"id"?: string,"notes"?: string | null,"number"?: string,"order_date"?: string,"partner_invoice_eur"?: number | null,"partner_invoice_no"?: string | null,"payment_method"?: Database["public"]['Enums']["payment_method"],"pieces"?: number,"rma_discount_usd"?: number,"ship_date"?: string | null,"ship_to"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["order_status"],"subtotal_usd"?: number,"total_usd"?: number,"tracking"?: string | null,"updated_at"?: string,"usdt_fee_usd"?: number
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
    },{
      foreignKeyName: "orders_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
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
      referencedRelation: "order_cycle"
      referencedColumns: ["id"]
    },{
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
    },{
      foreignKeyName: "orders_finance_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "portal_orders"
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
      foreignKeyName: "payments_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_cycle"
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
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "portal_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_proof_file_fk"
      columns: ["proof_file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_proof_file_fk"
      columns: ["proof_file_id"]
isOneToOne: false
      referencedRelation: "portal_files"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_users": {
                  Row: {
                    "account_id": string,"active": boolean,"contact_id": string | null,"created_at": string,"created_by": string | null,"email": string,"id": string,"language": string,"last_login_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"active"?: boolean,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email": string,"id"?: string,"language"?: string,"last_login_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "account_id"?: string,"active"?: boolean,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string,"id"?: string,"language"?: string,"last_login_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "portal_users_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portal_users_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portal_users_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portal_users_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
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
                },"rma_batches": {
                  Row: {
                    "awb": string | null,"boxes": number | null,"carrier": string,"created_at": string,"created_by": string | null,"cutoff_date": string,"email_sent_at": string | null,"id": string,"intermediary_id": string,"label_name": string | null,"label_path": string | null,"notes": string | null,"pickup_date": string | null,"received_at": string | null,"shipped_at": string | null,"status": Database["public"]['Enums']["rma_batch_status"],"updated_at": string,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "awb"?: string | null,"boxes"?: number | null,"carrier"?: string,"created_at"?: string,"created_by"?: string | null,"cutoff_date": string,"email_sent_at"?: string | null,"id"?: string,"intermediary_id": string,"label_name"?: string | null,"label_path"?: string | null,"notes"?: string | null,"pickup_date"?: string | null,"received_at"?: string | null,"shipped_at"?: string | null,"status"?: Database["public"]['Enums']["rma_batch_status"],"updated_at"?: string,"weight_kg"?: number | null
                  }
                  Update: {
                    "awb"?: string | null,"boxes"?: number | null,"carrier"?: string,"created_at"?: string,"created_by"?: string | null,"cutoff_date"?: string,"email_sent_at"?: string | null,"id"?: string,"intermediary_id"?: string,"label_name"?: string | null,"label_path"?: string | null,"notes"?: string | null,"pickup_date"?: string | null,"received_at"?: string | null,"shipped_at"?: string | null,"status"?: Database["public"]['Enums']["rma_batch_status"],"updated_at"?: string,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rma_batches_intermediary_id_fkey"
      columns: ["intermediary_id"]
isOneToOne: false
      referencedRelation: "intermediaries"
      referencedColumns: ["id"]
    }
                  ]
                },"rma_units": {
                  Row: {
                    "account_id": string,"batch_id": string | null,"battery_swollen": boolean,"check_note": string | null,"claimed_before": string | null,"color": string | null,"created_at": string,"created_by": string | null,"credit_fixed_usd": number | null,"credit_pct": number | null,"credit_usd": number | null,"detected_on": string | null,"fault_category": string,"fault_text": string | null,"hkr_notes": string | null,"id": string,"imei": string,"imei_check": Database["public"]['Enums']["imei_check"],"imei_master_id": string | null,"model": string | null,"origin_order_id": string | null,"physical_damage": boolean,"resolution": Database["public"]['Enums']["rma_resolution"],"rma_id": string,"shipped_on": string | null,"sort_order": number,"source": Database["public"]['Enums']["rma_source"],"storage_gb": number | null,"unit_price_usd": number | null,"unit_status": Database["public"]['Enums']["rma_unit_status"],"updated_at": string,"warranty_ok": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"batch_id"?: string | null,"battery_swollen"?: boolean,"check_note"?: string | null,"claimed_before"?: string | null,"color"?: string | null,"created_at"?: string,"created_by"?: string | null,"credit_fixed_usd"?: number | null,"credit_pct"?: number | null,"credit_usd"?: never,"detected_on"?: string | null,"fault_category": string,"fault_text"?: string | null,"hkr_notes"?: string | null,"id"?: string,"imei": string,"imei_check"?: Database["public"]['Enums']["imei_check"],"imei_master_id"?: string | null,"model"?: string | null,"origin_order_id"?: string | null,"physical_damage"?: boolean,"resolution"?: Database["public"]['Enums']["rma_resolution"],"rma_id": string,"shipped_on"?: string | null,"sort_order"?: number,"source"?: Database["public"]['Enums']["rma_source"],"storage_gb"?: number | null,"unit_price_usd"?: number | null,"unit_status"?: Database["public"]['Enums']["rma_unit_status"],"updated_at"?: string,"warranty_ok"?: boolean | null
                  }
                  Update: {
                    "account_id"?: string,"batch_id"?: string | null,"battery_swollen"?: boolean,"check_note"?: string | null,"claimed_before"?: string | null,"color"?: string | null,"created_at"?: string,"created_by"?: string | null,"credit_fixed_usd"?: number | null,"credit_pct"?: number | null,"credit_usd"?: never,"detected_on"?: string | null,"fault_category"?: string,"fault_text"?: string | null,"hkr_notes"?: string | null,"id"?: string,"imei"?: string,"imei_check"?: Database["public"]['Enums']["imei_check"],"imei_master_id"?: string | null,"model"?: string | null,"origin_order_id"?: string | null,"physical_damage"?: boolean,"resolution"?: Database["public"]['Enums']["rma_resolution"],"rma_id"?: string,"shipped_on"?: string | null,"sort_order"?: number,"source"?: Database["public"]['Enums']["rma_source"],"storage_gb"?: number | null,"unit_price_usd"?: number | null,"unit_status"?: Database["public"]['Enums']["rma_unit_status"],"updated_at"?: string,"warranty_ok"?: boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rma_units_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "rma_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_imei_master_id_fkey"
      columns: ["imei_master_id"]
isOneToOne: false
      referencedRelation: "imei_master"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_origin_order_id_fkey"
      columns: ["origin_order_id"]
isOneToOne: false
      referencedRelation: "order_cycle"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_origin_order_id_fkey"
      columns: ["origin_order_id"]
isOneToOne: false
      referencedRelation: "order_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_origin_order_id_fkey"
      columns: ["origin_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_origin_order_id_fkey"
      columns: ["origin_order_id"]
isOneToOne: false
      referencedRelation: "portal_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "portal_rmas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "rma_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "rmas"
      referencedColumns: ["id"]
    }
                  ]
                },"rmas": {
                  Row: {
                    "account_id": string,"approved_at": string | null,"approved_by": string | null,"channel": Database["public"]['Enums']["rma_channel"],"client_notes": string | null,"closed_at": string | null,"contact_info": string | null,"contact_name": string | null,"created_at": string,"created_by": string | null,"id": string,"internal_notes": string | null,"number": string,"order_refs": string | null,"status": Database["public"]['Enums']["rma_status"],"submitted_at": string | null,"units_location": Database["public"]['Enums']["units_location"] | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"approved_at"?: string | null,"approved_by"?: string | null,"channel"?: Database["public"]['Enums']["rma_channel"],"client_notes"?: string | null,"closed_at"?: string | null,"contact_info"?: string | null,"contact_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"internal_notes"?: string | null,"number"?: string,"order_refs"?: string | null,"status"?: Database["public"]['Enums']["rma_status"],"submitted_at"?: string | null,"units_location"?: Database["public"]['Enums']["units_location"] | null,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"approved_at"?: string | null,"approved_by"?: string | null,"channel"?: Database["public"]['Enums']["rma_channel"],"client_notes"?: string | null,"closed_at"?: string | null,"contact_info"?: string | null,"contact_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"internal_notes"?: string | null,"number"?: string,"order_refs"?: string | null,"status"?: Database["public"]['Enums']["rma_status"],"submitted_at"?: string | null,"units_location"?: Database["public"]['Enums']["units_location"] | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rmas_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rmas_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    }
                  ]
                },"sales_goals": {
                  Row: {
                    "amount_usd": number,"created_at": string,"created_by": string | null,"id": string,"month": string,"owner_user_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_usd": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"month": string,"owner_user_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_usd"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"month"?: string,"owner_user_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_goals_owner_user_id_fkey"
      columns: ["owner_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"sales_history": {
                  Row: {
                    "amount_usd": number,"created_at": string,"created_by": string | null,"month": string,"notes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_usd": number,"created_at"?: string,"created_by"?: string | null,"month": string,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_usd"?: number,"created_at"?: string,"created_by"?: string | null,"month"?: string,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sales_projections": {
                  Row: {
                    "amount_usd": number,"created_at": string,"created_by": string | null,"month": string,"notes": string | null,"suggested_usd": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_usd": number,"created_at"?: string,"created_by"?: string | null,"month": string,"notes"?: string | null,"suggested_usd"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_usd"?: number,"created_at"?: string,"created_by"?: string | null,"month"?: string,"notes"?: string | null,"suggested_usd"?: number | null,"updated_at"?: string
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
      foreignKeyName: "wa_conversations_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
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
            "order_cycle": {
                  Row: {
                    "account_id": string,"cash_cycle_days": number | null,"confirmed": number | null,"deposit_on": string | null,"fully_paid": boolean | null,"id": string,"invoiced_on": string | null,"number": string,"order_date": string,"outstanding": number | null,"paid_on": string | null,"payable": number | null,"pays_in_eur": boolean | null,"pieces": number,"processing_days": number | null,"ship_date": string | null,"status": Database["public"]['Enums']["order_status"],"total_usd": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "orders_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    }
                  ]
                },"order_overview": {
                  Row: {
                    "account_code": string,"account_id": string,"account_name": string,"balance_confirmed": number | null,"balance_ok": boolean | null,"delivery_setup": Database["public"]['Enums']["delivery_setup"],"deposit_confirmed": number | null,"deposit_payable": number | null,"eta_date": string | null,"id": string,"imei_count": number | null,"label_ok": boolean | null,"market": Database["public"]['Enums']["market"] | null,"number": string,"order_date": string,"payable_total": number | null,"payment_awaiting": boolean | null,"pays_in_eur": boolean | null,"pieces": number,"status": Database["public"]['Enums']["order_status"],"total_usd": number,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "orders_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_account": {
                  Row: {
                    "code": string,"country": string | null,"currency": Database["public"]['Enums']["currency_code"],"id": string,"intermediary_name": string | null,"language": string,"legal_name": string | null,"market": Database["public"]['Enums']["market"] | null,"name": string,"payment_method": Database["public"]['Enums']["payment_method"]
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"portal_credit_notes": {
                  Row: {
                    "amount": number,"applied_invoice_no": string | null,"applied_on": string | null,"applied_to": Database["public"]['Enums']["credit_applied_to"],"currency": Database["public"]['Enums']["currency_code"],"id": string,"invoice_no": string | null,"issued_on": string | null,"number": string,"pdf_file_id": string | null,"rma_id": string | null,"rma_number": string | null,"status": Database["public"]['Enums']["credit_note_status"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "credit_notes_pdf_file_id_fkey"
      columns: ["pdf_file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_pdf_file_id_fkey"
      columns: ["pdf_file_id"]
isOneToOne: false
      referencedRelation: "portal_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "portal_rmas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "rma_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_notes_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "rmas"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_files": {
                  Row: {
                    "created_at": string,"file_name": string,"id": string,"kind": string | null,"mime_type": string | null,"owner_id": string | null,"owner_table": string,"rma_unit_id": string | null,"size_bytes": number | null,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                           "created_at"?: string | null,"file_name"?: string | null,"id"?: string | null,"kind"?: never,"mime_type"?: string | null,"owner_id"?: string | null,"owner_table"?: string | null,"rma_unit_id"?: string | null,"size_bytes"?: number | null,"storage_path"?: string | null
                         }
                        Update: {
                           "created_at"?: string | null,"file_name"?: string | null,"id"?: string | null,"kind"?: never,"mime_type"?: string | null,"owner_id"?: string | null,"owner_table"?: string | null,"rma_unit_id"?: string | null,"size_bytes"?: number | null,"storage_path"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "files_rma_unit_id_fkey"
      columns: ["rma_unit_id"]
isOneToOne: false
      referencedRelation: "portal_rma_units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_rma_unit_id_fkey"
      columns: ["rma_unit_id"]
isOneToOne: false
      referencedRelation: "rma_units"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_imeis": {
                  Row: {
                    "color": string | null,"imei": string,"model": string | null,"order_id": string | null,"order_number": string,"shipped_at": string | null,"storage_gb": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "imei_master_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_cycle"
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
      foreignKeyName: "imei_master_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "portal_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_me": {
                  Row: {
                    "contact_name": string | null,"email": string,"language": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"portal_order_lines": {
                  Row: {
                    "battery_new": boolean,"color": string | null,"item": string | null,"model": string | null,"order_id": string,"qty": number,"sort_order": number,"storage_gb": number | null,"unit_price_usd": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "order_cycle"
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
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "portal_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_orders": {
                  Row: {
                    "balance_confirmed": number | null,"balance_pending": number | null,"battery_line_usd": number,"courier": string | null,"customs_usd": number,"delivered_date": string | null,"deposit_confirmed": number | null,"deposit_payable": number | null,"eta_date": string | null,"freight_usd": number,"hk_invoice_no": string | null,"id": string,"imei_count": number | null,"number": string,"order_date": string,"partner_invoice_eur": number | null,"partner_invoice_no": string | null,"payable_total": number | null,"payment_awaiting": boolean | null,"payment_method": Database["public"]['Enums']["payment_method"],"pays_in_eur": boolean | null,"pieces": number,"rma_discount_usd": number,"ship_date": string | null,"status": Database["public"]['Enums']["order_status"],"subtotal_usd": number,"total_usd": number,"tracking": string | null,"usdt_fee_usd": number
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"portal_rma_units": {
                  Row: {
                    "battery_swollen": boolean,"color": string | null,"credit_usd": number | null,"detected_on": string | null,"evidence_count": number | null,"fault_category": string,"fault_text": string | null,"id": string,"imei": string,"imei_found": boolean | null,"model": string | null,"physical_damage": boolean,"resolution": Database["public"]['Enums']["rma_resolution"] | null,"rma_id": string,"sort_order": number,"source": Database["public"]['Enums']["rma_source"],"storage_gb": number | null,"unit_status": Database["public"]['Enums']["rma_unit_status"],"warranty_ok": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "rma_units_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "portal_rmas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "rma_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rma_units_rma_id_fkey"
      columns: ["rma_id"]
isOneToOne: false
      referencedRelation: "rmas"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_rmas": {
                  Row: {
                    "approved_at": string | null,"channel": Database["public"]['Enums']["rma_channel"],"client_notes": string | null,"closed_at": string | null,"created_at": string,"credit_usd": number | null,"id": string,"number": string,"order_refs": string | null,"status": Database["public"]['Enums']["rma_status"],"submitted_at": string | null,"units": number | null,"units_location": Database["public"]['Enums']["units_location"] | null,"units_without_evidence": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "approved_at"?: string | null,"channel"?: Database["public"]['Enums']["rma_channel"] | null,"client_notes"?: string | null,"closed_at"?: string | null,"created_at"?: string | null,"credit_usd"?: never,"id"?: string | null,"number"?: string | null,"order_refs"?: string | null,"status"?: Database["public"]['Enums']["rma_status"] | null,"submitted_at"?: string | null,"units"?: never,"units_location"?: Database["public"]['Enums']["units_location"] | null,"units_without_evidence"?: never
                         }
                        Update: {
                           "approved_at"?: string | null,"channel"?: Database["public"]['Enums']["rma_channel"] | null,"client_notes"?: string | null,"closed_at"?: string | null,"created_at"?: string | null,"credit_usd"?: never,"id"?: string | null,"number"?: string | null,"order_refs"?: string | null,"status"?: Database["public"]['Enums']["rma_status"] | null,"submitted_at"?: string | null,"units"?: never,"units_location"?: Database["public"]['Enums']["units_location"] | null,"units_without_evidence"?: never
                         }
                        Relationships: [
                    
                  ]
                },"rma_overview": {
                  Row: {
                    "account_code": string,"account_id": string,"account_name": string,"approved_at": string | null,"cap_usd": number | null,"channel": Database["public"]['Enums']["rma_channel"],"closed_at": string | null,"created_at": string,"credit_usd": number | null,"id": string,"intermediary_id": string | null,"market": Database["public"]['Enums']["market"] | null,"number": string,"status": Database["public"]['Enums']["rma_status"],"submitted_at": string | null,"units": number | null,"units_claimed_before": number | null,"units_location": Database["public"]['Enums']["units_location"] | null,"units_not_found": number | null,"units_ours": number | null,"units_out_of_warranty": number | null,"units_pending": number | null,"units_return": number | null,"units_swollen": number | null,"units_testing": number | null,"units_to_batch": number | null,"units_without_evidence": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "accounts_intermediary_id_fkey"
      columns: ["intermediary_id"]
isOneToOne: false
      referencedRelation: "intermediaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rmas_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rmas_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "portal_account"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "can_manage_portal":
{ Args: { "p_account": string }; Returns: boolean
                           },
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
"portal_account_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"portal_add_evidence":
{ Args: { "p_mime": string,"p_name": string,"p_path": string,"p_size": number,"p_unit": string }; Returns: string
                           },
"portal_check_imei":
{ Args: { "p_imei": string }; Returns: Json
                           },
"portal_create_rma":
{ Args: { "p_contact_info": string,"p_contact_name": string,"p_location": string,"p_notes": string,"p_order_refs": string,"p_units": Json }; Returns: Json
                           },
"portal_file_kind_visible":
{ Args: { "p_kind": string }; Returns: boolean
                           },
"portal_storage_can_read":
{ Args: { "p_name": string }; Returns: boolean
                           },
"portal_storage_can_upload":
{ Args: { "p_name": string }; Returns: boolean
                           },
"portal_submit_rma":
{ Args: { "p_rma": string }; Returns: Json
                           },
"portal_touch":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"rma_fault_categories":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"sales_orders":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "account_id": string,"margin_usd": number,"number": string,"order_date": string,"order_id": string,"pieces": number,"rma_discount_usd": number,"status": Database["public"]['Enums']["order_status"],"total_usd": number
            }[]
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
            "account_role": "owner"|"specialist","account_status": "onboarding"|"active"|"paused"|"closed","app_role": "admin"|"bd"|"account_specialist","billing_entity": "ever_state"|"streamline_fze","credit_applied_to": "next_invoice"|"order_balance"|"refund","credit_note_status": "draft"|"approved"|"issued"|"applied"|"cancelled","currency_code": "USD"|"EUR","delivery_setup": "client_label"|"our_booking","file_kind": "INV-HK"|"INV-EU"|"PP-DEP"|"PP-BAL"|"IMEI"|"LABEL"|"TRK-HK"|"TRK-EU"|"POD"|"CN"|"OTHER"|"FORM"|"PRUEBAS"|"VERIF"|"TRK","imei_check": "ours"|"not_found","lead_event_kind": "created"|"stage_change"|"owner_change"|"note"|"contact"|"form"|"import"|"email"|"whatsapp"|"brevo","lead_stage": "New"|"Contacted"|"Replied"|"Qualified"|"Meeting"|"Sample/Proposal"|"Won"|"Lost","lead_tier": "A"|"B"|"C","market": "EU"|"LATAM"|"US"|"ROW","order_status": "quoted"|"invoiced"|"deposit_paid"|"in_preparation"|"ready_to_ship"|"balance_paid"|"shipped"|"delivered"|"closed","payment_method": "wire"|"usdt","payment_status": "awaiting_confirmation"|"confirmed","payment_type": "deposit"|"balance"|"other","rma_batch_status": "open"|"shipped"|"received","rma_channel": "portal"|"internal"|"import","rma_resolution": "pending"|"return_hk"|"repair_credit"|"credit_note"|"replacement"|"not_covered","rma_source": "testing"|"end_customer","rma_status": "requested"|"form_received"|"verified"|"approved"|"awaiting_return"|"credit_agreed"|"in_batch"|"received_hk"|"closed","rma_unit_status": "reported"|"verified"|"awaiting_shipment"|"shipped_to_hk"|"received_hk"|"returned_to_client"|"credited"|"rejected"|"closed","units_location": "with_client"|"at_intermediary"|"at_end_customer","wa_broadcast_status": "draft"|"pending_approval"|"approved"|"sending"|"done"|"cancelled"|"paused","wa_conversation_status": "open"|"pending"|"resolved","wa_cost_category": "service"|"utility"|"marketing"|"authentication"|"none","wa_direction": "inbound"|"outbound","wa_message_status": "received"|"queued"|"sent"|"delivered"|"read"|"failed","wa_recipient_status": "queued"|"sent"|"delivered"|"read"|"failed"|"skipped"
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
            "account_role": ["owner", "specialist"],"account_status": ["onboarding", "active", "paused", "closed"],"app_role": ["admin", "bd", "account_specialist"],"billing_entity": ["ever_state", "streamline_fze"],"credit_applied_to": ["next_invoice", "order_balance", "refund"],"credit_note_status": ["draft", "approved", "issued", "applied", "cancelled"],"currency_code": ["USD", "EUR"],"delivery_setup": ["client_label", "our_booking"],"file_kind": ["INV-HK", "INV-EU", "PP-DEP", "PP-BAL", "IMEI", "LABEL", "TRK-HK", "TRK-EU", "POD", "CN", "OTHER", "FORM", "PRUEBAS", "VERIF", "TRK"],"imei_check": ["ours", "not_found"],"lead_event_kind": ["created", "stage_change", "owner_change", "note", "contact", "form", "import", "email", "whatsapp", "brevo"],"lead_stage": ["New", "Contacted", "Replied", "Qualified", "Meeting", "Sample/Proposal", "Won", "Lost"],"lead_tier": ["A", "B", "C"],"market": ["EU", "LATAM", "US", "ROW"],"order_status": ["quoted", "invoiced", "deposit_paid", "in_preparation", "ready_to_ship", "balance_paid", "shipped", "delivered", "closed"],"payment_method": ["wire", "usdt"],"payment_status": ["awaiting_confirmation", "confirmed"],"payment_type": ["deposit", "balance", "other"],"rma_batch_status": ["open", "shipped", "received"],"rma_channel": ["portal", "internal", "import"],"rma_resolution": ["pending", "return_hk", "repair_credit", "credit_note", "replacement", "not_covered"],"rma_source": ["testing", "end_customer"],"rma_status": ["requested", "form_received", "verified", "approved", "awaiting_return", "credit_agreed", "in_batch", "received_hk", "closed"],"rma_unit_status": ["reported", "verified", "awaiting_shipment", "shipped_to_hk", "received_hk", "returned_to_client", "credited", "rejected", "closed"],"units_location": ["with_client", "at_intermediary", "at_end_customer"],"wa_broadcast_status": ["draft", "pending_approval", "approved", "sending", "done", "cancelled", "paused"],"wa_conversation_status": ["open", "pending", "resolved"],"wa_cost_category": ["service", "utility", "marketing", "authentication", "none"],"wa_direction": ["inbound", "outbound"],"wa_message_status": ["received", "queued", "sent", "delivered", "read", "failed"],"wa_recipient_status": ["queued", "sent", "delivered", "read", "failed", "skipped"]
          }
        }
} as const
