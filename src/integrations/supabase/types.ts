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
      achievements: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string
          icon: string
          threshold: number | null
          tier: string
          title: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description: string
          icon: string
          threshold?: number | null
          tier?: string
          title: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string
          icon?: string
          threshold?: number | null
          tier?: string
          title?: string
        }
        Relationships: []
      }
      admin_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          id: string
          kind: string
          market_id: string | null
          payload: Json
          severity: string
          trade_id: string | null
          user_id: string | null
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          kind: string
          market_id?: string | null
          payload?: Json
          severity?: string
          trade_id?: string | null
          user_id?: string | null
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          kind?: string
          market_id?: string | null
          payload?: Json
          severity?: string
          trade_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          market_id: string | null
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          market_id?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          market_id?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          id: string
          market_id: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          market_id: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          market_id?: string
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_depth_v"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "comments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_subsidy_estimate"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "comments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_submissions: {
        Row: {
          created_at: string
          date_of_birth: string
          full_name: string
          id: string
          id_back_path: string | null
          id_front_path: string
          id_number: string
          id_type: Database["public"]["Enums"]["kyc_id_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          selfie_path: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth: string
          full_name: string
          id?: string
          id_back_path?: string | null
          id_front_path: string
          id_number: string
          id_type: Database["public"]["Enums"]["kyc_id_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          selfie_path?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string
          full_name?: string
          id?: string
          id_back_path?: string | null
          id_front_path?: string
          id_number?: string
          id_type?: Database["public"]["Enums"]["kyc_id_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          selfie_path?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lmsr_state_log: {
        Row: {
          b: number
          cost_delta_cents: number
          id: number
          market_id: string
          outcome_id: string | null
          q_after: number[] | null
          q_before: number[] | null
          recorded_at: string
          trade_id: string | null
        }
        Insert: {
          b: number
          cost_delta_cents: number
          id?: number
          market_id: string
          outcome_id?: string | null
          q_after?: number[] | null
          q_before?: number[] | null
          recorded_at?: string
          trade_id?: string | null
        }
        Update: {
          b?: number
          cost_delta_cents?: number
          id?: number
          market_id?: string
          outcome_id?: string | null
          q_after?: number[] | null
          q_before?: number[] | null
          recorded_at?: string
          trade_id?: string | null
        }
        Relationships: []
      }
      market_outcomes: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_winner: boolean | null
          label: string
          market_id: string
          price: number
          q: number
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_winner?: boolean | null
          label: string
          market_id: string
          price?: number
          q?: number
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_winner?: boolean | null
          label?: string
          market_id?: string
          price?: number
          q?: number
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_outcomes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_depth_v"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "market_outcomes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_subsidy_estimate"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "market_outcomes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_signals: {
        Row: {
          avg_sentiment: number
          computed_at: string
          confidence: number
          market_id: string
          news_count: number
          signal_prob: number
          social_count: number
          velocity: number
        }
        Insert: {
          avg_sentiment?: number
          computed_at?: string
          confidence?: number
          market_id: string
          news_count?: number
          signal_prob?: number
          social_count?: number
          velocity?: number
        }
        Update: {
          avg_sentiment?: number
          computed_at?: string
          confidence?: number
          market_id?: string
          news_count?: number
          signal_prob?: number
          social_count?: number
          velocity?: number
        }
        Relationships: []
      }
      market_suggestions: {
        Row: {
          ai_reasoning: string | null
          auto_generated: boolean
          cluster_key: string | null
          confidence: number
          created_at: string
          created_by: string | null
          edge_score: number
          event_type: string | null
          horizon: string | null
          id: string
          initial_probability: number | null
          key_entities: string[] | null
          news_count: number
          resolution_criteria: string | null
          source_article_ids: string[] | null
          status: string
          suggested_category: Database["public"]["Enums"]["market_category"]
          suggested_close_at: string | null
          suggested_question: string
          suggested_yes_price: number
          topic: string
          trend_score: number
          used_market_id: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          auto_generated?: boolean
          cluster_key?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          edge_score?: number
          event_type?: string | null
          horizon?: string | null
          id?: string
          initial_probability?: number | null
          key_entities?: string[] | null
          news_count?: number
          resolution_criteria?: string | null
          source_article_ids?: string[] | null
          status?: string
          suggested_category: Database["public"]["Enums"]["market_category"]
          suggested_close_at?: string | null
          suggested_question: string
          suggested_yes_price: number
          topic: string
          trend_score?: number
          used_market_id?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          auto_generated?: boolean
          cluster_key?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          edge_score?: number
          event_type?: string | null
          horizon?: string | null
          id?: string
          initial_probability?: number | null
          key_entities?: string[] | null
          news_count?: number
          resolution_criteria?: string | null
          source_article_ids?: string[] | null
          status?: string
          suggested_category?: Database["public"]["Enums"]["market_category"]
          suggested_close_at?: string | null
          suggested_question?: string
          suggested_yes_price?: number
          topic?: string
          trend_score?: number
          used_market_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_suggestions_used_market_id_fkey"
            columns: ["used_market_id"]
            isOneToOne: false
            referencedRelation: "market_depth_v"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "market_suggestions_used_market_id_fkey"
            columns: ["used_market_id"]
            isOneToOne: false
            referencedRelation: "market_subsidy_estimate"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "market_suggestions_used_market_id_fkey"
            columns: ["used_market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          auto_resolve_enabled: boolean
          category: Database["public"]["Enums"]["market_category"]
          closes_at: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          initial_liquidity_cents: number | null
          initial_prob: number | null
          keywords: string[] | null
          liquidity_b: number
          market_type: string
          no_price: number
          pending_resolution: Json | null
          q_no: number
          q_yes: number
          question: string
          resolution_source: string | null
          resolved_outcome: boolean | null
          resolved_outcome_id: string | null
          slug: string
          status: Database["public"]["Enums"]["market_status"]
          trader_count: number
          updated_at: string
          volume_cents: number
          yes_price: number
        }
        Insert: {
          auto_resolve_enabled?: boolean
          category: Database["public"]["Enums"]["market_category"]
          closes_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          initial_liquidity_cents?: number | null
          initial_prob?: number | null
          keywords?: string[] | null
          liquidity_b?: number
          market_type?: string
          no_price?: number
          pending_resolution?: Json | null
          q_no?: number
          q_yes?: number
          question: string
          resolution_source?: string | null
          resolved_outcome?: boolean | null
          resolved_outcome_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["market_status"]
          trader_count?: number
          updated_at?: string
          volume_cents?: number
          yes_price?: number
        }
        Update: {
          auto_resolve_enabled?: boolean
          category?: Database["public"]["Enums"]["market_category"]
          closes_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          initial_liquidity_cents?: number | null
          initial_prob?: number | null
          keywords?: string[] | null
          liquidity_b?: number
          market_type?: string
          no_price?: number
          pending_resolution?: Json | null
          q_no?: number
          q_yes?: number
          question?: string
          resolution_source?: string | null
          resolved_outcome?: boolean | null
          resolved_outcome_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["market_status"]
          trader_count?: number
          updated_at?: string
          volume_cents?: number
          yes_price?: number
        }
        Relationships: []
      }
      news_articles: {
        Row: {
          body: string | null
          category: Database["public"]["Enums"]["market_category"]
          created_at: string
          id: string
          is_breaking: boolean
          is_verified: boolean
          market_id: string | null
          source_name: string
          source_url: string | null
          submitted_by: string | null
          title: string
        }
        Insert: {
          body?: string | null
          category: Database["public"]["Enums"]["market_category"]
          created_at?: string
          id?: string
          is_breaking?: boolean
          is_verified?: boolean
          market_id?: string | null
          source_name: string
          source_url?: string | null
          submitted_by?: string | null
          title: string
        }
        Update: {
          body?: string | null
          category?: Database["public"]["Enums"]["market_category"]
          created_at?: string
          id?: string
          is_breaking?: boolean
          is_verified?: boolean
          market_id?: string | null
          source_name?: string
          source_url?: string | null
          submitted_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_depth_v"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "news_articles_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_subsidy_estimate"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "news_articles_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          link: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          id: string
          market_id: string
          outcome: string
          outcome_id: string | null
          price: number
          quantity: number
          side: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          outcome: string
          outcome_id?: string | null
          price: number
          quantity: number
          side: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          outcome?: string
          outcome_id?: string | null
          price?: number
          quantity?: number
          side?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_depth_v"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_subsidy_estimate"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_price_history: {
        Row: {
          id: number
          market_id: string
          outcome_id: string
          price: number
          recorded_at: string
        }
        Insert: {
          id?: number
          market_id: string
          outcome_id: string
          price: number
          recorded_at?: string
        }
        Update: {
          id?: number
          market_id?: string
          outcome_id?: string
          price?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcome_price_history_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "market_outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          avg_price: number
          id: string
          market_id: string
          outcome: string
          outcome_id: string | null
          shares: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_price?: number
          id?: string
          market_id: string
          outcome: string
          outcome_id?: string | null
          shares?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_price?: number
          id?: string
          market_id?: string
          outcome?: string
          outcome_id?: string | null
          shares?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_depth_v"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_subsidy_estimate"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          id: number
          market_id: string
          recorded_at: string
          yes_price: number
        }
        Insert: {
          id?: number
          market_id: string
          recorded_at?: string
          yes_price: number
        }
        Update: {
          id?: number
          market_id?: string
          recorded_at?: string
          yes_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_depth_v"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "price_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_subsidy_estimate"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "price_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          current_streak: number
          display_name: string | null
          flag_reason: string | null
          id: string
          kes_balance: number
          kyc_tier: number
          last_seen_ip: unknown
          last_trade_date: string | null
          longest_streak: number
          oko_balance: number
          onboarded: boolean
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          sound_enabled: boolean
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          current_streak?: number
          display_name?: string | null
          flag_reason?: string | null
          id: string
          kes_balance?: number
          kyc_tier?: number
          last_seen_ip?: unknown
          last_trade_date?: string | null
          longest_streak?: number
          oko_balance?: number
          onboarded?: boolean
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          sound_enabled?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          current_streak?: number
          display_name?: string | null
          flag_reason?: string | null
          id?: string
          kes_balance?: number
          kyc_tier?: number
          last_seen_ip?: unknown
          last_trade_date?: string | null
          longest_streak?: number
          oko_balance?: number
          onboarded?: boolean
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          sound_enabled?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      raw_news_data: {
        Row: {
          analyze_attempts: number
          body: string | null
          category: Database["public"]["Enums"]["market_category"] | null
          created_at: string
          entities: Json | null
          id: string
          image_url: string | null
          last_error: string | null
          processed: boolean
          published_at: string
          relevant_keywords: string[] | null
          sentiment_score: number | null
          source: string
          title: string
          topics: string[] | null
          url: string
        }
        Insert: {
          analyze_attempts?: number
          body?: string | null
          category?: Database["public"]["Enums"]["market_category"] | null
          created_at?: string
          entities?: Json | null
          id?: string
          image_url?: string | null
          last_error?: string | null
          processed?: boolean
          published_at?: string
          relevant_keywords?: string[] | null
          sentiment_score?: number | null
          source: string
          title: string
          topics?: string[] | null
          url: string
        }
        Update: {
          analyze_attempts?: number
          body?: string | null
          category?: Database["public"]["Enums"]["market_category"] | null
          created_at?: string
          entities?: Json | null
          id?: string
          image_url?: string | null
          last_error?: string | null
          processed?: boolean
          published_at?: string
          relevant_keywords?: string[] | null
          sentiment_score?: number | null
          source?: string
          title?: string
          topics?: string[] | null
          url?: string
        }
        Relationships: []
      }
      rpc_call_log: {
        Row: {
          called_at: string
          fn: string
          id: number
          market_id: string | null
          user_id: string
        }
        Insert: {
          called_at?: string
          fn: string
          id?: number
          market_id?: string | null
          user_id: string
        }
        Update: {
          called_at?: string
          fn?: string
          id?: number
          market_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          author: string | null
          created_at: string
          engagement: number
          id: string
          keyword: string
          platform: string
          post_url: string
          posted_at: string
          sentiment: number | null
          text: string
        }
        Insert: {
          author?: string | null
          created_at?: string
          engagement?: number
          id?: string
          keyword: string
          platform?: string
          post_url: string
          posted_at?: string
          sentiment?: number | null
          text: string
        }
        Update: {
          author?: string | null
          created_at?: string
          engagement?: number
          id?: string
          keyword?: string
          platform?: string
          post_url?: string
          posted_at?: string
          sentiment?: number | null
          text?: string
        }
        Relationships: []
      }
      source_health: {
        Row: {
          articles_24h: number
          consecutive_failures: number
          last_error: string | null
          last_fetch_at: string | null
          last_success_at: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          articles_24h?: number
          consecutive_failures?: number
          last_error?: string | null
          last_fetch_at?: string | null
          last_success_at?: string | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          articles_24h?: number
          consecutive_failures?: number
          last_error?: string | null
          last_fetch_at?: string | null
          last_success_at?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_ticket_attachments: {
        Row: {
          created_at: string
          id: string
          message_id: string | null
          mime_type: string
          size_bytes: number
          storage_path: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id?: string | null
          mime_type: string
          size_bytes: number
          storage_path: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string | null
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: []
      }
      support_ticket_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_admin: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_admin?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: Database["public"]["Enums"]["ticket_category"]
          created_at: string
          description: string
          id: string
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description?: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      trades: {
        Row: {
          cost_cents: number
          created_at: string
          id: string
          market_id: string
          order_id: string | null
          outcome: string
          outcome_id: string | null
          price: number
          quantity: number
          side: string
          user_id: string
        }
        Insert: {
          cost_cents: number
          created_at?: string
          id?: string
          market_id: string
          order_id?: string | null
          outcome: string
          outcome_id?: string | null
          price: number
          quantity: number
          side?: string
          user_id: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          id?: string
          market_id?: string
          order_id?: string | null
          outcome?: string
          outcome_id?: string | null
          price?: number
          quantity?: number
          side?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_depth_v"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "market_subsidy_estimate"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_cents: number
          created_at: string
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      treasury_snapshot: {
        Row: {
          id: number
          refreshed_at: string
          total_kes_cents: number
        }
        Insert: {
          id?: number
          refreshed_at?: string
          total_kes_cents?: number
        }
        Update: {
          id?: number
          refreshed_at?: string
          total_kes_cents?: number
        }
        Relationships: []
      }
      trending_keywords: {
        Row: {
          avg_sentiment: number
          category: string | null
          confidence: number
          growth: number
          keyword: string
          lifecycle: string
          mentions_1h: number
          mentions_prev_1h: number
          sample_article_ids: string[] | null
          social_mentions_6h: number
          trend_score: number
          updated_at: string
          velocity: number
        }
        Insert: {
          avg_sentiment?: number
          category?: string | null
          confidence?: number
          growth?: number
          keyword: string
          lifecycle?: string
          mentions_1h?: number
          mentions_prev_1h?: number
          sample_article_ids?: string[] | null
          social_mentions_6h?: number
          trend_score?: number
          updated_at?: string
          velocity?: number
        }
        Update: {
          avg_sentiment?: number
          category?: string | null
          confidence?: number
          growth?: number
          keyword?: string
          lifecycle?: string
          mentions_1h?: number
          mentions_prev_1h?: number
          sample_article_ids?: string[] | null
          social_mentions_6h?: number
          trend_score?: number
          updated_at?: string
          velocity?: number
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          code: string
          seen: boolean
          unlocked_at: string
          user_id: string
        }
        Insert: {
          code: string
          seen?: boolean
          unlocked_at?: string
          user_id: string
        }
        Update: {
          code?: string
          seen?: boolean
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["code"]
          },
        ]
      }
      user_risk_scores: {
        Row: {
          reasons: Json
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          reasons?: Json
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          reasons?: Json
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          fingerprint: string | null
          first_seen_at: string
          id: string
          ip: unknown
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          fingerprint?: string | null
          first_seen_at?: string
          id?: string
          ip?: unknown
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          fingerprint?: string | null
          first_seen_at?: string
          id?: string
          ip?: unknown
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      market_depth_v: {
        Row: {
          b: number | null
          cost_per_cent_kes: number | null
          initial_liquidity_kes: number | null
          initial_prob: number | null
          market_id: string | null
          market_type: string | null
          question: string | null
          slug: string | null
          status: Database["public"]["Enums"]["market_status"] | null
          volume_cents: number | null
          yes_price: number | null
        }
        Insert: {
          b?: number | null
          cost_per_cent_kes?: never
          initial_liquidity_kes?: never
          initial_prob?: number | null
          market_id?: string | null
          market_type?: string | null
          question?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["market_status"] | null
          volume_cents?: number | null
          yes_price?: number | null
        }
        Update: {
          b?: number | null
          cost_per_cent_kes?: never
          initial_liquidity_kes?: never
          initial_prob?: number | null
          market_id?: string | null
          market_type?: string | null
          question?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["market_status"] | null
          volume_cents?: number | null
          yes_price?: number | null
        }
        Relationships: []
      }
      market_subsidy_estimate: {
        Row: {
          liquidity_b: number | null
          market_id: string | null
          market_type: string | null
          max_subsidy_kes: number | null
          question: string | null
          realized_payout_kes: number | null
          realized_revenue_kes: number | null
          slug: string | null
          status: Database["public"]["Enums"]["market_status"] | null
        }
        Insert: {
          liquidity_b?: number | null
          market_id?: string | null
          market_type?: string | null
          max_subsidy_kes?: never
          question?: string | null
          realized_payout_kes?: never
          realized_revenue_kes?: never
          slug?: string | null
          status?: Database["public"]["Enums"]["market_status"] | null
        }
        Update: {
          liquidity_b?: number | null
          market_id?: string | null
          market_type?: string | null
          max_subsidy_kes?: never
          question?: string | null
          realized_payout_kes?: never
          realized_revenue_kes?: never
          slug?: string | null
          status?: Database["public"]["Enums"]["market_status"] | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_acknowledge_alert: { Args: { _id: string }; Returns: undefined }
      admin_adjust_liquidity: {
        Args: { _market_id: string; _new_b: number }
        Returns: undefined
      }
      admin_detect_syndicates: {
        Args: { _window_minutes?: number }
        Returns: {
          cluster_key: string
          display_names: string[]
          market_id: string
          outcome: string
          question: string
          shared_fingerprint_count: number
          shared_ip_count: number
          suspicion_score: number
          total_cost_cents: number
          total_quantity: number
          user_count: number
          user_ids: string[]
        }[]
      }
      admin_edge_opportunities: {
        Args: { _limit?: number }
        Returns: {
          confidence: number
          edge: number
          market_id: string
          market_prob: number
          question: string
          signal_prob: number
        }[]
      }
      admin_overview_stats: { Args: never; Returns: Json }
      admin_pause_market: { Args: { _id: string }; Returns: undefined }
      admin_recent_trades: {
        Args: {
          _limit?: number
          _market_id?: string
          _min_cents?: number
          _user_id?: string
        }
        Returns: {
          cost_cents: number
          created_at: string
          display_name: string
          id: string
          market_id: string
          outcome: string
          price: number
          quantity: number
          question: string
          side: string
          user_id: string
        }[]
      }
      admin_reset_balance: {
        Args: { _amount_cents?: number; _user_id: string }
        Returns: Json
      }
      admin_resume_market: { Args: { _id: string }; Returns: undefined }
      admin_set_user_status: {
        Args: { _reason?: string; _status: string; _user_id: string }
        Returns: undefined
      }
      admin_user_stats: { Args: { _user_id: string }; Returns: Json }
      apply_signal_to_market: { Args: { _market_id: string }; Returns: Json }
      assert_trade_caps: {
        Args: { _market_id: string; _new_cost_cents: number; _uid: string }
        Returns: undefined
      }
      check_rate_limit: {
        Args: { _fn: string; _max: number; _window_seconds: number }
        Returns: undefined
      }
      compute_market_signal: { Args: { _market_id: string }; Returns: Json }
      compute_true_value: {
        Args: { _market_id: string }
        Returns: {
          confidence: number
          edge: number
          market_prob: number
          true_prob: number
        }[]
      }
      execute_lmsr_trade_binary: {
        Args: {
          _market_id: string
          _outcome: string
          _quantity: number
          _side: string
        }
        Returns: Json
      }
      execute_lmsr_trade_multi: {
        Args: {
          _market_id: string
          _outcome_id: string
          _quantity: number
          _side: string
        }
        Returns: Json
      }
      get_leaderboard: {
        Args: { _limit?: number; _period?: string }
        Returns: {
          avatar_url: string
          display_name: string
          realized_pnl_cents: number
          total_pnl_cents: number
          trade_count: number
          unrealized_pnl_cents: number
          user_id: string
          volume_cents: number
          win_rate: number
        }[]
      }
      get_setting_numeric: {
        Args: { _default: number; _key: string }
        Returns: number
      }
      get_user_public_positions: {
        Args: { _user_id: string }
        Returns: {
          avg_price: number
          category: string
          current_price: number
          market_id: string
          outcome: string
          pnl_pct: number
          question: string
          shares: number
          slug: string
        }[]
      }
      get_user_public_stats: {
        Args: { _user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          member_since: string
          realized_pnl_cents: number
          total_pnl_cents: number
          trade_count: number
          unrealized_pnl_cents: number
          user_id: string
          volume_cents: number
          win_rate: number
        }[]
      }
      get_user_trade_limits: { Args: { _market_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_current_user_admin: { Args: never; Returns: boolean }
      leaderboard_rising_stars: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          pnl_24h_cents: number
          trade_count: number
          user_id: string
        }[]
      }
      lmsr_cost: { Args: { _b: number; _q: number[] }; Returns: number }
      lmsr_price: {
        Args: { _b: number; _i: number; _q: number[] }
        Returns: number
      }
      lmsr_trade_cost: {
        Args: { _b: number; _delta: number; _i: number; _q: number[] }
        Returns: number
      }
      market_activity: { Args: { _market_id: string }; Returns: Json }
      match_news_to_markets: {
        Args: { _market_ids: string[]; _per_market?: number }
        Returns: {
          article_id: string
          market_id: string
          published_at: string
          source: string
          title: string
          url: string
        }[]
      }
      record_session: {
        Args: { _fingerprint: string; _user_agent: string }
        Returns: undefined
      }
      record_trade_engagement: {
        Args: {
          _category: string
          _market_id: string
          _seconds_on_page?: number
        }
        Returns: Json
      }
      refresh_treasury: { Args: never; Returns: undefined }
      rescale_liquidity: {
        Args: { _market_id: string; _new_b: number }
        Returns: undefined
      }
      resolve_market: {
        Args: { _market_id: string; _outcome: boolean }
        Returns: undefined
      }
      resolve_multi_market: {
        Args: { _market_id: string; _winning_outcome_id: string }
        Returns: undefined
      }
      run_signal_update_all: { Args: never; Returns: Json }
      score_user_behavior: { Args: never; Returns: Json }
      seed_lmsr_market: {
        Args: { _b: number; _initial_prob: number; _market_id: string }
        Returns: undefined
      }
      seed_lmsr_market_from_signal: {
        Args: {
          _confidence: number
          _initial_liquidity_kes?: number
          _initial_prob: number
          _market_id: string
        }
        Returns: Json
      }
      seed_market_priors: { Args: { _market_id: string }; Returns: Json }
      set_self_kyc_unverified: { Args: never; Returns: undefined }
      set_self_kyc_verified: { Args: never; Returns: Json }
      simulate_lmsr_trade: {
        Args: {
          _market_id: string
          _outcome: string
          _outcome_id: string
          _quantity: number
          _side: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      kyc_id_type: "national_id" | "passport"
      kyc_status: "pending" | "approved" | "rejected"
      market_category:
        | "politics"
        | "sports"
        | "entertainment"
        | "fashion"
        | "economics"
      market_status: "open" | "closed" | "resolved"
      ticket_category:
        | "account"
        | "kyc"
        | "deposits"
        | "withdrawals"
        | "trading"
        | "bug"
        | "other"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      kyc_id_type: ["national_id", "passport"],
      kyc_status: ["pending", "approved", "rejected"],
      market_category: [
        "politics",
        "sports",
        "entertainment",
        "fashion",
        "economics",
      ],
      market_status: ["open", "closed", "resolved"],
      ticket_category: [
        "account",
        "kyc",
        "deposits",
        "withdrawals",
        "trading",
        "bug",
        "other",
      ],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
    },
  },
} as const
