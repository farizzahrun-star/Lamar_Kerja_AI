export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      applications: {
        Row: {
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["apply_channel"];
          created_at: string;
          draft_id: string | null;
          id: string;
          job_id: string;
          last_error: string | null;
          match_score: number | null;
          queued_at: string;
          ready_at: string | null;
          recipient_email: string | null;
          replied_at: string | null;
          resume_id: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["application_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cancelled_at?: string | null;
          channel: Database["public"]["Enums"]["apply_channel"];
          created_at?: string;
          draft_id?: string | null;
          id?: string;
          job_id: string;
          last_error?: string | null;
          match_score?: number | null;
          queued_at?: string;
          ready_at?: string | null;
          recipient_email?: string | null;
          replied_at?: string | null;
          resume_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cancelled_at?: string | null;
          channel?: Database["public"]["Enums"]["apply_channel"];
          created_at?: string;
          draft_id?: string | null;
          id?: string;
          job_id?: string;
          last_error?: string | null;
          match_score?: number | null;
          queued_at?: string;
          ready_at?: string | null;
          recipient_email?: string | null;
          replied_at?: string | null;
          resume_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_resume_id_fkey";
            columns: ["resume_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: number;
          ip: unknown;
          meta_json: Json;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: never;
          ip?: unknown;
          meta_json?: Json;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: never;
          ip?: unknown;
          meta_json?: Json;
        };
        Relationships: [];
      };
      certifications: {
        Row: {
          created_at: string;
          credential_url: string | null;
          id: string;
          issuer: string | null;
          name: string;
          profile_id: string;
          updated_at: string;
          year: number | null;
        };
        Insert: {
          created_at?: string;
          credential_url?: string | null;
          id?: string;
          issuer?: string | null;
          name: string;
          profile_id: string;
          updated_at?: string;
          year?: number | null;
        };
        Update: {
          created_at?: string;
          credential_url?: string | null;
          id?: string;
          issuer?: string | null;
          name?: string;
          profile_id?: string;
          updated_at?: string;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "certifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      collector_runs: {
        Row: {
          blocked: boolean;
          created_at: string;
          error_count: number;
          finished_at: string | null;
          found: number;
          id: string;
          last_error: string | null;
          new_count: number;
          platform: Database["public"]["Enums"]["job_platform"];
          run_date: string;
          runner_id: string | null;
          skipped_known: number;
          started_at: string;
        };
        Insert: {
          blocked?: boolean;
          created_at?: string;
          error_count?: number;
          finished_at?: string | null;
          found?: number;
          id?: string;
          last_error?: string | null;
          new_count?: number;
          platform: Database["public"]["Enums"]["job_platform"];
          run_date: string;
          runner_id?: string | null;
          skipped_known?: number;
          started_at?: string;
        };
        Update: {
          blocked?: boolean;
          created_at?: string;
          error_count?: number;
          finished_at?: string | null;
          found?: number;
          id?: string;
          last_error?: string | null;
          new_count?: number;
          platform?: Database["public"]["Enums"]["job_platform"];
          run_date?: string;
          runner_id?: string | null;
          skipped_known?: number;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collector_runs_runner_id_fkey";
            columns: ["runner_id"];
            isOneToOne: false;
            referencedRelation: "runners";
            referencedColumns: ["id"];
          },
        ];
      };
      cv_parse_runs: {
        Row: {
          attempts: number;
          consent_version: string;
          created_at: string;
          duration_ms: number | null;
          error_code: string | null;
          finished_at: string | null;
          id: string;
          model: string;
          output_json: Json | null;
          section: Database["public"]["Enums"]["parse_section"];
          started_at: string | null;
          status: Database["public"]["Enums"]["parse_run_status"];
          uploaded_cv_id: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          consent_version: string;
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          model?: string;
          output_json?: Json | null;
          section: Database["public"]["Enums"]["parse_section"];
          started_at?: string | null;
          status?: Database["public"]["Enums"]["parse_run_status"];
          uploaded_cv_id: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          consent_version?: string;
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          model?: string;
          output_json?: Json | null;
          section?: Database["public"]["Enums"]["parse_section"];
          started_at?: string | null;
          status?: Database["public"]["Enums"]["parse_run_status"];
          uploaded_cv_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cv_parse_runs_uploaded_cv_id_fkey";
            columns: ["uploaded_cv_id"];
            isOneToOne: false;
            referencedRelation: "uploaded_cvs";
            referencedColumns: ["id"];
          },
        ];
      };
      cv_parse_suggestions: {
        Row: {
          confidence: number;
          created_at: string;
          decided_at: string | null;
          field_path: string;
          id: string;
          parse_run_id: string;
          section: Database["public"]["Enums"]["parse_section"];
          source_snippet: string | null;
          status: Database["public"]["Enums"]["suggestion_status"];
          user_id: string;
          value_json: Json;
        };
        Insert: {
          confidence?: number;
          created_at?: string;
          decided_at?: string | null;
          field_path: string;
          id?: string;
          parse_run_id: string;
          section: Database["public"]["Enums"]["parse_section"];
          source_snippet?: string | null;
          status?: Database["public"]["Enums"]["suggestion_status"];
          user_id: string;
          value_json: Json;
        };
        Update: {
          confidence?: number;
          created_at?: string;
          decided_at?: string | null;
          field_path?: string;
          id?: string;
          parse_run_id?: string;
          section?: Database["public"]["Enums"]["parse_section"];
          source_snippet?: string | null;
          status?: Database["public"]["Enums"]["suggestion_status"];
          user_id?: string;
          value_json?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "cv_parse_suggestions_parse_run_id_fkey";
            columns: ["parse_run_id"];
            isOneToOne: false;
            referencedRelation: "cv_parse_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      educations: {
        Row: {
          created_at: string;
          end_year: number | null;
          gpa: number | null;
          id: string;
          institution: string;
          level: Database["public"]["Enums"]["education_level"] | null;
          major: string | null;
          profile_id: string;
          start_year: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_year?: number | null;
          gpa?: number | null;
          id?: string;
          institution: string;
          level?: Database["public"]["Enums"]["education_level"] | null;
          major?: string | null;
          profile_id: string;
          start_year?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_year?: number | null;
          gpa?: number | null;
          id?: string;
          institution?: string;
          level?: Database["public"]["Enums"]["education_level"] | null;
          major?: string | null;
          profile_id?: string;
          start_year?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "educations_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      experience_points: {
        Row: {
          content: string;
          created_at: string;
          experience_id: string;
          id: string;
          sort_order: number;
        };
        Insert: {
          content: string;
          created_at?: string;
          experience_id: string;
          id?: string;
          sort_order?: number;
        };
        Update: {
          content?: string;
          created_at?: string;
          experience_id?: string;
          id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "experience_points_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      experiences: {
        Row: {
          company: string;
          created_at: string;
          description: string | null;
          employment_type: Database["public"]["Enums"]["employment_type"] | null;
          end_date: string | null;
          id: string;
          is_current: boolean;
          profile_id: string;
          start_date: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          company: string;
          created_at?: string;
          description?: string | null;
          employment_type?: Database["public"]["Enums"]["employment_type"] | null;
          end_date?: string | null;
          id?: string;
          is_current?: boolean;
          profile_id: string;
          start_date?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          company?: string;
          created_at?: string;
          description?: string | null;
          employment_type?: Database["public"]["Enums"]["employment_type"] | null;
          end_date?: string | null;
          id?: string;
          is_current?: boolean;
          profile_id?: string;
          start_date?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "experiences_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      interests: {
        Row: {
          created_at: string;
          id: string;
          is_default: boolean;
          label: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label?: string;
          slug?: string;
        };
        Relationships: [];
      };
      job_contacts: {
        Row: {
          created_at: string;
          hr_email: string;
          id: string;
          job_id: string;
          source: string;
        };
        Insert: {
          created_at?: string;
          hr_email: string;
          id?: string;
          job_id: string;
          source: string;
        };
        Update: {
          created_at?: string;
          hr_email?: string;
          id?: string;
          job_id?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_contacts_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      job_ingest_batches: {
        Row: {
          attempts: number;
          collector_run_id: string | null;
          created_at: string;
          error_message: string | null;
          finished_at: string | null;
          id: string;
          payload_json: Json;
          platform: Database["public"]["Enums"]["job_platform"];
          run_date: string;
          runner_id: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_ingest_status"];
          summary_json: Json | null;
        };
        Insert: {
          attempts?: number;
          collector_run_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          payload_json: Json;
          platform: Database["public"]["Enums"]["job_platform"];
          run_date: string;
          runner_id?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_ingest_status"];
          summary_json?: Json | null;
        };
        Update: {
          attempts?: number;
          collector_run_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          payload_json?: Json;
          platform?: Database["public"]["Enums"]["job_platform"];
          run_date?: string;
          runner_id?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_ingest_status"];
          summary_json?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_ingest_batches_collector_run_id_fkey";
            columns: ["collector_run_id"];
            isOneToOne: false;
            referencedRelation: "collector_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_ingest_batches_runner_id_fkey";
            columns: ["runner_id"];
            isOneToOne: false;
            referencedRelation: "runners";
            referencedColumns: ["id"];
          },
        ];
      };
      job_snapshots: {
        Row: {
          created_at: string;
          id: string;
          job_id: string;
          snapshot_date: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          job_id: string;
          snapshot_date: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_id?: string;
          snapshot_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_snapshots_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      job_sources: {
        Row: {
          config_json: Json;
          created_at: string;
          enabled: boolean;
          id: string;
          name: string;
          platform: Database["public"]["Enums"]["job_platform"];
          type: Database["public"]["Enums"]["job_source_type"];
          updated_at: string;
        };
        Insert: {
          config_json?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name: string;
          platform: Database["public"]["Enums"]["job_platform"];
          type: Database["public"]["Enums"]["job_source_type"];
          updated_at?: string;
        };
        Update: {
          config_json?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name?: string;
          platform?: Database["public"]["Enums"]["job_platform"];
          type?: Database["public"]["Enums"]["job_source_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      job_urls: {
        Row: {
          apply_channel: Database["public"]["Enums"]["apply_channel"];
          created_at: string;
          id: string;
          is_primary: boolean;
          job_id: string;
          platform: Database["public"]["Enums"]["job_platform"];
          url: string;
        };
        Insert: {
          apply_channel: Database["public"]["Enums"]["apply_channel"];
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          job_id: string;
          platform: Database["public"]["Enums"]["job_platform"];
          url: string;
        };
        Update: {
          apply_channel?: Database["public"]["Enums"]["apply_channel"];
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          job_id?: string;
          platform?: Database["public"]["Enums"]["job_platform"];
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_urls_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          company: string;
          created_at: string;
          created_by: string | null;
          description: string;
          external_id: string | null;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          location: string | null;
          posted_at: string | null;
          raw_hash: string;
          salary_max: number | null;
          salary_min: number | null;
          source_id: string | null;
          title: string;
          updated_at: string;
          url: string | null;
          work_mode: Database["public"]["Enums"]["work_mode"] | null;
        };
        Insert: {
          company: string;
          created_at?: string;
          created_by?: string | null;
          description: string;
          external_id?: string | null;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          location?: string | null;
          posted_at?: string | null;
          raw_hash: string;
          salary_max?: number | null;
          salary_min?: number | null;
          source_id?: string | null;
          title: string;
          updated_at?: string;
          url?: string | null;
          work_mode?: Database["public"]["Enums"]["work_mode"] | null;
        };
        Update: {
          company?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          external_id?: string | null;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          location?: string | null;
          posted_at?: string | null;
          raw_hash?: string;
          salary_max?: number | null;
          salary_min?: number | null;
          source_id?: string | null;
          title?: string;
          updated_at?: string;
          url?: string | null;
          work_mode?: Database["public"]["Enums"]["work_mode"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "job_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      languages: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          proficiency: string | null;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          proficiency?: string | null;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          proficiency?: string | null;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "languages_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          address: string | null;
          availability: string | null;
          birth_date: string | null;
          created_at: string;
          expected_salary: number | null;
          full_name: string | null;
          headline: string | null;
          linkedin_url: string | null;
          onboarding_completed_at: string | null;
          onboarding_step: string;
          phone: string | null;
          portfolio_url: string | null;
          summary: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          availability?: string | null;
          birth_date?: string | null;
          created_at?: string;
          expected_salary?: number | null;
          full_name?: string | null;
          headline?: string | null;
          linkedin_url?: string | null;
          onboarding_completed_at?: string | null;
          onboarding_step?: string;
          phone?: string | null;
          portfolio_url?: string | null;
          summary?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          availability?: string | null;
          birth_date?: string | null;
          created_at?: string;
          expected_salary?: number | null;
          full_name?: string | null;
          headline?: string | null;
          linkedin_url?: string | null;
          onboarding_completed_at?: string | null;
          onboarding_step?: string;
          phone?: string | null;
          portfolio_url?: string | null;
          summary?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      resumes: {
        Row: {
          application_id: string | null;
          created_at: string;
          data_json: Json;
          id: string;
          pdf_path: string;
          template: Database["public"]["Enums"]["resume_template"];
          user_id: string;
          version: number;
        };
        Insert: {
          application_id?: string | null;
          created_at?: string;
          data_json: Json;
          id?: string;
          pdf_path: string;
          template: Database["public"]["Enums"]["resume_template"];
          user_id: string;
          version: number;
        };
        Update: {
          application_id?: string | null;
          created_at?: string;
          data_json?: Json;
          id?: string;
          pdf_path?: string;
          template?: Database["public"]["Enums"]["resume_template"];
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "resumes_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      runner_tasks: {
        Row: {
          application_id: string | null;
          claimed_at: string | null;
          created_at: string;
          error_message: string | null;
          finished_at: string | null;
          id: string;
          payload_json: Json;
          result_json: Json | null;
          run_date: string;
          runner_id: string | null;
          status: Database["public"]["Enums"]["runner_task_status"];
          type: Database["public"]["Enums"]["runner_task_type"];
          updated_at: string;
        };
        Insert: {
          application_id?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          payload_json?: Json;
          result_json?: Json | null;
          run_date: string;
          runner_id?: string | null;
          status?: Database["public"]["Enums"]["runner_task_status"];
          type: Database["public"]["Enums"]["runner_task_type"];
          updated_at?: string;
        };
        Update: {
          application_id?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          payload_json?: Json;
          result_json?: Json | null;
          run_date?: string;
          runner_id?: string | null;
          status?: Database["public"]["Enums"]["runner_task_status"];
          type?: Database["public"]["Enums"]["runner_task_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "runner_tasks_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "runner_tasks_runner_id_fkey";
            columns: ["runner_id"];
            isOneToOne: false;
            referencedRelation: "runners";
            referencedColumns: ["id"];
          },
        ];
      };
      runners: {
        Row: {
          created_at: string;
          id: string;
          last_seen_at: string | null;
          name: string;
          revoked_at: string | null;
          token_hash: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_seen_at?: string | null;
          name: string;
          revoked_at?: string | null;
          token_hash: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_seen_at?: string | null;
          name?: string;
          revoked_at?: string | null;
          token_hash?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      skills: {
        Row: {
          created_at: string;
          id: string;
          level: Database["public"]["Enums"]["skill_level"] | null;
          name: string;
          profile_id: string;
          updated_at: string;
          years: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          level?: Database["public"]["Enums"]["skill_level"] | null;
          name: string;
          profile_id: string;
          updated_at?: string;
          years?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          level?: Database["public"]["Enums"]["skill_level"] | null;
          name?: string;
          profile_id?: string;
          updated_at?: string;
          years?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "skills_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      tracking_events: {
        Row: {
          application_id: string;
          created_at: string;
          event_type: string;
          id: string;
          payload_json: Json;
        };
        Insert: {
          application_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          payload_json?: Json;
        };
        Update: {
          application_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          payload_json?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "tracking_events_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      uploaded_cvs: {
        Row: {
          created_at: string;
          delete_after: string;
          file_path: string;
          id: string;
          mime: string;
          original_filename: string;
          sha256: string;
          size_bytes: number;
          status: Database["public"]["Enums"]["cv_status"];
          text_content: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          delete_after?: string;
          file_path: string;
          id?: string;
          mime: string;
          original_filename: string;
          sha256: string;
          size_bytes: number;
          status?: Database["public"]["Enums"]["cv_status"];
          text_content?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          delete_after?: string;
          file_path?: string;
          id?: string;
          mime?: string;
          original_filename?: string;
          sha256?: string;
          size_bytes?: number;
          status?: Database["public"]["Enums"]["cv_status"];
          text_content?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_consents: {
        Row: {
          accepted_at: string;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["consent_kind"];
          revoked_at: string | null;
          user_agent_hash: string | null;
          user_id: string;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["consent_kind"];
          revoked_at?: string | null;
          user_agent_hash?: string | null;
          user_id: string;
          version: string;
        };
        Update: {
          accepted_at?: string;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["consent_kind"];
          revoked_at?: string | null;
          user_agent_hash?: string | null;
          user_id?: string;
          version?: string;
        };
        Relationships: [];
      };
      user_interests: {
        Row: {
          created_at: string;
          interest_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          interest_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          interest_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_interests_interest_id_fkey";
            columns: ["interest_id"];
            isOneToOne: false;
            referencedRelation: "interests";
            referencedColumns: ["id"];
          },
        ];
      };
      user_platforms: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          last_checked_at: string | null;
          platform: Database["public"]["Enums"]["job_platform"];
          session_status: Database["public"]["Enums"]["platform_session_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          last_checked_at?: string | null;
          platform: Database["public"]["Enums"]["job_platform"];
          session_status?: Database["public"]["Enums"]["platform_session_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          last_checked_at?: string | null;
          platform?: Database["public"]["Enums"]["job_platform"];
          session_status?: Database["public"]["Enums"]["platform_session_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          apply_daily_limit: number;
          created_at: string;
          portal_auto_submit: boolean;
          review_before_send: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          apply_daily_limit?: number;
          created_at?: string;
          portal_auto_submit?: boolean;
          review_before_send?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          apply_daily_limit?: number;
          created_at?: string;
          portal_auto_submit?: boolean;
          review_before_send?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_owner: { Args: { profile: string }; Returns: boolean };
    };
    Enums: {
      application_status:
        | "queued"
        | "preparing"
        | "needs_user"
        | "ready"
        | "sending"
        | "sent"
        | "replied"
        | "failed"
        | "cancelled";
      apply_channel: "email" | "easy_apply" | "portal" | "link";
      consent_kind: "privacy" | "cv_ai_processing" | "ai_training_opt_in";
      cv_status: "uploaded" | "extracted" | "skipped";
      education_level: "SMA" | "SMK" | "D3" | "S1" | "S2" | "S3";
      employment_type:
        | "full_time"
        | "part_time"
        | "contract"
        | "internship"
        | "freelance";
      job_ingest_status: "pending" | "processing" | "completed" | "failed";
      job_platform: "glints" | "jobstreet" | "linkedin" | "glassdoor" | "manual" | "ats";
      job_source_type: "guest_scrape" | "feed" | "api" | "manual";
      parse_run_status: "pending" | "running" | "parsed" | "failed" | "skipped";
      parse_section: "identity" | "experiences" | "educations" | "skills";
      platform_session_status: "none" | "logged_in" | "expired";
      resume_template: "A" | "B";
      runner_task_status: "pending" | "claimed" | "completed" | "failed" | "blocked";
      runner_task_type: "scrape.daily" | "portal.apply";
      skill_level: "beginner" | "intermediate" | "advanced";
      suggestion_status: "pending" | "accepted" | "rejected";
      work_mode: "onsite" | "hybrid" | "remote";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      application_status: [
        "queued",
        "preparing",
        "needs_user",
        "ready",
        "sending",
        "sent",
        "replied",
        "failed",
        "cancelled",
      ],
      apply_channel: ["email", "easy_apply", "portal", "link"],
      consent_kind: ["privacy", "cv_ai_processing", "ai_training_opt_in"],
      cv_status: ["uploaded", "extracted", "skipped"],
      education_level: ["SMA", "SMK", "D3", "S1", "S2", "S3"],
      employment_type: [
        "full_time",
        "part_time",
        "contract",
        "internship",
        "freelance",
      ],
      job_ingest_status: ["pending", "processing", "completed", "failed"],
      job_platform: ["glints", "jobstreet", "linkedin", "glassdoor", "manual", "ats"],
      job_source_type: ["guest_scrape", "feed", "api", "manual"],
      parse_run_status: ["pending", "running", "parsed", "failed", "skipped"],
      parse_section: ["identity", "experiences", "educations", "skills"],
      platform_session_status: ["none", "logged_in", "expired"],
      resume_template: ["A", "B"],
      runner_task_status: ["pending", "claimed", "completed", "failed", "blocked"],
      runner_task_type: ["scrape.daily", "portal.apply"],
      skill_level: ["beginner", "intermediate", "advanced"],
      suggestion_status: ["pending", "accepted", "rejected"],
      work_mode: ["onsite", "hybrid", "remote"],
    },
  },
} as const;
