
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
                    "code": string,"country": string | null,"created_at": string,"created_by": string | null,"id": string,"market": Database["public"]['Enums']["market"] | null,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"market"?: Database["public"]['Enums']["market"] | null,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"market"?: Database["public"]['Enums']["market"] | null,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
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
                    "computed_score": number,"created_at": string,"created_by": string | null,"disqualified": boolean,"id": string,"ip": string | null,"lead_id": string | null,"merged": boolean,"raw": NonNullable<Json>,"reviewed_at": string | null,"reviewed_by": string | null,"submitted_at": string,"tier": Database["public"]['Enums']["lead_tier"] | null,"updated_at": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "computed_score"?: number,"created_at"?: string,"created_by"?: string | null,"disqualified"?: boolean,"id"?: string,"ip"?: string | null,"lead_id"?: string | null,"merged"?: boolean,"raw": NonNullable<Json>,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"submitted_at"?: string,"tier"?: Database["public"]['Enums']["lead_tier"] | null,"updated_at"?: string,"user_agent"?: string | null
                  }
                  Update: {
                    "computed_score"?: number,"created_at"?: string,"created_by"?: string | null,"disqualified"?: boolean,"id"?: string,"ip"?: string | null,"lead_id"?: string | null,"merged"?: boolean,"raw"?: NonNullable<Json>,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"submitted_at"?: string,"tier"?: Database["public"]['Enums']["lead_tier"] | null,"updated_at"?: string,"user_agent"?: string | null
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
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
"security_check":
{ Args: Record<PropertyKey, never>; Returns: {
              "problem": string,"table_name": string
            }[]
                           },
"setup_table":
{ Args: { "p_pk"?: string,"p_table": unknown }; Returns: undefined
                           },
"undo_lead_import":
{ Args: { "p_batch_id": string }; Returns: {
              "kept": number,"removed": number
            }[]
                           }
          }
          Enums: {
            "account_role": "owner"|"specialist","app_role": "admin"|"bd"|"account_specialist","lead_event_kind": "created"|"stage_change"|"owner_change"|"note"|"contact"|"form"|"import"|"email"|"whatsapp"|"brevo","lead_stage": "New"|"Contacted"|"Replied"|"Qualified"|"Meeting"|"Sample/Proposal"|"Won"|"Lost","lead_tier": "A"|"B"|"C","market": "EU"|"LATAM"|"US"|"ROW"
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
            "account_role": ["owner", "specialist"],"app_role": ["admin", "bd", "account_specialist"],"lead_event_kind": ["created", "stage_change", "owner_change", "note", "contact", "form", "import", "email", "whatsapp", "brevo"],"lead_stage": ["New", "Contacted", "Replied", "Qualified", "Meeting", "Sample/Proposal", "Won", "Lost"],"lead_tier": ["A", "B", "C"],"market": ["EU", "LATAM", "US", "ROW"]
          }
        }
} as const
