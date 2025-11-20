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
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
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
          budget: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          location: Json
          name: string
          project_code: string
          project_type: Database["public"]["Enums"]["project_type"]
          start_date: string
          status: Database["public"]["Enums"]["project_status"]
          team: Json | null
          updated_at: string | null
        }
        Insert: {
          budget?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          location: Json
          name: string
          project_code: string
          project_type: Database["public"]["Enums"]["project_type"]
          start_date: string
          status?: Database["public"]["Enums"]["project_status"]
          team?: Json | null
          updated_at?: string | null
        }
        Update: {
          budget?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          location?: Json
          name?: string
          project_code?: string
          project_type?: Database["public"]["Enums"]["project_type"]
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
