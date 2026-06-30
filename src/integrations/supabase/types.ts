export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      archive_settings: {
        Row: {
          id: string
          last_updated: string | null
          preferences: Json | null
          user_id: string | null
        }
        Insert: {
          id?: string
          last_updated?: string | null
          preferences?: Json | null
          user_id?: string | null
        }
        Update: {
          id?: string
          last_updated?: string | null
          preferences?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "archive_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_settings: {
        Row: {
          id: string
          last_updated: string | null
          layout: Json | null
          user_id: string
          widget_order: string[] | null
        }
        Insert: {
          id?: string
          last_updated?: string | null
          layout?: Json | null
          user_id: string
          widget_order?: string[] | null
        }
        Update: {
          id?: string
          last_updated?: string | null
          layout?: Json | null
          user_id?: string
          widget_order?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_visibility_settings: {
        Row: {
          id: string
          last_updated: string | null
          options: Json | null
          user_id: string
        }
        Insert: {
          id?: string
          last_updated?: string | null
          options?: Json | null
          user_id: string
        }
        Update: {
          id?: string
          last_updated?: string | null
          options?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_visibility_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          id: string
          source_bank: string
          rate_type: string
          usd_to_sdg: number
          fetched_at: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          source_bank: string
          rate_type?: string
          usd_to_sdg: number
          fetched_at?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          source_bank?: string
          rate_type?: string
          usd_to_sdg?: number
          fetched_at?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      field_team_settings: {
        Row: {
          coordinator_id: string | null
          id: string
          last_updated: string | null
          preferences: Json | null
          team_id: string | null
        }
        Insert: {
          coordinator_id?: string | null
          id?: string
          last_updated?: string | null
          preferences?: Json | null
          team_id?: string | null
        }
        Update: {
          coordinator_id?: string | null
          id?: string
          last_updated?: string | null
          preferences?: Json | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_team_settings_coordinator_id_fkey"
            columns: ["coordinator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mmp_files: {
        Row: {
          approval_workflow: Json | null
          approvedat: string | null
          approvedby: string | null
          archivedat: string | null
          archivedby: string | null
          cpverification: Json | null
          created_at: string | null
          deletedat: string | null
          deletedby: string | null
          description: string | null
          documents: Json | null
          entries: number
          expirydate: string | null
          file_url: string | null
          financial: Json | null
          id: string
          location: Json | null
          mmp_id: string | null
          modificationhistory: Json[] | null
          month: number | null
          name: string
          performance: Json | null
          permits: Json | null
          processed_entries: number | null
          projectname: string | null
          region: string | null
          rejectionreason: string | null
          site_entries: Json | null
          sitevisit: Json | null
          status: string
          team: Json | null
          type: string | null
          updated_at: string | null
          uploaded_at: string | null
          uploaded_by: string | null
          version: Json | null
          workflow: Json | null
          year: number | null
        }
        Insert: {
          approval_workflow?: Json | null
          approvedat?: string | null
          approvedby?: string | null
          archivedat?: string | null
          archivedby?: string | null
          cpverification?: Json | null
          created_at?: string | null
          deletedat?: string | null
          deletedby?: string | null
          description?: string | null
          documents?: Json | null
          entries?: number
          expirydate?: string | null
          file_url?: string | null
          financial?: Json | null
          id?: string
          location?: Json | null
          mmp_id?: string | null
          modificationhistory?: Json[] | null
          month?: number | null
          name: string
          performance?: Json | null
          permits?: Json | null
          processed_entries?: number | null
          projectname?: string | null
          region?: string | null
          rejectionreason?: string | null
          site_entries?: Json | null
          sitevisit?: Json | null
          status?: string
          team?: Json | null
          type?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          version?: Json | null
          workflow?: Json | null
          year?: number | null
        }
        Update: {
          approval_workflow?: Json | null
          approvedat?: string | null
          approvedby?: string | null
          archivedat?: string | null
          archivedby?: string | null
          cpverification?: Json | null
          created_at?: string | null
          deletedat?: string | null
          deletedby?: string | null
          description?: string | null
          documents?: Json | null
          entries?: number
          expirydate?: string | null
          file_url?: string | null
          financial?: Json | null
          id?: string
          location?: Json | null
          mmp_id?: string | null
          modificationhistory?: Json[] | null
          month?: number | null
          name?: string
          performance?: Json | null
          permits?: Json | null
          processed_entries?: number | null
          projectname?: string | null
          region?: string | null
          rejectionreason?: string | null
          site_entries?: Json | null
          sitevisit?: Json | null
          status?: string
          team?: Json | null
          type?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          version?: Json | null
          workflow?: Json | null
          year?: number | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          id: string
          name: string
          description: string | null
          parent_department_id: string | null
          manager_user_id: string | null
          hub_id: string | null
          color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          parent_department_id?: string | null
          manager_user_id?: string | null
          hub_id?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          parent_department_id?: string | null
          manager_user_id?: string | null
          hub_id?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_cost_submissions: {
        Row: {
          id: string
          expense_category: string
          amount_cents: number
          currency: string | null
          description: string | null
          expense_date: string | null
          vendor: string | null
          reference_number: string | null
          hub_id: string | null
          project_id: string | null
          submitted_by: string
          submitter_role: string | null
          supporting_documents: Json | null
          status: string | null
          tier1_status: string | null
          tier1_approved_by: string | null
          tier1_approved_at: string | null
          tier1_notes: string | null
          tier2_status: string | null
          tier2_approved_by: string | null
          tier2_approved_at: string | null
          tier2_notes: string | null
          rejection_reason: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          expense_category: string
          amount_cents: number
          currency?: string | null
          description?: string | null
          expense_date?: string | null
          vendor?: string | null
          reference_number?: string | null
          hub_id?: string | null
          project_id?: string | null
          submitted_by: string
          submitter_role?: string | null
          supporting_documents?: Json | null
          status?: string | null
          tier1_status?: string | null
          tier1_approved_by?: string | null
          tier1_approved_at?: string | null
          tier1_notes?: string | null
          tier2_status?: string | null
          tier2_approved_by?: string | null
          tier2_approved_at?: string | null
          tier2_notes?: string | null
          rejection_reason?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          expense_category?: string
          amount_cents?: number
          currency?: string | null
          description?: string | null
          expense_date?: string | null
          vendor?: string | null
          reference_number?: string | null
          hub_id?: string | null
          project_id?: string | null
          submitted_by?: string
          submitter_role?: string | null
          supporting_documents?: Json | null
          status?: string | null
          tier1_status?: string | null
          tier1_approved_by?: string | null
          tier1_approved_at?: string | null
          tier1_notes?: string | null
          tier2_status?: string | null
          tier2_approved_by?: string | null
          tier2_approved_at?: string | null
          tier2_notes?: string | null
          rejection_reason?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_cost_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_fund_approval_steps: {
        Row: {
          id: string
          pre_fund_request_id: string
          step_order: number
          step_label: string
          assigned_user_id: string | null
          is_required: boolean
          status: string
          approved_at: string | null
          approved_by: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          pre_fund_request_id: string
          step_order?: number
          step_label: string
          assigned_user_id?: string | null
          is_required?: boolean
          status?: string
          approved_at?: string | null
          approved_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          pre_fund_request_id?: string
          step_order?: number
          step_label?: string
          assigned_user_id?: string | null
          is_required?: boolean
          status?: string
          approved_at?: string | null
          approved_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_fund_approval_steps_pre_fund_request_id_fkey"
            columns: ["pre_fund_request_id"]
            isOneToOne: false
            referencedRelation: "pre_fund_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_fund_bank_unmatched: {
        Row: {
          id: string
          raw_reference: string | null
          amount: number
          currency: string
          transaction_date: string
          description: string | null
          matched_fund_id: string | null
          match_status: string
          reviewed_by: string | null
          reviewed_at: string | null
          source_payload: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          raw_reference?: string | null
          amount: number
          currency?: string
          transaction_date?: string
          description?: string | null
          matched_fund_id?: string | null
          match_status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          source_payload?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          raw_reference?: string | null
          amount?: number
          currency?: string
          transaction_date?: string
          description?: string | null
          matched_fund_id?: string | null
          match_status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          source_payload?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_fund_bank_unmatched_matched_fund_id_fkey"
            columns: ["matched_fund_id"]
            isOneToOne: false
            referencedRelation: "pre_fund_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_fund_period_types: {
        Row: {
          id: string
          name: string
          day_count: number | null
          is_builtin: boolean
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          day_count?: number | null
          is_builtin?: boolean
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          day_count?: number | null
          is_builtin?: boolean
          display_order?: number
          created_at?: string
        }
        Relationships: []
      }
      pre_fund_reconciliations: {
        Row: {
          id: string
          pre_fund_request_id: string
          period_start: string | null
          period_end: string | null
          total_funded: number
          total_paid: number
          total_committed: number
          variance: number
          surplus_action: string
          carry_forward_amount: number
          return_amount: number
          reserve_amount: number
          status: string
          closed_at: string | null
          closed_by: string | null
          pdf_url: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          pre_fund_request_id: string
          period_start?: string | null
          period_end?: string | null
          total_funded?: number
          total_paid?: number
          total_committed?: number
          variance?: number
          surplus_action?: string
          carry_forward_amount?: number
          return_amount?: number
          reserve_amount?: number
          status?: string
          closed_at?: string | null
          closed_by?: string | null
          pdf_url?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          pre_fund_request_id?: string
          period_start?: string | null
          period_end?: string | null
          total_funded?: number
          total_paid?: number
          total_committed?: number
          variance?: number
          surplus_action?: string
          carry_forward_amount?: number
          return_amount?: number
          reserve_amount?: number
          status?: string
          closed_at?: string | null
          closed_by?: string | null
          pdf_url?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_fund_reconciliations_pre_fund_request_id_fkey"
            columns: ["pre_fund_request_id"]
            isOneToOne: false
            referencedRelation: "pre_fund_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_fund_requests: {
        Row: {
          id: string
          name: string
          source: string | null
          amount: number
          currency: string
          available_balance: number
          committed_amount: number
          paid_amount: number
          status: string
          grace_expires_at: string | null
          period_type_id: string | null
          period_type_name: string | null
          start_date: string | null
          end_date: string | null
          country_id: string | null
          project_id: string | null
          grant_id: string | null
          matching_scope: string
          threshold_pct: number | null
          threshold_amount: number | null
          warning_days: number | null
          auto_renewal_mode: string
          auto_renewal_days_before: number | null
          low_balance_alert: boolean
          ending_soon_alert: boolean
          receipt_url: string | null
          activated_at: string | null
          notes: string | null
          gl_receipt_account: string
          gl_liability_account: string
          gl_expense_account: string
          gl_cf_account: string
          notification_recipients: Json
          approved_by: string | null
          approved_at: string | null
          rejection_reason: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          source?: string | null
          amount: number
          currency?: string
          available_balance?: number
          committed_amount?: number
          paid_amount?: number
          status?: string
          grace_expires_at?: string | null
          period_type_id?: string | null
          period_type_name?: string | null
          start_date?: string | null
          end_date?: string | null
          country_id?: string | null
          project_id?: string | null
          grant_id?: string | null
          matching_scope?: string
          threshold_pct?: number | null
          threshold_amount?: number | null
          warning_days?: number | null
          auto_renewal_mode?: string
          auto_renewal_days_before?: number | null
          low_balance_alert?: boolean
          ending_soon_alert?: boolean
          receipt_url?: string | null
          activated_at?: string | null
          notes?: string | null
          gl_receipt_account?: string
          gl_liability_account?: string
          gl_expense_account?: string
          gl_cf_account?: string
          notification_recipients?: Json
          approved_by?: string | null
          approved_at?: string | null
          rejection_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          source?: string | null
          amount?: number
          currency?: string
          available_balance?: number
          committed_amount?: number
          paid_amount?: number
          status?: string
          grace_expires_at?: string | null
          period_type_id?: string | null
          period_type_name?: string | null
          start_date?: string | null
          end_date?: string | null
          country_id?: string | null
          project_id?: string | null
          grant_id?: string | null
          matching_scope?: string
          threshold_pct?: number | null
          threshold_amount?: number | null
          warning_days?: number | null
          auto_renewal_mode?: string
          auto_renewal_days_before?: number | null
          low_balance_alert?: boolean
          ending_soon_alert?: boolean
          receipt_url?: string | null
          activated_at?: string | null
          notes?: string | null
          gl_receipt_account?: string
          gl_liability_account?: string
          gl_expense_account?: string
          gl_cf_account?: string
          notification_recipients?: Json
          approved_by?: string | null
          approved_at?: string | null
          rejection_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_fund_requests_period_type_id_fkey"
            columns: ["period_type_id"]
            isOneToOne: false
            referencedRelation: "pre_fund_period_types"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_fund_settings: {
        Row: {
          id: string
          base_currency: string
          default_base_currency: string
          default_threshold_pct: number
          default_warning_days: number
          auto_renewal_grace_hours: number
          bank_match_tolerance_pct: number
          bank_api_enabled: boolean
          bank_api_url_hint: string | null
          bank_api_url_encrypted: string | null
          bank_api_key_hint: string | null
          integration_bank_recon: boolean
          integration_cashflow: boolean
          integration_encumbrance: boolean
          default_renewal_mode: string
          default_gl_receipt_account: string
          default_gl_liability_account: string
          default_gl_expense_account: string
          default_gl_cf_account: string
          default_notification_recipients: Json
          default_matching_scope: string
          reconciliation_action_return: boolean
          reconciliation_action_carry_fwd: boolean
          reconciliation_action_reserve: boolean
          singleton_lock: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          base_currency?: string
          default_base_currency?: string
          default_threshold_pct?: number
          default_warning_days?: number
          auto_renewal_grace_hours?: number
          bank_match_tolerance_pct?: number
          bank_api_enabled?: boolean
          bank_api_url_hint?: string | null
          bank_api_url_encrypted?: string | null
          bank_api_key_hint?: string | null
          integration_bank_recon?: boolean
          integration_cashflow?: boolean
          integration_encumbrance?: boolean
          default_renewal_mode?: string
          default_gl_receipt_account?: string
          default_gl_liability_account?: string
          default_gl_expense_account?: string
          default_gl_cf_account?: string
          default_notification_recipients?: Json
          default_matching_scope?: string
          reconciliation_action_return?: boolean
          reconciliation_action_carry_fwd?: boolean
          reconciliation_action_reserve?: boolean
          singleton_lock?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          base_currency?: string
          default_base_currency?: string
          default_threshold_pct?: number
          default_warning_days?: number
          auto_renewal_grace_hours?: number
          bank_match_tolerance_pct?: number
          bank_api_enabled?: boolean
          bank_api_url_hint?: string | null
          bank_api_url_encrypted?: string | null
          bank_api_key_hint?: string | null
          integration_bank_recon?: boolean
          integration_cashflow?: boolean
          integration_encumbrance?: boolean
          default_renewal_mode?: string
          default_gl_receipt_account?: string
          default_gl_liability_account?: string
          default_gl_expense_account?: string
          default_gl_cf_account?: string
          default_notification_recipients?: Json
          default_matching_scope?: string
          reconciliation_action_return?: boolean
          reconciliation_action_carry_fwd?: boolean
          reconciliation_action_reserve?: boolean
          singleton_lock?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      pre_fund_transactions: {
        Row: {
          id: string
          pre_fund_request_id: string
          transaction_type: string
          amount: number
          currency: string
          reference: string | null
          description: string | null
          transaction_date: string
          reconciled: boolean
          reconciled_at: string | null
          source_table: string | null
          source_id: string | null
          encumbrance_id: string | null
          gl_entry_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          pre_fund_request_id: string
          transaction_type?: string
          amount: number
          currency?: string
          reference?: string | null
          description?: string | null
          transaction_date?: string
          reconciled?: boolean
          reconciled_at?: string | null
          source_table?: string | null
          source_id?: string | null
          encumbrance_id?: string | null
          gl_entry_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          pre_fund_request_id?: string
          transaction_type?: string
          amount?: number
          currency?: string
          reference?: string | null
          description?: string | null
          transaction_date?: string
          reconciled?: boolean
          reconciled_at?: string | null
          source_table?: string | null
          source_id?: string | null
          encumbrance_id?: string | null
          gl_entry_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_fund_transactions_pre_fund_request_id_fkey"
            columns: ["pre_fund_request_id"]
            isOneToOne: false
            referencedRelation: "pre_fund_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          employee_id: string | null
          full_name: string | null
          hub_id: string | null
          id: string
          locality_id: string | null
          location: Json | null
          location_sharing: boolean | null
          phone: string | null
          role: string | null
          state_id: string | null
          status: string | null
          updated_at: string
          username: string | null
          availability: string | null
          secondary_hub_id: string | null
          department_id: string | null
          employment_type: string | null
          contract_start_date: string | null
          contract_end_date: string | null
          reports_to: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          hub_id?: string | null
          id: string
          locality_id?: string | null
          location?: Json | null
          location_sharing?: boolean | null
          phone?: string | null
          role?: string | null
          state_id?: string | null
          status?: string | null
          updated_at?: string
          username?: string | null
          availability?: string | null
          secondary_hub_id?: string | null
          department_id?: string | null
          employment_type?: string | null
          contract_start_date?: string | null
          contract_end_date?: string | null
          reports_to?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          hub_id?: string | null
          id?: string
          locality_id?: string | null
          location?: Json | null
          location_sharing?: boolean | null
          phone?: string | null
          role?: string | null
          state_id?: string | null
          status?: string | null
          updated_at?: string
          username?: string | null
          availability?: string | null
          secondary_hub_id?: string | null
          department_id?: string | null
          employment_type?: string | null
          contract_start_date?: string | null
          contract_end_date?: string | null
          reports_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activities: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          name: string
          project_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["activity_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          name: string
          project_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["activity_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          project_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["activity_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_settings: {
        Row: {
          id: string
          last_updated: string | null
          project_id: string
          settings: Json | null
        }
        Insert: {
          id?: string
          last_updated?: string | null
          project_id: string
          settings?: Json | null
        }
        Update: {
          id?: string
          last_updated?: string | null
          project_id?: string
          settings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean | null
          budget: Json | null
          created_at: string | null
          created_by: string | null
          current_flow_stage: string | null
          custom_flow_stages: Json | null
          description: string | null
          end_date: string
          id: string
          location: Json
          name: string
          project_code: string
          project_type: Database["public"]["Enums"]["project_type"]
          related_mmps: string[] | null
          related_site_visits: string[] | null
          start_date: string
          status: Database["public"]["Enums"]["project_status"]
          team: Json | null
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          budget?: Json | null
          created_at?: string | null
          created_by?: string | null
          current_flow_stage?: string | null
          custom_flow_stages?: Json | null
          description?: string | null
          end_date: string
          id?: string
          location: Json
          name: string
          project_code: string
          project_type: Database["public"]["Enums"]["project_type"]
          related_mmps?: string[] | null
          related_site_visits?: string[] | null
          start_date: string
          status?: Database["public"]["Enums"]["project_status"]
          team?: Json | null
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          budget?: Json | null
          created_at?: string | null
          created_by?: string | null
          current_flow_stage?: string | null
          custom_flow_stages?: Json | null
          description?: string | null
          end_date?: string
          id?: string
          location?: Json
          name?: string
          project_code?: string
          project_type?: Database["public"]["Enums"]["project_type"]
          related_mmps?: string[] | null
          related_site_visits?: string[] | null
          start_date?: string
          status?: Database["public"]["Enums"]["project_status"]
          team?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      report_filters: {
        Row: {
          filters: Json | null
          id: string
          last_updated: string | null
          name: string
          user_id: string | null
        }
        Insert: {
          filters?: Json | null
          id?: string
          last_updated?: string | null
          name: string
          user_id?: string | null
        }
        Update: {
          filters?: Json | null
          id?: string
          last_updated?: string | null
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_filters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          activity: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          attachments: Json | null
          completed_at: string | null
          coordinates: Json | null
          created_at: string | null
          due_date: string | null
          fees: Json | null
          id: string
          locality: string | null
          location: Json | null
          main_activity: string | null
          mmp_id: string | null
          notes: string | null
          priority: string | null
          rating: number | null
          site_code: string | null
          site_name: string
          state: string | null
          status: string
          updated_at: string | null
          visit_data: Json | null
        }
        Insert: {
          activity?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          completed_at?: string | null
          coordinates?: Json | null
          created_at?: string | null
          due_date?: string | null
          fees?: Json | null
          id?: string
          locality?: string | null
          location?: Json | null
          main_activity?: string | null
          mmp_id?: string | null
          notes?: string | null
          priority?: string | null
          rating?: number | null
          site_code?: string | null
          site_name: string
          state?: string | null
          status?: string
          updated_at?: string | null
          visit_data?: Json | null
        }
        Update: {
          activity?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          completed_at?: string | null
          coordinates?: Json | null
          created_at?: string | null
          due_date?: string | null
          fees?: Json | null
          id?: string
          locality?: string | null
          location?: Json | null
          main_activity?: string | null
          mmp_id?: string | null
          notes?: string | null
          priority?: string | null
          rating?: number | null
          site_code?: string | null
          site_name?: string
          state?: string | null
          status?: string
          updated_at?: string | null
          visit_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_mmp_id_fkey"
            columns: ["mmp_id"]
            isOneToOne: false
            referencedRelation: "mmp_files"
            referencedColumns: ["mmp_id"]
          },
        ]
      }
      sub_activities: {
        Row: {
          activity_id: string | null
          assigned_to: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_active: boolean | null
          name: string
          status: Database["public"]["Enums"]["activity_status"] | null
          updated_at: string | null
        }
        Insert: {
          activity_id?: string | null
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          status?: Database["public"]["Enums"]["activity_status"] | null
          updated_at?: string | null
        }
        Update: {
          activity_id?: string | null
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          status?: Database["public"]["Enums"]["activity_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "project_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      team_activities: {
        Row: {
          activity_type: string
          created_at: string | null
          details: Json | null
          id: string
          location: Json | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          details?: Json | null
          id?: string
          location?: Json | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          location?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          joined_at: string | null
          project_id: string | null
          role: string
          updated_at: string | null
          user_id: string | null
          workload: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          joined_at?: string | null
          project_id?: string | null
          role: string
          updated_at?: string | null
          user_id?: string | null
          workload?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          joined_at?: string | null
          project_id?: string | null
          role?: string
          updated_at?: string | null
          user_id?: string | null
          workload?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_management_settings: {
        Row: {
          admin_id: string
          custom_roles: Json | null
          id: string
          last_updated: string | null
          role_approval_required: boolean | null
        }
        Insert: {
          admin_id: string
          custom_roles?: Json | null
          id?: string
          last_updated?: string | null
          role_approval_required?: boolean | null
        }
        Update: {
          admin_id?: string
          custom_roles?: Json | null
          id?: string
          last_updated?: string | null
          role_approval_required?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "user_management_settings_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"] | string
          role_id: string | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"] | string
          role_id?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | string
          role_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          id: string
          name: string
          display_name: string
          description: string | null
          is_system_role: boolean
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          name: string
          display_name: string
          description?: string | null
          is_system_role?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          display_name?: string
          description?: string | null
          is_system_role?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          id: string
          role_id: string
          resource: string
          action: string
          conditions: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          role_id: string
          resource: string
          action: string
          conditions?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          role_id?: string
          resource?: string
          action?: string
          conditions?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          id: string
          last_updated: string | null
          settings: Json | null
          user_id: string
        }
        Insert: {
          id?: string
          last_updated?: string | null
          settings?: Json | null
          user_id: string
        }
        Update: {
          id?: string
          last_updated?: string | null
          settings?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_nav_badge_counts: {
        Args: {
          p_hub_id?: string | null
          p_include_admin_bell?: boolean
          p_include_fom_verified?: boolean
          p_is_data_collector?: boolean
          p_role_coordinator?: boolean
          p_role_finance?: boolean
          p_role_fom_or_admin?: boolean
          p_role_incident?: boolean
          p_role_supervisor?: boolean
        }
        Returns: Json
      }
      get_sudan_default_coordinates: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_user_roles: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args:
          | { role: Database["public"]["Enums"]["app_role"] }
          | { role_name: string }
          | { user_id: string; role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_project_creator: {
        Args: { project_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { project_id: string }
        Returns: boolean
      }
      user_has_role: {
        Args:
          | { user_id: number; role_name: string }
          | { user_id: string; role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      close_project: {
        Args: {
          p_id: string
          p_justification?: string | null
          p_super_admin_override?: boolean
        }
        Returns: Json
      }
      reopen_project: {
        Args: {
          p_id: string
          p_justification: string
        }
        Returns: undefined
      }
      cycle_approve_close: {
        Args: {
          p_mmp_id: string
          p_close_records: Json
          p_super_admin_override?: boolean
          p_override_justification?: string | null
        }
        Returns: undefined
      }
    }
    Enums: {
      activity_status: "pending" | "inProgress" | "completed" | "cancelled"
      app_role:
        | "admin"
        | "ict"
        | "fom"
        | "financialAdmin"
        | "supervisor"
        | "coordinator"
        | "dataCollector"
        | "reviewer"
      project_status: "draft" | "active" | "onHold" | "completed" | "cancelled"
      project_type:
        | "infrastructure"
        | "survey"
        | "compliance"
        | "monitoring"
        | "training"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_status: ["pending", "inProgress", "completed", "cancelled"],
      app_role: [
        "admin",
        "ict",
        "fom",
        "financialAdmin",
        "supervisor",
        "coordinator",
        "dataCollector",
        "reviewer",
      ],
      project_status: ["draft", "active", "onHold", "completed", "cancelled"],
      project_type: [
        "infrastructure",
        "survey",
        "compliance",
        "monitoring",
        "training",
        "other",
      ],
    },
  },
} as const
