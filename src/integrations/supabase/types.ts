export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_user_id: string
          id: string
          metadata: Json
          mission_id: string
          occurred_at: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id: string
          id?: string
          metadata?: Json
          mission_id: string
          occurred_at?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          id?: string
          metadata?: Json
          mission_id?: string
          occurred_at?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          created_at: string
          display_name: string
          external_ref: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          external_ref?: string | null
          id: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          external_ref?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mission_crew_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          crew_member_id: string
          mission_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          crew_member_id: string
          mission_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          crew_member_id?: string
          mission_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_crew_assignments_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_crew_assignments_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_events: {
        Row: {
          classification: string
          created_at: string
          crew_member_id: string
          event_timestamp: string
          id: string
          idempotency_key: string
          ingested_at: string
          ingested_by: string
          kind: string
          mission_id: string
          payload: Json
          payload_hash: string
          source_id: string
          source_priority: number
          source_version: string
        }
        Insert: {
          classification: string
          created_at: string
          crew_member_id: string
          event_timestamp: string
          id: string
          idempotency_key: string
          ingested_at?: string
          ingested_by: string
          kind: string
          mission_id: string
          payload: Json
          payload_hash: string
          source_id: string
          source_priority: number
          source_version: string
        }
        Update: {
          classification?: string
          created_at?: string
          crew_member_id?: string
          event_timestamp?: string
          id?: string
          idempotency_key?: string
          ingested_at?: string
          ingested_by?: string
          kind?: string
          mission_id?: string
          payload?: Json
          payload_hash?: string
          source_id?: string
          source_priority?: number
          source_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_events_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_invites: {
        Row: {
          active: boolean
          claimed_at: string | null
          claimed_by: string | null
          code_hash: string
          created_at: string
          created_by: string
          crew_member_id: string | null
          expires_at: string
          id: string
          mission_id: string
          role: string
        }
        Insert: {
          active?: boolean
          claimed_at?: string | null
          claimed_by?: string | null
          code_hash: string
          created_at?: string
          created_by: string
          crew_member_id?: string | null
          expires_at: string
          id?: string
          mission_id: string
          role: string
        }
        Update: {
          active?: boolean
          claimed_at?: string | null
          claimed_by?: string | null
          code_hash?: string
          created_at?: string
          created_by?: string
          crew_member_id?: string | null
          expires_at?: string
          id?: string
          mission_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_invites_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_invites_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_memberships: {
        Row: {
          active: boolean
          created_at: string
          crew_member_id: string | null
          id: string
          mission_id: string
          role: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          crew_member_id?: string | null
          id?: string
          mission_id: string
          role: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          crew_member_id?: string | null
          id?: string
          mission_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_memberships_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_memberships_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_research_keys: {
        Row: {
          created_at: string
          mission_id: string
          pseudonym_salt: string
        }
        Insert: {
          created_at?: string
          mission_id: string
          pseudonym_salt?: string
        }
        Update: {
          created_at?: string
          mission_id?: string
          pseudonym_salt?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_research_keys_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          code: string
          created_at: string
          ends_at: string | null
          id: string
          name: string
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          ends_at?: string | null
          id: string
          name: string
          starts_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_mission_invite: { Args: { p_code: string }; Returns: Json }
      can_create_mission: { Args: never; Returns: boolean }
      create_mission_crew_member: {
        Args: {
          p_display_name: string
          p_external_ref?: string
          p_mission_id: string
          p_status?: string
        }
        Returns: Json
      }
      create_mission_invite: {
        Args: {
          p_crew_member_id?: string
          p_expires_in_hours?: number
          p_mission_id: string
          p_role: string
        }
        Returns: Json
      }
      create_mission_operation: {
        Args: { p_code: string; p_name: string; p_starts_at?: string }
        Returns: Json
      }
      deidentify_research_jsonb: { Args: { p_value: Json }; Returns: Json }
      export_research_mission: {
        Args: { p_mission_id: string }
        Returns: Json[]
      }
      get_ground_mission_snapshot: {
        Args: { p_mission_id: string }
        Returns: Json
      }
      get_mission_operations_workspace: {
        Args: { p_mission_id: string }
        Returns: Json
      }
      has_mission_role: {
        Args: { p_mission_id: string; p_roles: string[] }
        Returns: boolean
      }
      ingest_mission_event: {
        Args: { p_event: Json; p_idempotency_key: string }
        Returns: Json
      }
      set_mission_membership_active: {
        Args: {
          p_active: boolean
          p_membership_id: string
          p_mission_id: string
        }
        Returns: Json
      }
      update_mission_crew_member: {
        Args: {
          p_crew_member_id: string
          p_display_name?: string
          p_external_ref?: string
          p_mission_id: string
          p_status?: string
        }
        Returns: Json
      }
      update_mission_operation: {
        Args: {
          p_ends_at?: string
          p_mission_id: string
          p_name?: string
          p_starts_at?: string
          p_status?: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
