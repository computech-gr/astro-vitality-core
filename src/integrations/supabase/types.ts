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
    PostgrestVersion: "14.17"
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
      crew_health_record_index: {
        Row: {
          classification: string
          crew_member_id: string
          event_id: string
          indexed_at: string
          kind: string
          metric_code: string | null
          mission_id: string
          observed_at: string
          source_id: string
        }
        Insert: {
          classification: string
          crew_member_id: string
          event_id: string
          indexed_at?: string
          kind: string
          metric_code?: string | null
          mission_id: string
          observed_at: string
          source_id: string
        }
        Update: {
          classification?: string
          crew_member_id?: string
          event_id?: string
          indexed_at?: string
          kind?: string
          metric_code?: string | null
          mission_id?: string
          observed_at?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_health_record_index_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_health_record_index_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "mission_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_health_record_index_mission_id_fkey"
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
      medical_advisor_review_events: {
        Row: {
          actor_user_id: string
          canonical_evidence: string | null
          created_at: string
          crew_member_id: string
          draft_text: string
          event_type: string
          evidence_sha256: string
          final_text: string
          id: string
          mission_id: string
          model_metadata: Json
          previous_event_id: string | null
          provenance: string
          rationale: string
          request_id: string
          request_sha256: string
          revision: number
          source_record_ids: string[]
        }
        Insert: {
          actor_user_id: string
          canonical_evidence?: string | null
          created_at?: string
          crew_member_id: string
          draft_text: string
          event_type: string
          evidence_sha256: string
          final_text: string
          id?: string
          mission_id: string
          model_metadata?: Json
          previous_event_id?: string | null
          provenance?: string
          rationale: string
          request_id: string
          request_sha256: string
          revision: number
          source_record_ids?: string[]
        }
        Update: {
          actor_user_id?: string
          canonical_evidence?: string | null
          created_at?: string
          crew_member_id?: string
          draft_text?: string
          event_type?: string
          evidence_sha256?: string
          final_text?: string
          id?: string
          mission_id?: string
          model_metadata?: Json
          previous_event_id?: string | null
          provenance?: string
          rationale?: string
          request_id?: string
          request_sha256?: string
          revision?: number
          source_record_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "medical_advisor_review_events_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_advisor_review_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_advisor_review_events_previous_event_id_fkey"
            columns: ["previous_event_id"]
            isOneToOne: false
            referencedRelation: "medical_advisor_review_events"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_ai_quota_reservations: {
        Row: {
          actor_user_id: string
          crew_member_id: string
          id: string
          lease_until: string
          mission_id: string
          released_at: string | null
          reserved_at: string
        }
        Insert: {
          actor_user_id: string
          crew_member_id: string
          id?: string
          lease_until?: string
          mission_id: string
          released_at?: string | null
          reserved_at?: string
        }
        Update: {
          actor_user_id?: string
          crew_member_id?: string
          id?: string
          lease_until?: string
          mission_id?: string
          released_at?: string | null
          reserved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_ai_quota_reservations_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_ai_quota_reservations_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_demo_attempts: {
        Row: {
          actor_id: string
          dispatched_at: string | null
          evidence_sha: string
          finished_at: string | null
          hold_microusd: number
          id: string
          nonce_sha: string
          outcome: string
          quota_id: string
          reserved_at: string
          usage_microusd: number | null
        }
        Insert: {
          actor_id: string
          dispatched_at?: string | null
          evidence_sha: string
          finished_at?: string | null
          hold_microusd?: number
          id?: string
          nonce_sha: string
          outcome?: string
          quota_id: string
          reserved_at?: string
          usage_microusd?: number | null
        }
        Update: {
          actor_id?: string
          dispatched_at?: string | null
          evidence_sha?: string
          finished_at?: string | null
          hold_microusd?: number
          id?: string
          nonce_sha?: string
          outcome?: string
          quota_id?: string
          reserved_at?: string
          usage_microusd?: number | null
        }
        Relationships: []
      }
      medical_demo_authorization: {
        Row: {
          active_attempt: string | null
          actor_id: string
          attempts: number
          authorization_ref: string
          authorized_at: string
          disabled_at: string | null
          disabled_by: string | null
          enabled: boolean
          ends_at: string
          evidence_sha: string
          held_microusd: number
          membership_id: string
          operator_id: string
          singleton: boolean
          starts_at: string
        }
        Insert: {
          active_attempt?: string | null
          actor_id: string
          attempts?: number
          authorization_ref: string
          authorized_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          enabled?: boolean
          ends_at: string
          evidence_sha: string
          held_microusd?: number
          membership_id: string
          operator_id: string
          singleton?: boolean
          starts_at: string
        }
        Update: {
          active_attempt?: string | null
          actor_id?: string
          attempts?: number
          authorization_ref?: string
          authorized_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          enabled?: boolean
          ends_at?: string
          evidence_sha?: string
          held_microusd?: number
          membership_id?: string
          operator_id?: string
          singleton?: boolean
          starts_at?: string
        }
        Relationships: []
      }
      medical_demo_control_audit: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          id: string
          reference: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          id?: string
          reference: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          id?: string
          reference?: string
        }
        Relationships: []
      }
      medical_research_attempts: {
        Row: {
          actor_id: string
          dispatched_at: string | null
          estimated_usage_microusd: number | null
          evidence_sha: string
          finished_at: string | null
          hold_microusd: number
          id: string
          input_tokens: number | null
          month: string
          nonce_sha: string
          outcome: string
          output_tokens: number | null
          provider_request_id: string | null
          quota_id: string
          reserved_at: string
        }
        Insert: {
          actor_id: string
          dispatched_at?: string | null
          estimated_usage_microusd?: number | null
          evidence_sha: string
          finished_at?: string | null
          hold_microusd?: number
          id?: string
          input_tokens?: number | null
          month: string
          nonce_sha: string
          outcome?: string
          output_tokens?: number | null
          provider_request_id?: string | null
          quota_id: string
          reserved_at?: string
        }
        Update: {
          actor_id?: string
          dispatched_at?: string | null
          estimated_usage_microusd?: number | null
          evidence_sha?: string
          finished_at?: string | null
          hold_microusd?: number
          id?: string
          input_tokens?: number | null
          month?: string
          nonce_sha?: string
          outcome?: string
          output_tokens?: number | null
          provider_request_id?: string | null
          quota_id?: string
          reserved_at?: string
        }
        Relationships: []
      }
      medical_research_audit: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          details: Json
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          details: Json
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          details?: Json
          id?: string
        }
        Relationships: []
      }
      medical_research_owners: {
        Row: {
          granted_at: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medical_research_policy: {
        Row: {
          active_attempt: string | null
          budget_microusd: number
          enabled: boolean
          evidence_sha: string
          provider_project: string | null
          revision: number
          rolling_limit: number
          rolling_seconds: number
          singleton: boolean
          sync_required: boolean
          updated_at: string
        }
        Insert: {
          active_attempt?: string | null
          budget_microusd?: number
          enabled?: boolean
          evidence_sha: string
          provider_project?: string | null
          revision?: number
          rolling_limit?: number
          rolling_seconds?: number
          singleton?: boolean
          sync_required?: boolean
          updated_at?: string
        }
        Update: {
          active_attempt?: string | null
          budget_microusd?: number
          enabled?: boolean
          evidence_sha?: string
          provider_project?: string | null
          revision?: number
          rolling_limit?: number
          rolling_seconds?: number
          singleton?: boolean
          sync_required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      medical_research_provider_sync: {
        Row: {
          month: string
          project_id: string
          provider_input_tokens: number
          provider_output_tokens: number
          provider_requests: number
          recorded_microusd: number
          reported_until: string
          synchronized_at: string
        }
        Insert: {
          month: string
          project_id: string
          provider_input_tokens: number
          provider_output_tokens: number
          provider_requests: number
          recorded_microusd: number
          reported_until: string
          synchronized_at?: string
        }
        Update: {
          month?: string
          project_id?: string
          provider_input_tokens?: number
          provider_output_tokens?: number
          provider_requests?: number
          recorded_microusd?: number
          reported_until?: string
          synchronized_at?: string
        }
        Relationships: []
      }
      medical_v3_fixture_observations: {
        Row: {
          domain: string
          id: string
          metric_id: string
          observed_at: string
          source_id: string
          supersedes_id: string | null
          unit: string
          value: string
        }
        Insert: {
          domain: string
          id: string
          metric_id: string
          observed_at: string
          source_id: string
          supersedes_id?: string | null
          unit: string
          value: string
        }
        Update: {
          domain?: string
          id?: string
          metric_id?: string
          observed_at?: string
          source_id?: string
          supersedes_id?: string | null
          unit?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_v3_fixture_observations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "medical_v3_fixture_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_v3_fixture_observations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "medical_v3_fixture_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_v3_fixture_receipts: {
        Row: {
          catalog_sha256: string
          decision: string
          id: string
          observation_id: string
          previous_id: string | null
          receipt_kind: string
          reviewed_at: string
          revision: number
          source_sha256: string
        }
        Insert: {
          catalog_sha256: string
          decision: string
          id: string
          observation_id: string
          previous_id?: string | null
          receipt_kind: string
          reviewed_at: string
          revision: number
          source_sha256: string
        }
        Update: {
          catalog_sha256?: string
          decision?: string
          id?: string
          observation_id?: string
          previous_id?: string | null
          receipt_kind?: string
          reviewed_at?: string
          revision?: number
          source_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_v3_fixture_receipts_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "medical_v3_fixture_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_v3_fixture_receipts_previous_id_fkey"
            columns: ["previous_id"]
            isOneToOne: false
            referencedRelation: "medical_v3_fixture_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_v3_fixture_sources: {
        Row: {
          catalog_sha256: string
          crew_member_id: string
          id: string
          literal_document: Json
          mission_id: string
          provenance: string
          source_sha256: string
          version: string
        }
        Insert: {
          catalog_sha256: string
          crew_member_id: string
          id: string
          literal_document: Json
          mission_id: string
          provenance: string
          source_sha256: string
          version: string
        }
        Update: {
          catalog_sha256?: string
          crew_member_id?: string
          id?: string
          literal_document?: Json
          mission_id?: string
          provenance?: string
          source_sha256?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_v3_fixture_sources_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_v3_fixture_sources_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_bootstrap_control: {
        Row: {
          armed_at: string
          consumed_at: string | null
          consumed_by: string | null
          mission_id: string | null
          secret_hash: string
          singleton: boolean
        }
        Insert: {
          armed_at?: string
          consumed_at?: string | null
          consumed_by?: string | null
          mission_id?: string | null
          secret_hash: string
          singleton?: boolean
        }
        Update: {
          armed_at?: string
          consumed_at?: string | null
          consumed_by?: string | null
          mission_id?: string | null
          secret_hash?: string
          singleton?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "mission_bootstrap_control_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
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
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          claimed_at: string | null
          claimed_by: string | null
          code_hash: string
          created_at: string
          created_by: string
          crew_member_id: string | null
          expires_at: string
          id: string
          intended_recipient_email: string | null
          intended_recipient_user_id: string | null
          mission_id: string
          recipient_bound_at: string | null
          recipient_bound_by: string | null
          role: string
        }
        Insert: {
          active?: boolean
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          code_hash: string
          created_at?: string
          created_by: string
          crew_member_id?: string | null
          expires_at: string
          id?: string
          intended_recipient_email?: string | null
          intended_recipient_user_id?: string | null
          mission_id: string
          recipient_bound_at?: string | null
          recipient_bound_by?: string | null
          role: string
        }
        Update: {
          active?: boolean
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          code_hash?: string
          created_at?: string
          created_by?: string
          crew_member_id?: string | null
          expires_at?: string
          id?: string
          intended_recipient_email?: string | null
          intended_recipient_user_id?: string | null
          mission_id?: string
          recipient_bound_at?: string | null
          recipient_bound_by?: string | null
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
      mission_research_snapshots: {
        Row: {
          crew_count: number
          event_count: number
          frozen_at: string
          mission_id: string
          policy: string
        }
        Insert: {
          crew_count: number
          event_count: number
          frozen_at: string
          mission_id: string
          policy?: string
        }
        Update: {
          crew_count?: number
          event_count?: number
          frozen_at?: string
          mission_id?: string
          policy?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_research_snapshots_mission_id_fkey"
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
      observation_sync_events: {
        Row: {
          cipher_alg: string
          ciphertext: string
          crew_member_id: string
          event_id: string
          event_kind: string
          fingerprint: string
          iv: string
          key_version: number
          mission_id: string
          observation_id: string
          provenance: string
          received_at: string
          received_seq: number
          uploaded_by: string
        }
        Insert: {
          cipher_alg: string
          ciphertext: string
          crew_member_id: string
          event_id: string
          event_kind: string
          fingerprint: string
          iv: string
          key_version: number
          mission_id: string
          observation_id: string
          provenance: string
          received_at?: string
          received_seq?: never
          uploaded_by: string
        }
        Update: {
          cipher_alg?: string
          ciphertext?: string
          crew_member_id?: string
          event_id?: string
          event_kind?: string
          fingerprint?: string
          iv?: string
          key_version?: number
          mission_id?: string
          observation_id?: string
          provenance?: string
          received_at?: string
          received_seq?: never
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_sync_events_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_sync_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      p36_biomarker_review_batches: {
        Row: {
          classification: string
          created_at: string
          crew_member_id: string
          decision_authorization_basis: string | null
          decision_idempotency_key: string | null
          decision_payload_hash: string | null
          decision_received_at: string | null
          decision_request_id: string | null
          id: string
          idempotency_key: string | null
          mission_id: string
          observation_date: string
          request_payload_hash: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          reviewed_by_user_snapshot: string | null
          source_filename: string
          source_fingerprint: string
          status: string
          submitted_by_membership_id: string
          submitted_by_user_snapshot: string
        }
        Insert: {
          classification?: string
          created_at?: string
          crew_member_id: string
          decision_authorization_basis?: string | null
          decision_idempotency_key?: string | null
          decision_payload_hash?: string | null
          decision_received_at?: string | null
          decision_request_id?: string | null
          id?: string
          idempotency_key?: string | null
          mission_id: string
          observation_date: string
          request_payload_hash?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          reviewed_by_user_snapshot?: string | null
          source_filename: string
          source_fingerprint: string
          status?: string
          submitted_by_membership_id: string
          submitted_by_user_snapshot: string
        }
        Update: {
          classification?: string
          created_at?: string
          crew_member_id?: string
          decision_authorization_basis?: string | null
          decision_idempotency_key?: string | null
          decision_payload_hash?: string | null
          decision_received_at?: string | null
          decision_request_id?: string | null
          id?: string
          idempotency_key?: string | null
          mission_id?: string
          observation_date?: string
          request_payload_hash?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          reviewed_by_user_snapshot?: string | null
          source_filename?: string
          source_fingerprint?: string
          status?: string
          submitted_by_membership_id?: string
          submitted_by_user_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "p36_biomarker_review_batches_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p36_biomarker_review_batches_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p36_biomarker_review_batches_reviewed_by_membership_id_fkey"
            columns: ["reviewed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "mission_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p36_biomarker_review_batches_submitted_by_membership_id_fkey"
            columns: ["submitted_by_membership_id"]
            isOneToOne: false
            referencedRelation: "mission_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      p36_biomarker_review_events: {
        Row: {
          authorization_basis: string
          batch_id: string
          decision_note: string | null
          decision_request_id: string
          event_type: string
          id: string
          mission_id: string
          occurred_at: string
          previous_status: string
          resulting_status: string
          reviewer_membership_id: string
          reviewer_user_snapshot: string
          server_received_at: string
          source_fingerprint: string
          submitter_membership_id: string
          submitter_user_snapshot: string
        }
        Insert: {
          authorization_basis: string
          batch_id: string
          decision_note?: string | null
          decision_request_id: string
          event_type: string
          id?: string
          mission_id: string
          occurred_at?: string
          previous_status: string
          resulting_status: string
          reviewer_membership_id: string
          reviewer_user_snapshot: string
          server_received_at: string
          source_fingerprint: string
          submitter_membership_id: string
          submitter_user_snapshot: string
        }
        Update: {
          authorization_basis?: string
          batch_id?: string
          decision_note?: string | null
          decision_request_id?: string
          event_type?: string
          id?: string
          mission_id?: string
          occurred_at?: string
          previous_status?: string
          resulting_status?: string
          reviewer_membership_id?: string
          reviewer_user_snapshot?: string
          server_received_at?: string
          source_fingerprint?: string
          submitter_membership_id?: string
          submitter_user_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "p36_biomarker_review_events_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "p36_biomarker_review_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p36_biomarker_review_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p36_biomarker_review_events_reviewer_membership_id_fkey"
            columns: ["reviewer_membership_id"]
            isOneToOne: false
            referencedRelation: "mission_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p36_biomarker_review_events_submitter_membership_id_fkey"
            columns: ["submitter_membership_id"]
            isOneToOne: false
            referencedRelation: "mission_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      p36_biomarker_review_items: {
        Row: {
          batch_id: string
          disposition: string
          id: string
          measured_value: number
          metric_id: string
          source_excerpt: string
          unit: string
        }
        Insert: {
          batch_id: string
          disposition?: string
          id?: string
          measured_value: number
          metric_id: string
          source_excerpt: string
          unit: string
        }
        Update: {
          batch_id?: string
          disposition?: string
          id?: string
          measured_value?: number
          metric_id?: string
          source_excerpt?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "p36_biomarker_review_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "p36_biomarker_review_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      p36_dynamic_admission: {
        Row: {
          authorization_open: boolean
          change_note: string
          changed_at: string
          handoff_open: boolean
          singleton: boolean
        }
        Insert: {
          authorization_open?: boolean
          change_note?: string
          changed_at?: string
          handoff_open?: boolean
          singleton?: boolean
        }
        Update: {
          authorization_open?: boolean
          change_note?: string
          changed_at?: string
          handoff_open?: boolean
          singleton?: boolean
        }
        Relationships: []
      }
      p36_dynamic_authorization_events: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string
          authority_mission_id: string
          crew_member_id: string
          event_hash: string
          event_id: string
          kind: string
          payload_canonical: string
          payload_sha256: string
          prev_event_hash: string
          provenance: string
          received_at: string
          received_seq: number
          references_recommendation_id: string | null
          submission_id: string
          supersedes_event_id: string | null
          term_id: string
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id: string
          authority_mission_id: string
          crew_member_id: string
          event_hash: string
          event_id: string
          kind: string
          payload_canonical: string
          payload_sha256: string
          prev_event_hash: string
          provenance: string
          received_at?: string
          received_seq?: never
          references_recommendation_id?: string | null
          submission_id: string
          supersedes_event_id?: string | null
          term_id: string
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string
          authority_mission_id?: string
          crew_member_id?: string
          event_hash?: string
          event_id?: string
          kind?: string
          payload_canonical?: string
          payload_sha256?: string
          prev_event_hash?: string
          provenance?: string
          received_at?: string
          received_seq?: never
          references_recommendation_id?: string | null
          submission_id?: string
          supersedes_event_id?: string | null
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p36_dynamic_authorization_events_authority_mission_id_fkey"
            columns: ["authority_mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p36_dynamic_authorization_events_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
        ]
      }
      p36_dynamic_handoff_submissions: {
        Row: {
          crew_member_id: string
          mission_id: string
          payload_canonical: string
          payload_sha256: string
          provenance: string
          received_at: string
          received_seq: number
          request_id: string
          submission_id: string
          submitted_by: string
          submitted_role: string
        }
        Insert: {
          crew_member_id: string
          mission_id: string
          payload_canonical: string
          payload_sha256: string
          provenance: string
          received_at?: string
          received_seq?: never
          request_id: string
          submission_id?: string
          submitted_by: string
          submitted_role: string
        }
        Update: {
          crew_member_id?: string
          mission_id?: string
          payload_canonical?: string
          payload_sha256?: string
          provenance?: string
          received_at?: string
          received_seq?: never
          request_id?: string
          submission_id?: string
          submitted_by?: string
          submitted_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "p36_dynamic_handoff_submissions_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p36_dynamic_handoff_submissions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      p36_dynamic_handoff_terms: {
        Row: {
          metadata: Json
          submission_id: string
          term_id: string
        }
        Insert: {
          metadata: Json
          submission_id: string
          term_id: string
        }
        Update: {
          metadata?: Json
          submission_id?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p36_dynamic_handoff_terms_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "p36_dynamic_handoff_submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      p36_dynamic_source_validation: {
        Row: {
          canonical_metric_id: string
          crew_member_id: string
          exact_unit: string
          method: string
          mission_id: string
          protocol: string
          protocol_version: string
          provenance: string
          source_sha256: string
          specimen: string
          term_id: string
          validation_reference: string
          verified_at: string
          verified_by: string
        }
        Insert: {
          canonical_metric_id: string
          crew_member_id: string
          exact_unit: string
          method: string
          mission_id: string
          protocol: string
          protocol_version: string
          provenance: string
          source_sha256: string
          specimen: string
          term_id: string
          validation_reference: string
          verified_at: string
          verified_by: string
        }
        Update: {
          canonical_metric_id?: string
          crew_member_id?: string
          exact_unit?: string
          method?: string
          mission_id?: string
          protocol?: string
          protocol_version?: string
          provenance?: string
          source_sha256?: string
          specimen?: string
          term_id?: string
          validation_reference?: string
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "p36_dynamic_source_validation_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p36_dynamic_source_validation_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      p36_global_review_audit: {
        Row: {
          access_basis: string | null
          action: string
          actor_id: string | null
          at: string
          details: Json
          id: string
          mission_id: string | null
          provenance: string | null
          row_count: number
        }
        Insert: {
          access_basis?: string | null
          action: string
          actor_id?: string | null
          at?: string
          details?: Json
          id?: string
          mission_id?: string | null
          provenance?: string | null
          row_count?: number
        }
        Update: {
          access_basis?: string | null
          action?: string
          actor_id?: string | null
          at?: string
          details?: Json
          id?: string
          mission_id?: string | null
          provenance?: string | null
          row_count?: number
        }
        Relationships: []
      }
      p36_global_scientific_reviewers: {
        Row: {
          authorization_ref: string
          granted_at: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          authorization_ref: string
          granted_at?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          authorization_ref?: string
          granted_at?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      p36_metric_unit_catalog: {
        Row: {
          metric_id: string
          unit: string
        }
        Insert: {
          metric_id: string
          unit: string
        }
        Update: {
          metric_id?: string
          unit?: string
        }
        Relationships: []
      }
      p36_mission_scientific_sharing: {
        Row: {
          changed_at: string
          mission_id: string
          permitted_provenance: string[]
          policy_ref: string
        }
        Insert: {
          changed_at?: string
          mission_id: string
          permitted_provenance: string[]
          policy_ref: string
        }
        Update: {
          changed_at?: string
          mission_id?: string
          permitted_provenance?: string[]
          policy_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "p36_mission_scientific_sharing_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sync_attestation_events: {
        Row: {
          action: string
          actor_user_id: string
          badge: string
          batch_id: string
          crew_member_id: string
          decided_at: string
          event_id: string
          metric_id: string
          mission_id: string
          provenance: string
          reason: string
          received_at: string
          received_seq: number
          record_fingerprint: string
          record_id: string
          supersedes_event_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          badge: string
          batch_id: string
          crew_member_id: string
          decided_at: string
          event_id: string
          metric_id: string
          mission_id: string
          provenance: string
          reason: string
          received_at?: string
          received_seq?: never
          record_fingerprint: string
          record_id: string
          supersedes_event_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          badge?: string
          batch_id?: string
          crew_member_id?: string
          decided_at?: string
          event_id?: string
          metric_id?: string
          mission_id?: string
          provenance?: string
          reason?: string
          received_at?: string
          received_seq?: never
          record_fingerprint?: string
          record_id?: string
          supersedes_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_sync_attestation_events_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sync_attestation_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sync_correction_events: {
        Row: {
          actor_user_id: string
          corrected_record_id: string
          crew_member_id: string
          decided_at: string
          intent_id: string
          metric_id: string
          mission_id: string
          original_record_id: string
          provenance: string
          reason: string
          received_at: string
          received_seq: number
        }
        Insert: {
          actor_user_id: string
          corrected_record_id: string
          crew_member_id: string
          decided_at: string
          intent_id: string
          metric_id: string
          mission_id: string
          original_record_id: string
          provenance: string
          reason: string
          received_at?: string
          received_seq?: never
        }
        Update: {
          actor_user_id?: string
          corrected_record_id?: string
          crew_member_id?: string
          decided_at?: string
          intent_id?: string
          metric_id?: string
          mission_id?: string
          original_record_id?: string
          provenance?: string
          reason?: string
          received_at?: string
          received_seq?: never
        }
        Relationships: [
          {
            foreignKeyName: "review_sync_correction_events_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_sync_correction_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_mission_invite: { Args: { p_code: string }; Returns: Json }
      approve_mission_invite: {
        Args: { p_expected_recipient_email: string; p_invite_id: string }
        Returns: Json
      }
      assign_existing_crew_to_mission: {
        Args: {
          p_crew_member_id: string
          p_source_mission_id: string
          p_target_mission_id: string
        }
        Returns: Json
      }
      bind_mission_invite_recipient: {
        Args: { p_invite_id: string; p_recipient_email: string }
        Returns: Json
      }
      bootstrap_first_mission: {
        Args: {
          p_bootstrap_secret: string
          p_code: string
          p_name: string
          p_starts_at?: string
        }
        Returns: Json
      }
      can_create_mission: { Args: never; Returns: boolean }
      configure_mission_bootstrap: {
        Args: { p_secret_hash: string }
        Returns: Json
      }
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
      get_mission_audit_log: {
        Args: {
          p_action?: string
          p_cursor?: string
          p_from?: string
          p_limit?: number
          p_mission_id: string
          p_outcome?: string
          p_search?: string
          p_to?: string
        }
        Returns: Json
      }
      get_mission_bootstrap_status: { Args: never; Returns: Json }
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
      medical_demo_authorize: {
        Args: {
          p_end: string
          p_operator: string
          p_ref: string
          p_sha: string
          p_start: string
        }
        Returns: undefined
      }
      medical_demo_disable: { Args: { p_ref: string }; Returns: undefined }
      medical_demo_dispatch: {
        Args: { p_attempt: string; p_nonce: string; p_sha: string }
        Returns: boolean
      }
      medical_demo_finish: {
        Args: { p_attempt: string; p_nonce: string; p_usage: number }
        Returns: boolean
      }
      medical_demo_reserve: {
        Args: { p_nonce: string; p_sha: string }
        Returns: Json
      }
      medical_demo_scope: { Args: never; Returns: boolean }
      medical_demo_status: { Args: never; Returns: Json }
      medical_research_audit_log: { Args: never; Returns: Json }
      medical_research_configure: {
        Args: {
          p_budget: number
          p_enabled: boolean
          p_limit: number
          p_project: string
          p_ref: string
          p_revision: number
          p_seconds: number
          p_sync: boolean
        }
        Returns: undefined
      }
      medical_research_dispatch: {
        Args: { p_attempt: string; p_nonce: string; p_sha: string }
        Returns: boolean
      }
      medical_research_finish: {
        Args: {
          p_attempt: string
          p_input: number
          p_nonce: string
          p_outcome: string
          p_output: number
          p_request: string
          p_usage: number
        }
        Returns: boolean
      }
      medical_research_is_owner: { Args: never; Returns: boolean }
      medical_research_pause: { Args: { p_ref: string }; Returns: undefined }
      medical_research_provision: {
        Args: { p_owner: string; p_sha: string }
        Returns: undefined
      }
      medical_research_record_sync: {
        Args: {
          p_actor: string
          p_cost: number
          p_input: number
          p_month: string
          p_output: number
          p_project: string
          p_requests: number
          p_until: string
        }
        Returns: undefined
      }
      medical_research_reserve: {
        Args: { p_nonce: string; p_sha: string }
        Returns: Json
      }
      medical_research_resolve: {
        Args: { p_attempt: string; p_ref: string }
        Returns: undefined
      }
      medical_research_status: { Args: never; Returns: Json }
      medical_v3_ai_evidence: {
        Args: { p_crew: string; p_mission: string }
        Returns: Json
      }
      medical_v3_append_review: {
        Args: {
          p_crew: string
          p_draft: string
          p_final: string
          p_mission: string
          p_previous: string
          p_rationale: string
          p_request: string
          p_sha: string
          p_type: string
        }
        Returns: Json
      }
      medical_v3_authoritative_evidence: {
        Args: { p_crew: string; p_mission: string }
        Returns: {
          canonical_text: string
          source_ids: string[]
        }[]
      }
      medical_v3_canonical_json: { Args: { p: Json }; Returns: string }
      medical_v3_fixture_scope: {
        Args: never
        Returns: {
          crew_member_id: string
          mission_id: string
        }[]
      }
      medical_v3_fixture_snapshot: { Args: never; Returns: Json }
      medical_v3_fixture_text_valid: {
        Args: { p_canonical: string; p_text: string }
        Returns: boolean
      }
      medical_v3_has_scope: {
        Args: { p_crew: string; p_mission: string }
        Returns: boolean
      }
      medical_v3_release_ai: {
        Args: { p_reservation: string }
        Returns: undefined
      }
      medical_v3_reserve_ai: {
        Args: { p_crew: string; p_mission: string }
        Returns: Json
      }
      medical_v3_review_history: {
        Args: { p_crew: string; p_mission: string }
        Returns: Json
      }
      mission_role_conflict: {
        Args: {
          p_exclude?: string
          p_mission_id: string
          p_role: string
          p_user_id: string
        }
        Returns: string
      }
      mission_roles_compatible: {
        Args: { p_a: string; p_b: string }
        Returns: boolean
      }
      observation_sync_append_v1: {
        Args: {
          p_crew_member_id: string
          p_events: Json
          p_mission_id: string
          p_provenance: string
          p_real_data_confirmed: boolean
        }
        Returns: Json
      }
      observation_sync_can_access: {
        Args: { p_crew_member_id: string; p_mission_id: string }
        Returns: boolean
      }
      observation_sync_list_v1: {
        Args: {
          p_after_seq: number
          p_crew_member_id: string
          p_limit: number
          p_mission_id: string
          p_provenance: string
        }
        Returns: Json
      }
      p36_dynamic_auth_append_v1: {
        Args: {
          p_crew_member_id: string
          p_mission_id: string
          p_payload_canonical: string
          p_payload_sha256: string
          p_provenance: string
          p_submission_id: string
        }
        Returns: Json
      }
      p36_dynamic_auth_event_hash: {
        Args: {
          p_actor: string
          p_mission: string
          p_prev: string
          p_role: string
          p_sha: string
          p_term: string
        }
        Returns: string
      }
      p36_dynamic_auth_has_role: {
        Args: { p_mission_id: string; p_roles: string[] }
        Returns: boolean
      }
      p36_dynamic_auth_list_v1: {
        Args: {
          p_after_seq: number
          p_crew_member_id: string
          p_limit: number
          p_mission_id: string
          p_provenance: string
        }
        Returns: Json
      }
      p36_dynamic_crew_roster_v1: {
        Args: { p_mission_id: string }
        Returns: {
          crew_member_id: string
          display_name: string
          mission_id: string
        }[]
      }
      p36_dynamic_handoff_append_v1: {
        Args: {
          p_crew_member_id: string
          p_mission_id: string
          p_payload_canonical: string
          p_payload_sha256: string
          p_provenance: string
          p_request_id: string
        }
        Returns: Json
      }
      p36_dynamic_handoff_list_v1: {
        Args: {
          p_after_seq: number
          p_crew_member_id: string
          p_limit: number
          p_mission_id: string
          p_provenance: string
        }
        Returns: Json
      }
      p36_dynamic_scope: {
        Args: { p_crew: string; p_mission: string; p_write: boolean }
        Returns: string
      }
      p36_global_review_basis: {
        Args: { p_mission: string; p_provenance: string }
        Returns: string
      }
      p36_global_review_list_v1: {
        Args: {
          p_after_seq: number
          p_limit: number
          p_mission_id: string
          p_provenance: string
        }
        Returns: Json
      }
      p36_global_review_missions_v1: {
        Args: { p_provenance: string }
        Returns: Json
      }
      p36_list_synthetic_review_history: {
        Args: { p_crew_member_id: string; p_mission_id: string }
        Returns: {
          batch_id: string
          created_at: string
          item_count: number
          observed_on: string
          review_status: string
        }[]
      }
      p36_submit_synthetic_review_batch: {
        Args: {
          p_crew_member_id: string
          p_idempotency_key: string
          p_items: Json
          p_mission_id: string
          p_observed_on: string
          p_source_filename: string
          p_source_sha256: string
          p_synthetic_attestation: boolean
        }
        Returns: Json
      }
      p368_decide_ground_medical_batch: {
        Args: {
          p_batch_id: string
          p_decision: string
          p_expected_item_count: number
          p_idempotency_key: string
          p_mission_id: string
          p_note: string
        }
        Returns: Json
      }
      p368_get_ground_medical_batch: {
        Args: { p_batch_id: string; p_mission_id: string }
        Returns: {
          batch_id: string
          crew_member_id: string
          measured_value: number
          metric_id: string
          observed_on: string
          review_status: string
          source_excerpt: string
          submitted_at: string
          unit: string
        }[]
      }
      p368_list_ground_medical_pending: {
        Args: { p_mission_id: string }
        Returns: {
          batch_id: string
          crew_member_id: string
          item_count: number
          observed_on: string
          review_status: string
          submitted_at: string
        }[]
      }
      review_sync_append_v1: {
        Args: {
          p_attestations: Json
          p_corrections: Json
          p_crew_member_id: string
          p_mission_id: string
          p_provenance: string
        }
        Returns: Json
      }
      review_sync_can_read: {
        Args: { p_crew_member_id: string; p_mission_id: string }
        Returns: boolean
      }
      review_sync_is_ground_medical: {
        Args: { p_crew_member_id: string; p_mission_id: string }
        Returns: boolean
      }
      review_sync_list_v1: {
        Args: {
          p_after_seq: number
          p_crew_member_id: string
          p_kind: string
          p_limit: number
          p_mission_id: string
          p_provenance: string
        }
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
