-- Liravo: complete schema for a new PostgreSQL 15+ or Supabase database.
-- Run the entire file once in the database SQL editor.
BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL check_function_bodies = false;

DO $setup$
DECLARE role_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')) THEN
    RAISE EXCEPTION 'Use a new database with an empty public schema';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN',role_name);
    END IF;
  END LOOP;
  IF to_regnamespace('auth') IS NULL THEN
    CREATE SCHEMA auth;
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE $sql$CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'$sql$;
  END IF;
  IF to_regprocedure('auth.role()') IS NULL THEN
    EXECUTE $sql$CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      'SELECT coalesce(nullif(current_setting(''request.jwt.claim.role'',true),''''),current_user::text)'$sql$;
  END IF;
END $setup$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- Tables and constraints.

CREATE SEQUENCE public.account_export_epoch START WITH 1;
SELECT setval('public.account_export_epoch',1,true);
CREATE SEQUENCE public.account_export_floor START WITH 2;
SELECT setval('public.account_export_floor',2,true);
CREATE TABLE public.account_export_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,request_key text NOT NULL CHECK(length(request_key)between 8 and 200),
 format text NOT NULL CHECK(format in('json','csv')),epoch bigint NOT NULL,datasets jsonb NOT NULL,
 created_at timestamp with time zone DEFAULT clock_timestamp()NOT NULL,expires_at timestamp with time zone DEFAULT(clock_timestamp()+interval '24 hours')NOT NULL,
 UNIQUE(user_id,request_key)
);
CREATE TABLE public.account_export_current(table_name text NOT NULL,row_key jsonb NOT NULL,epoch bigint NOT NULL,PRIMARY KEY(table_name,row_key));
CREATE TABLE public.account_export_versions(table_name text NOT NULL,row_key jsonb NOT NULL,born_epoch bigint NOT NULL,removed_epoch bigint NOT NULL,data jsonb NOT NULL,PRIMARY KEY(table_name,row_key,born_epoch,removed_epoch));

CREATE TABLE public.account_hardening_notices (
 user_id uuid NOT NULL,
 stage integer NOT NULL CHECK(stage in(7,30)),
 notified_at timestamp with time zone DEFAULT now() NOT NULL,
 PRIMARY KEY(user_id,stage)
);

CREATE TABLE public.affiliate_health_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    book_title text NOT NULL,
    issue text NOT NULL,
    flagged_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT affiliate_health_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.affiliate_link_clicks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    user_id_hash text,
    link_type text NOT NULL,
    store_name text,
    country text,
    is_affiliate boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    link_id text,
    store_id uuid,
    CONSTRAINT affiliate_link_clicks_pkey PRIMARY KEY (id)
);

CREATE TABLE public.affiliate_stores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    countries text[] DEFAULT '{}'::text[] NOT NULL,
    url_template text NOT NULL,
    affiliate_tag text,
    is_active boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    is_non_affiliate boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT affiliate_stores_pkey PRIMARY KEY (id)
);

CREATE TABLE public.ai_taste_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    profile_text text NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_data jsonb,
    policy_version text,
    source_hash text,
    locale text,
    provider text,
    CONSTRAINT ai_taste_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT ai_taste_profiles_user_id_key UNIQUE (user_id)
);

CREATE TABLE public.appeals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    report_id uuid,
    reason text NOT NULL,
    content_type text,
    content_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewer_note text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT appeals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT appeals_pkey PRIMARY KEY (id)
);

CREATE TABLE public.arc_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    arc_id uuid NOT NULL,
    reader_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    CONSTRAINT arc_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT arc_applications_arc_id_reader_id_key UNIQUE (arc_id, reader_id),
    CONSTRAINT arc_applications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.arcs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    book_id uuid NOT NULL,
    description text,
    reader_slots integer DEFAULT 5 NOT NULL,
    close_date timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT arcs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.ask_writer_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    user_id uuid NOT NULL,
    answer text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT ask_writer_answers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.ask_writer_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    question text NOT NULL,
    best_answer_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    answer_count integer DEFAULT 0 NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT ask_writer_questions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.auth_email_challenges (
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    purpose text NOT NULL,
    email text NOT NULL,
    original_email text,
    expected_version integer NOT NULL,
    expected_pin_hash text,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_email_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['verify'::text, 'recover'::text]))),
    CONSTRAINT auth_email_challenges_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT auth_email_challenges_pkey PRIMARY KEY (token_hash),
    CONSTRAINT auth_email_challenges_user_id_purpose_key UNIQUE (user_id, purpose)
);

CREATE TABLE public.auth_factor_challenges (
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    expected_version integer NOT NULL,
    provider_session_hash text,
    encrypted_payload text,
    attempts integer DEFAULT 0 NOT NULL,
    verified_at timestamp with time zone,
    grant_hash text,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_factor_challenges_kind_check CHECK ((kind = ANY (ARRAY['login'::text, 'setup'::text]))),
    CONSTRAINT auth_factor_challenges_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT auth_factor_challenges_pkey PRIMARY KEY (token_hash)
);

CREATE TABLE public.auth_factor_grants (
    session_hash text NOT NULL,
    user_id uuid NOT NULL,
    mfa_version integer NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_factor_grants_session_hash_check CHECK ((session_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT auth_factor_grants_pkey PRIMARY KEY (session_hash)
);

CREATE TABLE public.author_books (
    author_id uuid NOT NULL,
    book_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT author_books_pkey PRIMARY KEY (author_id, book_id)
);

CREATE TABLE public.author_catalog_intents (
    actor_id uuid NOT NULL,
    intent_key text NOT NULL,
    request_hash text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT author_catalog_intents_pkey PRIMARY KEY (actor_id, intent_key)
);

CREATE TABLE public.author_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    book_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body text,
    type text DEFAULT 'blog'::text NOT NULL,
    followers_notified boolean DEFAULT false NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT author_posts_type_check CHECK ((type = ANY (ARRAY['announcement'::text, 'blog'::text, 'arc_invite'::text]))),
    CONSTRAINT author_posts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.author_qa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    asked_by uuid,
    question text NOT NULL,
    answer text,
    is_public boolean DEFAULT true NOT NULL,
    answered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT author_qa_question_check CHECK (((char_length(question) >= 10) AND (char_length(question) <= 500))),
    CONSTRAINT author_qa_pkey PRIMARY KEY (id)
);

CREATE TABLE public.author_verification_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pen_name text NOT NULL,
    publisher text,
    book_titles text NOT NULL,
    website_url text,
    social_proof_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    CONSTRAINT author_verification_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT author_verification_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.author_work_claims (
    author_id uuid NOT NULL,
    work_id uuid NOT NULL,
    verified_by uuid,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT author_work_claims_pkey PRIMARY KEY (author_id, work_id)
);

CREATE TABLE public.billing_accounts (
    provider text NOT NULL,
    account_id text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_accounts_provider_check CHECK ((provider = 'google_play'::text)),
    CONSTRAINT billing_accounts_pkey PRIMARY KEY (provider, account_id)
);

CREATE TABLE public.billing_webhook_receipts (
    provider text NOT NULL,
    delivery_id text NOT NULL,
    fingerprint text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_webhook_receipts_status_check CHECK ((status = ANY (ARRAY['pending_ack'::text, 'processed'::text]))),
    CONSTRAINT billing_webhook_receipts_pkey PRIMARY KEY (provider, delivery_id)
);

CREATE TABLE public.book_catalog_audit (
    id bigint NOT NULL,
    book_id uuid NOT NULL,
    reason text NOT NULL,
    previous_data jsonb NOT NULL,
    resolution jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT book_catalog_audit_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_debates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    user_id uuid NOT NULL,
    question text NOT NULL,
    yes_count integer DEFAULT 0 NOT NULL,
    no_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT debates_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_edition_identifiers (
    provider text NOT NULL,
    identifier text NOT NULL,
    book_id uuid NOT NULL,
    CONSTRAINT book_edition_identifiers_identifier_check CHECK (((length(identifier) >= 1) AND (length(identifier) <= 200))),
    CONSTRAINT book_edition_identifiers_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'openlibrary'::text, 'goodreads'::text]))),
    CONSTRAINT book_edition_identifiers_pkey PRIMARY KEY (provider, identifier)
);

CREATE TABLE public.book_passes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    book_id uuid NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT book_passes_check CHECK ((sender_id <> recipient_id)),
    CONSTRAINT book_passes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_work_identifiers (
    open_library_id text NOT NULL,
    work_id uuid NOT NULL,
    CONSTRAINT book_work_identifiers_open_library_id_check CHECK ((open_library_id ~ '^/works/OL[1-9][0-9]*W$'::text)),
    CONSTRAINT book_work_identifiers_pkey PRIMARY KEY (open_library_id)
);

CREATE TABLE public.book_works (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    author_name text NOT NULL,
    open_library_id text,
    merged_into uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT book_works_check CHECK (((merged_into IS NULL) OR (merged_into <> id))),
    CONSTRAINT book_works_open_library_id_check CHECK ((open_library_id ~ '^/works/OL[1-9][0-9]*W$'::text)),
    CONSTRAINT book_works_title_check CHECK (((length(title) >= 1) AND (length(title) <= 500))),
    CONSTRAINT book_works_open_library_id_key UNIQUE (open_library_id),
    CONSTRAINT book_works_pkey PRIMARY KEY (id)
);

CREATE TABLE public.books (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    google_books_id text,
    open_library_id text,
    isbn_10 text,
    isbn_13 text,
    title text NOT NULL,
    subtitle text,
    author_name text NOT NULL,
    author_names text[] DEFAULT '{}'::text[] NOT NULL,
    publisher text,
    published_year integer,
    description text,
    cover_url text,
    page_count integer,
    genres text[] DEFAULT '{}'::text[] NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    has_audiobook boolean DEFAULT false NOT NULL,
    average_rating numeric(3,2),
    ratings_count integer DEFAULT 0 NOT NULL,
    currently_reading_count integer DEFAULT 0 NOT NULL,
    want_to_read_count integer DEFAULT 0 NOT NULL,
    have_read_count integer DEFAULT 0 NOT NULL,
    similar_book_ids uuid[],
    search_vector tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    work_id uuid NOT NULL,
    canonical_edition_id uuid,
    edition_name text,
    format text,
    metadata_source text DEFAULT 'legacy'::text NOT NULL,
    metadata_provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT books_check CHECK ((canonical_edition_id <> id)),
    CONSTRAINT books_edition_name_check CHECK ((length(edition_name) <= 200)),
    CONSTRAINT books_format_check CHECK ((format = ANY (ARRAY['hardcover'::text, 'paperback'::text, 'ebook'::text, 'audiobook'::text]))),
    CONSTRAINT books_metadata_provenance_check CHECK ((jsonb_typeof(metadata_provenance) = 'object'::text)),
    CONSTRAINT books_metadata_source_check CHECK ((metadata_source = ANY (ARRAY['legacy'::text, 'seed'::text, 'goodreads'::text, 'google'::text, 'openlibrary'::text]))),
    CONSTRAINT books_google_books_id_key UNIQUE (google_books_id),
    CONSTRAINT books_isbn_13_key UNIQUE (isbn_13),
    CONSTRAINT books_open_library_id_key UNIQUE (open_library_id),
    CONSTRAINT books_pkey PRIMARY KEY (id)
);

CREATE TABLE public.buddy_read_members (
    buddy_read_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT buddy_read_members_pkey PRIMARY KEY (buddy_read_id, user_id)
);

CREATE TABLE public.buddy_read_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buddy_read_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT buddy_read_messages_pkey PRIMARY KEY (id)
);

CREATE TABLE public.buddy_read_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buddy_read_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reply_to_id uuid,
    idempotency_key text,
    request_hash text,
    CONSTRAINT buddy_read_notes_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 2000))),
    CONSTRAINT buddy_read_notes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.buddy_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    created_by uuid NOT NULL,
    title text,
    max_participants integer DEFAULT 20 NOT NULL,
    is_private boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_chapter integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT buddy_reads_pkey PRIMARY KEY (id)
);

CREATE TABLE public.challenge_participants (
    challenge_id uuid NOT NULL,
    user_id uuid NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT challenge_participants_pkey PRIMARY KEY (challenge_id, user_id)
);

CREATE TABLE public.challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    type text DEFAULT 'reading'::text NOT NULL,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    badge_name text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cadence text DEFAULT 'weekly'::text NOT NULL,
    goal_books integer,
    goal_pages integer,
    CONSTRAINT challenges_cadence_check CHECK ((cadence = ANY (ARRAY['weekly'::text, 'monthly'::text]))),
    CONSTRAINT challenges_goal_books_check CHECK ((goal_books > 0)),
    CONSTRAINT challenges_goal_pages_check CHECK ((goal_pages > 0)),
    CONSTRAINT challenges_type_check CHECK ((type = ANY (ARRAY['reading'::text, 'writing'::text]))),
    CONSTRAINT challenges_pkey PRIMARY KEY (id)
);

CREATE TABLE public.checkout_reconciliations (
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    reference text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    claim_token uuid,
    claimed_at timestamp with time zone,
    last_checked_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT (now() + '00:01:00'::interval) NOT NULL,
    scan_page integer DEFAULT 0 NOT NULL,
    last_error text,
    correlation_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT checkout_reconciliations_entity_type_check CHECK ((entity_type = ANY (ARRAY['tip'::text, 'subscription'::text, 'ticket'::text]))),
    CONSTRAINT checkout_reconciliations_provider_check CHECK ((provider = ANY (ARRAY['paystack'::text, 'dodopayments'::text]))),
    CONSTRAINT checkout_reconciliations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'settled'::text, 'failed'::text]))),
    CONSTRAINT checkout_reconciliations_pkey PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE public.community_note_ratings (
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_helpful boolean NOT NULL,
    rated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_note_ratings_pkey PRIMARY KEY (note_id, user_id)
);

CREATE TABLE public.community_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_type text NOT NULL,
    content_id uuid NOT NULL,
    author_id uuid NOT NULL,
    note_text text NOT NULL,
    helpful_votes integer DEFAULT 0 NOT NULL,
    unhelpful_votes integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT community_notes_content_type_check CHECK ((content_type = ANY (ARRAY['review'::text, 'quote'::text, 'profile'::text, 'debate'::text, 'post'::text, 'comment'::text]))),
    CONSTRAINT community_notes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT community_notes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.content_intents (
    actor_id uuid NOT NULL,
    action text NOT NULL,
    intent_key text NOT NULL,
    fingerprint text NOT NULL,
    response jsonb NOT NULL,
    CONSTRAINT content_intents_pkey PRIMARY KEY (actor_id, action, intent_key)
);

CREATE TABLE public.content_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    moderator_id uuid,
    moderator_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    idempotency_key text,
    request_hash text,
    CONSTRAINT content_reports_entity_type_check CHECK ((entity_type = ANY (ARRAY['review'::text, 'quote'::text, 'comment'::text, 'user'::text]))),
    CONSTRAINT content_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'removed'::text, 'warned'::text, 'escalated'::text]))),
    CONSTRAINT content_reports_pkey PRIMARY KEY (id)
);

CREATE TABLE public.custom_themes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    css_overrides text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_themes_name_key UNIQUE (name),
    CONSTRAINT custom_themes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.debate_votes (
    debate_id uuid NOT NULL,
    user_id uuid NOT NULL,
    vote text NOT NULL,
    argument text,
    voted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT debate_votes_vote_check CHECK ((vote = ANY (ARRAY['yes'::text, 'no'::text]))),
    CONSTRAINT debate_votes_pkey PRIMARY KEY (debate_id, user_id)
);

CREATE TABLE public.digest_deliveries (
    user_id uuid NOT NULL,
    period_start date NOT NULL,
    status text NOT NULL,
    attempts integer DEFAULT 1 NOT NULL,
    message_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    claim_id uuid,
    CONSTRAINT digest_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'skipped'::text, 'failed'::text, 'unknown'::text]))),
    CONSTRAINT digest_deliveries_pkey PRIMARY KEY (user_id, period_start)
);

CREATE TABLE public.digest_email_campaigns (
    period_start date NOT NULL,
    user_cursor uuid,
    audience_complete boolean DEFAULT false NOT NULL,
    CONSTRAINT digest_email_campaigns_pkey PRIMARY KEY (period_start)
);

CREATE TABLE public.email_unsubscribe_proofs (
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    email_hash text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '180 days'::interval) NOT NULL,
    consumed_at timestamp with time zone,
    CONSTRAINT email_unsubscribe_proofs_kind_check CHECK ((kind = ANY (ARRAY['weekly_digest'::text, 'new_release_alert'::text]))),
    CONSTRAINT email_unsubscribe_proofs_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT email_unsubscribe_proofs_pkey PRIMARY KEY (token_hash)
);

CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT email_verification_tokens_token_key UNIQUE (token),
    CONSTRAINT uq_evtoken_user UNIQUE (user_id)
);

CREATE TABLE public.event_revenue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    organizer_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    ticket_id uuid,
    original_amount numeric(10,2),
    verified boolean DEFAULT false NOT NULL,
    CONSTRAINT event_revenue_pkey PRIMARY KEY (id)
);

CREATE TABLE public.event_rsvps (
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rsvped_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_rsvps_pkey PRIMARY KEY (event_id, user_id)
);

CREATE TABLE public.event_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount_paid numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organizer_id uuid NOT NULL,
    platform_fee numeric(10,2) NOT NULL,
    host_amount numeric(10,2) NOT NULL,
    provider text NOT NULL,
    provider_checkout_id text,
    checkout_url text,
    reserved_until timestamp with time zone,
    idempotency_key text,
    CONSTRAINT event_tickets_provider_check CHECK ((provider = ANY (ARRAY['paystack'::text, 'dodopayments'::text]))),
    CONSTRAINT event_tickets_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'expired'::text, 'confirmed'::text, 'refund_pending'::text, 'refunded'::text, 'legacy_hold'::text]))),
    CONSTRAINT event_tickets_pkey PRIMARY KEY (id)
);

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id uuid NOT NULL,
    book_id uuid,
    title text NOT NULL,
    description text,
    event_date timestamp with time zone NOT NULL,
    external_url text,
    is_paid boolean DEFAULT false NOT NULL,
    ticket_price numeric(10,2),
    currency text DEFAULT 'USD'::text,
    platform_fee_pct numeric(4,2) DEFAULT 10.00 NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_attendees integer,
    idempotency_key text,
    request_hash text,
    CONSTRAINT events_max_attendees_check CHECK ((max_attendees > 0)),
    CONSTRAINT events_pkey PRIMARY KEY (id)
);

CREATE TABLE public.feature_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feature_flags_name_key UNIQUE (name),
    CONSTRAINT feature_flags_pkey PRIMARY KEY (id)
);

CREATE TABLE public.financial_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    target_user_id uuid,
    action text NOT NULL,
    amount numeric(18,4),
    currency text,
    idempotency_key text,
    provider text,
    provider_event_id text,
    correlation_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_audit_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.follows (
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE public.goodreads_book_identities (
    goodreads_id text NOT NULL,
    book_id uuid NOT NULL,
    CONSTRAINT goodreads_book_identities_goodreads_id_check CHECK ((goodreads_id ~ '^[1-9][0-9]{0,19}$'::text)),
    CONSTRAINT goodreads_book_identities_pkey PRIMARY KEY (goodreads_id)
);

CREATE TABLE public.leaderboard_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    board_type text NOT NULL,
    snapshot_date date NOT NULL,
    data jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leaderboard_snapshots_board_type_snapshot_date_key UNIQUE (board_type, snapshot_date),
    CONSTRAINT leaderboard_snapshots_pkey PRIMARY KEY (id)
);

CREATE TABLE public.legacy_goodreads_import_intents (
    actor_id uuid NOT NULL,
    intent_key text NOT NULL,
    fingerprint text NOT NULL,
    CONSTRAINT legacy_goodreads_import_intents_pkey PRIMARY KEY (actor_id, intent_key)
);

CREATE TABLE public.maintenance_jobs (
 name text PRIMARY KEY CHECK(length(name)between 1 and 256),
 owner uuid,
 epoch bigint DEFAULT 0 NOT NULL,
 lease_until timestamp with time zone DEFAULT '-infinity' NOT NULL,
 after_id uuid,
 cycle_started_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.moderation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    moderator_id uuid,
    target_user_id uuid,
    report_id uuid,
    action text NOT NULL,
    reason text,
    notes text,
    entity_type text,
    entity_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT moderation_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    actor_id uuid,
    entity_type text,
    entity_id uuid,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    message_key text,
    message_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT notifications_message_key_check CHECK (((message_key IS NULL) OR ((length(message_key) >= 1) AND (length(message_key) <= 100)))),
    CONSTRAINT notifications_message_values_check CHECK ((jsonb_typeof(message_values) = 'object'::text)),
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    CONSTRAINT outbox_events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text]))),
    CONSTRAINT outbox_events_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pass_the_book_chains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pass_the_book_chains_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pass_the_book_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chain_id uuid NOT NULL,
    user_id uuid NOT NULL,
    nominee_id uuid,
    note text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pass_the_book_nodes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.payment_captures (
    provider text NOT NULL,
    payment_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    user_id uuid NOT NULL,
    recipient_id uuid,
    currency text NOT NULL,
    charged_minor bigint NOT NULL,
    credited boolean DEFAULT true NOT NULL,
    refunded_minor bigint DEFAULT 0 NOT NULL,
    period_end timestamp with time zone,
    event_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_captures_charged_minor_check CHECK ((charged_minor > 0)),
    CONSTRAINT payment_captures_check CHECK (((refunded_minor >= 0) AND (refunded_minor <= charged_minor))),
    CONSTRAINT payment_captures_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'NGN'::text, 'EUR'::text]))),
    CONSTRAINT payment_captures_entity_type_check CHECK ((entity_type = ANY (ARRAY['tip'::text, 'subscription'::text, 'ticket'::text]))),
    CONSTRAINT payment_captures_provider_check CHECK ((provider = ANY (ARRAY['paystack'::text, 'dodopayments'::text]))),
    CONSTRAINT payment_captures_pkey PRIMARY KEY (provider, payment_id)
);

CREATE TABLE public.payment_events (
    provider text NOT NULL,
    event_id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_events_pkey PRIMARY KEY (provider, event_id)
);

CREATE TABLE public.payment_refunds (
    provider text NOT NULL,
    refund_id text NOT NULL,
    payment_id text NOT NULL,
    amount_minor bigint NOT NULL,
    currency text NOT NULL,
    correlation_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_refunds_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT payment_refunds_pkey PRIMARY KEY (provider, refund_id)
);

CREATE TABLE public.payment_returns (
    provider text NOT NULL,
    payment_id text NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_refund_id text,
    attempts integer DEFAULT 0 NOT NULL,
    claim_token uuid,
    claimed_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    correlation_id text,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_returns_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'submitted'::text, 'unknown'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT payment_returns_pkey PRIMARY KEY (provider, payment_id)
);

CREATE TABLE public.payout_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    method text DEFAULT 'dodopayments'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    destination jsonb,
    transfer_reference text,
    provider_transfer_code text,
    provider_recipient_code text,
    settlement_reference text,
    claimed_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    completed_at timestamp with time zone,
    CONSTRAINT payout_requests_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'NGN'::text, 'EUR'::text]))),
    CONSTRAINT payout_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT payout_requests_pkey PRIMARY KEY (id),
    CONSTRAINT payout_requests_transfer_reference_key UNIQUE (transfer_reference)
);

CREATE TABLE public.payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tip_id uuid,
    recipient_id uuid,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payouts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT payouts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.profile_avatar_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    fingerprint text NOT NULL,
    backend text NOT NULL,
    bucket text NOT NULL,
    path text NOT NULL,
    public_url text,
    state text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    claim_token uuid,
    claimed_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profile_avatar_uploads_backend_check CHECK ((backend = ANY (ARRAY['s3'::text, 'supabase'::text]))),
    CONSTRAINT profile_avatar_uploads_bucket_check CHECK (((length(bucket) >= 1) AND (length(bucket) <= 128))),
    CONSTRAINT profile_avatar_uploads_fingerprint_check CHECK ((fingerprint ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT profile_avatar_uploads_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'uploaded'::text, 'committed'::text, 'abandoned'::text, 'deleting'::text]))),
    CONSTRAINT profile_avatar_uploads_path_key UNIQUE (path),
    CONSTRAINT profile_avatar_uploads_pkey PRIMARY KEY (id)
);

CREATE TABLE public.promoted_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    author_id uuid,
    placement text DEFAULT 'discover_top'::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    clicks integer DEFAULT 0 NOT NULL,
    price_usd numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT promoted_listings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    book_id uuid NOT NULL,
    content text NOT NULL,
    page_number integer,
    is_hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT quotes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reading_activity_days (
    user_id uuid NOT NULL,
    activity_date date NOT NULL,
    CONSTRAINT reading_activity_days_pkey PRIMARY KEY (user_id, activity_date)
);

CREATE TABLE public.reading_completions (
    user_id uuid NOT NULL,
    book_id uuid NOT NULL,
    source text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reading_completions_source_check CHECK ((source = ANY (ARRAY['interactive'::text, 'history'::text]))),
    CONSTRAINT reading_completions_pkey PRIMARY KEY (user_id, book_id)
);

CREATE TABLE public.reading_goal_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    milestone integer NOT NULL,
    fired_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reading_goal_milestones_milestone_check CHECK ((milestone = ANY (ARRAY[25, 50, 75, 100]))),
    CONSTRAINT reading_goal_milestones_pkey PRIMARY KEY (id),
    CONSTRAINT reading_goal_milestones_user_id_year_milestone_key UNIQUE (user_id, year, milestone)
);

CREATE TABLE public.reading_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    target_books integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reading_goals_target_books_check CHECK ((target_books > 0)),
    CONSTRAINT reading_goals_pkey PRIMARY KEY (id),
    CONSTRAINT reading_goals_user_id_year_key UNIQUE (user_id, year)
);

CREATE TABLE public.reading_list_books (
    list_id uuid NOT NULL,
    book_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reading_list_books_pkey PRIMARY KEY (list_id, book_id)
);

CREATE TABLE public.reading_list_follows (
    list_id uuid NOT NULL,
    user_id uuid NOT NULL,
    followed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reading_list_follows_pkey PRIMARY KEY (list_id, user_id)
);

CREATE TABLE public.reading_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    cover_url text,
    is_public boolean DEFAULT true NOT NULL,
    forked_from uuid,
    follower_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    list_type text DEFAULT 'standard'::text NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT reading_lists_list_type_check CHECK ((list_type = ANY (ARRAY['standard'::text, 'inspired_by'::text, 'wishlist'::text, 'favorites'::text]))),
    CONSTRAINT reading_lists_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reading_room_members (
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reading_room_members_pkey PRIMARY KEY (room_id, user_id)
);

CREATE TABLE public.reading_room_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    title text NOT NULL,
    unlock_date timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    idempotency_key text,
    request_hash text,
    CONSTRAINT reading_room_milestones_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reading_room_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    milestone_id uuid,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT reading_room_posts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reading_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid,
    creator_id uuid NOT NULL,
    title text NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    name text,
    idempotency_key text,
    request_hash text,
    CONSTRAINT reading_rooms_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reading_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    book_id uuid,
    shelf_book_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    pages_read integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT reading_sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reading_work_completions (
    user_id uuid NOT NULL,
    work_id uuid NOT NULL,
    book_id uuid,
    source text NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    rewarded_at timestamp with time zone,
    CONSTRAINT reading_work_completions_source_check CHECK ((source = ANY (ARRAY['interactive'::text, 'history'::text]))),
    CONSTRAINT reading_work_completions_pkey PRIMARY KEY (user_id, work_id)
);

CREATE TABLE public.referral_commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    referred_user_id uuid,
    transaction_id text NOT NULL,
    transaction_type text NOT NULL,
    gross_transaction_amount numeric(12,4) NOT NULL,
    platform_fee_amount numeric(12,4) NOT NULL,
    commission_rate numeric(5,4) DEFAULT 0.10 NOT NULL,
    commission_amount numeric(12,4) NOT NULL,
    credited_at timestamp with time zone DEFAULT now() NOT NULL,
    reversed_at timestamp with time zone,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    original_commission_amount numeric(12,4),
    currency text DEFAULT 'USD'::text NOT NULL,
    CONSTRAINT referral_commissions_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'NGN'::text, 'EUR'::text]))),
    CONSTRAINT referral_commissions_idempotency_key_key UNIQUE (idempotency_key),
    CONSTRAINT referral_commissions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    referred_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referrals_pkey PRIMARY KEY (id),
    CONSTRAINT referrals_referrer_id_referred_id_key UNIQUE (referrer_id, referred_id)
);

CREATE TABLE public.refund_inbox (
    provider text NOT NULL,
    refund_id text NOT NULL,
    payment_id text NOT NULL,
    amount_minor bigint NOT NULL,
    currency text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    claimed_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    correlation_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT refund_inbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text]))),
    CONSTRAINT refund_inbox_pkey PRIMARY KEY (provider, refund_id)
);

CREATE TABLE public.release_email_campaigns (
    post_id uuid NOT NULL,
    follower_cursor uuid,
    audience_complete boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT release_email_campaigns_pkey PRIMARY KEY (post_id)
);

CREATE TABLE public.release_email_deliveries (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    claim_id uuid,
    message_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT release_email_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'skipped'::text, 'failed'::text, 'unknown'::text]))),
    CONSTRAINT release_email_deliveries_pkey PRIMARY KEY (post_id, user_id)
);

CREATE TABLE public.review_conversions (
    actor_id uuid NOT NULL,
    book_id uuid NOT NULL,
    review_id uuid,
    reviewer_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_conversions_check CHECK (((reviewer_id IS NULL) OR (reviewer_id <> actor_id))),
    CONSTRAINT review_conversions_pkey PRIMARY KEY (actor_id, book_id)
);

CREATE TABLE public.review_helpfulness_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_helpful boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cast_at timestamp with time zone NOT NULL,
    CONSTRAINT review_helpfulness_votes_pkey PRIMARY KEY (id),
    CONSTRAINT review_helpfulness_votes_review_id_user_id_key UNIQUE (review_id, user_id)
);

CREATE TABLE public.review_likes (
    review_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_likes_pkey PRIMARY KEY (review_id, user_id)
);

CREATE TABLE public.review_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_replies_content_check CHECK ((char_length(content) <= 1000)),
    CONSTRAINT review_replies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    book_id uuid NOT NULL,
    review_type text DEFAULT 'short'::text NOT NULL,
    rating integer NOT NULL,
    content text,
    mood_tags text[] DEFAULT '{}'::text[] NOT NULL,
    has_spoilers boolean DEFAULT false NOT NULL,
    read_date date,
    edition_read text,
    likes_count integer DEFAULT 0 NOT NULL,
    want_to_read_count integer DEFAULT 0 NOT NULL,
    helpful_votes integer DEFAULT 0 NOT NULL,
    unhelpful_votes integer DEFAULT 0 NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    moderation_status text DEFAULT 'published'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT reviews_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['published'::text, 'pending'::text, 'removed'::text]))),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_review_type_check CHECK ((review_type = ANY (ARRAY['short'::text, 'long'::text, 'one_line'::text]))),
    CONSTRAINT reviews_pkey PRIMARY KEY (id)
);

CREATE TABLE public.room_participants (
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT room_participants_pkey PRIMARY KEY (room_id, user_id)
);

CREATE TABLE public.seasonal_event_participants (
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seasonal_event_participants_pkey PRIMARY KEY (event_id, user_id)
);

CREATE TABLE public.seasonal_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    theme text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    badge_name text,
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    badge_id text,
    CONSTRAINT seasonal_events_pkey PRIMARY KEY (id)
);

CREATE TABLE public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    ip_hash text,
    auth_provider text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT security_events_pkey PRIMARY KEY (id)
);

CREATE TABLE public.seed_records (
    kind text NOT NULL,
    key text NOT NULL,
    entity_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seed_records_pkey PRIMARY KEY (kind, key)
);

CREATE TABLE public.shelf_books (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shelf_id uuid NOT NULL,
    book_id uuid NOT NULL,
    user_id uuid NOT NULL,
    progress_pages integer,
    progress_percent numeric(5,2),
    started_at date,
    finished_at date,
    edition_read text,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shelf_books_pkey PRIMARY KEY (id),
    CONSTRAINT shelf_books_shelf_id_book_id_key UNIQUE (shelf_id, book_id)
);

CREATE TABLE public.shelves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    default_type text,
    is_public boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT shelves_default_type_check CHECK ((default_type = ANY (ARRAY['currently_reading'::text, 'have_read'::text, 'want_to_read'::text]))),
    CONSTRAINT shelves_pkey PRIMARY KEY (id),
    CONSTRAINT shelves_user_id_slug_key UNIQUE (user_id, slug)
);

CREATE TABLE public.similar_books_computed (
 work_id uuid PRIMARY KEY,
 similar_ids uuid[] DEFAULT '{}' NOT NULL CHECK(cardinality(similar_ids)<=5),
 computed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.social_intents (
    actor_id uuid NOT NULL,
    action text NOT NULL,
    intent_key text NOT NULL,
    target_id uuid NOT NULL,
    result boolean NOT NULL,
    CONSTRAINT social_intents_pkey PRIMARY KEY (actor_id, action, intent_key)
);

CREATE TABLE public.social_rewards (
    actor_id uuid NOT NULL,
    action text NOT NULL,
    target_id uuid NOT NULL,
    CONSTRAINT social_rewards_pkey PRIMARY KEY (actor_id, action, target_id)
);

CREATE TABLE public.subscription_cancellations (
    subscription_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    claimed_at timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    correlation_id text,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT subscription_cancellations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT subscription_cancellations_pkey PRIMARY KEY (subscription_id)
);

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    provider_event_id text,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    checkout_url text,
    provider_subscription_id text,
    last_provider_event_at timestamp with time zone,
    activated_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    provider_product_id text,
    provider_account_id text,
    provider_state text,
    last_verified_at timestamp with time zone,
    provider_acknowledged boolean DEFAULT true NOT NULL,
    renewal_cancelled boolean DEFAULT false NOT NULL,
    provider_checkout_id text,
    CONSTRAINT subscriptions_provider_check CHECK ((provider = ANY (ARRAY['dodopayments'::text, 'paystack'::text, 'google_play'::text]))),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'cancelled'::text, 'expired'::text, 'past_due'::text]))),
    CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT subscriptions_provider_event_id_key UNIQUE (provider_event_id)
);

CREATE TABLE public.tips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recipient_id uuid,
    creator_id uuid,
    amount numeric(10,2) NOT NULL,
    platform_fee numeric(10,2) NOT NULL,
    recipient_amount numeric(10,2),
    creator_amount numeric(10,2),
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    checkout_url text,
    refunded_recipient_amount numeric(10,2) DEFAULT 0 NOT NULL,
    provider_checkout_id text,
    CONSTRAINT tips_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text]))),
    CONSTRAINT tips_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    badge_id text NOT NULL,
    awarded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_badges_pkey PRIMARY KEY (id),
    CONSTRAINT user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id)
);

CREATE TABLE public.user_payout_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    display_name text NOT NULL,
    account_number text NOT NULL,
    bank_code text NOT NULL,
    currency text DEFAULT 'NGN'::text NOT NULL,
    paystack_recipient_code text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_payout_methods_provider_check CHECK ((provider = ANY (ARRAY['paystack'::text, 'manual'::text]))),
    CONSTRAINT user_payout_methods_pkey PRIMARY KEY (id),
    CONSTRAINT user_payout_methods_user_id_provider_key UNIQUE (user_id, provider)
);

CREATE TABLE public.users (
    id uuid NOT NULL,
    username text NOT NULL,
    display_name text NOT NULL,
    bio text,
    avatar_url text,
    banner_url text,
    country text,
    user_types text[] DEFAULT '{reader}'::text[] NOT NULL,
    genres text[] DEFAULT '{}'::text[] NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    is_moderator boolean DEFAULT false NOT NULL,
    is_verified_author boolean DEFAULT false NOT NULL,
    is_creator boolean DEFAULT false NOT NULL,
    is_suspended boolean DEFAULT false NOT NULL,
    is_banned boolean DEFAULT false NOT NULL,
    suspension_reason text,
    xp integer DEFAULT 0 NOT NULL,
    reading_streak integer DEFAULT 0 NOT NULL,
    streak_freeze_tokens integer DEFAULT 0 NOT NULL,
    last_streak_date date,
    annual_reading_goal integer,
    books_read_count integer DEFAULT 0 NOT NULL,
    referral_code text NOT NULL,
    referred_by uuid,
    email text,
    email_verified boolean DEFAULT false NOT NULL,
    pin_hash text,
    totp_secret text,
    totp_enabled boolean DEFAULT false NOT NULL,
    recovery_codes text[],
    external_links text[] DEFAULT '{}'::text[] NOT NULL,
    profile_visibility text DEFAULT 'public'::text NOT NULL,
    shelf_visibility text DEFAULT 'public'::text NOT NULL,
    show_referrer boolean DEFAULT true NOT NULL,
    onboarding_complete boolean DEFAULT false NOT NULL,
    email_prompt_shown_at timestamp with time zone,
    email_prompt_dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email_digest_enabled boolean DEFAULT true NOT NULL,
    is_premium boolean DEFAULT false NOT NULL,
    unsubscribe_token text,
    account_hardening_email_prompted_at timestamp with time zone,
    account_hardening_2fa_prompted_at timestamp with time zone,
    password_hash text,
    telegram_id text,
    writing_streak integer DEFAULT 0 NOT NULL,
    last_writing_date date,
    writing_freeze_tokens integer DEFAULT 0 NOT NULL,
    max_reading_streak integer DEFAULT 0 NOT NULL,
    hardening_prompt_7d_sent_at timestamp with time zone,
    hardening_prompt_30d_sent_at timestamp with time zone,
    notify_follows boolean DEFAULT true NOT NULL,
    notify_likes boolean DEFAULT true NOT NULL,
    notify_replies boolean DEFAULT true NOT NULL,
    notify_mentions boolean DEFAULT true NOT NULL,
    notify_author_announcements boolean DEFAULT true NOT NULL,
    notify_new_releases boolean DEFAULT true NOT NULL,
    notify_challenge_completions boolean DEFAULT true NOT NULL,
    notify_arc_grants boolean DEFAULT true NOT NULL,
    preferred_locale text DEFAULT 'en'::text NOT NULL,
    premium_override boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    mfa_version integer DEFAULT 0 NOT NULL,
    mfa_last_step bigint,
    google_id text,
    auth_not_before bigint DEFAULT 0 NOT NULL,
    locale_initialized boolean DEFAULT false NOT NULL,
    CONSTRAINT users_auth_not_before_check CHECK ((auth_not_before >= 0)),
    CONSTRAINT users_bio_check CHECK ((char_length(bio) <= 280)),
    CONSTRAINT users_preferred_locale_check CHECK ((preferred_locale = ANY (ARRAY['en'::text, 'fr'::text, 'de'::text]))),
    CONSTRAINT users_profile_visibility_check CHECK ((profile_visibility = ANY (ARRAY['public'::text, 'followers_only'::text]))),
    CONSTRAINT users_shelf_visibility_check CHECK ((shelf_visibility = ANY (ARRAY['public'::text, 'followers_only'::text, 'private'::text]))),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_referral_code_key UNIQUE (referral_code),
    CONSTRAINT users_username_key UNIQUE (username)
);

CREATE TABLE public.revoked_push_sessions (
    session_hash text PRIMARY KEY CHECK (session_hash ~ '^[a-f0-9]{64}$'),
    revoked_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    endpoint text NOT NULL,
    session_hash text NOT NULL,
    p256dh text,
    auth text,
    platform text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now()+interval '30 days') NOT NULL,
    CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint),
    CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT push_subscriptions_session_check CHECK (session_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT push_subscriptions_channel_check CHECK ((channel='web' AND platform='web' AND p256dh IS NOT NULL AND auth IS NOT NULL) OR (channel='expo' AND platform IN ('ios','android') AND p256dh IS NULL AND auth IS NULL))
);

CREATE TABLE public.workshop_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid NOT NULL,
    user_id uuid NOT NULL,
    what_worked text,
    what_to_improve text,
    specific_suggestion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT writing_workshop_feedback_pkey PRIMARY KEY (id),
    CONSTRAINT writing_workshop_feedback_submission_id_reviewer_id_key UNIQUE (submission_id, user_id)
);

CREATE TABLE public.workshop_members (
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT writing_workshop_members_pkey PRIMARY KEY (room_id, user_id)
);

CREATE TABLE public.workshop_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    facilitator_id uuid NOT NULL,
    name text NOT NULL,
    topic text,
    max_members integer DEFAULT 8 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    member_count integer DEFAULT 0 NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT writing_workshops_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workshop_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    excerpt text NOT NULL,
    word_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    idempotency_key text,
    request_hash text,
    CONSTRAINT writing_workshop_submissions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.writing_challenge_participants (
    challenge_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT writing_challenge_participants_pkey PRIMARY KEY (challenge_id, user_id)
);

CREATE TABLE public.writing_challenge_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenge_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    word_count integer,
    ai_feedback text,
    community_votes integer DEFAULT 0 NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    body text,
    CONSTRAINT writing_challenge_submissions_challenge_id_user_id_key UNIQUE (challenge_id, user_id),
    CONSTRAINT writing_challenge_submissions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.writing_challenge_votes (
    submission_id uuid NOT NULL,
    user_id uuid NOT NULL,
    voted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT writing_challenge_votes_pkey PRIMARY KEY (submission_id, user_id)
);

CREATE TABLE public.writing_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    type text DEFAULT 'weekly'::text NOT NULL,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    goal_type text DEFAULT 'submission_count'::text NOT NULL,
    goal_value integer DEFAULT 1 NOT NULL,
    participant_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT writing_challenges_goal_type_check CHECK ((goal_type = ANY (ARRAY['word_count'::text, 'submission_count'::text]))),
    CONSTRAINT writing_challenges_goal_value_check CHECK ((goal_value > 0)),
    CONSTRAINT writing_challenges_type_check CHECK ((type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
    CONSTRAINT writing_challenges_pkey PRIMARY KEY (id)
);

CREATE TABLE public.writing_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_text text NOT NULL,
    week_start date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tasks jsonb,
    policy_version text,
    source_hash text,
    locale text,
    provider text,
    CONSTRAINT writing_plans_pkey PRIMARY KEY (id),
    CONSTRAINT writing_plans_user_id_week_start_key UNIQUE (user_id, week_start)
);

CREATE TABLE public.writing_prompt_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prompt_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    word_count integer,
    ai_feedback text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT writing_prompt_submissions_pkey PRIMARY KEY (id),
    CONSTRAINT writing_prompt_submissions_prompt_id_user_id_key UNIQUE (prompt_id, user_id)
);

CREATE TABLE public.writing_prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prompt_text text NOT NULL,
    topic_seed text,
    is_active boolean DEFAULT true NOT NULL,
    prompt_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT writing_prompts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.xp_ledger (
    user_id uuid NOT NULL,
    event_key text NOT NULL,
    amount integer NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT xp_ledger_pkey PRIMARY KEY (user_id, event_key)
);

CREATE TABLE public.xp_reversals (
    user_id uuid NOT NULL,
    event_key text NOT NULL,
    amount integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT xp_reversals_pkey PRIMARY KEY (user_id, event_key)
);

-- Functions.

CREATE FUNCTION public.insert_owned_content(p_actor uuid,p_table text,p_payload jsonb,p_key text,p_hash text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare owner text;document jsonb;columns text;result jsonb;
begin
 owner:='{"shelves":"user_id","reviews":"user_id","quotes":"user_id","buddy_reads":"created_by","ask_writer_questions":"user_id","ask_writer_answers":"user_id","reading_sessions":"user_id","reading_lists":"user_id","content_reports":"reporter_id","events":"organizer_id","reading_rooms":"created_by","book_debates":"user_id","book_passes":"sender_id","author_posts":"author_id","author_qa":"asked_by","arcs":"author_id","workshop_rooms":"facilitator_id","workshop_submissions":"user_id","workshop_feedback":"user_id","buddy_read_notes":"user_id","reading_room_posts":"user_id","reading_room_milestones":"created_by","author_verification_requests":"user_id","appeals":"user_id","community_notes":"author_id"}'::jsonb->>p_table;
 if owner is null or jsonb_typeof(p_payload) is distinct from 'object'or p_key is null or length(p_key)not between 8 and 200 or p_hash is null or p_hash!~'^[a-f0-9]{64}$'then raise exception 'Invalid content request'using errcode='P1004';end if;
 perform 1 from users where id=p_actor and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable'using errcode='P1003';end if;
 document:=p_payload||jsonb_build_object(owner,p_actor,'idempotency_key',p_key,'request_hash',p_hash);
 if exists(select 1 from jsonb_object_keys(document)key where not exists(select 1 from pg_attribute a where a.attrelid=format('public.%I',p_table)::regclass and a.attname=key and a.attnum>0 and not a.attisdropped))then raise exception 'Unknown content field'using errcode='P1004';end if;
 select string_agg(format('%I',key),','order by key)into columns from jsonb_object_keys(document)key;
 execute format('insert into public.%I(%s)select %s from jsonb_populate_record(null::public.%I,$1)returning to_jsonb(%I.*)',p_table,columns,columns,p_table,p_table)into result using document;
 return result;
end $$;

CREATE FUNCTION public.account_export_sources()RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path TO public,pg_temp AS $sources$
 SELECT '[{"dataset":"profile","relation":"users","owners":["id"],"columns":["id","username","display_name","bio","avatar_url","banner_url","country","user_types","genres","is_admin","is_moderator","is_verified_author","is_creator","is_suspended","is_banned","suspension_reason","xp","reading_streak","streak_freeze_tokens","last_streak_date","annual_reading_goal","books_read_count","referral_code","referred_by","email","email_verified","totp_enabled","external_links","profile_visibility","shelf_visibility","show_referrer","onboarding_complete","email_prompt_shown_at","email_prompt_dismissed_at","created_at","updated_at","email_digest_enabled","is_premium","account_hardening_email_prompted_at","account_hardening_2fa_prompted_at","writing_streak","last_writing_date","writing_freeze_tokens","max_reading_streak","hardening_prompt_7d_sent_at","hardening_prompt_30d_sent_at","notify_follows","notify_likes","notify_replies","notify_mentions","notify_author_announcements","notify_new_releases","notify_challenge_completions","notify_arc_grants","preferred_locale","premium_override","deleted_at","locale_initialized"],"numeric":[],"keys":["id"],"types":["uuid"],"single":true,"metadataOnly":false},{"dataset":"shelves","relation":"shelves","owners":["user_id"],"columns":["id","user_id","name","slug","is_default","default_type","is_public","description","created_at","updated_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_history","relation":"shelf_books","owners":["user_id"],"columns":["id","shelf_id","book_id","user_id","progress_pages","progress_percent","started_at","finished_at","edition_read","added_at","updated_at"],"numeric":["progress_percent"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"reviews","relation":"reviews","owners":["user_id"],"columns":["id","user_id","book_id","review_type","rating","content","mood_tags","has_spoilers","read_date","edition_read","likes_count","want_to_read_count","helpful_votes","unhelpful_votes","is_hidden","moderation_status","created_at","updated_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"review_replies","relation":"review_replies","owners":["user_id"],"columns":["id","review_id","user_id","content","created_at","updated_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"review_likes","relation":"review_likes","owners":["user_id"],"columns":["review_id","user_id","created_at"],"numeric":[],"keys":["review_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"review_helpfulness_votes","relation":"review_helpfulness_votes","owners":["user_id"],"columns":["id","review_id","user_id","is_helpful","created_at","cast_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"review_conversions","relation":"review_conversions","owners":["actor_id"],"columns":["actor_id","book_id","review_id","reviewer_id","created_at"],"numeric":[],"keys":["actor_id","book_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"quotes","relation":"quotes","owners":["user_id"],"columns":["id","user_id","book_id","content","page_number","is_hidden","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_sessions","relation":"reading_sessions","owners":["user_id"],"columns":["id","user_id","book_id","shelf_book_id","started_at","ended_at","pages_read","notes","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_goals","relation":"reading_goals","owners":["user_id"],"columns":["id","user_id","year","target_books","created_at","updated_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_activity_days","relation":"reading_activity_days","owners":["user_id"],"columns":["user_id","activity_date"],"numeric":[],"keys":["user_id","activity_date"],"types":["uuid","date"],"single":false,"metadataOnly":false},{"dataset":"reading_completions","relation":"reading_completions","owners":["user_id"],"columns":["user_id","book_id","source","completed_at"],"numeric":[],"keys":["user_id","book_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_work_completions","relation":"reading_work_completions","owners":["user_id"],"columns":["user_id","work_id","book_id","source","completed_at","rewarded_at"],"numeric":[],"keys":["user_id","work_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_goal_milestones","relation":"reading_goal_milestones","owners":["user_id"],"columns":["id","user_id","year","milestone","fired_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"user_badges","relation":"user_badges","owners":["user_id"],"columns":["id","user_id","badge_id","awarded_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"xp_ledger","relation":"xp_ledger","owners":["user_id"],"columns":["user_id","event_key","amount","reason","created_at"],"numeric":[],"keys":["user_id","event_key"],"types":["uuid","text"],"single":false,"metadataOnly":false},{"dataset":"xp_reversals","relation":"xp_reversals","owners":["user_id"],"columns":["user_id","event_key","amount","created_at"],"numeric":[],"keys":["user_id","event_key"],"types":["uuid","text"],"single":false,"metadataOnly":false},{"dataset":"follows","relation":"follows","owners":["follower_id","following_id"],"columns":["follower_id","following_id","created_at"],"numeric":[],"keys":["follower_id","following_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_lists","relation":"reading_lists","owners":["user_id"],"columns":["id","user_id","name","description","cover_url","is_public","forked_from","follower_count","created_at","updated_at","list_type"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_list_books","relation":"reading_list_books","owners":["$list_owner"],"columns":["list_id","book_id","position","added_at"],"numeric":[],"keys":["list_id","book_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_list_follows","relation":"reading_list_follows","owners":["user_id"],"columns":["list_id","user_id","followed_at"],"numeric":[],"keys":["list_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"writing_prompt_submissions","relation":"writing_prompt_submissions","owners":["user_id"],"columns":["id","prompt_id","user_id","content","word_count","ai_feedback","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"writing_challenge_submissions","relation":"writing_challenge_submissions","owners":["user_id"],"columns":["id","challenge_id","user_id","content","word_count","ai_feedback","community_votes","submitted_at","title","body"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"writing_challenge_participants","relation":"writing_challenge_participants","owners":["user_id"],"columns":["challenge_id","user_id","joined_at"],"numeric":[],"keys":["challenge_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"writing_challenge_votes","relation":"writing_challenge_votes","owners":["user_id"],"columns":["submission_id","user_id","voted_at"],"numeric":[],"keys":["submission_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"writing_plans","relation":"writing_plans","owners":["user_id"],"columns":["id","user_id","plan_text","week_start","created_at","tasks","policy_version","source_hash","locale","provider"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"ai_taste_profiles","relation":"ai_taste_profiles","owners":["user_id"],"columns":["id","user_id","profile_text","generated_at","profile_data","policy_version","source_hash","locale","provider"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"workshop_rooms","relation":"workshop_rooms","owners":["facilitator_id"],"columns":["id","facilitator_id","name","topic","max_members","is_active","created_at","member_count"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"workshop_members","relation":"workshop_members","owners":["user_id"],"columns":["room_id","user_id","joined_at"],"numeric":[],"keys":["room_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"workshop_submissions","relation":"workshop_submissions","owners":["user_id"],"columns":["id","room_id","user_id","excerpt","word_count","created_at","title"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"workshop_feedback","relation":"workshop_feedback","owners":["user_id"],"columns":["id","submission_id","user_id","what_worked","what_to_improve","specific_suggestion","created_at","comment"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"book_debates","relation":"book_debates","owners":["user_id"],"columns":["id","book_id","user_id","question","yes_count","no_count","created_at","is_active"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"debate_votes","relation":"debate_votes","owners":["user_id"],"columns":["debate_id","user_id","vote","argument","voted_at"],"numeric":[],"keys":["debate_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"ask_writer_questions","relation":"ask_writer_questions","owners":["user_id"],"columns":["id","user_id","question","best_answer_id","created_at","tags","answer_count"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"ask_writer_answers","relation":"ask_writer_answers","owners":["user_id"],"columns":["id","question_id","user_id","answer","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"author_posts","relation":"author_posts","owners":["author_id"],"columns":["id","author_id","title","content","book_id","created_at","updated_at","body","type","followers_notified"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"author_qa","relation":"author_qa","owners":["author_id","asked_by"],"columns":["id","author_id","asked_by","question","answer","is_public","answered_at","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"author_books","relation":"author_books","owners":["author_id"],"columns":["author_id","book_id","created_at"],"numeric":[],"keys":["author_id","book_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"author_work_claims","relation":"author_work_claims","owners":["author_id"],"columns":["author_id","work_id","verified_at"],"numeric":[],"keys":["author_id","work_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"author_verification_requests","relation":"author_verification_requests","owners":["user_id"],"columns":["id","user_id","pen_name","publisher","book_titles","website_url","social_proof_url","status","created_at","reviewed_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"arcs","relation":"arcs","owners":["author_id"],"columns":["id","author_id","book_id","description","reader_slots","close_date","is_active","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"arc_applications","relation":"arc_applications","owners":["reader_id"],"columns":["id","arc_id","reader_id","status","applied_at","reviewed_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"buddy_reads","relation":"buddy_reads","owners":["created_by"],"columns":["id","book_id","created_by","title","max_participants","is_private","created_at","updated_at","current_chapter","is_active"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"buddy_read_members","relation":"buddy_read_members","owners":["user_id"],"columns":["buddy_read_id","user_id","joined_at"],"numeric":[],"keys":["buddy_read_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"buddy_read_notes","relation":"buddy_read_notes","owners":["user_id"],"columns":["id","buddy_read_id","user_id","content","created_at","reply_to_id"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"buddy_read_messages","relation":"buddy_read_messages","owners":["user_id"],"columns":["id","buddy_read_id","user_id","content","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_rooms","relation":"reading_rooms","owners":["creator_id"],"columns":["id","book_id","creator_id","title","is_public","is_active","created_at","updated_at","created_by","name"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_room_members","relation":"reading_room_members","owners":["user_id"],"columns":["room_id","user_id","joined_at"],"numeric":[],"keys":["room_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"room_participants","relation":"room_participants","owners":["user_id"],"columns":["room_id","user_id","joined_at"],"numeric":[],"keys":["room_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_room_milestones","relation":"reading_room_milestones","owners":["created_by"],"columns":["id","room_id","title","unlock_date","created_at","created_by"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"reading_room_posts","relation":"reading_room_posts","owners":["user_id"],"columns":["id","room_id","milestone_id","user_id","content","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"pass_the_book_chains","relation":"pass_the_book_chains","owners":["creator_id"],"columns":["id","book_id","creator_id","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"pass_the_book_nodes","relation":"pass_the_book_nodes","owners":["user_id","nominee_id"],"columns":["id","chain_id","user_id","nominee_id","note","position","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"book_passes","relation":"book_passes","owners":["sender_id","recipient_id"],"columns":["id","sender_id","recipient_id","book_id","message","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"challenge_participants","relation":"challenge_participants","owners":["user_id"],"columns":["challenge_id","user_id","progress","completed","joined_at","completed_at"],"numeric":[],"keys":["challenge_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"seasonal_event_participants","relation":"seasonal_event_participants","owners":["user_id"],"columns":["event_id","user_id","joined_at"],"numeric":[],"keys":["event_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"community_notes","relation":"community_notes","owners":["author_id"],"columns":["id","content_type","content_id","author_id","note_text","helpful_votes","unhelpful_votes","is_visible","deleted_at","created_at","reviewed_at","status"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"community_note_ratings","relation":"community_note_ratings","owners":["user_id"],"columns":["note_id","user_id","is_helpful","rated_at"],"numeric":[],"keys":["note_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"events","relation":"events","owners":["organizer_id"],"columns":["id","organizer_id","book_id","title","description","event_date","external_url","is_paid","ticket_price","currency","platform_fee_pct","is_published","created_at","updated_at","max_attendees"],"numeric":["ticket_price","platform_fee_pct"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"event_rsvps","relation":"event_rsvps","owners":["user_id"],"columns":["event_id","user_id","rsvped_at"],"numeric":[],"keys":["event_id","user_id"],"types":["uuid","uuid"],"single":false,"metadataOnly":false},{"dataset":"event_tickets","relation":"event_tickets","owners":["user_id","organizer_id"],"columns":["id","event_id","user_id","amount_paid","currency","status","created_at","organizer_id","platform_fee","host_amount","provider","reserved_until"],"numeric":["amount_paid","platform_fee","host_amount"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"event_revenue","relation":"event_revenue","owners":["organizer_id"],"columns":["id","event_id","organizer_id","amount","currency","recorded_at","ticket_id","original_amount","verified"],"numeric":["amount","original_amount"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"tips","relation":"tips","owners":["user_id","recipient_id"],"columns":["id","user_id","recipient_id","creator_id","amount","platform_fee","recipient_amount","creator_amount","currency","status","provider_reference","created_at","updated_at","refunded_recipient_amount"],"numeric":["amount","platform_fee","recipient_amount","creator_amount","refunded_recipient_amount"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"payouts","relation":"payouts","owners":["recipient_id"],"columns":["id","tip_id","recipient_id","amount","currency","status","provider","created_at","updated_at"],"numeric":["amount"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"payout_requests","relation":"payout_requests","owners":["user_id"],"columns":["id","user_id","amount","method","status","created_at","updated_at","currency","transfer_reference","settlement_reference","claimed_at","next_attempt_at","attempts","last_error","completed_at"],"numeric":["amount"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"user_payout_methods","relation":"user_payout_methods","owners":["user_id"],"columns":["id","user_id","provider","display_name","account_number","bank_code","currency","is_default","created_at","updated_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"subscriptions","relation":"subscriptions","owners":["user_id"],"columns":["id","user_id","provider","status","amount","currency","provider_event_id","current_period_end","created_at","updated_at","provider_subscription_id","last_provider_event_at","activated_at","cancelled_at","provider_product_id","provider_account_id","provider_state","last_verified_at","provider_acknowledged","renewal_cancelled"],"numeric":["amount"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"payment_captures","relation":"payment_captures","owners":["user_id"],"columns":["provider","payment_id","entity_type","entity_id","user_id","recipient_id","currency","charged_minor","credited","refunded_minor","period_end","event_id","created_at"],"numeric":[],"keys":["provider","payment_id"],"types":["text","text"],"single":false,"metadataOnly":false},{"dataset":"payment_refunds","relation":"payment_refunds","owners":["$capture_owner"],"columns":["provider","refund_id","payment_id","amount_minor","currency","correlation_id","created_at"],"numeric":[],"keys":["provider","refund_id"],"types":["text","text"],"single":false,"metadataOnly":false},{"dataset":"referrals","relation":"referrals","owners":["referrer_id","referred_id"],"columns":["id","referrer_id","referred_id","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"referral_commissions","relation":"referral_commissions","owners":["referrer_id"],"columns":["id","referrer_id","referred_user_id","transaction_id","transaction_type","gross_transaction_amount","platform_fee_amount","commission_rate","commission_amount","credited_at","reversed_at","created_at","original_commission_amount","currency"],"numeric":["gross_transaction_amount","platform_fee_amount","commission_rate","commission_amount","original_commission_amount"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"notifications","relation":"notifications","owners":["user_id"],"columns":["id","user_id","type","actor_id","entity_type","entity_id","message","is_read","created_at","message_key","message_values"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"content_reports","relation":"content_reports","owners":["reporter_id"],"columns":["id","reporter_id","entity_type","entity_id","reason","status","created_at","resolved_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"appeals","relation":"appeals","owners":["user_id"],"columns":["id","user_id","report_id","reason","content_type","content_id","status","reviewer_note","reviewed_at","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"security_events","relation":"security_events","owners":["user_id"],"columns":["id","user_id","event_type","ip_hash","auth_provider","created_at"],"numeric":[],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":false},{"dataset":"books","relation":"books","owners":[],"columns":["id","google_books_id","open_library_id","isbn_10","isbn_13","title","subtitle","author_name","author_names","publisher","published_year","description","cover_url","page_count","genres","language","has_audiobook","average_rating","ratings_count","currently_reading_count","want_to_read_count","have_read_count","similar_book_ids","search_vector","created_at","updated_at","work_id","canonical_edition_id","edition_name","format","metadata_source","metadata_provenance"],"numeric":["average_rating"],"keys":["id"],"types":["uuid"],"single":false,"metadataOnly":true},{"dataset":"book_edition_identifiers","relation":"book_edition_identifiers","owners":["$library_book"],"columns":["provider","identifier","book_id"],"numeric":[],"keys":["provider","identifier"],"types":["text","text"],"single":false,"metadataOnly":false}]'::jsonb
$sources$;

CREATE FUNCTION public.account_export_key(p_row jsonb,p_source jsonb)RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path TO public,pg_temp AS $$
 select jsonb_object_agg(name,p_row->>name)from jsonb_array_elements_text(p_source->'keys')name
$$;

CREATE FUNCTION public.account_export_project(p_row jsonb,p_source jsonb)RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path TO public,pg_temp AS $$
 select coalesce(jsonb_object_agg(key,case when p_source->'numeric'?key and jsonb_typeof(value)='number'then to_jsonb(value#>>'{}')else value end),'{}'::jsonb)from jsonb_each(p_row)where p_source->'columns'?key
$$;

CREATE FUNCTION public.account_export_barrier()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
begin
 perform pg_advisory_xact_lock_shared(105,91);
 if tg_op='TRUNCATE'and(select last_value from account_export_epoch)>=(select last_value from account_export_floor)then raise exception 'Export snapshots are active'using errcode='P1001';end if;
 return null;
end $$;

CREATE FUNCTION public.capture_account_export_version()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare source jsonb;key jsonb;born bigint;current_epoch bigint;floor_epoch bigint;
begin
 select last_value into current_epoch from account_export_epoch;select last_value into floor_epoch from account_export_floor;
 if current_epoch>=floor_epoch then
  select value into source from jsonb_array_elements(account_export_sources())where value->>'relation'=tg_table_name;
  key:=account_export_key(to_jsonb(old),source);
  select epoch into born from account_export_current where table_name=tg_table_name and row_key=key;born:=coalesce(born,0);
  if born<current_epoch then insert into account_export_versions(table_name,row_key,born_epoch,removed_epoch,data)values(tg_table_name,key,born,current_epoch,account_export_project(to_jsonb(old),source))on conflict do nothing;end if;
  delete from account_export_versions where(table_name,row_key,born_epoch,removed_epoch)in(select table_name,row_key,born_epoch,removed_epoch from account_export_versions where removed_epoch<floor_epoch order by removed_epoch limit 1 for update skip locked);
 end if;
 if tg_op='DELETE'then return old;else return new;end if;
end $$;

CREATE FUNCTION public.mark_account_export_version()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare source jsonb;key jsonb;current_epoch bigint;floor_epoch bigint;
begin
 select last_value into current_epoch from account_export_epoch;select last_value into floor_epoch from account_export_floor;
 if current_epoch>=floor_epoch then
  select value into source from jsonb_array_elements(account_export_sources())where value->>'relation'=tg_table_name;
  if tg_op in('UPDATE','DELETE')then delete from account_export_current where table_name=tg_table_name and row_key=account_export_key(to_jsonb(old),source);end if;
  if tg_op<>'DELETE'then key:=account_export_key(to_jsonb(new),source);insert into account_export_current(table_name,row_key,epoch)values(tg_table_name,key,current_epoch)on conflict(table_name,row_key)do update set epoch=excluded.epoch;end if;
  delete from account_export_current where(table_name,row_key)in(select table_name,row_key from account_export_current where epoch<floor_epoch order by epoch limit 1 for update skip locked);
 end if;return null;
end $$;

CREATE FUNCTION public.cleanup_account_exports(p_limit integer DEFAULT 1000)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp SET lock_timeout TO '1s' AS $$
declare floor_epoch bigint;jobs_removed integer;versions_removed integer;maps_removed integer;
begin
 if p_limit is null or p_limit not between 1 and 5000 then raise exception 'Invalid cleanup batch'using errcode='P1004';end if;
 if current_setting('transaction_isolation')<>'read committed'then raise exception 'Export cleanup requires read committed isolation'using errcode='P1004';end if;
 perform pg_advisory_xact_lock(105,92);
 select coalesce(min(epoch),(select last_value+1 from account_export_epoch))into floor_epoch from account_export_jobs where expires_at>clock_timestamp();
 perform setval('account_export_floor',greatest(floor_epoch,(select last_value from account_export_floor)),true);
 delete from account_export_jobs where id in(select id from account_export_jobs where expires_at<=clock_timestamp()order by expires_at,id limit p_limit for update skip locked);get diagnostics jobs_removed=row_count;
 delete from account_export_versions where(table_name,row_key,born_epoch,removed_epoch)in(select table_name,row_key,born_epoch,removed_epoch from account_export_versions where removed_epoch<floor_epoch order by removed_epoch limit p_limit for update skip locked);get diagnostics versions_removed=row_count;
 delete from account_export_current where(table_name,row_key)in(select table_name,row_key from account_export_current where epoch<floor_epoch order by epoch limit p_limit for update skip locked);get diagnostics maps_removed=row_count;
 return jsonb_build_object('jobs',jobs_removed,'versions',versions_removed,'maps',maps_removed);
end $$;

CREATE FUNCTION public.start_account_export(p_user uuid,p_format text,p_key text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp SET lock_timeout TO '2s' AS $$
declare job account_export_jobs;manifest jsonb;next_epoch bigint;
begin
 if p_format is null or p_format not in('json','csv')or p_key is null or length(p_key)not between 8 and 200 then raise exception 'Invalid export request'using errcode='P1004';end if;
 if current_setting('transaction_isolation')<>'read committed'then raise exception 'Export creation requires read committed isolation'using errcode='P1004';end if;
 perform pg_advisory_xact_lock(105,91);perform pg_advisory_xact_lock(105,92);
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable'using errcode='P1003';end if;
 select * into job from account_export_jobs where user_id=p_user and request_key=p_key and expires_at>clock_timestamp();
 if found then if job.format<>p_format then raise exception 'Conflicting export request'using errcode='P1001';end if;return jsonb_build_object('id',job.id,'actorId',job.user_id,'format',job.format,'createdAt',job.created_at,'expiresAt',job.expires_at,'datasets',job.datasets);end if;
 delete from account_export_jobs where user_id=p_user and request_key=p_key and expires_at<=clock_timestamp();
 perform cleanup_account_exports(1000);
 if(select count(*)from account_export_jobs where expires_at>clock_timestamp())>=1000 then raise exception 'Export capacity unavailable'using errcode='P1001';end if;
 select jsonb_agg(value order by position)into manifest from jsonb_array_elements(account_export_sources())with ordinality item(value,position)where not(value->>'metadataOnly')::boolean and(p_format='json'or value->>'dataset'='reading_history');
 next_epoch:=nextval('account_export_epoch');
 insert into account_export_jobs(user_id,request_key,format,epoch,datasets)values(p_user,p_key,p_format,next_epoch,manifest)returning * into job;
 return jsonb_build_object('id',job.id,'actorId',job.user_id,'format',job.format,'createdAt',job.created_at,'expiresAt',job.expires_at,'datasets',job.datasets);
end $$;

CREATE FUNCTION public.account_export_record(p_job uuid,p_relation text,p_key jsonb)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare source jsonb;job_epoch bigint;predicate text;result jsonb;
begin
 select epoch into job_epoch from account_export_jobs where id=p_job;
 select value into source from jsonb_array_elements(account_export_sources())where value->>'relation'=p_relation;
 if job_epoch is null or source is null then raise exception 'Export source unavailable'using errcode='P1004';end if;
 select string_agg(format('r.%I=($2->>%L)::%s',name,name,source->'types'->>position), ' and ')into predicate from jsonb_array_elements_text(source->'keys')with ordinality item(name,ordinal),lateral(select(ordinal-1)::integer position)p;
 execute format('select data from((select public.account_export_project(to_jsonb(r),$3)data,0 priority,0::bigint removed from public.%I r left join public.account_export_current m on m.table_name=%L and m.row_key=$2 where %s and coalesce(m.epoch,0)<$1)union all(select data,1,removed_epoch from public.account_export_versions where table_name=%L and row_key=$2 and born_epoch<$1 and removed_epoch>=$1))c order by priority,removed limit 1',p_relation,p_relation,predicate,p_relation)into result using job_epoch,p_key,source;
 return result;
end $$;

CREATE FUNCTION public.account_export_has_book(p_user uuid,p_job uuid,p_book uuid)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
 select exists(
  select 1 from shelf_books r join account_export_jobs j on j.id=p_job left join account_export_current m on m.table_name='shelf_books'and m.row_key=jsonb_build_object('id',r.id::text)
  where r.user_id=p_user and coalesce(m.epoch,0)<j.epoch and(r.book_id=p_book or account_export_record(p_job,'books',jsonb_build_object('id',r.book_id))->>'canonical_edition_id'=p_book::text)
  union all
  select 1 from account_export_versions v join account_export_jobs j on j.id=p_job where v.table_name='shelf_books'and v.born_epoch<j.epoch and v.removed_epoch>=j.epoch and v.data->>'user_id'=p_user::text
  and(v.data->>'book_id'=p_book::text or account_export_record(p_job,'books',jsonb_build_object('id',v.data->>'book_id'))->>'canonical_edition_id'=p_book::text));
$$;

CREATE FUNCTION public.account_export_goodreads_id(p_job uuid,p_book uuid)RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
 select identifier from(
  select r.identifier from book_edition_identifiers r join account_export_jobs j on j.id=p_job left join account_export_current m on m.table_name='book_edition_identifiers'and m.row_key=jsonb_build_object('provider',r.provider,'identifier',r.identifier)
  where r.book_id=p_book and r.provider='goodreads'and coalesce(m.epoch,0)<j.epoch
  union
  select v.data->>'identifier' from account_export_versions v join account_export_jobs j on j.id=p_job where v.table_name='book_edition_identifiers'and v.born_epoch<j.epoch and v.removed_epoch>=j.epoch and v.data->>'book_id'=p_book::text and v.data->>'provider'='goodreads'
 )ids order by identifier limit 1;
$$;

CREATE FUNCTION public.account_export_page(p_user uuid,p_job uuid,p_dataset text,p_cursor jsonb DEFAULT NULL,p_limit integer DEFAULT 500)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp SET lock_timeout TO '2s' AS $$
declare job account_export_jobs;source jsonb;owner_current text;owner_old text;keys_current text;keys_old text;cursor_values text;key_names text;query text;item record;records jsonb:='[]';next_key jsonb;finished boolean:=true;bytes integer:=0;size integer;row_count integer:=0;book jsonb;shelf jsonb;
begin
 if p_limit is null or p_limit not between 1 and 1000 or p_cursor is not null and jsonb_typeof(p_cursor)<>'object'then raise exception 'Invalid export page'using errcode='P1004';end if;
 perform pg_advisory_xact_lock_shared(105,92);
 select * into job from account_export_jobs where id=p_job and user_id=p_user and expires_at>clock_timestamp();
 if not found then raise exception 'Export expired or unavailable'using errcode='P1005';end if;
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable'using errcode='P1003';end if;
 select value into source from jsonb_array_elements(job.datasets)where value->>'dataset'=p_dataset;
 if source is null then raise exception 'Unknown export dataset'using errcode='P1004';end if;
 select string_agg(case when name='$library_book'then 'public.account_export_has_book($2,$5,r.book_id)'when name='$list_owner'then 'public.account_export_record($5,''reading_lists'',jsonb_build_object(''id'',r.list_id))->>''user_id''=($2::uuid)::text'
 when name='$capture_owner'then 'public.account_export_record($5,''payment_captures'',jsonb_build_object(''provider'',r.provider,''payment_id'',r.payment_id))->>''user_id''=($2::uuid)::text'
 else format('r.%I=$2::uuid',name)end,' or '),string_agg(case when name='$library_book'then 'public.account_export_has_book($2,$5,(v.data->>''book_id'')::uuid)'when name='$list_owner'then 'public.account_export_record($5,''reading_lists'',jsonb_build_object(''id'',v.data->>''list_id''))->>''user_id''=($2::uuid)::text'
 when name='$capture_owner'then 'public.account_export_record($5,''payment_captures'',jsonb_build_object(''provider'',v.data->>''provider'',''payment_id'',v.data->>''payment_id''))->>''user_id''=($2::uuid)::text'
 else format('v.data->>%L=($2::uuid)::text',name)end,' or ')into owner_current,owner_old from jsonb_array_elements_text(source->'owners')name;
 select string_agg(format('r.%I',name),','order by ordinal),string_agg(format('(v.row_key->>%L)::%s',name,source->'types'->>(ordinal-1)::integer),','order by ordinal),string_agg(format('($3->>%L)::%s',name,source->'types'->>(ordinal-1)::integer),','order by ordinal),string_agg(format('key_%s',ordinal),','order by ordinal)into keys_current,keys_old,cursor_values,key_names from jsonb_array_elements_text(source->'keys')with ordinality item(name,ordinal);
 query:=format('with current_rows as(select public.account_export_project(to_jsonb(r),$6)data,public.account_export_key(to_jsonb(r),$6)row_key,%s,0 priority from public.%I r left join public.account_export_current m on m.table_name=%L and m.row_key=public.account_export_key(to_jsonb(r),$6)where(%s)and coalesce(m.epoch,0)<$1 and($3 is null or row(%s)>row(%s))order by %s limit $4),past_rows as(select distinct on(%s)v.data,v.row_key,%s,1 priority from public.account_export_versions v where v.table_name=%L and v.born_epoch<$1 and v.removed_epoch>=$1 and(%s)and($3 is null or row(%s)>row(%s))order by %s,v.removed_epoch limit $4),ranked as(select distinct on(row_key)*from(select *from current_rows union all select *from past_rows)c order by row_key,priority)select data,row_key from ranked order by %s limit $4',
  (select string_agg(format('r.%I as key_%s',name,ordinal),','order by ordinal)from jsonb_array_elements_text(source->'keys')with ordinality k(name,ordinal)),source->>'relation',source->>'relation',owner_current,keys_current,cursor_values,keys_current,keys_old,
  (select string_agg(format('(v.row_key->>%L)::%s as key_%s',name,source->'types'->>(ordinal-1)::integer,ordinal),','order by ordinal)from jsonb_array_elements_text(source->'keys')with ordinality k(name,ordinal)),source->>'relation',owner_old,keys_old,cursor_values,keys_old,key_names);
 for item in execute query using job.epoch,p_user,p_cursor,p_limit+1,p_job,source loop
  if p_dataset='reading_history'then
   book:=account_export_record(p_job,'books',jsonb_build_object('id',item.data->>'book_id'));
   if book->>'canonical_edition_id'is not null then book:=account_export_record(p_job,'books',jsonb_build_object('id',book->>'canonical_edition_id'));end if;
   book:=book||jsonb_build_object('goodreads_id',account_export_goodreads_id(p_job,(book->>'id')::uuid));
   shelf:=account_export_record(p_job,'shelves',jsonb_build_object('id',item.data->>'shelf_id'));
   item.data:=item.data||jsonb_build_object('books',book,'shelves',shelf);
  end if;
  size:=octet_length(jsonb_build_object('key',item.row_key,'data',item.data)::text);
  if size>900000 then raise exception 'Export record exceeds the supported record size'using errcode='P1004';end if;
  if row_count>=p_limit or bytes+size>900000 then finished:=false;exit;end if;
  records:=records||jsonb_build_array(jsonb_build_object('key',item.row_key,'data',item.data));bytes:=bytes+size;row_count:=row_count+1;next_key:=item.row_key;
 end loop;
 return jsonb_build_object('actorId',p_user,'jobId',p_job,'dataset',p_dataset,'records',records,'complete',finished,'nextKey',case when finished then null else next_key end);
end $$;

CREATE FUNCTION public.admin_catalog_snapshot(p_user uuid, p_scope text, p_search text DEFAULT ''::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_key text DEFAULT NULL::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare relation text;stamp text:='t.created_at';identity text:='t.id::text';document text:='to_jsonb(t)';predicate text:='true';result jsonb;
begin
  if not exists(select 1 from users where id=p_user and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin access required' using errcode='P1003';end if;
  if p_limit is null or p_offset is null or p_search is null or p_limit not between 1 and 100 or p_offset not between 0 and 250000 or length(p_search)>200 or (p_at is null)<>(p_key is null) or length(p_key)not between 1 and 200 then raise exception 'Invalid catalog page' using errcode='P1004';end if;
  case p_scope
    when 'users' then relation:='users t';predicate:='t.username ilike ''%''||$1||''%''';document:='jsonb_build_object(''id'',t.id,''username'',t.username,''display_name'',t.display_name,''avatar_url'',t.avatar_url,''email'',t.email,''user_types'',t.user_types,''is_premium'',t.is_premium,''premium_override'',t.premium_override,''is_moderator'',t.is_moderator,''is_admin'',t.is_admin,''is_suspended'',t.is_suspended,''is_banned'',t.is_banned,''deleted_at'',t.deleted_at,''created_at'',t.created_at)';
    when 'books' then
      relation:='books t';document:='catalog_book_snapshot(t.id)||jsonb_build_object(''affiliate_click_count'',(select count(*)from affiliate_link_clicks c where c.book_id=any(book_edition_family(t.id))and c.is_affiliate))';
      predicate:='t.canonical_edition_id is null and($1='''' or t.search_vector@@websearch_to_tsquery(''simple'',$1))';
    when 'themes' then relation:='custom_themes t';identity:='t.name';
    when 'promotions' then relation:='promoted_listings t left join books b on b.id=t.book_id';document:='to_jsonb(t)||jsonb_build_object(''book'',case when b.id is null then null else jsonb_build_object(''title'',b.title,''author_name'',b.author_name)end)';
    when 'seasons' then relation:='seasonal_events t';stamp:='t.start_date';
    when 'writing' then relation:='writing_challenges t';document:='to_jsonb(t)||jsonb_build_object(''xp_reward'',25)';
    else raise exception 'Invalid admin catalog' using errcode='P1004';
  end case;
  execute format('select jsonb_build_object(''total'',(select count(*)from %s where %s),''rows'',coalesce((select jsonb_agg(jsonb_build_object(''item'',item,''at'',at,''key'',key)order by at desc,key desc)from(select %s as item,%s as at,%s as key from %s where %s and($2 is null or(%s,%s)<($2,$3))order by %s desc,%s desc limit $4+1 offset $5)page),''[]''::jsonb))',relation,predicate,document,stamp,identity,relation,predicate,stamp,identity,stamp,identity)
    into result using p_search,p_at,p_key,p_limit,p_offset;
  return result;
end $_$;

CREATE FUNCTION public.admin_edition_audiobook_snapshot(p_actor uuid, p_book uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
  if not exists(select 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null)then raise exception 'Admin access required' using errcode='P1003';end if;
  select jsonb_build_object('actorId',p_actor,'bookId',p_book,'editionId',b.id,'has_audiobook',b.has_audiobook)into result from books source join books b on b.id=coalesce(source.canonical_edition_id,source.id)where source.id=p_book;
  if result is null then raise exception 'Book unavailable' using errcode='P1005';end if;return result;
end $$;

CREATE FUNCTION public.ai_profile_authorized(p_kind text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select has_premium_access(auth.uid()) and exists(select 1 from users where id=auth.uid() and not is_banned and deleted_at is null and (p_kind='taste' or p_kind='writing' and 'newbie_writer'=any(user_types)));
$$;

CREATE FUNCTION public.appeal_action_document(p_user uuid, p_report uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',r.id,'content_type',case when r.entity_type='user' then 'profile' else r.entity_type end,'status',r.status,'created_at',coalesce(r.resolved_at,r.created_at),
    'label',case when r.entity_type='review' then(select b.title from reviews v join books b on b.id=v.book_id where v.id=r.entity_id)
      when r.entity_type='quote' then(select b.title from quotes q join books b on b.id=q.book_id where q.id=r.entity_id)
      when r.entity_type='user' then(select display_name from users where id=r.entity_id) end,'moderator_note',r.moderator_note,'content',case when r.entity_type='review' then(select left(content,500) from reviews where id=r.entity_id) when r.entity_type='quote' then(select left(content,500) from quotes where id=r.entity_id)end,
    'pending_appeal_id',(select id from appeals where user_id=p_user and report_id=r.id and status='pending' order by created_at desc,id desc limit 1))
  from content_reports r where r.id=p_report and(r.entity_type='user' and r.entity_id=p_user or r.entity_type='review' and exists(select 1 from reviews where id=r.entity_id and user_id=p_user) or r.entity_type='quote' and exists(select 1 from quotes where id=r.entity_id and user_id=p_user));
$$;

CREATE FUNCTION public.appeal_catalog_snapshot(p_user uuid, p_scope text DEFAULT 'mine'::text, p_status text DEFAULT 'pending'::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare staff boolean;
begin
  select is_admin or is_moderator into staff from users where id=p_user and not is_banned and deleted_at is null;
  if not found or p_scope='queue' and not staff then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_scope not in('mine','queue','actions') or p_status not in('pending','approved','rejected','all') then raise exception 'Invalid catalog' using errcode='P1004';end if;
  if p_scope='actions' then
    return(with page as materialized(select r.id,coalesce(r.resolved_at,r.created_at) as created_at from content_reports r where r.status in('removed','warned')
      and(r.entity_type='user' and r.entity_id=p_user or r.entity_type='review' and exists(select 1 from reviews where id=r.entity_id and user_id=p_user) or r.entity_type='quote' and exists(select 1 from quotes where id=r.entity_id and user_id=p_user))
      and(p_at is null or(coalesce(r.resolved_at,r.created_at),r.id)<(p_at,p_id)) order by coalesce(r.resolved_at,r.created_at) desc,r.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
      select jsonb_build_object('actions',coalesce((select jsonb_agg(appeal_action_document(p_user,id) order by created_at desc,id desc) from page),'[]'::jsonb)));
  end if;
  return(with page as materialized(select a.id,a.created_at from appeals a where(case when p_scope='mine' then a.user_id=p_user else(p_status='all' or a.status=p_status)end)
    and(p_at is null or case when p_scope='queue' then(a.created_at,a.id)>(p_at,p_id)else(a.created_at,a.id)<(p_at,p_id)end)
    order by case when p_scope='queue' then a.created_at end asc,case when p_scope='queue' then a.id end asc,case when p_scope='mine' then a.created_at end desc,a.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('appeals',coalesce((select jsonb_agg(appeal_document(p_user,id,p_scope='queue') order by case when p_scope='queue' then created_at end asc,case when p_scope='queue' then id end asc,case when p_scope='mine' then created_at end desc,id desc) from page),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.appeal_document(p_user uuid, p_appeal uuid, p_staff boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('id',a.id,'user_id',a.user_id,'report_id',a.report_id,'reason',a.reason,'content_type',a.content_type,'status',a.status,'created_at',a.created_at,'reviewer_note',a.reviewer_note,'reviewed_at',a.reviewed_at,
   'user',jsonb_build_object('username',u.username,'display_name',u.display_name),'action',appeal_action_document(a.user_id,a.report_id),
   'can_review',p_staff and a.status='pending' and a.user_id<>p_user and coalesce(r.moderator_id<>p_user,true) and(r.entity_type is distinct from 'user' or r.status<>'removed' or exists(select 1 from users where id=p_user and is_admin)))
 from appeals a join users u on u.id=a.user_id left join content_reports r on r.id=a.report_id where a.id=p_appeal and(a.user_id=p_user or p_staff);
$$;

CREATE FUNCTION public.appeal_receipt_snapshot(p_user uuid, p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare receipt jsonb;
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  select response into receipt from content_intents where actor_id=p_user and action='appeals' and intent_key=p_key;
  if receipt is null then raise exception 'Receipt unavailable' using errcode='P1005';end if;
  return receipt;
end $$;

CREATE FUNCTION public.apply_admin_configuration(p_actor_id uuid, p_action text, p_key text, p_payload jsonb, p_correlation_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare previous content_intents; fingerprint text; result jsonb; before_state jsonb; theme custom_themes; store affiliate_stores; season seasonal_events; store_countries text[];
begin
  if p_action is null or p_action not in ('theme_create','theme_set','store_create','store_update','season_create','season_update') or p_key is null or length(p_key) not between 8 and 200 or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid configuration' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-configuration',0));
  perform 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Admin required' using errcode='P1003'; end if;
  fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_actor_id and action='admin:'||p_action and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting configuration intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  if p_action in ('theme_create','theme_set') then
    if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 80 then raise exception 'Invalid theme name' using errcode='P1004'; end if;
    if p_action='theme_create' then
      if p_payload->>'css_overrides' is null or length(p_payload->>'css_overrides')>50000 or (p_payload->>'css_overrides'<>'' and p_payload->>'css_overrides' !~ '^((:root|\.dark)\{(--(background|foreground|muted|muted-foreground|border|input|primary|primary-foreground|secondary|secondary-foreground|accent|accent-foreground|card|card-foreground|destructive|destructive-foreground|ring|radius):(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([0-9 .,%/+\-]+\)|[0-9.]+(rem|px));)+\}[[:space:]]*)+$') then raise exception 'Invalid theme CSS' using errcode='P1004'; end if;
      insert into custom_themes(name,css_overrides) values(p_payload->>'name',p_payload->>'css_overrides') returning * into theme;
    else
      if jsonb_typeof(p_payload->'is_active') is distinct from 'boolean' then raise exception 'Invalid activation' using errcode='P1004'; end if;
      select * into theme from custom_themes where name=p_payload->>'name' for update;
      if not found then raise exception 'Theme unavailable' using errcode='P1005'; end if;
      select jsonb_agg(to_jsonb(t)) into before_state from custom_themes t where is_active or id=theme.id;
      if (p_payload->>'is_active')::boolean then update custom_themes set is_active=false where is_active and id<>theme.id; end if;
      update custom_themes set is_active=(p_payload->>'is_active')::boolean where id=theme.id returning * into theme;
    end if;
    result:=to_jsonb(theme);
  elsif p_action in ('store_create','store_update') then
    if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 100 or length(coalesce(p_payload->>'url_template','')) not between 1 and 2000
      or p_payload->>'url_template' !~ '^https://[^[:space:]<>]+$' or jsonb_typeof(p_payload->'countries') is distinct from 'array'
      or jsonb_array_length(p_payload->'countries')>100 or exists(select 1 from jsonb_array_elements_text(p_payload->'countries') country where country !~ '^[A-Z]{2}$')
      or jsonb_typeof(p_payload->'is_active') is distinct from 'boolean' or jsonb_typeof(p_payload->'is_non_affiliate') is distinct from 'boolean'
      or p_payload->>'priority' is null or p_payload->>'priority' !~ '^-?[0-9]{1,6}$' or length(coalesce(p_payload->>'affiliate_tag',''))>200 then raise exception 'Invalid store' using errcode='P1004'; end if;
    store_countries:=array(select distinct jsonb_array_elements_text(p_payload->'countries'));
    if p_action='store_create' then
      insert into affiliate_stores(name,countries,url_template,affiliate_tag,is_active,priority,is_non_affiliate)
        values(p_payload->>'name',store_countries,p_payload->>'url_template',p_payload->>'affiliate_tag',(p_payload->>'is_active')::boolean,(p_payload->>'priority')::integer,(p_payload->>'is_non_affiliate')::boolean) returning * into store;
    else
      select * into store from affiliate_stores where id=(p_payload->>'id')::uuid for update;
      if not found then raise exception 'Store unavailable' using errcode='P1005'; end if;
      before_state:=to_jsonb(store);
      update affiliate_stores set name=p_payload->>'name',countries=store_countries,url_template=p_payload->>'url_template',affiliate_tag=p_payload->>'affiliate_tag',is_active=(p_payload->>'is_active')::boolean,priority=(p_payload->>'priority')::integer,is_non_affiliate=(p_payload->>'is_non_affiliate')::boolean where id=store.id returning * into store;
    end if;
    result:=to_jsonb(store);
  else
    if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 100 or length(coalesce(p_payload->>'theme',''))>500 or length(coalesce(p_payload->>'badge_name',''))>100
      or p_payload->>'start_date' is null or p_payload->>'end_date' is null or (p_payload->>'end_date')::timestamptz<=(p_payload->>'start_date')::timestamptz
      or jsonb_typeof(p_payload->'is_published') is distinct from 'boolean' then raise exception 'Invalid seasonal event' using errcode='P1004'; end if;
    if p_action='season_create' then
      insert into seasonal_events(name,theme,start_date,end_date,badge_name,is_published) values(p_payload->>'name',p_payload->>'theme',(p_payload->>'start_date')::timestamptz,(p_payload->>'end_date')::timestamptz,p_payload->>'badge_name',(p_payload->>'is_published')::boolean) returning * into season;
    else
      select * into season from seasonal_events where id=(p_payload->>'id')::uuid for update;
      if not found then raise exception 'Event unavailable' using errcode='P1005'; end if;
      before_state:=to_jsonb(season);
      update seasonal_events set name=p_payload->>'name',theme=p_payload->>'theme',start_date=(p_payload->>'start_date')::timestamptz,end_date=(p_payload->>'end_date')::timestamptz,badge_name=p_payload->>'badge_name',is_published=(p_payload->>'is_published')::boolean where id=season.id returning * into season;
    end if;
    result:=to_jsonb(season);
  end if;
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_actor_id,'admin:'||p_action,p_key,fingerprint,result);
  insert into financial_audit_log(actor_user_id,action,idempotency_key,correlation_id,metadata) values(p_actor_id,'admin_'||p_action,p_key,p_correlation_id,jsonb_build_object('before',before_state,'after',result));
  return result;
end $_$;

CREATE FUNCTION public.apply_book_chain_intent(p_actor_id uuid, p_action text, p_target uuid, p_key text, p_payload jsonb, p_correlation_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
 if p_action is null or p_action not in('chain_create','chain_nominate')then raise exception 'Invalid chain action' using errcode='P1004';end if;
 result:=apply_community_intent(p_actor_id,p_action,p_target,p_key,p_payload,p_correlation_id);
 if not exists(select 1 from users where id=p_actor_id and not is_banned and deleted_at is null)or p_action='chain_nominate' and not exists(select 1 from users where id=(p_payload->>'nominee_id')::uuid and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 result:=result||jsonb_build_object('actorId',p_actor_id,'chainId',case when p_action='chain_create' then result->'chain'->>'id' else p_target::text end)||case when p_action='chain_create' then jsonb_build_object('bookId',p_target)else jsonb_build_object('nomineeId',p_payload->>'nominee_id')end;
 update content_intents set response=result where actor_id=p_actor_id and action=p_action and intent_key=p_key;
 return result;
end $$;

CREATE FUNCTION public.apply_book_interaction(p_user_id uuid, p_book_id uuid, p_action text, p_key text, p_review_id uuid DEFAULT NULL::uuid, p_value boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  return apply_book_interaction_060(p_user_id,p_book_id,p_action,p_key,p_review_id,p_value);
end $$;

CREATE FUNCTION public.apply_book_interaction_060(p_user_id uuid, p_book_id uuid, p_action text, p_key text, p_review_id uuid DEFAULT NULL::uuid, p_value boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous content_intents; fingerprint text; result jsonb; shelf uuid; entry uuid; review reviews; old_vote boolean; active boolean; desired boolean; attributed integer;
begin
  if p_action not in ('reaction','helpfulness') or length(p_key) not between 8 and 200 or p_key is null then raise exception 'Invalid interaction'; end if;
  fingerprint:=jsonb_build_array(p_book_id,p_review_id,p_value)::text;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Unknown actor' using errcode='P1003'; end if;
  select * into previous from content_intents where actor_id=p_user_id and action='book:'||p_action and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting interaction intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  perform 1 from books where id=p_book_id for update;
  if not found then raise exception 'Unknown book' using errcode='P1003'; end if;
  if p_action='reaction' then
    if p_review_id is not null then
      select r.* into review from reviews r join users u on u.id=r.user_id where r.id=p_review_id and r.book_id=p_book_id
        and r.user_id<>p_user_id and r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null
        and (u.profile_visibility='public' or (u.profile_visibility='followers_only' and exists(select 1 from follows where follower_id=p_user_id and following_id=u.id))) for update of r;
      if not found then raise exception 'Review unavailable' using errcode='P1003';end if;
    end if;
    select id into shelf from shelves where user_id=p_user_id and default_type='want_to_read';
    if not found then raise exception 'Missing shelf' using errcode='P1003'; end if;
    select id into entry from shelf_books where shelf_id=shelf and user_id=p_user_id and book_id=p_book_id;
    active:=found;desired:=coalesce(p_value,not active);
    if desired and not active then
      insert into review_conversions(actor_id,book_id,review_id,reviewer_id)
        values(p_user_id,p_book_id,p_review_id,case when p_review_id is not null then review.user_id end) on conflict do nothing;
      get diagnostics attributed=row_count;
      insert into shelf_books(shelf_id,book_id,user_id) values(shelf,p_book_id,p_user_id);
      perform award_xp_once(p_user_id,5,'want_to_read','want-to-read:'||p_book_id);
      if attributed=1 and p_review_id is not null then
        update reviews set want_to_read_count=(select count(*) from review_conversions where review_id=p_review_id) where id=p_review_id;
        insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('review_conversions',p_user_id::text||':'||p_book_id::text,'check_badges',jsonb_build_object('userId',review.user_id,'trigger','want_to_read_triggered'));
      end if;
    elsif not desired and active then delete from shelf_books where id=entry;end if;
    active:=desired;
    update books set want_to_read_count=(select count(*) from shelf_books sb join shelves sh on sh.id=sb.shelf_id where sb.book_id=p_book_id and sh.default_type='want_to_read') where id=p_book_id;
    result:=jsonb_build_object('reacted',active);
  else
    if p_review_id is null or p_value is null then raise exception 'Invalid vote'; end if;
    select * into review from reviews where id=p_review_id and book_id=p_book_id and moderation_status='published' and not is_hidden for update;
    if not found then raise exception 'Review does not belong to book' using errcode='P1003'; end if;
    select is_helpful into old_vote from review_helpfulness_votes where review_id=p_review_id and user_id=p_user_id;
    if found and old_vote=p_value then
      delete from review_helpfulness_votes where review_id=p_review_id and user_id=p_user_id;
      old_vote:=null;
    else
      insert into review_helpfulness_votes(review_id,user_id,is_helpful) values(p_review_id,p_user_id,p_value)
        on conflict(review_id,user_id) do update set is_helpful=excluded.is_helpful;
      old_vote:=p_value;
    end if;
    update reviews set
      helpful_votes=(select count(*) from review_helpfulness_votes where review_id=p_review_id and is_helpful),
      unhelpful_votes=(select count(*) from review_helpfulness_votes where review_id=p_review_id and not is_helpful)
      where id=p_review_id returning * into review;
    result:=jsonb_build_object('vote',old_vote,'helpfulVotes',review.helpful_votes,'unhelpfulVotes',review.unhelpful_votes);
  end if;
  insert into content_intents values(p_user_id,'book:'||p_action,p_key,fingerprint,result);
  return result;
end $$;

CREATE FUNCTION public.apply_community_intent(p_actor_id uuid, p_action text, p_target uuid, p_key text, p_payload jsonb, p_correlation_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;legacy boolean;
begin
 if p_action='author_answer'then
  perform 1 from users where id=p_actor_id or id in(select asked_by from author_qa where id=p_target)order by id for update;
  if not exists(select 1 from users where id=p_actor_id and not is_banned and deleted_at is null and(is_verified_author or 'author'=any(user_types)))then raise exception 'Author access required' using errcode='P1003';end if;
  select exists(select 1 from content_intents where actor_id=p_actor_id and action=p_action and intent_key=p_key)into legacy;
 end if;
 result:=apply_community_intent_before095(p_actor_id,p_action,p_target,p_key,p_payload,p_correlation_id);
 if p_action<>'author_answer'or result?'qa'then return result;end if;
 if legacy then return result||jsonb_build_object('actorId',p_actor_id,'legacy',true);end if;
 result:=result||jsonb_build_object('actorId',p_actor_id,'requestKey',p_key,'qa',(select jsonb_build_object('id',id,'author_id',author_id,'asked_by',asked_by,'question',question,'answer',answer,'created_at',created_at,'answered_at',answered_at,'is_public',is_public)from author_qa where id=p_target and author_id=p_actor_id));
 update content_intents set response=result where actor_id=p_actor_id and action=p_action and intent_key=p_key;
 return result;
end $$;

CREATE FUNCTION public.apply_community_intent_before095(p_actor_id uuid, p_action text, p_target uuid, p_key text, p_payload jsonb, p_correlation_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous content_intents; fingerprint text; result jsonb; related uuid[]; recipient uuid; actor users;
  qa author_qa; arc arcs; application arc_applications; appeal appeals; report content_reports;
  verification author_verification_requests; note community_notes; chain pass_the_book_chains; node pass_the_book_nodes;
  new_status text; next_position integer; changed boolean; old_answer text;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_target is null then
    raise exception 'Invalid intent' using errcode='P1004';
  end if;
  related:=array[p_actor_id];
  case p_action
    when 'author_answer' then select array[asked_by,author_id] into related from author_qa where id=p_target;
    when 'arc_apply' then select array[author_id] into related from arcs where id=p_target;
    when 'arc_review' then select array[a.author_id,r.reader_id] into related from arcs a join arc_applications r on r.arc_id=a.id where a.id=p_target and r.id=(p_payload->>'applicationId')::uuid;
    when 'appeal_review' then select array[a.user_id,r.moderator_id] into related from appeals a left join content_reports r on r.id=a.report_id where a.id=p_target;
    when 'author_verify','admin_user' then related:=array[p_target];
    when 'chain_nominate' then related:=array[(p_payload->>'nominee_id')::uuid];
    when 'report_review' then
      select * into report from content_reports where id=p_target;
      case report.entity_type
        when 'review' then select user_id into recipient from reviews where id=report.entity_id;
        when 'quote' then select user_id into recipient from quotes where id=report.entity_id;
        when 'user' then recipient:=report.entity_id;
        else null;
      end case;
      select array_agg(id) into related from users where id in (recipient,report.reporter_id) or (is_admin and p_payload->>'status'='escalated');
    when 'community_note_review' then select array[author_id] into related from community_notes where id=p_target;
    when 'chain_create' then null;
    else raise exception 'Unknown community action' using errcode='P1004';
  end case;
  perform 1 from users where id=p_actor_id or id=any(related) order by id for update;
  select * into actor from users where id=p_actor_id and not is_banned;
  if not found then raise exception 'Forbidden' using errcode='P1003'; end if;
  if p_action in ('author_verify','admin_user') and not actor.is_admin then raise exception 'Admin access required' using errcode='P1003'; end if;
  if p_action in ('appeal_review','report_review','community_note_review') and not (actor.is_admin or actor.is_moderator) then
    raise exception 'Moderator access required' using errcode='P1003';
  end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('target',p_target,'payload',p_payload)::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_actor_id and action=p_action and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  case p_action
    when 'author_answer' then
      select * into qa from author_qa where id=p_target for update;
      if not found then raise exception 'Question unavailable' using errcode='P1005'; end if;
      if qa.author_id<>p_actor_id or not (actor.is_verified_author or 'author'=any(actor.user_types)) then raise exception 'Author access required' using errcode='P1003'; end if;
      if length(trim(coalesce(p_payload->>'answer',''))) not between 1 and 2000 then raise exception 'Invalid answer' using errcode='P1004'; end if;
      old_answer:=qa.answer;
      if qa.answer is distinct from p_payload->>'answer' then
        update author_qa set answer=p_payload->>'answer',answered_at=now() where id=p_target returning * into qa;
        if old_answer is null then
          insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
            values(qa.asked_by,'author_qa_answer',p_actor_id,'author_qa',qa.id,actor.display_name||' answered your question: '||left(qa.question,60));
        end if;
      end if;
      result:=jsonb_build_object('ok',true);
    when 'arc_apply' then
      select * into arc from arcs where id=p_target for update;
      if not found then raise exception 'ARC unavailable' using errcode='P1005'; end if;
      select * into application from arc_applications where arc_id=p_target and reader_id=p_actor_id;
      if not found then
        if arc.author_id=p_actor_id or not arc.is_active or arc.close_date<=now() then raise exception 'ARC unavailable' using errcode='P1004'; end if;
        insert into arc_applications(arc_id,reader_id) values(p_target,p_actor_id) returning * into application;
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
          values(arc.author_id,'buddy_read_invite',p_actor_id,'arc',arc.id,'A reader applied for your ARC.');
      end if;
      result:=jsonb_build_object('applied',true,'application',to_jsonb(application));
    when 'arc_review' then
      select * into arc from arcs where id=p_target for update;
      if not found then raise exception 'ARC unavailable' using errcode='P1005'; end if;
      if arc.author_id<>p_actor_id then raise exception 'Forbidden' using errcode='P1003'; end if;
      select * into application from arc_applications where arc_id=p_target and id=(p_payload->>'applicationId')::uuid for update;
      if not found then raise exception 'Application unavailable' using errcode='P1005'; end if;
      if jsonb_typeof(p_payload->'approved') is distinct from 'boolean' then raise exception 'Invalid decision' using errcode='P1004'; end if;
      new_status:=case when (p_payload->>'approved')::boolean then 'approved' else 'rejected' end;
      if application.status<>'pending' and application.status<>new_status then raise exception 'Decision is final' using errcode='P1001'; end if;
      if application.status='pending' then
        if new_status='approved' and (not arc.is_active or arc.close_date<=now() or (select count(*) from arc_applications where arc_id=p_target and status='approved')>=arc.reader_slots) then
          raise exception 'ARC slots unavailable' using errcode='P1001';
        end if;
        update arc_applications set status=new_status,reviewed_at=now() where id=application.id returning * into application;
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
          values(application.reader_id,'buddy_read_invite',p_actor_id,'arc',arc.id,case when new_status='approved' then 'Your ARC application has been approved!' else 'Your ARC application was not approved this time.' end);
      end if;
      result:=jsonb_build_object('application',to_jsonb(application));
    when 'author_verify' then
      if jsonb_typeof(p_payload->'approved') is distinct from 'boolean' then raise exception 'Invalid decision' using errcode='P1004'; end if;
      select * into verification from author_verification_requests where user_id=p_target order by created_at desc,id desc limit 1 for update;
      if not found then raise exception 'Verification request unavailable' using errcode='P1005'; end if;
      new_status:=case when (p_payload->>'approved')::boolean then 'approved' else 'rejected' end;
      if verification.status<>'pending' and verification.status<>new_status then raise exception 'Decision is final' using errcode='P1001'; end if;
      if verification.status='pending' then
        update author_verification_requests set status=new_status,reviewed_by=p_actor_id,reviewed_at=now() where id=verification.id;
        if new_status='approved' then update users set is_verified_author=true where id=p_target; end if;
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(p_target,'author_qa_answer',p_actor_id,'author_verification_request',verification.id,
          case when new_status='approved' then 'Your author verification has been approved! You now have a verified author badge.' else 'Your author verification request was not approved at this time.' end);
        insert into moderation_log(moderator_id,target_user_id,action,entity_type,entity_id) values(p_actor_id,p_target,'author_'||new_status,'author_verification_request',verification.id);
      end if;
      select jsonb_build_object('user',jsonb_build_object('id',id,'username',username,'display_name',display_name,'is_verified_author',is_verified_author)) into result from users where id=p_target;
    when 'appeal_review' then
      select * into appeal from appeals where id=p_target for update;
      if not found then raise exception 'Appeal unavailable' using errcode='P1005'; end if;
      if appeal.user_id=p_actor_id then raise exception 'Cannot review your own appeal' using errcode='P1003'; end if;
      select * into report from content_reports where id=appeal.report_id for update;
      if found and report.moderator_id=p_actor_id then raise exception 'Independent appeal reviewer required' using errcode='P1003'; end if;
      new_status:=p_payload->>'status';
      if new_status is null or new_status not in ('approved','rejected') or length(coalesce(p_payload->>'note',''))>500 then raise exception 'Invalid decision' using errcode='P1004'; end if;
      if appeal.status<>'pending' and (appeal.status<>new_status or appeal.reviewer_note is distinct from p_payload->>'note') then raise exception 'Decision is final' using errcode='P1001'; end if;
      if appeal.status='pending' then
        if new_status='approved' and report.status='removed' then
          if report.entity_type='user' and not actor.is_admin then raise exception 'Admin account restoration required' using errcode='P1003'; end if;
          if not exists(select 1 from content_reports where id<>report.id and entity_type=report.entity_type and entity_id=report.entity_id and status='removed') then
            if report.entity_type='review' then update reviews set is_hidden=false,moderation_status='published' where id=report.entity_id and moderation_status='removed';
            elsif report.entity_type='quote' then update quotes set is_hidden=false where id=report.entity_id;
            elsif report.entity_type='user' and not exists(select 1 from moderation_log where target_user_id=report.entity_id and action='suspend_user' and created_at>report.resolved_at) then
              update users set is_suspended=false where id=report.entity_id;
            end if;
          end if;
        end if;
        if new_status='approved' and report.id is not null then update content_reports set status='approved',resolved_at=now() where id=report.id; end if;
        update appeals set status=new_status,reviewed_by=p_actor_id,reviewer_note=p_payload->>'note',reviewed_at=now() where id=p_target returning * into appeal;
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(appeal.user_id,'appeal_decision',p_actor_id,'appeal',appeal.id,'Your appeal has been '||new_status||'. '||coalesce(appeal.reviewer_note,''));
        insert into moderation_log(moderator_id,target_user_id,report_id,action,reason,entity_type,entity_id) values(p_actor_id,appeal.user_id,appeal.report_id,'appeal_'||new_status,appeal.reviewer_note,'appeal',appeal.id);
      end if;
      result:=jsonb_build_object('appeal',to_jsonb(appeal)-'idempotency_key'-'request_hash');
    when 'community_note_review' then
      select * into note from community_notes where id=p_target for update;
      if not found then raise exception 'Note unavailable' using errcode='P1005'; end if;
      if note.author_id=p_actor_id then raise exception 'Independent reviewer required' using errcode='P1003'; end if;
      new_status:=p_payload->>'status';
      if new_status is null or new_status not in ('approved','rejected') then raise exception 'Invalid decision' using errcode='P1004'; end if;
      if note.status<>'pending' and note.status<>new_status then raise exception 'Decision is final' using errcode='P1001'; end if;
      if note.status='pending' then
        update community_notes set status=new_status,is_visible=new_status='approved',reviewed_by=p_actor_id,reviewed_at=now() where id=p_target returning * into note;
        insert into moderation_log(moderator_id,target_user_id,action,entity_type,entity_id) values(p_actor_id,note.author_id,'community_note_'||new_status,'community_note',note.id);
      end if;
      result:=jsonb_build_object('note',to_jsonb(note)-'idempotency_key'-'request_hash');
    when 'report_review' then
      select * into report from content_reports where id=p_target for update;
      if not found then raise exception 'Report unavailable' using errcode='P1005'; end if;
      if recipient=p_actor_id then raise exception 'Independent reviewer required' using errcode='P1003'; end if;
      new_status:=coalesce(p_payload->>'status',report.status);
      if new_status not in ('pending','approved','removed','warned','escalated') or length(coalesce(p_payload->>'note',''))>1000 then raise exception 'Invalid decision' using errcode='P1004'; end if;
      if report.status in ('approved','removed','warned') and report.status<>new_status then raise exception 'Decision is final' using errcode='P1001'; end if;
      if report.status='escalated' and new_status<>'escalated' and not actor.is_admin then raise exception 'Admin review required' using errcode='P1003'; end if;
      changed:=report.status<>new_status;
      if changed and new_status='removed' then
        if report.entity_type='review' then update reviews set is_hidden=true,moderation_status='removed' where id=report.entity_id;
        elsif report.entity_type='quote' then update quotes set is_hidden=true where id=report.entity_id;
        elsif report.entity_type='user' then
          if not actor.is_admin then raise exception 'Admin account moderation required' using errcode='P1003'; end if;
          update users set is_suspended=true where id=report.entity_id;
        else raise exception 'Unsupported removal target' using errcode='P1004'; end if;
      elsif changed and new_status='warned' and recipient is not null then
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(recipient,'moderation_warning',p_actor_id,report.entity_type,report.entity_id,'Your '||report.entity_type||' has received a moderation warning. Reason: '||coalesce(p_payload->>'note','Community guidelines violation.'));
      elsif changed and new_status='escalated' then
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) select id,'moderation_escalation',p_actor_id,'content_report',report.id,'Report #'||report.id||' has been escalated for admin review.' from users where is_admin and not is_banned;
      end if;
      if changed or report.moderator_note is distinct from p_payload->>'note' then
        update content_reports set status=new_status,moderator_id=p_actor_id,moderator_note=p_payload->>'note',resolved_at=case when new_status='pending' then null else now() end where id=p_target returning * into report;
        insert into moderation_log(moderator_id,report_id,action,reason,entity_type,entity_id) values(p_actor_id,report.id,new_status,p_payload->>'note',report.entity_type,report.entity_id);
      end if;
      result:=jsonb_build_object('report',to_jsonb(report)-'idempotency_key'-'request_hash');
    when 'admin_user' then
      if not exists(select 1 from users where id=p_target) then raise exception 'Unknown user' using errcode='P1005'; end if;
      if p_payload ? 'is_premium' then
        if jsonb_typeof(p_payload->'is_premium')<>'boolean' then raise exception 'Invalid premium state' using errcode='P1004'; end if;
        perform set_premium_override_atomic(p_actor_id,p_target,(p_payload->>'is_premium')::boolean,coalesce(nullif(p_correlation_id,''),'community:'||p_key));
      end if;
      if p_payload ? 'is_moderator' then
        if jsonb_typeof(p_payload->'is_moderator')<>'boolean' then raise exception 'Invalid moderator state' using errcode='P1004'; end if;
        update users set is_moderator=(p_payload->>'is_moderator')::boolean where id=p_target and is_moderator is distinct from (p_payload->>'is_moderator')::boolean;
        if found then insert into moderation_log(moderator_id,target_user_id,action) values(p_actor_id,p_target,case when (p_payload->>'is_moderator')::boolean then 'grant_moderator' else 'revoke_moderator' end); end if;
      end if;
      if p_payload ? 'is_suspended' then
        if jsonb_typeof(p_payload->'is_suspended')<>'boolean' then raise exception 'Invalid suspension state' using errcode='P1004'; end if;
        update users set is_suspended=(p_payload->>'is_suspended')::boolean where id=p_target and is_suspended is distinct from (p_payload->>'is_suspended')::boolean;
        if found then insert into moderation_log(moderator_id,target_user_id,action) values(p_actor_id,p_target,case when (p_payload->>'is_suspended')::boolean then 'suspend_user' else 'restore_user' end); end if;
      end if;
      result:=jsonb_build_object('updated',true);
    when 'chain_create' then
      if not exists(select 1 from books where id=p_target) or length(coalesce(p_payload->>'note',''))>500 then raise exception 'Invalid book chain' using errcode='P1004'; end if;
      insert into pass_the_book_chains(book_id,creator_id) values(p_target,p_actor_id) returning * into chain;
      insert into pass_the_book_nodes(chain_id,user_id,position,note) values(chain.id,p_actor_id,0,p_payload->>'note');
      result:=jsonb_build_object('chain',to_jsonb(chain));
    when 'chain_nominate' then
      select * into chain from pass_the_book_chains where id=p_target for update;
      if not found then raise exception 'Chain unavailable' using errcode='P1005'; end if;
      recipient:=(p_payload->>'nominee_id')::uuid;
      if recipient is null or recipient=p_actor_id or not exists(select 1 from users where id=recipient and not is_banned) or length(coalesce(p_payload->>'note',''))>500 then raise exception 'Invalid nominee' using errcode='P1004'; end if;
      select * into node from pass_the_book_nodes where chain_id=p_target and user_id=p_actor_id for update;
      if not found then raise exception 'Chain membership required' using errcode='P1003'; end if;
      if node.nominee_id is not null then
        if node.nominee_id<>recipient then raise exception 'Already passed this book' using errcode='P1001'; end if;
        select position into next_position from pass_the_book_nodes where chain_id=p_target and user_id=recipient;
      else
        if exists(select 1 from pass_the_book_nodes where chain_id=p_target and user_id=recipient) then raise exception 'Reader already in chain' using errcode='P1001'; end if;
        select coalesce(max(position),-1)+1 into next_position from pass_the_book_nodes where chain_id=p_target;
        update pass_the_book_nodes set nominee_id=recipient where id=node.id;
        insert into pass_the_book_nodes(chain_id,user_id,position,note) values(p_target,recipient,next_position,p_payload->>'note');
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(recipient,'book_pass',p_actor_id,'pass_the_book_chain',p_target,actor.display_name||' passed a book to you in a chain!');
      end if;
      result:=jsonb_build_object('success',true,'position',next_position);
  end case;
  if result is null then raise exception 'Community result unavailable'; end if;
  insert into content_intents values(p_actor_id,p_action,p_key,fingerprint,result);
  return result;
end $$;

CREATE FUNCTION public.apply_follow_intent_snapshot(p_actor uuid, p_target uuid, p_action text, p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if p_action is null or p_action not in('follow','unfollow')then raise exception 'Invalid follow action' using errcode='P1004';end if;
 perform apply_social_intent(p_actor,p_target,p_action,p_key);
 return follow_intent_snapshot(p_actor,p_target,p_key);
end $$;

CREATE FUNCTION public.apply_pending_capture_refunds(p_provider text, p_payment_id text, p_correlation_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare receipt refund_inbox;
begin
  for receipt in select * from refund_inbox where provider=p_provider and payment_id=p_payment_id and status<>'processed' order by refund_id loop
    perform process_refund_event(p_provider,receipt.refund_id,p_payment_id,receipt.amount_minor,receipt.currency,coalesce(receipt.correlation_id,p_correlation_id));
  end loop;
end $$;

CREATE FUNCTION public.apply_promotion_intent(p_actor uuid, p_action text, p_id uuid, p_key text, p_data jsonb, p_correlation_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare listing promoted_listings; previous content_intents; fingerprint text; result jsonb; recipient uuid; active_before boolean;
begin
  if p_action not in ('create','update','delete') or p_key is null or length(p_key) not between 8 and 200 or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid promotion intent' using errcode='P1004'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) as field where field not in ('book_id','author_id','start_date','end_date','placement','is_active')) then raise exception 'Invalid promotion fields' using errcode='P1004'; end if;
  if p_action='create' then recipient:=(p_data->>'author_id')::uuid;
  else select author_id into recipient from promoted_listings where id=p_id; end if;
  perform 1 from users where id in (p_actor,recipient) order by id for update;
  if not exists(select 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin required' using errcode='P1003'; end if;
  fingerprint:=jsonb_build_array(p_id,p_data)::text;
  select * into previous from content_intents where actor_id=p_actor and action='promotion:'||p_action and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting promotion intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  if p_action='create' then
    if not exists(select 1 from books where id=(p_data->>'book_id')::uuid) then raise exception 'Book not found' using errcode='P1005'; end if;
    listing:=jsonb_populate_record(null::promoted_listings,p_data);
    listing.id:=gen_random_uuid();listing.created_by:=p_actor;listing.is_active:=coalesce(listing.is_active,true);listing.created_at:=now();listing.updated_at:=now();listing.clicks:=0;
    active_before:=false;
  else
    select * into listing from promoted_listings where id=p_id for update;
    if not found then raise exception 'Listing not found' using errcode='P1005'; end if;
    if listing.author_id is distinct from recipient then raise exception 'Listing changed' using errcode='P1001'; end if;
    if p_data?'book_id' or p_data?'author_id' then raise exception 'Promotion ownership is immutable' using errcode='P1004'; end if;
    active_before:=listing.is_active;
    if p_action='delete' then
      delete from promoted_listings where id=p_id;
      result:=jsonb_build_object('id',p_id,'deleted',true);
    else listing:=jsonb_populate_record(listing,p_data);listing.updated_at:=now(); end if;
  end if;
  if p_action<>'delete' then
    if listing.placement is null or listing.placement not in ('discover_top','book_page_sidebar') or (listing.start_date is not null and listing.end_date is not null and listing.end_date<=listing.start_date)
      or ((p_action='create' or listing.is_active) and (listing.start_date is null or listing.end_date is null)) then raise exception 'Invalid promotion dates or placement' using errcode='P1004'; end if;
    if listing.author_id is not null and not exists(select 1 from users where id=listing.author_id) then raise exception 'Author not found' using errcode='P1005'; end if;
    if p_action='create' then insert into promoted_listings select listing.*;
    else update promoted_listings set is_active=listing.is_active,start_date=listing.start_date,end_date=listing.end_date,placement=listing.placement,updated_at=now() where id=listing.id returning * into listing; end if;
    result:=to_jsonb(listing);
    if listing.is_active and not active_before and listing.author_id is not null then
      insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(listing.author_id,'promoted_listing_activated',p_actor,'book',listing.book_id,'A promoted listing for your book was activated.');
    end if;
  end if;
  insert into content_intents values(p_actor,'promotion:'||p_action,p_key,fingerprint,result);
  insert into financial_audit_log(actor_user_id,target_user_id,action,idempotency_key,correlation_id,metadata)
    values(p_actor,recipient,'promotion_'||p_action,p_key,p_correlation_id,jsonb_build_object('listing_id',listing.id,'manual',true,'state',result));
  return result;
end $$;

CREATE FUNCTION public.apply_shelf_membership_intent(p_user_id uuid, p_shelf_id uuid, p_book_id uuid, p_add boolean, p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  return apply_shelf_membership_intent_063(p_user_id,p_shelf_id,p_book_id,p_add,p_key);
end $$;

CREATE FUNCTION public.apply_shelf_membership_intent_063(p_user_id uuid, p_shelf_id uuid, p_book_id uuid, p_add boolean, p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous content_intents;fingerprint text:=jsonb_build_array(p_shelf_id,p_book_id,p_add)::text;result jsonb;
begin
  if p_key is null or length(p_key) not between 8 and 200 then raise exception 'Invalid shelf intent' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into previous from content_intents where actor_id=p_user_id and action='shelf:membership' and intent_key=p_key;
  if found then if previous.fingerprint<>fingerprint then raise exception 'Conflicting shelf intent' using errcode='P1001';end if;return previous.response;end if;
  result:=set_shelf_membership(p_user_id,p_shelf_id,p_book_id,p_add);
  insert into content_intents values(p_user_id,'shelf:membership',p_key,fingerprint,result);return result;
end $$;

CREATE FUNCTION public.apply_social_intent(p_actor_id uuid, p_target_id uuid, p_action text, p_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous social_intents;
begin
 if p_action in('follow','unfollow')then
  if p_key is null or length(p_key)not between 8 and 200 or p_target_id is null or p_target_id=p_actor_id then raise exception 'Invalid follow intent' using errcode='P1004';end if;
  perform 1 from users where id in(p_actor_id,p_target_id)order by id for update;
  if not exists(select 1 from users where id=p_actor_id and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
  if not exists(select 1 from users where id=p_target_id and(p_action='unfollow'or(not is_banned and deleted_at is null)))then raise exception 'Reader unavailable' using errcode='P1005';end if;
  select * into previous from social_intents where actor_id=p_actor_id and action in('follow','unfollow')and intent_key=p_key limit 1;
  if found and(previous.target_id<>p_target_id or previous.action<>p_action)then raise exception 'Conflicting follow intent' using errcode='P1001';end if;
 end if;
 return apply_social_intent_before096(p_actor_id,p_target_id,p_action,p_key);
end $$;

CREATE FUNCTION public.apply_social_intent_before096(p_actor_id uuid, p_target_id uuid, p_action text, p_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous social_intents; owner_id uuid; active boolean; affected integer;
begin
  if p_action not in ('follow','unfollow','like') or length(p_key) not between 8 and 200 then raise exception 'Invalid action'; end if;
  -- One lock order for actor/recipient updates avoids cross-user reward deadlocks.
  if p_action in ('follow','unfollow') then owner_id:=p_target_id;
  else select user_id into owner_id from reviews where id=p_target_id; end if;
  perform 1 from users where id in (p_actor_id,owner_id) order by id for update;
  select * into previous from social_intents where actor_id=p_actor_id and action=p_action and intent_key=p_key;
  if found then
    if previous.target_id<>p_target_id then raise exception 'Conflicting intent'; end if;
    return previous.result;
  end if;
  if p_action='unfollow' then
    delete from follows where follower_id=p_actor_id and following_id=p_target_id;
    active:=false;
  elsif p_action='follow' then
    if p_actor_id=p_target_id then raise exception 'Cannot follow self'; end if;
    perform 1 from users where id=p_target_id and not is_suspended;
    if not found then raise exception 'Unavailable target'; end if;
    insert into follows(follower_id,following_id) values(p_actor_id,p_target_id) on conflict do nothing;
    get diagnostics affected=row_count;
    active:=true; owner_id:=p_target_id;
    if affected>0 then
      insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
        values(p_target_id,'follow',p_actor_id,'user',p_actor_id,'You have a new follower.');
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('follow',p_actor_id::text||':'||p_target_id::text,'push_notification',jsonb_build_object('userId',p_target_id,'title','New Follower','body','You have a new follower.','url','/notifications'));
    end if;
  else
    select user_id into owner_id from reviews where id=p_target_id for update;
    if not found then raise exception 'Unknown review'; end if;
    delete from review_likes where review_id=p_target_id and user_id=p_actor_id;
    get diagnostics affected=row_count;
    active:=affected=0;
    if active then insert into review_likes(review_id,user_id) values(p_target_id,p_actor_id); end if;
  end if;
  if active then
    insert into social_rewards values(p_actor_id,p_action,p_target_id) on conflict do nothing;
    if found then
      update users set xp=xp+2 where id=p_actor_id;
      if owner_id<>p_actor_id then update users set xp=xp+5 where id=owner_id; end if;
    end if;
  end if;
  insert into social_intents values(p_actor_id,p_action,p_key,p_target_id,active);
  return active;
end $$;

CREATE FUNCTION public.apply_writing_intent(p_user_id uuid, p_kind text, p_target uuid, p_key text, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous content_intents; fingerprint text; result jsonb; prompt writing_prompts; challenge writing_challenges;
  entry writing_challenge_submissions; question ask_writer_questions; answer ask_writer_answers;
  target_author uuid; body text; title text; words integer; wanted boolean; changed boolean; current_voted boolean;
begin
  if p_user_id is null or p_target is null or p_key is null or p_kind is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or length(p_key) not between 8 and 200 or p_kind not in ('prompt','challenge','join','vote','best_answer') then
    raise exception 'Invalid writing intent' using errcode='P1004';
  end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('target',p_target,'payload',p_payload)::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_user_id and action='writing:'||p_kind and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting writing intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  if p_kind='best_answer' then
    select user_id into target_author from ask_writer_answers where id=(p_payload->>'answer_id')::uuid and question_id=p_target;
  end if;
  perform 1 from users where id in (p_user_id,target_author) order by id for update;
  select * into previous from content_intents where actor_id=p_user_id and action='writing:'||p_kind and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting writing intent' using errcode='P1001'; end if;
    return previous.response;
  end if;

  if p_kind in ('prompt','challenge') then
    body:=btrim(p_payload->>'content');
    if body is null or length(body) not between 1 and 50000 then raise exception 'Invalid writing content' using errcode='P1004'; end if;
    words:=cardinality(regexp_split_to_array(body,'\s+'));
  end if;
  if p_kind='prompt' then
    if length(body) not between 50 and 2000 then raise exception 'Prompt response must contain 50–2000 characters' using errcode='P1004'; end if;
    select * into prompt from writing_prompts where id=p_target for share;
    if not found or not prompt.is_active or prompt.prompt_date>(now() at time zone 'UTC')::date then raise exception 'Prompt unavailable' using errcode='P1005'; end if;
    if exists(select 1 from writing_prompt_submissions where prompt_id=p_target and user_id=p_user_id) then raise exception 'Already submitted for this prompt' using errcode='P1001'; end if;
    insert into writing_prompt_submissions(user_id,prompt_id,content,word_count) values(p_user_id,p_target,body,words) returning to_jsonb(writing_prompt_submissions.*) into result;
    perform award_xp_once(p_user_id,10,'prompt_submission','prompt:'||p_target::text);
    perform increment_streak_atomic(p_user_id,'writing');
  elsif p_kind in ('challenge','join') then
    select * into challenge from writing_challenges where id=p_target for update;
    if not found then raise exception 'Challenge not found' using errcode='P1005'; end if;
    if not challenge.is_active or challenge.start_date>now() or challenge.end_date<now() then raise exception 'Challenge unavailable' using errcode='P1001'; end if;
    if p_kind='join' then
      insert into writing_challenge_participants(challenge_id,user_id) values(p_target,p_user_id) on conflict do nothing;
      select jsonb_build_object('success',true,'participant_count',participant_count) into result from writing_challenges where id=p_target;
    else
      title:=btrim(p_payload->>'title');
      if title is null or length(title) not between 1 and 200 then raise exception 'Invalid entry title' using errcode='P1004'; end if;
      select * into entry from writing_challenge_submissions where challenge_id=p_target and user_id=p_user_id for update;
      changed:=not found or entry.content is distinct from body or entry.title is distinct from title;
      insert into writing_challenge_participants(challenge_id,user_id) values(p_target,p_user_id) on conflict do nothing;
      insert into writing_challenge_submissions(user_id,challenge_id,title,content,body,word_count)
        values(p_user_id,p_target,title,body,body,words) on conflict(challenge_id,user_id) do update
        set title=excluded.title,content=excluded.content,body=excluded.body,word_count=excluded.word_count
        returning to_jsonb(writing_challenge_submissions.*) into result;
      perform award_xp_once(p_user_id,25,'challenge_submission','challenge:'||p_target::text);
      if changed then perform increment_streak_atomic(p_user_id,'writing'); end if;
    end if;
  elsif p_kind='vote' then
    select * into entry from writing_challenge_submissions where id=p_target for update;
    if not found then raise exception 'Submission not found' using errcode='P1005'; end if;
    if entry.user_id=p_user_id then raise exception 'Cannot vote on your own submission' using errcode='P1004'; end if;
    if jsonb_typeof(p_payload->'voted') is distinct from 'boolean' then raise exception 'Invalid vote' using errcode='P1004'; end if;
    wanted:=(p_payload->>'voted')::boolean;
    select exists(select 1 from writing_challenge_votes where user_id=p_user_id and submission_id=p_target) into current_voted;
    if wanted and not current_voted then
      insert into writing_challenge_votes(user_id,submission_id) values(p_user_id,p_target);
      update writing_challenge_submissions set community_votes=community_votes+1 where id=p_target;
    elsif not wanted and current_voted then
      delete from writing_challenge_votes where user_id=p_user_id and submission_id=p_target;
      update writing_challenge_submissions set community_votes=greatest(0,community_votes-1) where id=p_target;
    end if;
    select jsonb_build_object('voted',wanted,'community_votes',community_votes) into result from writing_challenge_submissions where id=p_target;
  else
    select * into answer from ask_writer_answers where id=(p_payload->>'answer_id')::uuid and question_id=p_target for share;
    if not found then raise exception 'Answer not found for this question' using errcode='P1005'; end if;
    select * into question from ask_writer_questions where id=p_target for update;
    if not found then raise exception 'Question not found' using errcode='P1005'; end if;
    if question.user_id<>p_user_id then raise exception 'Not your question' using errcode='P1003'; end if;
    if question.best_answer_id is not null and question.best_answer_id<>answer.id then raise exception 'Best answer already selected' using errcode='P1001'; end if;
    update ask_writer_questions set best_answer_id=answer.id where id=question.id;
    if answer.user_id<>p_user_id and not exists(select 1 from xp_ledger where reason='best_answer_chosen' and event_key='best-answer:'||question.id::text) then
      perform award_xp_once(answer.user_id,20,'best_answer_chosen','best-answer:'||question.id::text);
    end if;
    result:=jsonb_build_object('ok',true);
  end if;
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_user_id,'writing:'||p_kind,p_key,fingerprint,result);
  return result;
end $$;

CREATE FUNCTION public.arc_application_snapshot(p_user uuid, p_arc uuid, p_status text DEFAULT 'all'::text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target arcs;result jsonb;
begin
  select * into target from arcs where id=p_arc;
  if not found then return null;end if;
  if target.author_id is distinct from p_user then raise exception 'Author access required' using errcode='P1003';end if;
  if p_status not in('all','pending','approved','rejected') then raise exception 'Invalid status' using errcode='P1004';end if;
  with page as materialized(
    select a.* from arc_applications a where arc_id=p_arc and(p_status='all' or status=p_status) and(p_before is null or(applied_at,id)<(p_before,p_id)) order by applied_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1
  )select jsonb_build_object('arc',arc_offer_document(p_arc,p_user),
    'statistics',(select jsonb_build_object('total',count(*),'pending',count(*) filter(where status='pending'),'approved',count(*) filter(where status='approved'),'rejected',count(*) filter(where status='rejected')) from arc_applications where arc_id=p_arc),
    'applications',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('reader',jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url,'xp',u.xp,'active',not u.is_banned and u.deleted_at is null)) order by a.applied_at desc,a.id desc) from page a join users u on u.id=a.reader_id),'[]'::jsonb)) into result;
  return result;
end $$;

CREATE FUNCTION public.arc_catalog_snapshot(p_user uuid, p_owned boolean, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_author uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with page as materialized(
    select a.id,a.created_at from arcs a where
      (case when p_owned then a.author_id=p_user else(a.is_active and(a.close_date is null or a.close_date>now()) and author_owns_book(a.author_id,a.book_id)) or exists(select 1 from arc_applications m where m.arc_id=a.id and m.reader_id=p_user) end)
      and(p_author is null or a.author_id=p_author) and(p_before is null or(a.created_at,a.id)<(p_before,p_id))
    order by a.created_at desc,a.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1
  )select jsonb_build_object('arcs',coalesce((select jsonb_agg(arc_offer_document(id,p_user) order by created_at desc,id desc) from page),'[]'::jsonb));
$$;

CREATE FUNCTION public.arc_offer_document(p_arc uuid, p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',a.id,'author_id',a.author_id,'book_id',a.book_id,'description',a.description,'reader_slots',a.reader_slots,'close_date',a.close_date,'is_active',a.is_active,'created_at',a.created_at,
    'title',b.title,'books',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'isbn_13',b.isbn_13,'language',b.language,'format',b.format),
    'author',jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url,'is_verified_author',u.is_verified_author),
    'approved_count',counts.approved,'pending_count',case when p_user=a.author_id then counts.pending end,'total_applications',case when p_user=a.author_id then counts.total end,'slots_remaining',greatest(0,a.reader_slots-counts.approved),
    'my_application_status',mine.status,'is_open',availability.open,
    'can_apply',coalesce(p_user is not null and p_user<>a.author_id and mine.id is null and availability.open and counts.approved<a.reader_slots,false),
    'can_review',coalesce(p_user=a.author_id and availability.open and counts.approved<a.reader_slots,false))
  from arcs a join users u on u.id=a.author_id join books source on source.id=a.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
  cross join lateral(select count(*) as total,count(*) filter(where status='approved') as approved,count(*) filter(where status='pending') as pending from arc_applications where arc_id=a.id) counts
  cross join lateral(select a.is_active and(a.close_date is null or a.close_date>now()) and author_owns_book(a.author_id,a.book_id) as open) availability
  left join arc_applications mine on mine.arc_id=a.id and mine.reader_id=p_user where a.id=p_arc;
$$;

CREATE FUNCTION public.assert_reading_room_access(p_user uuid, p_room uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) or not reading_room_visible(p_room,p_user) then raise exception 'Room unavailable' using errcode='P1003';end if;
end $$;

CREATE FUNCTION public.attribute_referral_atomic(p_user_id uuid, p_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare referrer uuid;
begin
  referrer:=attribute_referral_atomic_036(p_user_id,p_code);
  if referrer is not null then
    insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('referrals',p_user_id::text,'check_badges',jsonb_build_object('userId',referrer,'trigger','referral')) on conflict do nothing;
  end if;
  return referrer;
end $$;

CREATE FUNCTION public.attribute_referral_atomic_036(p_user_id uuid, p_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare referrer uuid; existing uuid;
begin
  if p_code is null or length(p_code) not between 1 and 100 then return null; end if;
  select id into referrer from users where referral_code=p_code and id<>p_user_id and not is_banned;
  if not found then return null; end if;
  perform 1 from users where id in (p_user_id,referrer) order by id for update;
  select referred_by into existing from users where id=p_user_id;
  if not found then raise exception 'Unknown user' using errcode='P1003'; end if;
  if existing is not null then return existing; end if;
  update users set referred_by=referrer where id=p_user_id;
  insert into referrals(referrer_id,referred_id) values(referrer,p_user_id);
  perform award_xp_once(referrer,200,'referral_signup','referral-signup:'||p_user_id);
  insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
    values(referrer,'referral',p_user_id,'user',p_user_id,'Someone signed up using your referral link! +200 XP');
  return referrer;
end $$;

CREATE FUNCTION public.author_analytics_snapshot(p_author uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with owned as materialized(select b.id,b.work_id from books b where b.work_id in(select canonical_book_work(work_id) from author_work_claims where author_id=p_author)),
  reading as materialized(select distinct o.work_id,sb.user_id,s.default_type from owned o join shelf_books sb on sb.book_id=o.id join shelves s on s.id=sb.shelf_id join users u on u.id=sb.user_id where not u.is_banned and u.deleted_at is null),
  visible_reviews as not materialized(select r.* from reviews r join owned o on o.id=r.book_id join users u on u.id=r.user_id where r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null),
  recent as(select r.*,b.title,u.display_name,u.username from visible_reviews r join books b on b.id=r.book_id join users u on u.id=r.user_id order by r.created_at desc,r.id desc limit 5)
  select jsonb_build_object('totalWantToReads',(select count(*) from reading where default_type='want_to_read'),
    'totalCurrentlyReading',(select count(*) from reading where default_type='currently_reading'),
    'totalHaveRead',(select count(*) from reading where default_type='have_read'),
    'totalReviews',(select count(*) from visible_reviews),
    'followerCount',(select count(*) from follows f join users u on u.id=f.follower_id where f.following_id=p_author and not u.is_banned and u.deleted_at is null),
    'recentReviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'rating',rating,'content',content,'created_at',created_at,'books',jsonb_build_object('title',title),'users',jsonb_build_object('display_name',display_name,'username',username)) order by created_at desc,id desc) from recent),'[]'::jsonb))
  from users where id=p_author and is_verified_author and not is_banned and deleted_at is null;
$$;

CREATE FUNCTION public.author_answer_has_text(p_answer text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_answer,''),'<[^>]*>','','g'),'&(?:nbsp|#0*160|#x0*a0);','','gi'),U&'[\00A0\200B\200C\200D\2060\FEFF]','','g'),'[[:space:]]','','g'))>0;
$$;

CREATE FUNCTION public.author_answer_receipt_snapshot(p_user uuid, p_question uuid, p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null and(is_verified_author or 'author'=any(user_types)))then raise exception 'Author access required' using errcode='P1003';end if;
 if p_question is null or p_key is null or length(p_key)not between 8 and 200 then raise exception 'Invalid receipt' using errcode='P1004';end if;
 select response into result from content_intents where actor_id=p_user and action='author_answer'and intent_key=p_key;
 if result is null or result->'qa'->>'id'is distinct from p_question::text or result->'qa'->>'author_id'is distinct from p_user::text then raise exception 'Receipt unavailable' using errcode='P1005';end if;
 return result;
end $$;

CREATE FUNCTION public.author_catalog_snapshot(p_author uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with owned as materialized(
    select b.* from books b where b.canonical_edition_id is null and b.work_id in(select canonical_book_work(c.work_id) from author_work_claims c join users u on u.id=c.author_id where c.author_id=p_author and u.is_verified_author and not u.is_banned and u.deleted_at is null)
  ), page as(
    select * from owned where p_before is null or(created_at,id)<(p_before,p_id) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,30),50))+1
  )
  select jsonb_build_object('total',(select count(*) from owned),'books',coalesce((select jsonb_agg(jsonb_build_object('id',id,'work_id',canonical_book_work(work_id),'title',title,'author_name',author_name,'cover_url',cover_url,'isbn_13',isbn_13,'isbn_10',isbn_10,'language',language,'format',format,'published_year',published_year,'average_rating',average_rating,'ratings_count',ratings_count,'currently_reading_count',currently_reading_count,'want_to_read_count',want_to_read_count,'have_read_count',have_read_count,'created_at',created_at) order by created_at desc,id desc) from page),'[]'::jsonb));
$$;

CREATE FUNCTION public.author_owns_book(p_author uuid, p_book uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists(select 1 from author_work_claims c join users u on u.id=c.author_id join books b on b.id=p_book
    where c.author_id=p_author and u.is_verified_author and not u.is_banned and u.deleted_at is null
      and canonical_book_work(c.work_id)=canonical_book_work(b.work_id));
$$;

CREATE FUNCTION public.author_question_owner_snapshot(p_user uuid, p_state text DEFAULT 'all'::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null and(is_verified_author or 'author'=any(user_types)))then raise exception 'Author access required' using errcode='P1003';end if;
 if p_state is null or p_state not in('all','unanswered','answered')or p_limit is null or p_limit not between 1 and 50 or(p_at is null)<>(p_id is null)then raise exception 'Invalid question page' using errcode='P1004';end if;
 return jsonb_build_object('total',(select count(*)from author_qa where author_id=p_user),'unanswered',(select count(*)from author_qa where author_id=p_user and answer is null),'answered',(select count(*)from author_qa where author_id=p_user and answer is not null),'qa',coalesce((
 select jsonb_agg(to_jsonb(q)order by q.created_at desc,q.id desc)from(select id,author_id,asked_by,question,answer,created_at,answered_at,is_public from author_qa where author_id=p_user and(p_state='all'or(answer is null)=(p_state='unanswered'))and(p_at is null or(created_at,id)<(p_at,p_id))order by created_at desc,id desc limit p_limit+1)q),'[]'::jsonb));
end $$;

CREATE FUNCTION public.author_question_snapshot(p_author uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if not exists(select 1 from users where id=p_author and(is_verified_author or 'author'=any(user_types))and not is_banned and deleted_at is null)then raise exception 'Author unavailable' using errcode='P1005';end if;
 if p_limit is null or p_limit not between 1 and 50 or(p_at is null)<>(p_id is null)then raise exception 'Invalid question page' using errcode='P1004';end if;
 return jsonb_build_object('total',(select count(*)from author_qa where author_id=p_author and is_public and answer is not null),'qa',coalesce((select jsonb_agg(jsonb_build_object('id',id,'author_id',author_id,'asked_by',asked_by,'question',question,'answer',answer,'created_at',created_at,'answered_at',answered_at,'cursor_at',coalesce(answered_at,created_at))order by coalesce(answered_at,created_at) desc,id desc)from(select * from author_qa where author_id=p_author and is_public and answer is not null and(p_at is null or(coalesce(answered_at,created_at),id)<(p_at,p_id))order by coalesce(answered_at,created_at) desc,id desc limit p_limit+1)page),'[]'::jsonb));
end $$;

CREATE FUNCTION public.award_badge_atomic(p_user_id uuid, p_badge_id text, p_xp integer, p_name text, p_icon text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_xp is null or p_xp<0 or p_xp>5000 or p_badge_id is null or length(p_badge_id) not between 1 and 100 then raise exception 'Invalid badge';end if;
  perform 1 from users where id=p_user_id for update;
  insert into user_badges(user_id,badge_id) values(p_user_id,p_badge_id) on conflict do nothing;
  if not found then return false;end if;
  perform award_xp_once(p_user_id,p_xp,'badge:'||p_badge_id,'badge:'||p_badge_id);
  insert into notifications(user_id,type,message,message_key,message_values) values(p_user_id,'badge_earned',p_icon||' '||p_name,'badge',jsonb_build_object('badgeId',p_badge_id,'badgeName',p_name,'icon',p_icon));
  return true;
end $$;

CREATE FUNCTION public.award_reading_goal_milestones(p_user_id uuid, p_year integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare snapshot jsonb;threshold integer;receipt uuid;awarded integer:=0;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then return 0;end if;
  snapshot:=reading_goal_snapshot(p_user_id,p_year);
  for threshold in select unnest(array[25,50,75,100]) loop
    if (snapshot#>>'{progress,percentage}')::numeric>=threshold then
      insert into reading_goal_milestones(user_id,year,milestone) values(p_user_id,p_year,threshold) on conflict do nothing returning id into receipt;
      if found then
        insert into notifications(user_id,type,message,message_key,message_values) values(p_user_id,'reading_goal_milestone',format('You have read %s of %s books and reached %s%% of your %s reading goal.',snapshot#>>'{progress,books_read}',snapshot#>>'{goal,target_books}',threshold,p_year),'readingGoal',jsonb_build_object('count',(snapshot#>>'{progress,books_read}')::integer,'target',(snapshot#>>'{goal,target_books}')::integer,'percent',threshold,'year',p_year::text));
        awarded:=awarded+1;
      end if;
    end if;
  end loop;
  return awarded;
end $$;

CREATE FUNCTION public.award_xp_once(p_user_id uuid, p_amount integer, p_reason text, p_event_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare target uuid;total integer;
begin
  if p_reason='write_review' and p_amount between 0 and 5000 and p_event_key ~ '^review:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    select xp into total from users where id=p_user_id for update;
    select coalesce(canonical_edition_id,id) into target from books where id=substr(p_event_key,8)::uuid;
    if target is not null then
      if exists(select 1 from xp_ledger where user_id=p_user_id and reason='write_review' and event_key in(select 'review:'||id::text from books where id=target or canonical_edition_id=target)) then return jsonb_build_object('xp',total,'awarded',0);end if;
      p_event_key:='review:'||target;
    end if;
  end if;
  return award_xp_once_024(p_user_id,p_amount,p_reason,p_event_key);
end $_$;

CREATE FUNCTION public.award_xp_once_024(p_user_id uuid, p_amount integer, p_reason text, p_event_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous xp_ledger; total integer;
begin
  if p_amount<0 or p_amount>5000 or length(p_event_key) not between 1 and 512 then raise exception 'Invalid reward'; end if;
  perform 1 from users where id=p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  select * into previous from xp_ledger where user_id=p_user_id and event_key=p_event_key;
  if found then
    if previous.amount<>p_amount or previous.reason<>p_reason then raise exception 'Conflicting reward'; end if;
    select xp into total from users where id=p_user_id;
    return jsonb_build_object('xp',total,'awarded',0);
  end if;
  insert into xp_ledger values(p_user_id,p_event_key,p_amount,p_reason,now());
  update users set xp=xp+p_amount where id=p_user_id returning xp into total;
  return jsonb_build_object('xp',total,'awarded',p_amount);
end $$;

CREATE FUNCTION public.begin_avatar_upload(p_user_id uuid, p_hash text, p_backend text, p_bucket text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare profile users;upload profile_avatar_uploads;upload_id uuid:=gen_random_uuid();
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_backend is null or p_backend not in ('s3','supabase') or p_bucket is null or length(p_bucket) not between 1 and 128 then raise exception 'Invalid avatar upload' using errcode='P1004';end if;
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into upload from profile_avatar_uploads where user_id=p_user_id and fingerprint=p_hash and backend=p_backend and bucket=p_bucket
    and ((state in ('pending','uploaded') and expires_at>now()) or (state='committed' and public_url=profile.avatar_url)) order by created_at desc limit 1;
  if found then return to_jsonb(upload);end if;
  if (select count(*) from profile_avatar_uploads where user_id=p_user_id and state in ('pending','uploaded') and expires_at>now())>=10 then raise exception 'Too many staged avatars' using errcode='P1001';end if;
  insert into profile_avatar_uploads(id,user_id,fingerprint,backend,bucket,path) values(upload_id,p_user_id,p_hash,p_backend,p_bucket,'avatars/'||p_user_id::text||'/'||upload_id::text||'.webp') returning * into upload;
  return to_jsonb(upload);
end $_$;

CREATE FUNCTION public.begin_factor_challenge(p_user_id uuid, p_hash text, p_kind text, p_session_hash text, p_encrypted_payload text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare profile users;
begin
  select * into profile from users where id=p_user_id and deleted_at is null and not is_banned for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  if p_kind is null or p_kind not in ('login','setup') or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid factor challenge' using errcode='P1004'; end if;
  if (p_kind='login' and not profile.totp_enabled) or (p_kind='setup' and (profile.totp_enabled or p_encrypted_payload is null or p_session_hash is null)) then raise exception 'Factor state changed' using errcode='P1001'; end if;
  delete from auth_factor_challenges where expires_at<now() and user_id=p_user_id;
  insert into auth_factor_challenges(token_hash,user_id,kind,expected_version,provider_session_hash,encrypted_payload)
    values(p_hash,p_user_id,p_kind,profile.mfa_version,p_session_hash,p_encrypted_payload);
end $_$;

CREATE FUNCTION public.book_authors_snapshot(p_book uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',username,'display_name',display_name,'avatar_url',avatar_url,'is_verified_author',is_verified_author) order by username),'[]'::jsonb)
  from users u where is_verified_author and not is_banned and deleted_at is null and u.id in(select c.author_id from author_work_claims c join books b on b.id=p_book where canonical_book_work(c.work_id)=canonical_book_work(b.work_id));
$$;

CREATE FUNCTION public.book_chain_node_document(p_node uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('id',n.id,'chain_id',n.chain_id,'user_id',n.user_id,'nominee_id',n.nominee_id,'note',n.note,'position',n.position,'created_at',n.created_at,'reader',case when u.id is null then null else jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url)end)
 from pass_the_book_nodes n left join users u on u.id=n.user_id and not u.is_banned and u.deleted_at is null where n.id=p_node;
$$;

CREATE FUNCTION public.book_chain_roster_snapshot(p_user uuid, p_chain uuid, p_position integer DEFAULT '-1'::integer, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if not exists(select 1 from pass_the_book_chains where id=p_chain)then raise exception 'Chain unavailable' using errcode='P1005';end if;
 if p_position is null or p_position< -1 or(p_position=-1)<>(p_id is null)or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid roster' using errcode='P1004';end if;
 return jsonb_build_object('total',(select count(*)from pass_the_book_nodes where chain_id=p_chain),'nodes',coalesce((select jsonb_agg(book_chain_node_document(n.id)order by position,id)from(select id,position from pass_the_book_nodes where chain_id=p_chain and(p_position=-1 or(position,id)>(p_position,p_id)) order by position,id limit p_limit+1)n),'[]'::jsonb));
end $$;

CREATE FUNCTION public.book_edition_family(p_book_id uuid) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with target as(select coalesce(canonical_edition_id,id) as id from books where id=p_book_id)
  select coalesce(array_agg(b.id order by b.id),'{}'::uuid[]) from books b,target where b.id=target.id or b.canonical_edition_id=target.id;
$$;

CREATE FUNCTION public.book_pass_catalog_snapshot(p_user uuid, p_scope text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_scope is null or p_scope not in('chains','received','sent') or p_limit is null or p_limit not between 1 and 100 or(p_at is null)<>(p_id is null)then raise exception 'Invalid catalog' using errcode='P1004';end if;
 if p_scope='chains' then
  return jsonb_build_object('total',(select count(*)from pass_the_book_chains),'items',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('books',catalog_book_snapshot(c.book_id),'reader_count',(select count(*)from pass_the_book_nodes where chain_id=c.id),'can_nominate',exists(select 1 from pass_the_book_nodes where chain_id=c.id and user_id=p_user and nominee_id is null),'nodes',coalesce((select jsonb_agg(book_chain_node_document(n.id)order by n.position,n.id)from(select id,position from pass_the_book_nodes where chain_id=c.id order by position,id limit 5)n),'[]'::jsonb))order by c.created_at desc,c.id desc)from(select * from pass_the_book_chains where p_at is null or(created_at,id)<(p_at,p_id)order by created_at desc,id desc limit p_limit+1)c),'[]'::jsonb));
 end if;
 return jsonb_build_object('total',(select count(*)from book_passes where case p_scope when 'received' then recipient_id=p_user else sender_id=p_user end),'items',coalesce((select jsonb_agg((to_jsonb(p)-'idempotency_key'-'request_hash')||jsonb_build_object('book',catalog_book_snapshot(p.book_id),'sender',case when sender.id is null then null else jsonb_build_object('id',sender.id,'username',sender.username,'display_name',sender.display_name)end,'recipient',case when recipient.id is null then null else jsonb_build_object('id',recipient.id,'username',recipient.username,'display_name',recipient.display_name)end)order by p.created_at desc,p.id desc)from(select * from book_passes where(case p_scope when 'received' then recipient_id=p_user else sender_id=p_user end)and(p_at is null or(created_at,id)<(p_at,p_id))order by created_at desc,id desc limit p_limit+1)p left join users sender on sender.id=p.sender_id and not sender.is_banned and sender.deleted_at is null left join users recipient on recipient.id=p.recipient_id and not recipient.is_banned and recipient.deleted_at is null),'[]'::jsonb));
end $$;

CREATE FUNCTION public.book_pass_receipt_snapshot(p_user uuid, p_action text, p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare receipt jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_action is null or p_action not in('book_passes','chain_create','chain_nominate') or p_key is null or length(p_key)not between 8 and 200 then raise exception 'Invalid receipt' using errcode='P1004';end if;
 select response into receipt from content_intents where actor_id=p_user and action=p_action and intent_key=p_key;
 if receipt is null then raise exception 'Receipt unavailable' using errcode='P1005';end if;
 return case when p_action='book_passes' then jsonb_build_object('actorId',p_user,'pass',receipt)else receipt end;
end $$;

CREATE FUNCTION public.book_review_snapshot(p_book_id uuid, p_limit integer DEFAULT 50, p_after_helpful integer DEFAULT NULL::integer, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target uuid;result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 or p_after_helpful<0 or num_nonnulls(p_after_helpful,p_after_created_at,p_after_id) not in (0,3) then raise exception 'Invalid review page' using errcode='P1004';end if;
  select coalesce(canonical_edition_id,id) into target from books where id=p_book_id;
  if target is null then return null;end if;
  with visible as not materialized(
    select r.id,r.book_id,r.user_id,r.rating,r.content,r.review_type,r.mood_tags,r.has_spoilers,r.likes_count,r.helpful_votes,r.unhelpful_votes,r.created_at,
      jsonb_build_object('id',u.id,'display_name',u.display_name,'avatar_url',u.avatar_url,'username',u.username) as "user"
    from reviews r join users u on u.id=r.user_id where r.book_id=any(book_edition_family(target)) and r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null
  ),page as(
    select * from visible where p_after_id is null or (helpful_votes,created_at,id)<(p_after_helpful,p_after_created_at,p_after_id)
      order by helpful_votes desc,created_at desc,id desc limit p_limit+1
  ),shown as(select * from page order by helpful_votes desc,created_at desc,id desc limit p_limit)
  select jsonb_build_object('bookId',target,'statistics',(
    select jsonb_build_object('ratings_count',count(*),'average_rating',round(avg(rating),2),'distribution',jsonb_build_object('1',count(*) filter(where rating=1),'2',count(*) filter(where rating=2),'3',count(*) filter(where rating=3),'4',count(*) filter(where rating=4),'5',count(*) filter(where rating=5))) from visible
  ),'reviews',(select coalesce(jsonb_agg(to_jsonb(s) order by helpful_votes desc,created_at desc,id desc),'[]'::jsonb) from shown s),'nextCursor',
    case when (select count(*) from page)>p_limit then(select jsonb_build_object('helpful',helpful_votes,'at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',id) from shown order by helpful_votes,created_at,id limit 1) end
  ) into result;
  return result;
end $$;

CREATE FUNCTION public.book_work_snapshot(p_work_id uuid, p_cursor uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target uuid:=canonical_book_work(p_work_id);page jsonb;next_id uuid;statistics jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid edition page' using errcode='P1004';end if;
  if target is null then return null;end if;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]'::jsonb) into page from(
    select * from books where work_id=target and canonical_edition_id is null and (p_cursor is null or id>p_cursor) order by id limit p_limit+1
  ) b;
  if jsonb_array_length(page)>p_limit then page:=page-(p_limit);next_id:=(page->(p_limit-1)->>'id')::uuid;end if;
  select jsonb_build_object('ratings_count',count(*),'average_rating',round(avg(r.rating),2),'readers_count',(
    select count(distinct sb.user_id) from shelf_books sb join books b on b.id=sb.book_id join users u on u.id=sb.user_id where b.work_id=target and not u.is_banned and u.deleted_at is null
  )) into statistics from reviews r join books b on b.id=r.book_id join users u on u.id=r.user_id where b.work_id=target and r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null;
  return jsonb_build_object('work',(select to_jsonb(w)||jsonb_build_object('open_library_id',coalesce(w.open_library_id,(select open_library_id from book_work_identifiers where work_id=target order by open_library_id limit 1))) from book_works w where id=target),'editions',page,'nextCursor',next_id,'statistics',statistics);
end $$;

CREATE FUNCTION public.books_search_vector_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.search_vector:=to_tsvector('simple',coalesce(new.title,'')||' '||coalesce(new.author_name,'')||' '||coalesce(new.isbn_13,'')||' '||coalesce(new.isbn_10,''));return new;
end $$;

CREATE FUNCTION public.buddy_catalog_snapshot(p_user uuid, p_scope text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_scope not in('mine','open') then raise exception 'Invalid catalog' using errcode='P1004';end if;
  return(with page as materialized(
    select r.id,r.created_at from buddy_reads r where
      case when p_scope='mine' then exists(select 1 from buddy_read_members where buddy_read_id=r.id and user_id=p_user)
      else r.is_active and not r.is_private and not exists(select 1 from buddy_read_members where buddy_read_id=r.id and user_id=p_user)
        and exists(select 1 from users where id=r.created_by and not is_banned and deleted_at is null)
        and(select count(*) from buddy_read_members where buddy_read_id=r.id)<r.max_participants end
      and(p_before is null or(r.created_at,r.id)<(p_before,p_id))
    order by r.created_at desc,r.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1
  )select jsonb_build_object('buddy_reads',coalesce((select jsonb_agg(buddy_read_document(id,p_user) order by created_at desc,id desc) from page),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.buddy_detail_snapshot(p_user uuid, p_room uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with room as(select buddy_read_document(p_room,p_user) as document)
  select jsonb_build_object('buddyRead',document,'book',document->'book','participants',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url) order by m.joined_at,u.id) from buddy_read_members m join users u on u.id=m.user_id where m.buddy_read_id=p_room),'[]'::jsonb)) from room where document is not null;
$$;

CREATE FUNCTION public.buddy_notes_snapshot(p_user uuid, p_room uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not exists(select 1 from buddy_read_members where buddy_read_id=p_room and user_id=p_user) then raise exception 'Not a participant' using errcode='P1003';end if;
  return(with page as materialized(select n.* from buddy_read_notes n where buddy_read_id=p_room and(p_before is null or(created_at,id)<(p_before,p_id)) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'user_id',n.user_id,'content',n.content,'created_at',n.created_at,'reply_to_id',n.reply_to_id,'user',jsonb_build_object('display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url)) order by n.created_at desc,n.id desc) from page n join users u on u.id=n.user_id),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.buddy_read_document(p_room uuid, p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',r.id,'title',r.title,'book_id',r.book_id,'max_participants',r.max_participants,'current_chapter',r.current_chapter,'is_active',r.is_active,'is_private',r.is_private,'created_by',r.created_by,'created_at',r.created_at,
    'participant_count',members.total,'is_member',members.mine,'can_join',not members.mine and not r.is_private and r.is_active and members.total<r.max_participants and owner.active,
    'can_update',members.mine and r.is_active,
    'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'isbn_13',b.isbn_13,'isbn_10',b.isbn_10,'language',b.language,'format',b.format))
  from buddy_reads r join books source on source.id=r.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
  cross join lateral(select count(*) as total,coalesce(bool_or(user_id=p_user),false) as mine from buddy_read_members where buddy_read_id=r.id) members
  cross join lateral(select exists(select 1 from users where id=r.created_by and not is_banned and deleted_at is null) as active) owner
  where r.id=p_room and(not r.is_private or r.created_by=p_user or members.mine);
$$;

CREATE FUNCTION public.buddy_read_visible(p_room_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists(select 1 from buddy_reads room where room.id=p_room_id and (not room.is_private or room.created_by=auth.uid() or exists(select 1 from buddy_read_members member where member.buddy_read_id=room.id and member.user_id=auth.uid())));
$$;

CREATE FUNCTION public.can_read_reading_room(p_room_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select reading_room_visible(p_room_id,auth.uid());
$$;

CREATE FUNCTION public.can_read_workshop(p_room_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists(select 1 from workshop_members where room_id=p_room_id and user_id=auth.uid());
$$;

CREATE FUNCTION public.cancel_payout_request(p_user_id uuid, p_payout_id uuid, p_correlation_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare payout payout_requests;
begin
  perform 1 from users where id=p_user_id for update;
  select * into payout from payout_requests where id=p_payout_id and user_id=p_user_id for update;
  if not found then raise exception 'Unknown payout' using errcode='P1005'; end if;
  if payout.status='cancelled' then return; end if;
  if payout.status<>'pending' then raise exception 'Payout already processing' using errcode='P1001'; end if;
  update payout_requests set status='cancelled' where id=payout.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,correlation_id,metadata)
    values(p_user_id,p_user_id,'payout_cancelled',payout.amount,payout.currency,p_correlation_id,jsonb_build_object('payout_id',payout.id));
end $$;

CREATE FUNCTION public.cancel_subscriptions_atomic(p_user_id uuid, p_correlation_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform 1 from users where id=p_user_id for update;
  update subscriptions set status='cancelled',cancelled_at=now(),last_provider_event_at=now() where user_id=p_user_id and status='active';
  if found then
    update users set is_premium=false where id=p_user_id;
    insert into financial_audit_log(actor_user_id,target_user_id,action,correlation_id) values(p_user_id,p_user_id,'subscriptions_cancelled',p_correlation_id);
  end if;
end $$;

CREATE FUNCTION public.canonical_book_work(p_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare current_id uuid:=p_id;target uuid;depth integer:=0;
begin
  loop
    select merged_into into target from book_works where id=current_id;
    if not found then return null;end if;
    if target is null then return current_id;end if;
    current_id:=target;depth:=depth+1;
    if depth>32 then raise exception 'Invalid work identity' using errcode='P1001';end if;
  end loop;
end $$;

CREATE FUNCTION public.canonical_workshop_member_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='INSERT' then new.member_count:=0;
  else select count(*)::integer into new.member_count from workshop_members where room_id=new.id;end if;
  return new;
end $$;

CREATE FUNCTION public.cast_debate_vote(p_user_id uuid, p_debate_id uuid, p_vote text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare debate book_debates;previous text;visible boolean;
begin
  if p_vote is null or p_vote not in('yes','no')then raise exception 'Invalid vote' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Forbidden' using errcode='P1003';end if;
  select * into debate from book_debates where id=p_debate_id for update;if not found then raise exception 'Unknown debate' using errcode='P1005';end if;
  visible:=reading_author_visible(p_user_id,debate.user_id);
  select vote into previous from debate_votes where debate_id=p_debate_id and user_id=p_user_id;
  if found then
    if previous<>p_vote then raise exception 'Vote is final' using errcode='P1001';end if;
    return jsonb_build_object('success',true,'vote',previous,'alreadyVoted',true,'yes_count',case when visible then debate.yes_count end,'no_count',case when visible then debate.no_count end);
  end if;
  if not visible then raise exception 'Debate unavailable' using errcode='P1003';end if;
  if not debate.is_active then raise exception 'Debate closed' using errcode='P1004';end if;
  insert into debate_votes(debate_id,user_id,vote)values(p_debate_id,p_user_id,p_vote);
  update book_debates set yes_count=yes_count+case when p_vote='yes' then 1 else 0 end,no_count=no_count+case when p_vote='no' then 1 else 0 end where id=p_debate_id returning * into debate;
  return jsonb_build_object('success',true,'vote',p_vote,'yes_count',debate.yes_count,'no_count',debate.no_count);
end $$;

CREATE FUNCTION public.catalog_book_snapshot(p_book_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with target as(select coalesce(canonical_edition_id,id) as id from books where id=p_book_id),family as(select unnest(book_edition_family(p_book_id)) as id)
  select to_jsonb(b)||jsonb_build_object(
    'currently_reading_count',(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id in(select id from family) and s.default_type='currently_reading'),
    'want_to_read_count',(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id in(select id from family) and s.default_type='want_to_read'),
    'have_read_count',(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id in(select id from family) and s.default_type='have_read')
  ) from books b,target where b.id=target.id;
$$;

CREATE FUNCTION public.catalog_isbn(p_value text, p_length integer) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare code text:=upper(regexp_replace(p_value,'[[:space:]-]','','g'));total integer:=0;digit integer;i integer;
begin
  if code is null then return null;end if;
  if p_length=13 then
    if code !~ '^(978[0-9]{10}|979[1-9][0-9]{9})$' then return null;end if;
  elsif p_length=10 then
    if code !~ '^[0-9]{9}[0-9X]$' then return null;end if;
  else return null;end if;
  for i in 1..p_length loop
    digit:=case when substr(code,i,1)='X' then 10 else substr(code,i,1)::integer end;
    total:=total+digit*case when p_length=10 then 11-i when i%2=0 then 3 else 1 end;
  end loop;
  if total%(case when p_length=10 then 11 else 10 end)<>0 then return null;end if;
  return code;
end $_$;

CREATE FUNCTION public.catalog_isbn13(p_isbn10 text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare prefix text;total integer:=0;i integer;
begin
  if catalog_isbn(p_isbn10,10) is null then return null;end if;
  prefix:='978'||substr(p_isbn10,1,9);
  for i in 1..12 loop total:=total+substr(prefix,i,1)::integer*case when i%2=0 then 3 else 1 end;end loop;
  return prefix||((10-total%10)%10)::text;
end $$;

CREATE FUNCTION public.check_maintenance_lease(p_name text,p_owner uuid,p_epoch bigint)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare item maintenance_jobs;
begin
 select * into item from maintenance_jobs where name=p_name for update;
 if not found or item.owner is distinct from p_owner or item.epoch is distinct from p_epoch or item.lease_until<=clock_timestamp()then raise exception 'Job ownership lost'using errcode='P1001';end if;
end $$;

CREATE FUNCTION public.claim_maintenance_job(p_name text,p_owner uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp SET lock_timeout TO '1s' AS $$
declare item maintenance_jobs;
begin
 if p_name is null or length(p_name)not between 1 and 256 or p_owner is null then raise exception 'Invalid job'using errcode='P1004';end if;
 insert into maintenance_jobs(name)values(p_name)on conflict do nothing;
 select * into item from maintenance_jobs where name=p_name for update;
 if item.lease_until>clock_timestamp()and item.owner is distinct from p_owner then return null;end if;
 if item.owner is distinct from p_owner then item.epoch:=item.epoch+1;end if;
 update maintenance_jobs set owner=p_owner,epoch=item.epoch,lease_until=clock_timestamp()+interval '55 seconds',updated_at=clock_timestamp()where name=p_name;
 return jsonb_build_object('name',p_name,'owner',p_owner,'epoch',item.epoch);
end $$;

CREATE FUNCTION public.release_maintenance_job(p_name text,p_owner uuid,p_epoch bigint)RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp SET lock_timeout TO '1s' AS $$
begin
 update maintenance_jobs set owner=null,lease_until=clock_timestamp(),updated_at=clock_timestamp()where name=p_name and owner=p_owner and epoch=p_epoch;
 return found;
end $$;

CREATE FUNCTION public.guard_maintenance_write()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp SET lock_timeout TO '1s' AS $$
declare fence jsonb;
begin
 fence:=coalesce(nullif(current_setting('liravo.maintenance',true),'')::jsonb,(nullif(current_setting('request.headers',true),'')::jsonb->>'x-liravo-maintenance')::jsonb);
 if fence is not null then perform check_maintenance_lease(fence->>'name',(fence->>'owner')::uuid,(fence->>'epoch')::bigint);end if;
 return null;
end $$;

CREATE FUNCTION public.run_maintenance_rpc(p_name text,p_owner uuid,p_epoch bigint,p_function text,p_args jsonb DEFAULT '{}')RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp SET lock_timeout TO '1s' AS $$
declare target record;arguments text;result jsonb;matches integer;
begin
 perform check_maintenance_lease(p_name,p_owner,p_epoch);
 perform set_config('liravo.maintenance',jsonb_build_object('name',p_name,'owner',p_owner,'epoch',p_epoch)::text,true);
 if p_function is null or p_function!~'^[a-z_][a-z0-9_]*$'or p_function in('run_maintenance_rpc','claim_maintenance_job','release_maintenance_job','check_maintenance_lease')or p_args is null or jsonb_typeof(p_args)<>'object'then raise exception 'Invalid job operation'using errcode='P1004';end if;
 select count(*)into matches from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'and p.proname=p_function and p.prokind='f'and has_function_privilege('service_role',p.oid,'EXECUTE')
 and not exists(select 1 from jsonb_object_keys(p_args)k where not(k=any(p.proargnames[1:p.pronargs])))
 and not exists(select 1 from unnest(p.proargnames)with ordinality a(name,position)where position<=p.pronargs-p.pronargdefaults and not(p_args?name));
 if matches<>1 then raise exception 'Unsupported job operation'using errcode='P1004';end if;
 select p.* into target from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'and p.proname=p_function and p.prokind='f'and has_function_privilege('service_role',p.oid,'EXECUTE')
 and not exists(select 1 from jsonb_object_keys(p_args)k where not(k=any(p.proargnames[1:p.pronargs])))
 and not exists(select 1 from unnest(p.proargnames)with ordinality a(name,position)where position<=p.pronargs-p.pronargdefaults and not(p_args?name));
 select string_agg(format('%I => %s',a.name,case
  when p_args->a.name='null'::jsonb then format('NULL::%s',format_type(a.type,null))
  when a.type in('json'::regtype,'jsonb'::regtype)then format('($1->%L)::%s',a.name,format_type(a.type,null))
  when t.typelem<>0 then format('ARRAY(select jsonb_array_elements_text($1->%L))::%s',a.name,format_type(a.type,null))
  else format('($1->>%L)::%s',a.name,format_type(a.type,null))end),','order by a.position)into arguments
 from unnest(coalesce(target.proallargtypes,target.proargtypes::oid[]),target.proargnames,coalesce(target.proargmodes,array_fill('i'::"char",array[target.pronargs])))with ordinality a(type,name,mode,position)
 join pg_type t on t.oid=a.type where a.mode in('i','b')and p_args?a.name;
 if target.proretset then execute format('select coalesce(jsonb_agg(to_jsonb(item)),''[]''::jsonb)from public.%I(%s)item',p_function,coalesce(arguments,''))into result using p_args;
 else execute format('select to_jsonb(public.%I(%s))',p_function,coalesce(arguments,''))into result using p_args;end if;
 return result;
end $$;

CREATE FUNCTION public.maintenance_batch_cursor(p_name text)RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare fence jsonb;cursor_id uuid;
begin
 fence:=nullif(current_setting('liravo.maintenance',true),'')::jsonb;
 if fence is null or fence->>'name' is distinct from p_name then raise exception 'Job claim required'using errcode='P1003';end if;
 perform check_maintenance_lease(p_name,(fence->>'owner')::uuid,(fence->>'epoch')::bigint);
 select after_id into cursor_id from maintenance_jobs where name=p_name;return cursor_id;
end $$;

CREATE FUNCTION public.compute_similar_books_batch(p_limit integer DEFAULT 25)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare cursor_id uuid;item record;source books;ids uuid[];processed integer:=0;scanned integer:=0;done boolean;started timestamp with time zone:=clock_timestamp();
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch'using errcode='P1004';end if;
 cursor_id:=maintenance_batch_cursor('similar-books');
 for item in select id from book_works where merged_into is null and(cursor_id is null or id>cursor_id)order by id limit p_limit loop
  select * into source from books where work_id=item.id and canonical_edition_id is null order by id limit 1;
  if found then
   with candidates as(
    (select b.id from books b where canonical_edition_id is null and work_id<>item.id and b.id=(select representative.id from books representative where representative.work_id=b.work_id and representative.canonical_edition_id is null order by representative.id limit 1)and author_name=source.author_name order by id limit 100)
    union(select b.id from books b where canonical_edition_id is null and work_id<>item.id and b.id=(select representative.id from books representative where representative.work_id=b.work_id and representative.canonical_edition_id is null order by representative.id limit 1)and genres&&source.genres order by id limit 100)
    union(select b.id from books b where canonical_edition_id is null and work_id<>item.id and b.id=(select representative.id from books representative where representative.work_id=b.work_id and representative.canonical_edition_id is null order by representative.id limit 1)and language=source.language order by id limit 50)
   ),ranked as(
    select b.id,b.work_id,(case when b.author_name=source.author_name then 3 else 0 end+case when b.language=source.language then 1 else 0 end+(select count(*)from(select unnest(b.genres)intersect select unnest(source.genres))g))score
    from candidates c join books b on b.id=c.id join book_works w on w.id=b.work_id where w.merged_into is null
   ),works as(select distinct on(work_id)id,work_id,score from ranked order by work_id,score desc,id)
   select coalesce(array_agg(id order by score desc,id),'{}'::uuid[])into ids from(select * from works where score>0 order by score desc,id limit 5)top;
   insert into similar_books_computed(work_id,similar_ids,computed_at)values(item.id,ids,clock_timestamp())on conflict(work_id)do update set similar_ids=excluded.similar_ids,computed_at=excluded.computed_at;
   processed:=processed+1;
  end if;
  cursor_id:=item.id;scanned:=scanned+1;
  exit when clock_timestamp()-started>interval '1500 milliseconds';
 end loop;
 done:=not exists(select 1 from book_works where merged_into is null and(cursor_id is null or id>cursor_id));
 update maintenance_jobs set after_id=case when done then null else cursor_id end,cycle_started_at=case when done then clock_timestamp()else cycle_started_at end,updated_at=clock_timestamp()where name='similar-books';
 return jsonb_build_object('processed',processed,'scanned',scanned,'complete',done);
end $$;

CREATE FUNCTION public.similar_book_snapshot(p_book uuid)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare source books;work uuid;ids uuid[];
begin
 select b.* into source from books alias join books b on b.id=coalesce(alias.canonical_edition_id,alias.id)where alias.id=p_book;
 if not found then return '[]'::jsonb;end if;work:=canonical_book_work(source.work_id);
 select similar_ids into ids from similar_books_computed where work_id=work;
 if not found then ids:=source.similar_book_ids;end if;
 if coalesce(cardinality(ids),0)=0 then select array_agg(id)into ids from(select id from books where canonical_edition_id is null and work_id<>work and genres&&source.genres order by id limit 100)fallback;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'author_name',author_name,'cover_url',cover_url)order by position,id)from(select * from(
  select distinct on(canonical_book_work(b.work_id))b.id,b.title,b.author_name,b.cover_url,requested.position
  from unnest(ids[1:100])with ordinality requested(id,position)join books alias on alias.id=requested.id join books b on b.id=coalesce(alias.canonical_edition_id,alias.id)
  where canonical_book_work(b.work_id)<>work order by canonical_book_work(b.work_id),position,b.id
 )unique_works order by position,id limit 5)page),'[]'::jsonb);
end $$;

CREATE FUNCTION public.account_hardening_batch(p_limit integer DEFAULT 500)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare cursor_id uuid;last_id uuid;scanned integer;notified integer;done boolean;
begin
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid batch'using errcode='P1004';end if;
 cursor_id:=maintenance_batch_cursor('account-hardening');
 with candidates as materialized(
  select id,case when created_at<=now()-interval '30 days'then 30 else 7 end stage from users
  where email is null and not is_banned and deleted_at is null and created_at<=now()-interval '7 days'and(cursor_id is null or id>cursor_id)order by id limit p_limit
 ),receipts as(
  insert into account_hardening_notices(user_id,stage)select id,stage from candidates on conflict do nothing returning user_id,stage
 ),notices as(
  insert into notifications(user_id,type,message,message_key,message_values)select user_id,'account_hardening','Secure your account — add an email address to prevent lockout.','accountHardening',jsonb_build_object('stage',stage)from receipts returning id
 )select(select count(*)from candidates),(select id from candidates order by id desc limit 1),(select count(*)from notices)into scanned,last_id,notified;
 cursor_id:=coalesce(last_id,cursor_id);
 done:=not exists(select 1 from users where email is null and not is_banned and deleted_at is null and created_at<=now()-interval '7 days'and(cursor_id is null or id>cursor_id));
 update maintenance_jobs set after_id=case when done then null else cursor_id end,cycle_started_at=case when done then clock_timestamp()else cycle_started_at end,updated_at=clock_timestamp()where name='account-hardening';
 return jsonb_build_object('scanned',scanned,'notified',notified,'complete',done);
end $$;

CREATE FUNCTION public.check_affiliate_health()RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare checked integer;flagged integer;logged integer;
begin
 perform maintenance_batch_cursor('affiliate-health');
 with candidates as materialized(select id,title from books where canonical_edition_id is null order by have_read_count desc,id limit 500),missing as materialized(
  select c.* from candidates c where not exists(select 1 from affiliate_link_clicks a where a.book_id=c.id and a.is_affiliate)
 ),logs as(
  insert into affiliate_health_log(book_id,book_title,issue)select id,title,'no_affiliate_clicks'from missing on conflict do nothing returning id
 )select(select count(*)from candidates),(select count(*)from missing),(select count(*)from logs)into checked,flagged,logged;
 return jsonb_build_object('checked',checked,'flagged',flagged,'logged',logged);
end $$;

CREATE FUNCTION public.prune_operational_history(p_limit integer DEFAULT 1000)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare notifications_removed integer;events_removed integer;events_compacted integer;health_removed integer;devices_removed integer;sessions_removed integer;
begin
 if p_limit is null or p_limit not between 1 and 2000 then raise exception 'Invalid retention batch'using errcode='P1004';end if;
 delete from notifications where id in(select id from notifications where created_at<now()-interval '180 days'or is_read and created_at<now()-interval '90 days'order by created_at,id limit p_limit for update skip locked);get diagnostics notifications_removed=row_count;
 delete from outbox_events where id in(select id from outbox_events where (status='processed'and processed_at<now()-interval '30 days'or status='failed'and created_at<now()-interval '90 days')and aggregate_type not in('tip','tips','payout','payouts','referrals','referral_commissions','payment','payments','subscriptions')and event_type<>'deliver_push'order by created_at,id limit p_limit for update skip locked);get diagnostics events_removed=row_count;
 update outbox_events set payload='{}',last_error=null where id in(select id from outbox_events where status='processed'and processed_at<now()-interval '30 days'and payload<>'{}'::jsonb order by processed_at,id limit p_limit for update skip locked);get diagnostics events_compacted=row_count;
 delete from outbox_events where id in(select id from outbox_events where event_type='deliver_push'and(status='processed'and processed_at<now()-interval '30 days'or status='failed'and created_at<now()-interval '90 days')order by created_at,id limit p_limit for update skip locked);
 delete from affiliate_health_log where id in(select id from affiliate_health_log where flagged_at<now()-interval '90 days'order by flagged_at,id limit p_limit for update skip locked);get diagnostics health_removed=row_count;
 delete from push_subscriptions where id in(select id from push_subscriptions where expires_at<=now()order by expires_at,id limit p_limit for update skip locked);get diagnostics devices_removed=row_count;
 delete from revoked_push_sessions where session_hash in(select session_hash from revoked_push_sessions where revoked_at<now()-interval '60 days'order by revoked_at,session_hash limit p_limit for update skip locked);get diagnostics sessions_removed=row_count;
 return jsonb_build_object('notifications',notifications_removed,'events',events_removed,'compacted',events_compacted,'affiliateHealth',health_removed,'devices',devices_removed,'sessions',sessions_removed);
end $$;

CREATE FUNCTION public.claim_avatar_cleanup(p_backend text, p_limit integer DEFAULT 5) RETURNS SETOF public.profile_avatar_uploads
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with candidates as (
    select a.id from profile_avatar_uploads a where a.backend=p_backend
      and ((a.state in ('pending','uploaded','committed','abandoned') and a.expires_at<=now()) or (a.state='deleting' and a.claimed_until<=now()))
      and not exists(select 1 from users u where u.avatar_url=a.public_url)
      order by a.expires_at limit greatest(1,least(coalesce(p_limit,5),20)) for update skip locked
  ) update profile_avatar_uploads a set state='deleting',claim_token=gen_random_uuid(),claimed_until=now()+interval '2 minutes'
    from candidates c where a.id=c.id returning a.*;
$$;

CREATE FUNCTION public.claim_checkout_reconciliations(p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 3) RETURNS SETOF public.checkout_reconciliations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update checkout_reconciliations q set status='settled',claim_token=null,claimed_at=null
    where q.status in ('pending','processing','failed') and (p_user_id is null or q.user_id=p_user_id)
    and (q.entity_type='tip' or q.provider='paystack')
    and exists(select 1 from payment_captures c where c.entity_type=q.entity_type and c.entity_id=q.entity_id);
  return query with candidates as(
    select q.entity_type,q.entity_id from checkout_reconciliations q where (p_user_id is null or q.user_id=p_user_id)
      and ((q.status='pending' and (q.next_attempt_at<=now() or p_user_id is not null and q.last_checked_at is null)) or(q.status='processing' and q.claimed_at<now()-interval '2 minutes') or(q.status='failed' and p_user_id is not null and q.next_attempt_at<=now()))
      order by q.next_attempt_at,q.entity_id for update skip locked limit greatest(1,least(p_limit,3))
  ) update checkout_reconciliations q set status='processing',claim_token=gen_random_uuid(),claimed_at=now(),attempts=q.attempts+1
    from candidates c where q.entity_type=c.entity_type and q.entity_id=c.entity_id returning q.*;
end $$;

CREATE FUNCTION public.claim_digest_delivery(p_user_id uuid, p_period_start date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare delivery digest_deliveries;
begin
  insert into digest_deliveries(user_id,period_start,status) values(p_user_id,p_period_start,'sending') on conflict do nothing;
  if found then return true; end if;
  select * into delivery from digest_deliveries where user_id=p_user_id and period_start=p_period_start for update;
  if delivery.status='sending' and delivery.updated_at<now()-interval '5 minutes' then
    update digest_deliveries set status='unknown',updated_at=now() where user_id=p_user_id and period_start=p_period_start;
  elsif delivery.status='failed' and delivery.attempts<3 then
    update digest_deliveries set status='sending',attempts=attempts+1,updated_at=now() where user_id=p_user_id and period_start=p_period_start;
    return true;
  end if;
  return false;
end $$;

CREATE FUNCTION public.claim_digest_email_batch(p_limit integer DEFAULT 4) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare batch jsonb;candidate record;claim jsonb;result jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'Invalid delivery batch' using errcode='P1004';end if;
 perform pg_advisory_xact_lock(hashtextextended('email:digest-claim',0));
 update digest_deliveries set status='unknown',updated_at=now()where(user_id,period_start)in(select user_id,period_start from digest_deliveries where status='sending' and updated_at<now()-interval '5 minutes' order by updated_at limit 100);
 select coalesce(jsonb_agg(to_jsonb(page)order by page.period_start,page.user_id),'[]'::jsonb)into batch from(select user_id,period_start from digest_deliveries where status='pending' or status='failed' and attempts<3 and updated_at<=now()-interval '5 minutes' order by period_start,user_id limit p_limit)page;
 perform 1 from users where id in(select(value->>'user_id')::uuid from jsonb_array_elements(batch))order by id for update;
 for candidate in select(value->>'user_id')::uuid user_id,(value->>'period_start')::date period_start from jsonb_array_elements(batch)loop
  claim:=claim_paid_digest(candidate.user_id,candidate.period_start);if claim is not null then result:=result||jsonb_build_array(claim);end if;
 end loop;
 return jsonb_build_object('claims',result,'examined',jsonb_array_length(batch));
end $$;

CREATE FUNCTION public.claim_factor_challenge(p_hash text, p_kind text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare challenge auth_factor_challenges;
begin
  select * into challenge from auth_factor_challenges where token_hash=p_hash and kind=p_kind for update;
  if not found or challenge.expires_at<=now() or (challenge.verified_at is null and challenge.attempts>=10) then return null; end if;
  if challenge.verified_at is null then update auth_factor_challenges set attempts=attempts+1 where token_hash=p_hash; end if;
  return to_jsonb(challenge);
end $$;

CREATE FUNCTION public.claim_outbox_events(p_batch_size integer DEFAULT 50) RETURNS SETOF public.outbox_events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update outbox_events set status='failed' where attempts>=10 and (
    status='pending' or (status='processing' and claimed_at<now()-interval '5 minutes')
  );
  return query with candidates as (
    select id from outbox_events where attempts<10 and (
      (status='pending' and next_attempt_at<=now()) or
      (status='processing' and (claimed_at is null or claimed_at<now()-interval '5 minutes'))
    ) order by created_at,id for update skip locked limit greatest(1,least(p_batch_size,200))
  ) update outbox_events e set status='processing',attempts=e.attempts+1,claimed_at=now()
    from candidates c where e.id=c.id returning e.*;
end $$;

CREATE FUNCTION public.claim_paid_digest(p_user uuid, p_period date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare profile users;delivery digest_deliveries;stats jsonb;claim uuid:=gen_random_uuid();
begin
 if p_period is null or extract(isodow from p_period)<>1 or p_period>(date_trunc('week',now()at time zone 'UTC'))::date then raise exception 'Invalid digest period' using errcode='P1004';end if;
 select * into profile from users where id=p_user for update;if not found then return null;end if;
 insert into digest_deliveries(user_id,period_start,status,attempts)values(p_user,p_period,'pending',0)on conflict do nothing;
 select * into delivery from digest_deliveries where user_id=p_user and period_start=p_period for update;
 if delivery.status='sending' and delivery.updated_at<now()-interval '5 minutes' then update digest_deliveries set status='unknown',updated_at=now()where user_id=p_user and period_start=p_period;return null;end if;
 if delivery.status not in('pending','failed')or delivery.attempts>=3 or delivery.status='failed' and delivery.updated_at>now()-interval '5 minutes' then return null;end if;
 if profile.is_banned or profile.deleted_at is not null or not profile.email_verified or profile.email is null or not profile.email_digest_enabled or not has_premium_access(p_user)then update digest_deliveries set status='skipped',updated_at=now()where user_id=p_user and period_start=p_period;return null;end if;
 select jsonb_build_object('newFollowers',(select count(*)from follows where following_id=p_user and created_at>=(p_period-7)::timestamp at time zone 'UTC' and created_at<p_period::timestamp at time zone 'UTC'),
  'newNotifications',(select count(*)from notifications where user_id=p_user and created_at>=(p_period-7)::timestamp at time zone 'UTC' and created_at<p_period::timestamp at time zone 'UTC'),
  'booksThisWeek',(select count(distinct canonical_book_work(b.work_id))from shelf_books s join books b on b.id=s.book_id where s.user_id=p_user and s.added_at>=(p_period-7)::timestamp at time zone 'UTC' and s.added_at<p_period::timestamp at time zone 'UTC'))into stats;
 if stats->>'newFollowers'='0' and stats->>'newNotifications'='0' and stats->>'booksThisWeek'='0'then update digest_deliveries set status='skipped',updated_at=now()where user_id=p_user and period_start=p_period;return null;end if;
 update digest_deliveries set status='sending',attempts=attempts+1,claim_id=claim,updated_at=now()where user_id=p_user and period_start=p_period;
 return jsonb_build_object('userId',p_user,'claimId',claim,'period',p_period,'email',profile.email,'displayName',profile.display_name,'username',profile.username,'locale',profile.preferred_locale,'stats',stats,'unsubscribeToken',issue_email_unsubscribe(p_user,'weekly_digest'));
end $$;

CREATE FUNCTION public.claim_payment_returns(p_limit integer DEFAULT 3) RETURNS TABLE(provider text, payment_id text, reason text, status text, provider_refund_id text, attempts integer, claim_token uuid, currency text, charged_minor bigint, refunded_minor bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with candidates as (
    select r.provider,r.payment_id from payment_returns r where r.status in ('pending','submitted','unknown','processing') and r.next_attempt_at<=now() and (r.claimed_at is null or r.claimed_at<now()-interval '2 minutes')
    order by r.next_attempt_at,r.payment_id for update skip locked limit greatest(1,least(p_limit,3))
  ), claimed as (
    update payment_returns r set claim_token=gen_random_uuid(),claimed_at=now(),attempts=r.attempts+1 from candidates c where r.provider=c.provider and r.payment_id=c.payment_id returning r.*
  ) select r.provider,r.payment_id,r.reason,r.status,r.provider_refund_id,r.attempts,r.claim_token,c.currency,c.charged_minor,c.refunded_minor from claimed r join payment_captures c using(provider,payment_id);
$$;

CREATE FUNCTION public.claim_payout_request(p_actor_id uuid, p_payout_id uuid, p_correlation_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare payout payout_requests; owner uuid;
begin
  select user_id into owner from payout_requests where id=p_payout_id;
  perform 1 from users where id in (owner,p_actor_id) order by id for update;
  if p_actor_id is not null and not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null) then raise exception 'Forbidden' using errcode='P1003'; end if;
  select * into payout from payout_requests where id=p_payout_id for update;
  if not found then raise exception 'Unknown payout' using errcode='P1005'; end if;
  if payout.status in ('completed','failed','cancelled') then return jsonb_build_object('status',payout.status,'claimed',false); end if;
  if payout.method='manual' then
    if p_actor_id is null then raise exception 'Admin required' using errcode='P1003'; end if;
    if payout.status='processing' then return jsonb_build_object('status',payout.status,'claimed',false); end if;
    if payout.destination is null then raise exception 'Payout destination required' using errcode='P1004'; end if;
  elsif payout.method<>'paystack' or payout.currency<>'NGN' or payout.destination is null then raise exception 'Invalid payout destination' using errcode='P1004'; end if;
  if payout.next_attempt_at>now() or payout.claimed_at>now()-interval '2 minutes' then return jsonb_build_object('status',payout.status,'claimed',false); end if;
  update payout_requests set status='processing',claimed_at=now(),attempts=attempts+1,next_attempt_at=now()+interval '2 minutes' where id=payout.id returning * into payout;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,provider,correlation_id,metadata)
    values(p_actor_id,payout.user_id,'payout_processing',payout.amount,payout.currency,payout.method,p_correlation_id,jsonb_build_object('payout_id',payout.id,'attempt',payout.attempts));
  return to_jsonb(payout)||jsonb_build_object('claimed',true);
end $$;

CREATE FUNCTION public.claim_reading_reward(p_user_id uuid, p_action text, p_book_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target uuid;proof reading_work_completions;profile users;reward jsonb;previous_reward timestamptz;
begin
  if p_action<>'finish_book' then return claim_reading_reward_063(p_user_id,p_action,p_book_id);end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select canonical_book_work(work_id) into target from books where id=p_book_id;
  select * into proof from reading_work_completions where user_id=p_user_id and canonical_book_work(work_id)=target order by completed_at,(source='history') desc,work_id limit 1;
  if proof.user_id is null or proof.source='history' or exists(select 1 from reading_work_completions where user_id=p_user_id and canonical_book_work(work_id)=target and rewarded_at is not null) then return jsonb_build_object('xp',profile.xp,'awarded',0);end if;
  select min(x.created_at) into previous_reward from xp_ledger x join books b on x.event_key='finish_book:'||b.id::text where x.user_id=p_user_id and x.reason='finish_book' and canonical_book_work(b.work_id)=target;
  if previous_reward is not null then
    update reading_work_completions set rewarded_at=previous_reward where user_id=p_user_id and work_id=proof.work_id;
    return jsonb_build_object('xp',profile.xp,'awarded',0);
  end if;
  reward:=claim_reading_reward_063(p_user_id,p_action,p_book_id);
  if (reward->>'awarded')::integer>0 then update reading_work_completions set rewarded_at=now() where user_id=p_user_id and work_id=proof.work_id;end if;
  return reward;
end $$;

CREATE FUNCTION public.claim_reading_reward_063(p_user_id uuid, p_action text, p_book_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare profile users;reward jsonb;
begin
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_action='daily_login' and p_book_id is null then
    return award_xp_once(p_user_id,3,'daily_login','daily_login:'||(now() at time zone 'UTC')::date);
  elsif p_action='finish_book' and p_book_id is not null then
    if not exists(select 1 from reading_completions where user_id=p_user_id and book_id=p_book_id and source='interactive')
      or not exists(select 1 from shelf_books sb join shelves s on s.id=sb.shelf_id and s.user_id=p_user_id where sb.user_id=p_user_id and sb.book_id=p_book_id and s.default_type='have_read' and sb.finished_at is not null) then
      return jsonb_build_object('xp',profile.xp,'awarded',0);
    end if;
    reward:=award_xp_once(p_user_id,50,'finish_book','finish_book:'||p_book_id);
    if (reward->>'awarded')::integer>0 then
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('reading_completions',p_user_id::text||':'||p_book_id::text,'check_badges',jsonb_build_object('userId',p_user_id,'trigger','finish_book'));
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('reading_completions',p_user_id::text||':'||p_book_id::text,'check_badges',jsonb_build_object('userId',p_user_id,'trigger','finish_book_genre'));
    end if;
    return reward;
  end if;
  raise exception 'Invalid reading reward' using errcode='P1004';
end $$;

CREATE FUNCTION public.claim_refund_reconciliation(p_limit integer DEFAULT 3) RETURNS SETOF public.refund_inbox
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with exhausted as (
    update refund_inbox set status='failed' where attempts>=10 and (status='pending' or (status='processing' and claimed_at<now()-interval '5 minutes'))
  ), candidates as (
    select provider,refund_id from refund_inbox where attempts<10 and ((status='pending' and next_attempt_at<=now()) or (status='processing' and claimed_at<now()-interval '5 minutes'))
    order by created_at for update skip locked limit greatest(1,least(p_limit,3))
  ) update refund_inbox r set status='processing',attempts=r.attempts+1,claimed_at=now()
    from candidates c where r.provider=c.provider and r.refund_id=c.refund_id returning r.*;
$$;

CREATE FUNCTION public.claim_release_email_batch(p_limit integer DEFAULT 4) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare candidate record;delivery release_email_deliveries;profile users;post author_posts;author users;book jsonb;claim uuid;batch jsonb;result jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'Invalid delivery batch' using errcode='P1004';end if;
 perform pg_advisory_xact_lock(hashtextextended('email:release-claim',0));
 update release_email_deliveries set status='unknown',updated_at=now()where(post_id,user_id)in(select post_id,user_id from release_email_deliveries where status='sending' and updated_at<now()-interval '5 minutes' order by updated_at limit 100);
 select coalesce(jsonb_agg(to_jsonb(page)order by page.updated_at,page.post_id,page.user_id),'[]'::jsonb)into batch from(select post_id,user_id,updated_at from release_email_deliveries where status='pending' or status='failed' and attempts<3 and updated_at<=now()-interval '5 minutes' order by updated_at,post_id,user_id limit p_limit)page;
 perform 1 from users where id in(select(value->>'user_id')::uuid from jsonb_array_elements(batch))order by id for update;
 for candidate in select(value->>'post_id')::uuid post_id,(value->>'user_id')::uuid user_id from jsonb_array_elements(batch)loop
  select * into profile from users where id=candidate.user_id for update;
  select * into delivery from release_email_deliveries where post_id=candidate.post_id and user_id=candidate.user_id for update;
  if not found or delivery.status not in('pending','failed') or delivery.attempts>=3 or delivery.status='failed' and delivery.updated_at>now()-interval '5 minutes' then continue;end if;
  select * into post from author_posts where id=candidate.post_id;
  if profile.id is null or profile.is_banned or profile.deleted_at is not null or not profile.email_verified or profile.email is null or not profile.notify_new_releases or not has_premium_access(profile.id)or post.id is null or post.type<>'announcement' or post.book_id is null or not author_owns_book(post.author_id,post.book_id)or not exists(select 1 from follows where follower_id=profile.id and following_id=post.author_id and created_at<=post.created_at)then update release_email_deliveries set status='skipped',updated_at=now()where post_id=candidate.post_id and user_id=candidate.user_id;continue;end if;
  select * into author from users where id=post.author_id;book:=catalog_book_snapshot(post.book_id);claim:=gen_random_uuid();
  update release_email_deliveries set status='sending',attempts=attempts+1,claim_id=claim,updated_at=now()where post_id=candidate.post_id and user_id=candidate.user_id;
  result:=result||jsonb_build_array(jsonb_build_object('postId',post.id,'userId',profile.id,'claimId',claim,'email',profile.email,'displayName',profile.display_name,'locale',profile.preferred_locale,'authorName',author.display_name,'bookTitle',book->>'title','bookId',book->>'id','unsubscribeToken',issue_email_unsubscribe(profile.id,'new_release_alert')));
 end loop;
 return jsonb_build_object('claims',result,'examined',jsonb_array_length(batch));
end $$;

CREATE FUNCTION public.claim_subscription_cancellations(p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 3) RETURNS TABLE(subscription_id uuid, provider text, provider_subscription_id text, attempts integer, correlation_id text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with exhausted as (
    update subscription_cancellations set status='failed' where attempts>=10 and status='processing' and claimed_at<now()-interval '2 minutes'
  ), candidates as (
    select c.subscription_id from subscription_cancellations c join subscriptions s on s.id=c.subscription_id
      where (p_user_id is null or s.user_id=p_user_id) and c.attempts<10 and (
        (c.status='pending' and c.next_attempt_at<=now()) or
        (c.status='processing' and c.claimed_at<now()-interval '2 minutes'))
      order by c.created_at,c.subscription_id for update of c skip locked limit greatest(1,least(p_limit,3))
  ), claimed as (
    update subscription_cancellations c set status='processing',attempts=c.attempts+1,claimed_at=now()
      from candidates x where c.subscription_id=x.subscription_id returning c.*
  ) select s.id,s.provider,s.provider_subscription_id,c.attempts,c.correlation_id from claimed c join subscriptions s on s.id=c.subscription_id;
$$;

CREATE FUNCTION public.cleanup_email_unsubscribe_proofs(p_limit integer DEFAULT 1000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare removed integer;
begin
 if p_limit is null or p_limit not between 1 and 10000 then raise exception 'Invalid cleanup page' using errcode='P1004';end if;
 delete from email_unsubscribe_proofs where token_hash in(select token_hash from email_unsubscribe_proofs where expires_at<=now()order by expires_at limit p_limit);get diagnostics removed=row_count;return removed;
end $$;

CREATE FUNCTION public.cleanup_factor_sessions(p_limit integer DEFAULT 500) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare removed integer; total integer;
begin
  with expired as(select token_hash from auth_factor_challenges where expires_at<=now() order by expires_at limit greatest(1,least(coalesce(p_limit,500),2000)) for update skip locked)
    delete from auth_factor_challenges c using expired e where c.token_hash=e.token_hash;
  get diagnostics total=row_count;
  with expired as(select session_hash from auth_factor_grants where expires_at<=now() order by expires_at limit greatest(1,least(coalesce(p_limit,500),2000)) for update skip locked)
    delete from auth_factor_grants g using expired e where g.session_hash=e.session_hash;
  get diagnostics removed=row_count;
  return total+removed;
end $$;

CREATE FUNCTION public.complete_google_play_delivery(p_user_id uuid, p_token_id text, p_acknowledged boolean, p_delivery_id text, p_fingerprint text, p_correlation_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare subscription subscriptions; receipt billing_webhook_receipts;
begin
  perform 1 from users where id=p_user_id for update;
  select * into subscription from subscriptions where provider='google_play' and provider_event_id=p_token_id for update;
  if not found or subscription.user_id<>p_user_id then raise exception 'Purchase owner mismatch' using errcode='P1003'; end if;
  if p_acknowledged and not subscription.provider_acknowledged then
    update subscriptions set provider_acknowledged=true where id=subscription.id;
    insert into financial_audit_log(actor_user_id,target_user_id,action,provider,provider_event_id,correlation_id)
      values(p_user_id,p_user_id,'google_play_purchase_acknowledged','google_play',p_token_id,p_correlation_id);
  end if;
  if p_delivery_id is not null then
    select * into receipt from billing_webhook_receipts where provider='google_play' and delivery_id=p_delivery_id for update;
    if not found or receipt.fingerprint is distinct from p_fingerprint then raise exception 'Billing delivery conflict' using errcode='P1001'; end if;
    update billing_webhook_receipts set status='processed' where provider='google_play' and delivery_id=p_delivery_id;
  end if;
end $$;

CREATE FUNCTION public.complete_subscription_cancellation(p_subscription_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s subscriptions; c subscription_cancellations;
begin
  select * into s from subscriptions where id=p_subscription_id;
  perform 1 from users where id=s.user_id for update;
  select * into s from subscriptions where id=p_subscription_id for update;
  select * into c from subscription_cancellations where subscription_id=p_subscription_id for update;
  if not found or c.status='completed' then return; end if;
  if c.status<>'processing' or s.provider not in ('paystack','dodopayments') then raise exception 'Invalid web cancellation'; end if;
  update subscriptions set status=case when current_period_end>now() then 'active' else 'cancelled' end,renewal_cancelled=true,cancelled_at=now(),last_provider_event_at=greatest(coalesce(last_provider_event_at,now()),now()) where id=s.id;
  perform refresh_premium_access(s.user_id);
  update subscription_cancellations set status='completed',completed_at=now(),last_error=null where subscription_id=s.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,provider,correlation_id,metadata)
    values(s.user_id,s.user_id,'subscription_cancelled',s.provider,c.correlation_id,jsonb_build_object('subscription_id',s.id));
end $$;

CREATE FUNCTION public.consume_email_challenge(p_hash text, p_purpose text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target_user uuid;profile users;challenge auth_email_challenges;
begin
  select user_id into target_user from auth_email_challenges where token_hash=p_hash and purpose=p_purpose;
  if not found then return null;end if;
  select * into profile from users where id=target_user and not is_banned and deleted_at is null for update;
  if not found then return null;end if;
  select * into challenge from auth_email_challenges where token_hash=p_hash and purpose=p_purpose for update;
  if not found or challenge.consumed_at is not null or challenge.expires_at<=now() or challenge.original_email is distinct from profile.email or challenge.expected_version<>profile.mfa_version or challenge.expected_pin_hash is distinct from profile.pin_hash then return null;end if;
  if p_purpose='verify' then
    if exists(select 1 from users where lower(email)=challenge.email and id<>target_user) then raise exception 'Email unavailable' using errcode='P1001';end if;
    perform pg_advisory_xact_lock(hashtextextended('verified-email:'||challenge.email,0));
    update users set email=challenge.email,email_verified=true where id=target_user;
  elsif p_purpose='recover' then
    if not profile.email_verified or lower(profile.email) is distinct from challenge.email then return null;end if;
    update users set mfa_version=mfa_version+1,auth_not_before=floor(extract(epoch from clock_timestamp()))::bigint where id=target_user;
    delete from auth_factor_grants where user_id=target_user;
  else return null;end if;
  update auth_email_challenges set consumed_at=now() where token_hash=p_hash;
  insert into security_events(user_id,event_type,metadata) values(target_user,case when p_purpose='verify' then 'email_verified' else 'account_recovery' end,jsonb_build_object('source','email_link'));
  return jsonb_build_object('id',target_user,'email',challenge.email);
end $$;

CREATE FUNCTION public.consume_email_unsubscribe(p_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare proof email_unsubscribe_proofs;profile users;owner uuid;
begin
 if p_hash is null or p_hash!~'^[a-f0-9]{64}$'then return false;end if;
 select user_id into owner from email_unsubscribe_proofs where token_hash=p_hash;if not found then return false;end if;
 select * into profile from users where id=owner and not is_banned and deleted_at is null and email_verified and email is not null for update;
 if not found then return false;end if;
 select * into proof from email_unsubscribe_proofs where token_hash=p_hash for update;
 if not found or proof.expires_at<=now() or proof.email_hash<>encode(sha256(convert_to(lower(profile.email),'UTF8')),'hex')then return false;end if;
 if proof.consumed_at is not null then return case proof.kind when 'weekly_digest' then not profile.email_digest_enabled else not profile.notify_new_releases end;end if;
 if proof.kind='weekly_digest' then update users set email_digest_enabled=false where id=owner;else update users set notify_new_releases=false where id=owner;end if;
 update email_unsubscribe_proofs set consumed_at=now()where token_hash=p_hash;
 return true;
end $_$;

CREATE FUNCTION public.content_creation_receipt_snapshot(p_user uuid, p_action text, p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare receipt jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_action is null or p_action not in('shelves','author_qa')or p_key is null or length(p_key)not between 8 and 200 then raise exception 'Invalid receipt' using errcode='P1004';end if;
 select response into receipt from content_intents where actor_id=p_user and action=p_action and intent_key=p_key;
 if receipt is null then raise exception 'Receipt unavailable' using errcode='P1005';end if;
 return receipt;
end $$;

CREATE FUNCTION public.count_list_followers() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='INSERT' then update reading_lists set follower_count=follower_count+1 where id=new.list_id; return new; end if;
  update reading_lists set follower_count=greatest(0,follower_count-1) where id=old.list_id; return old;
end $$;

CREATE FUNCTION public.count_reading_works(p_user_id uuid, p_genres text[] DEFAULT NULL::text[], p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_finished boolean DEFAULT true) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select count(distinct canonical_book_work(b.work_id))::integer from shelf_books sb join shelves s on s.id=sb.shelf_id join books b on b.id=sb.book_id
    where sb.user_id=p_user_id and s.user_id=p_user_id and (not p_finished or s.default_type='have_read' and sb.finished_at is not null)
    and (p_since is null or sb.finished_at>=p_since::date)
    and (p_genres is null or exists(select 1 from unnest(b.genres) tag cross join unnest(p_genres) wanted where lower(tag) like '%'||lower(wanted)||'%'));
$$;

CREATE FUNCTION public.count_verified_books(p_user_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select count(distinct canonical_book_work(b.work_id))::integer from shelf_books sb join shelves s on s.id=sb.shelf_id join books b on b.id=sb.book_id
  where s.user_id=p_user_id and sb.user_id=p_user_id and s.default_type='have_read' and sb.finished_at is not null;
$$;

CREATE FUNCTION public.count_workshop_members() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='INSERT' then update workshop_rooms set member_count=member_count+1 where id=new.room_id; return new; end if;
  update workshop_rooms set member_count=greatest(0,member_count-1) where id=old.room_id; return old;
end $$;

CREATE FUNCTION public.count_writer_answers() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='INSERT' then
    update ask_writer_questions set answer_count=answer_count+1 where id=new.question_id;
    return new;
  else
    update ask_writer_questions set answer_count=greatest(0,answer_count-1) where id=old.question_id;
    return old;
  end if;
end $$;

CREATE FUNCTION public.count_writing_participants() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='INSERT' then
    update writing_challenges set participant_count=participant_count+1 where id=new.challenge_id;
    return new;
  end if;
  update writing_challenges set participant_count=greatest(0,participant_count-1) where id=old.challenge_id;
  return old;
end $$;

CREATE FUNCTION public.create_direct_account(p_id uuid, p_email text, p_username text, p_display_name text, p_password_hash text DEFAULT NULL::text, p_google_id text DEFAULT NULL::text, p_telegram_id text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare referral text; profile users;
begin
  if p_id is null or length(coalesce(p_username,''))<1 or length(coalesce(p_display_name,''))<1 then raise exception 'Invalid account' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended('direct-account:'||coalesce(p_email,p_telegram_id,p_id::text),0));
  if exists(select 1 from pg_constraint where conrelid='public.users'::regclass and contype='f' and confrelid=to_regclass('auth.users')) then
    execute 'insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)' using p_id,p_email,jsonb_build_object('username',p_username,'full_name',p_display_name);
  else
    loop
      referral:=lpad(floor(random()*1000000000000)::text,12,'0');
      exit when not exists(select 1 from users where referral_code=referral);
    end loop;
    insert into users(id,username,display_name,referral_code) values(p_id,p_username,p_display_name,referral);
  end if;
  update users set email=p_email,password_hash=p_password_hash,google_id=p_google_id,telegram_id=p_telegram_id,avatar_url=p_avatar_url where id=p_id returning * into profile;
  return to_jsonb(profile);
end $_$;

CREATE FUNCTION public.create_localized_direct_account(p_id uuid, p_email text, p_username text, p_display_name text, p_locale text, p_password_hash text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform create_direct_account(p_id,p_email,p_username,p_display_name,p_password_hash);
  perform initialize_account_locale(p_id,p_locale);
  return (select to_jsonb(u) from users u where id=p_id);
end $$;

CREATE FUNCTION public.create_payout_request_040(p_user_id uuid, p_amount numeric, p_method text, p_idempotency_key text, p_correlation_id text, p_currency text DEFAULT 'USD'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare existing payout_requests; destination user_payout_methods; result uuid; balance jsonb;
begin
  if p_amount is null or p_amount<5 or p_amount>10000 or p_amount<>round(p_amount,2) or p_method is null or p_method not in ('manual','paystack')
    or p_currency is null or p_currency not in ('USD','NGN','EUR') or (p_method='paystack' and p_currency<>'NGN') or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'Invalid payout';
  end if;
  perform 1 from users where id=p_user_id and not is_banned for update;
  if not found then raise exception 'Unknown user'; end if;
  select * into existing from payout_requests where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if existing.amount<>p_amount or existing.method<>p_method or existing.currency<>p_currency then raise exception 'Conflicting payout intent'; end if;
    return existing.id;
  end if;
  select * into destination from user_payout_methods where user_id=p_user_id and provider=p_method and currency=p_currency for share;
  if not found then raise exception 'Payout destination required'; end if;
  balance:=creator_balance(p_user_id,p_currency);
  if (balance->>'available')::numeric<p_amount then raise exception 'Insufficient balance'; end if;
  result:=gen_random_uuid();
  insert into payout_requests(id,user_id,amount,method,currency,idempotency_key,destination,transfer_reference)
    values(result,p_user_id,p_amount,p_method,p_currency,p_idempotency_key,
      jsonb_build_object('display_name',destination.display_name,'account_number',destination.account_number,'bank_code',destination.bank_code,'currency',destination.currency),
      'liravo_payout_'||replace(result::text,'-',''));
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,idempotency_key,correlation_id,metadata)
    values(p_user_id,p_user_id,'payout_requested',p_amount,p_currency,p_idempotency_key,p_correlation_id,jsonb_build_object('payout_id',result,'method',p_method));
  return result;
end $$;

CREATE FUNCTION public.create_payout_request_atomic(p_user_id uuid, p_amount numeric, p_method text, p_idempotency_key text, p_correlation_id text, p_currency text DEFAULT 'USD'::text, p_pin_hash text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare expected text;
begin
  select pin_hash into expected from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if expected is distinct from p_pin_hash then raise exception 'PIN confirmation required' using errcode='P1003';end if;
  return create_payout_request_040(p_user_id,p_amount,p_method,p_idempotency_key,p_correlation_id,p_currency);
end $$;

CREATE FUNCTION public.create_subscription_intent(p_user_id uuid, p_provider text, p_currency text, p_amount numeric, p_key text, p_correlation_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s subscriptions;
begin
  if p_provider not in ('paystack','dodopayments') or p_currency not in ('USD','NGN') or p_amount<=0 or length(p_key) not between 8 and 200 then raise exception 'Invalid subscription'; end if;
  perform 1 from users where id=p_user_id for update;
  select * into s from subscriptions where user_id=p_user_id and idempotency_key=p_key;
  if found then
    if s.provider<>p_provider or s.currency<>p_currency or s.amount<>p_amount then raise exception 'Conflicting subscription intent'; end if;
  else
    insert into subscriptions(user_id,provider,currency,amount,status,idempotency_key)
      values(p_user_id,p_provider,p_currency,p_amount,'pending',p_key) returning * into s;
    update subscriptions set provider_event_id='sub_'||s.id::text where id=s.id;
    insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,provider,idempotency_key,correlation_id,metadata)
      values(p_user_id,p_user_id,'subscription_create_pending',p_amount,p_currency,p_provider,p_key,p_correlation_id,jsonb_build_object('subscription_id',s.id));
  end if;
  return jsonb_build_object('id',s.id,'checkout_url',s.checkout_url);
end $$;

CREATE FUNCTION public.create_tip_transaction(p_user_id uuid, p_recipient_id uuid, p_amount numeric, p_platform_fee numeric, p_recipient_amount numeric, p_currency text, p_idempotency_key text, p_correlation_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare t tips;
begin
  if p_amount < 0.5 or p_amount > 5000 or p_amount<>round(p_amount,2) or p_currency not in ('USD','NGN','EUR') or p_user_id=p_recipient_id or length(p_idempotency_key) not between 8 and 200 then raise exception 'Invalid tip'; end if;
  perform 1 from users where id=p_user_id for update;
  select * into t from tips where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if t.amount<>p_amount or t.recipient_id<>p_recipient_id or t.currency<>p_currency then raise exception 'Conflicting tip intent'; end if;
    return jsonb_build_object('id',t.id);
  end if;
  if p_platform_fee<>round(p_amount*0.1,2) or p_recipient_amount<>p_amount-p_platform_fee then raise exception 'Invalid tip fees'; end if;
  insert into tips(user_id,recipient_id,amount,platform_fee,recipient_amount,currency,status,idempotency_key)
    values(p_user_id,p_recipient_id,p_amount,p_platform_fee,p_recipient_amount,p_currency,'pending',p_idempotency_key) returning * into t;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,idempotency_key,correlation_id,metadata)
    values(p_user_id,p_recipient_id,'tip_created',p_amount,p_currency,p_idempotency_key,p_correlation_id,jsonb_build_object('tip_id',t.id));
  return jsonb_build_object('id',t.id);
end $$;

CREATE FUNCTION public.creator_balance(p_user_id uuid, p_currency text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with earned as (
    select coalesce(sum(coalesce(recipient_amount,creator_amount)-refunded_recipient_amount),0) as tips from tips where coalesce(recipient_id,creator_id)=p_user_id and status in ('completed','refunded') and currency=p_currency
  ), commission as (
    select coalesce(sum(commission_amount),0) as referrals from referral_commissions where referrer_id=p_user_id and reversed_at is null and currency=p_currency
  ), events as (
    select coalesce(sum(amount),0) as revenue from event_revenue where organizer_id=p_user_id and currency=p_currency and verified
  ), withdrawn as (
    select coalesce(sum(amount) filter(where status in ('pending','processing')),0) as reserved,coalesce(sum(amount) filter(where status='completed'),0) as paid from payout_requests where user_id=p_user_id and currency=p_currency
  ) select jsonb_build_object('currency',p_currency,'tips',tips::text,'referrals',referrals::text,'events',revenue::text,'earned',(tips+referrals+revenue)::text,'reserved',reserved::text,'paid',paid::text,'available',(tips+referrals+revenue-reserved-paid)::text) from earned,commission,events,withdrawn;
$$;

CREATE FUNCTION public.debate_catalog_snapshot(p_user uuid DEFAULT NULL::uuid, p_scope text DEFAULT 'active'::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_scope not in('active','mine') then raise exception 'Invalid catalog' using errcode='P1004';end if;
  if(p_user is null and p_scope='mine')or(p_user is not null and not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null))then raise exception 'Account unavailable' using errcode='P1003';end if;
  return(with page as materialized(select d.id,d.created_at from book_debates d where reading_author_visible(p_user,d.user_id)
    and(case when p_scope='mine' then d.user_id=p_user or exists(select 1 from debate_votes where debate_id=d.id and user_id=p_user)else d.is_active end)
    and(p_at is null or(d.created_at,d.id)<(p_at,p_id))order by d.created_at desc,d.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('debates',coalesce((select jsonb_agg(debate_document(p_user,id)order by created_at desc,id desc)from page),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.debate_detail_snapshot(p_user uuid, p_debate uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare document jsonb;
begin
  if p_user is not null and not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
  document:=debate_document(p_user,p_debate);if document is null then raise exception 'Debate unavailable' using errcode='P1005';end if;
  return jsonb_build_object('debate',document);
end $$;

CREATE FUNCTION public.debate_document(p_user uuid, p_debate uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',d.id,'book_id',d.book_id,'user_id',d.user_id,'question',d.question,'yes_count',d.yes_count,'no_count',d.no_count,'is_active',d.is_active,'created_at',d.created_at,
    'can_share',reading_author_visible(null,d.user_id),'current_vote',(select vote from debate_votes where debate_id=d.id and user_id=p_user),'can_vote',p_user is not null and d.is_active and not exists(select 1 from debate_votes where debate_id=d.id and user_id=p_user),'book',reading_edition_document(d.book_id))
  from book_debates d where d.id=p_debate and reading_author_visible(p_user,d.user_id);
$$;

CREATE FUNCTION public.default_custom_shelf_slug() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not new.is_default then
    perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
    if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
    if not has_premium_access(new.user_id) and (select count(*) from shelves where user_id=new.user_id and not is_default)>=10 then raise exception 'Free shelf limit reached' using errcode='P1004'; end if;
  end if;
  if new.slug is null then new.slug:='shelf-'||new.id; end if;
  return new;
end $$;

CREATE FUNCTION public.defer_payout_request(p_payout_id uuid, p_attempt integer, p_error text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update payout_requests set claimed_at=null,last_error=left(p_error,200),next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(p_attempt,7)))::integer)
    where id=p_payout_id and status='processing' and attempts=p_attempt;
end $$;

CREATE FUNCTION public.disable_factor_atomic(p_user_id uuid, p_version integer, p_step bigint, p_recovery_hash text, p_session_hash text, p_key text, p_fingerprint text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare profile users; previous content_intents;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid factor intent' using errcode='P1004'; end if;
  select * into profile from users where id=p_user_id for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into previous from content_intents where actor_id=p_user_id and action='auth:disable_factor' and intent_key=p_key;
  if found then
    if previous.fingerprint<>p_fingerprint then raise exception 'Conflicting factor intent' using errcode='P1001'; end if;
    return true;
  end if;
  if profile.mfa_version is distinct from p_version or not profile.totp_enabled then raise exception 'Factor state changed' using errcode='P1001'; end if;
  if p_recovery_hash is not null then
    if not coalesce(p_recovery_hash=any(profile.recovery_codes),false) then raise exception 'Recovery code already used' using errcode='P1003'; end if;
  elsif p_step is null or p_step<=coalesce(profile.mfa_last_step,-1) then raise exception 'Code already used or invalid' using errcode='P1003'; end if;
  update users set totp_enabled=false,totp_secret=null,recovery_codes=null,mfa_version=mfa_version+1,mfa_last_step=null where id=p_user_id;
  insert into auth_factor_grants(session_hash,user_id,mfa_version) values(p_session_hash,p_user_id,p_version+1)
    on conflict(session_hash) do update set mfa_version=excluded.mfa_version,expires_at=excluded.expires_at;
  insert into security_events(user_id,event_type) values(p_user_id,'2fa_disabled');
  insert into content_intents values(p_user_id,'auth:disable_factor',p_key,p_fingerprint,'{"ok":true}'::jsonb);
  return true;
end $_$;

CREATE FUNCTION public.discover_mood_books(p_mood text, p_limit integer DEFAULT 30, p_after_count integer DEFAULT NULL::integer, p_after_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
  if p_mood is null or p_mood not in ('Dark','Cozy','Mind-bending','Funny','Emotional','Slow-burn','Fast-paced','Educational','Inspiring','Disturbing','Romantic','Intense')
    or p_limit is null or p_limit not between 1 and 50 or (p_after_count is null)<>(p_after_id is null) or p_after_count<1 then raise exception 'Invalid mood page' using errcode='P1004';end if;
  with counts as(
    select coalesce(b.canonical_edition_id,b.id) as id,count(distinct r.user_id)::integer as score
    from reviews r join books b on b.id=r.book_id join users u on u.id=r.user_id
    where r.mood_tags @> array[p_mood] and r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null
    group by coalesce(b.canonical_edition_id,b.id)
  ),page as(
    select b.*,c.score from counts c join books b on b.id=c.id
    where p_after_count is null or (c.score,b.id)<(p_after_count,p_after_id)
    order by c.score desc,b.id desc limit p_limit+1
  ),visible as(select * from page order by score desc,id desc limit p_limit)
  select jsonb_build_object('books',coalesce((select jsonb_agg(to_jsonb(v)-'score'||jsonb_build_object('mood_count',v.score) order by v.score desc,v.id desc) from visible v),'[]'::jsonb),
    'nextCursor',case when (select count(*) from page)>p_limit then (select jsonb_build_object('count',v.score,'id',v.id) from visible v order by v.score,v.id limit 1) else null end) into result;
  return result;
end $$;

CREATE FUNCTION public.discovery_friends_snapshot(p_user uuid, p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Invalid discovery query' using errcode='P1004';end if;
 with visible as not materialized(select * from discovery_shelf_rows(p_user)),candidates as materialized(
  select v.* from visible v join follows f on f.following_id=v.reader_id and f.follower_id=p_user where not exists(select 1 from visible mine where mine.reader_id=p_user and mine.work_id=v.work_id)
 ),ranked as(select work_id,count(distinct reader_id)readers,max(added_at)latest from candidates group by work_id order by readers desc,latest desc,work_id limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('book_id',b.id,'work_id',r.work_id,'count',r.readers,'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'language',b.language,'format',b.format))order by r.readers desc,r.latest desc,r.work_id),'[]'::jsonb)into result
 from ranked r join lateral(select edition_id from candidates where work_id=r.work_id group by edition_id order by count(distinct reader_id)desc,max(added_at)desc,edition_id limit 1)chosen on true join books b on b.id=chosen.edition_id;
 return result;
end $$;

CREATE FUNCTION public.discovery_gems_snapshot(p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Invalid discovery query' using errcode='P1004';end if;
 with reviews as materialized(
  select canonical_book_work(b.work_id)work_id,avg(r.rating)rating,count(*)ratings from reviews r join books b on b.id=r.book_id join users u on u.id=r.user_id where r.moderation_status='published'and not r.is_hidden and not u.is_banned and u.deleted_at is null group by canonical_book_work(b.work_id)
 ),readers as(select work_id,count(distinct reader_id)readers from discovery_shelf_rows()where default_type='have_read'group by work_id),editions as(
  select b.*,canonical_book_work(b.work_id)root_work,coalesce(r.rating,case when b.ratings_count>0 and b.average_rating between 1 and 5 then b.average_rating end)score,coalesce(r.ratings,0)community_ratings,coalesce(readers.readers,0)public_readers
  from books b left join reviews r on r.work_id=canonical_book_work(b.work_id)left join readers on readers.work_id=canonical_book_work(b.work_id)where b.canonical_edition_id is null
 ),works as(select distinct on(root_work)* from editions where score>=4 and public_readers<50 order by root_work,score desc,community_ratings desc,ratings_count desc,id),page as(select * from works order by score desc,community_ratings desc,root_work limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'work_id',root_work,'title',title,'author_name',author_name,'cover_url',cover_url,'average_rating',round(score,2),'have_read_count',public_readers,'rating_source',case when community_ratings>0 then 'community'else 'catalog'end)order by score desc,community_ratings desc,root_work),'[]'::jsonb)into result from page;
 return result;
end $$;

CREATE FUNCTION public.discovery_shelf_rows(p_viewer uuid DEFAULT NULL::uuid) RETURNS TABLE(reader_id uuid, shelf_id uuid, default_type text, edition_id uuid, work_id uuid, added_at timestamp with time zone, finished_at date, country text)
    LANGUAGE sql STABLE
    AS $$
 select u.id,s.id,s.default_type,b.id,b.work_id,sb.added_at,sb.finished_at,u.country
 from public.shelf_books sb join public.shelves s on s.id=sb.shelf_id and s.user_id=sb.user_id join public.users u on u.id=sb.user_id join public.books source on source.id=sb.book_id join public.books b on b.id=coalesce(source.canonical_edition_id,source.id)
 where not u.is_banned and u.deleted_at is null and(u.id=p_viewer or(s.is_public and u.shelf_visibility<>'private'
  and(u.profile_visibility='public'or exists(select 1 from public.follows where follower_id=p_viewer and following_id=u.id))
  and(u.shelf_visibility='public'or exists(select 1 from public.follows where follower_id=p_viewer and following_id=u.id))));
$$;

CREATE FUNCTION public.discovery_trending_snapshot(p_country text DEFAULT NULL::text, p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 10 or(p_country is not null and p_country!~'^[A-Z]{2}$')then raise exception 'Invalid discovery query' using errcode='P1004';end if;
 with activity as materialized(select * from discovery_shelf_rows()where added_at>=now()-interval '7 days'and added_at<=now()and(p_country is null or country=p_country)),ranked as(
  select work_id,count(distinct reader_id)readers,max(added_at)latest from activity group by work_id order by readers desc,latest desc,work_id limit p_limit
 )select coalesce(jsonb_agg(jsonb_build_object('book_id',b.id,'work_id',r.work_id,'count',r.readers,'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'language',b.language,'format',b.format))order by r.readers desc,r.latest desc,r.work_id),'[]'::jsonb)into result
 from ranked r join lateral(select edition_id from activity where work_id=r.work_id group by edition_id order by count(distinct reader_id)desc,max(added_at)desc,edition_id limit 1)chosen on true join books b on b.id=chosen.edition_id;
 return result;
end $_$;

CREATE FUNCTION public.enforce_workshop_capacity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare room workshop_rooms;
begin
  perform 1 from users where id=new.user_id for update;
  select * into room from workshop_rooms where id=new.room_id for update;
  if not found or not room.is_active then raise exception 'Workshop unavailable' using errcode='P1005'; end if;
  if exists(select 1 from workshop_members where room_id=new.room_id and user_id=new.user_id) then return new; end if;
  if (select count(*) from workshop_members where room_id=new.room_id)>=room.max_members then raise exception 'Workshop full' using errcode='P1004'; end if;
  return new;
end $$;

CREATE FUNCTION public.enqueue_checkout_reconciliation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare kind text:=case when tg_table_name='tips' then 'tip' else 'subscription' end; gateway text;
begin
  if new.user_id is null then return new; end if;
  gateway:=case when kind='tip' then case when new.currency='NGN' then 'paystack' else 'dodopayments' end else to_jsonb(new)->>'provider' end;
  if gateway not in ('paystack','dodopayments') then return new; end if;
  insert into checkout_reconciliations(entity_type,entity_id,user_id,provider,reference)
    values(kind,new.id,new.user_id,gateway,case when kind='tip' then 'tip_' else 'sub_' end||new.id) on conflict do nothing;
  return new;
end $$;

CREATE FUNCTION public.enqueue_release_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if new.type='announcement' and new.book_id is not null then insert into release_email_campaigns(post_id,created_at)values(new.id,new.created_at)on conflict do nothing;end if;
 return new;
end $$;

CREATE FUNCTION public.expire_subscription_entitlements(p_limit integer DEFAULT 200) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target uuid; total integer:=0;
begin
  for target in select u.id from users u where exists(select 1 from subscriptions s where s.user_id=u.id and s.status='active' and s.current_period_end<=now())
    order by u.id for update skip locked limit greatest(1,least(p_limit,1000)) loop
    update subscriptions set status='expired' where user_id=target and status='active' and current_period_end<=now();
    perform refresh_premium_access(target);
    total:=total+1;
  end loop;
  return total;
end $$;

CREATE FUNCTION public.factor_session_authorized() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce((select (u.auth_not_before=0 or coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'iat')::bigint,0)>=u.auth_not_before) and (not u.totp_enabled or exists(
    select 1 from auth_factor_grants g where g.user_id=u.id and g.mfa_version=u.mfa_version and g.expires_at>now()
      and g.session_hash=encode(sha256(convert_to('supabase:'||u.id::text||':'||(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id'),'UTF8')),'hex')
  )) from users u where u.id=auth.uid() and not u.is_banned and u.deleted_at is null),false);
$$;

CREATE FUNCTION public.financial_integrity_snapshot() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select financial_integrity_snapshot_089()||jsonb_build_object('uncertainReleaseEmails',(select count(*)from release_email_deliveries where status='unknown' or status='sending' and updated_at<now()-interval '5 minutes'),'failedReleaseEmails',(select count(*)from release_email_deliveries where status='failed' and attempts>=3),'failedDigestEmails',(select count(*)from digest_deliveries where status='failed' and attempts>=3),'pendingDigestEmails',(select count(*)from digest_deliveries where status='pending' or status='failed' and attempts<3),'pendingReleaseEmails',(select count(*)from release_email_deliveries where status='pending' or status='failed' and attempts<3));
$$;

CREATE FUNCTION public.financial_integrity_snapshot_046() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object(
    'tipsWithoutPayout', (select count(*) from tips t where status='completed' and not exists(select 1 from payouts p where p.tip_id=t.id)),
    'tipsWithoutOutbox', (select count(*) from tips t where status='completed' and not exists(select 1 from outbox_events e where e.aggregate_type='tip' and e.aggregate_id=t.id::text and e.event_type='notify_recipient')),
    'payoutsWithoutAudit', (select count(*) from payout_requests p where not exists(select 1 from financial_audit_log a where a.action='payout_requested' and a.actor_user_id=p.user_id and a.idempotency_key=p.idempotency_key)),
    'failedOutbox', (select count(*) from outbox_events where status='failed') + (select count(*) from subscription_cancellations where status='failed'),
    'stalledOutbox', (select count(*) from outbox_events where (status='processing' and (claimed_at is null or claimed_at<now()-interval '5 minutes')) or (status='pending' and created_at<now()-interval '25 hours')) + (select count(*) from subscription_cancellations where (status='processing' and claimed_at<now()-interval '2 minutes') or (status='pending' and created_at<now()-interval '25 hours')),
    'unacknowledgedPurchases', (select count(*) from subscriptions where provider='google_play' and status='active' and not provider_acknowledged and last_verified_at<now()-interval '5 minutes'),
    'stalledBillingDeliveries', (select count(*) from billing_webhook_receipts where status='pending_ack' and created_at<now()-interval '5 minutes'),
    'duplicatePayments', (select count(*) from payment_captures where not credited and refunded_minor<charged_minor),
    'pendingRefunds', (select count(*) from refund_inbox where status='failed' or (status<>'processed' and created_at<now()-interval '5 minutes')),
    'unverifiedBillingPeriods', (select count(*) from subscriptions where status='active' and current_period_end is null),
    'overdrawnCreators', (select count(*) from (select distinct recipient_id as id from payment_captures where refunded_minor>0 and recipient_id is not null union select referrer_id from referral_commissions where reversed_at is not null or commission_amount<original_commission_amount) users cross join (values('USD'),('NGN'),('EUR')) currencies(currency) where (creator_balance(users.id,currencies.currency)->>'available')::numeric<0),
    'unconfirmedPayouts', (select count(*) from payout_requests where (status='processing' and (attempts>=10 or created_at<now()-interval '25 hours')) or (status='pending' and created_at<now()-interval '7 days')),
    'uncertainDigests', (select count(*) from digest_deliveries where status='unknown' or (status='sending' and updated_at<now()-interval '5 minutes'))
  );
$$;

CREATE FUNCTION public.financial_integrity_snapshot_047() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select financial_integrity_snapshot_046()||jsonb_build_object('unreconciledCheckouts',(select count(*) from checkout_reconciliations where status='failed' or status='processing' and claimed_at<now()-interval '5 minutes'));
$$;

CREATE FUNCTION public.financial_integrity_snapshot_089() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select financial_integrity_snapshot_047()||jsonb_build_object('unresolvedPaymentReturns',(select count(*) from payment_returns where status in ('unknown','failed') or status<>'completed' and created_at<now()-interval '25 hours'),'legacyEventTickets',(select count(*) from event_tickets where status='legacy_hold')+(select count(*) from event_revenue where not verified));
$$;

CREATE FUNCTION public.find_direct_account(p_email text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare matches integer;profile users;
begin
  select count(*) into matches from users where email is not null and lower(email)=lower(btrim(p_email));
  if matches>1 then raise exception 'Ambiguous email identity' using errcode='P1001';end if;
  if matches=0 then return null;end if;
  select * into profile from users where email is not null and lower(email)=lower(btrim(p_email));
  return to_jsonb(profile);
end $$;

CREATE FUNCTION public.finish_avatar_cleanup(p_id uuid, p_claim uuid, p_success boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_success then
    delete from profile_avatar_uploads where id=p_id and state='deleting' and claim_token=p_claim and claimed_until>now();
    return found or not exists(select 1 from profile_avatar_uploads where id=p_id);
  end if;
  update profile_avatar_uploads set state='abandoned',claimed_until=null,claim_token=null,expires_at=now()+interval '15 minutes'
    where id=p_id and state='deleting' and claim_token=p_claim and claimed_until>now();
  return found;
end $$;

CREATE FUNCTION public.finish_avatar_upload(p_user_id uuid, p_upload_id uuid, p_public_url text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare upload profile_avatar_uploads;
begin
  if p_public_url is null or length(p_public_url)>2048 or p_public_url !~ '^https?://' then raise exception 'Invalid avatar URL' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into upload from profile_avatar_uploads where id=p_upload_id and user_id=p_user_id for update;
  if not found or upload.state not in ('pending','uploaded','committed') or (upload.state<>'committed' and upload.expires_at<=now()) then raise exception 'Upload expired or unavailable' using errcode='P1001';end if;
  if upload.public_url is not null and upload.public_url<>p_public_url then raise exception 'Avatar URL changed' using errcode='P1001';end if;
  if upload.state='pending' then update profile_avatar_uploads set state='uploaded',public_url=p_public_url where id=p_upload_id;end if;
  return true;
end $$;

CREATE FUNCTION public.finish_checkout_reconciliation(p_kind text, p_entity_id uuid, p_claim uuid, p_ok boolean, p_settled boolean, p_page integer, p_delay integer, p_error text, p_correlation_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare job checkout_reconciliations;
begin
  select * into job from checkout_reconciliations where entity_type=p_kind and entity_id=p_entity_id and status='processing' and claim_token=p_claim for update;
  if not found then return false; end if;
  update checkout_reconciliations set status=case when p_settled then 'settled' when not p_ok and (attempts>=10 or p_error in ('BINDING_MISMATCH','AMOUNT_MISMATCH')) then 'failed' else 'pending' end,
    attempts=case when p_ok then 0 else attempts end,claim_token=null,claimed_at=null,last_checked_at=now(),scan_page=greatest(0,coalesce(p_page,0)),
    next_attempt_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_delay,300),21600))),last_error=case when p_ok then null else left(p_error,64) end,correlation_id=p_correlation_id
    where entity_type=p_kind and entity_id=p_entity_id returning * into job;
  if job.status='failed' then
    insert into financial_audit_log(target_user_id,action,provider,correlation_id,metadata) values(job.user_id,'checkout_reconciliation_failed',job.provider,p_correlation_id,jsonb_build_object('kind',p_kind,'entity_id',p_entity_id,'error',job.last_error));
  end if;
  return true;
end $$;

CREATE FUNCTION public.finish_factor_challenge(p_hash text, p_kind text, p_version integer, p_step bigint, p_recovery_hash text, p_grant_hash text, p_secret text DEFAULT NULL::text, p_recovery_hashes text[] DEFAULT NULL::text[], p_pin_hash text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target_user uuid;profile users;
begin
  if p_kind='setup' then
    select user_id into target_user from auth_factor_challenges where token_hash=p_hash and kind=p_kind;
    select * into profile from users where id=target_user and not is_banned and deleted_at is null for update;
    if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
    if profile.pin_hash is distinct from p_pin_hash then raise exception 'PIN confirmation changed' using errcode='P1001';end if;
  end if;
  return finish_factor_challenge_044(p_hash,p_kind,p_version,p_step,p_recovery_hash,p_grant_hash,p_secret,p_recovery_hashes);
end $$;

CREATE FUNCTION public.finish_factor_challenge_044(p_hash text, p_kind text, p_version integer, p_step bigint, p_recovery_hash text, p_grant_hash text, p_secret text DEFAULT NULL::text, p_recovery_hashes text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare challenge auth_factor_challenges; profile users; target_user uuid; granted_version integer;
begin
  select user_id into target_user from auth_factor_challenges where token_hash=p_hash and kind=p_kind;
  if not found then raise exception 'Challenge unavailable' using errcode='P1003'; end if;
  select * into profile from users where id=target_user and deleted_at is null and not is_banned for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into challenge from auth_factor_challenges where token_hash=p_hash and kind=p_kind for update;
  if challenge.expires_at<=now() or challenge.expected_version is distinct from p_version or p_grant_hash is null or p_grant_hash !~ '^[a-f0-9]{64}$' then raise exception 'Challenge unavailable' using errcode='P1003'; end if;
  if challenge.provider_session_hash is not null and challenge.provider_session_hash<>p_grant_hash then raise exception 'Session binding mismatch' using errcode='P1003'; end if;
  granted_version:=p_version+case when p_kind='setup' then 1 else 0 end;
  if challenge.verified_at is not null then
    if profile.mfa_version is distinct from granted_version or challenge.grant_hash<>p_grant_hash then raise exception 'Factor state changed' using errcode='P1001'; end if;
    return jsonb_build_object('user_id',profile.id,'mfa_version',granted_version);
  end if;
  if challenge.attempts not between 1 and 10 or profile.mfa_version is distinct from p_version then raise exception 'Factor state changed' using errcode='P1001'; end if;
  if p_kind='login' then
    if not profile.totp_enabled then raise exception 'Factor state changed' using errcode='P1001'; end if;
    if p_recovery_hash is not null then
      if not coalesce(p_recovery_hash=any(profile.recovery_codes),false) then raise exception 'Recovery code already used' using errcode='P1003'; end if;
      update users set recovery_codes=array_remove(recovery_codes,p_recovery_hash) where id=profile.id;
    elsif p_step is not null and p_step>coalesce(profile.mfa_last_step,-1) then update users set mfa_last_step=p_step where id=profile.id;
    else raise exception 'Code already used or invalid' using errcode='P1003'; end if;
    if p_secret is not null then
      if p_secret not like 'v1:%' then raise exception 'Invalid encrypted factor' using errcode='P1004'; end if;
      update users set totp_secret=p_secret where id=profile.id;
    end if;
  elsif p_kind='setup' then
    if profile.totp_enabled or p_secret is null or p_secret not like 'v1:%' or coalesce(cardinality(p_recovery_hashes),0)<>8 or p_step is null then raise exception 'Invalid enrollment' using errcode='P1004'; end if;
    update users set totp_enabled=true,totp_secret=p_secret,recovery_codes=p_recovery_hashes,mfa_version=granted_version,mfa_last_step=p_step where id=profile.id;
  else raise exception 'Invalid challenge kind' using errcode='P1004'; end if;
  insert into auth_factor_grants(session_hash,user_id,mfa_version) values(p_grant_hash,profile.id,granted_version)
    on conflict(session_hash) do update set user_id=excluded.user_id,mfa_version=excluded.mfa_version,expires_at=excluded.expires_at;
  update auth_factor_challenges set verified_at=now(),grant_hash=p_grant_hash where token_hash=p_hash;
  insert into security_events(user_id,event_type,metadata) values(profile.id,case when p_kind='setup' then '2fa_enabled' else '2fa_login' end,jsonb_build_object('method',case when p_recovery_hash is null then 'totp' else 'recovery' end));
  return jsonb_build_object('user_id',profile.id,'mfa_version',granted_version);
end $_$;

CREATE FUNCTION public.finish_paid_email(p_kind text, p_user uuid, p_claim uuid, p_status text, p_message text DEFAULT NULL::text, p_period date DEFAULT NULL::date, p_post uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if p_status is null or p_status not in('sent','failed','unknown') or p_status='sent' and(nullif(trim(p_message),'')is null)then raise exception 'Invalid delivery receipt' using errcode='P1004';end if;
 if p_kind='weekly_digest' then update digest_deliveries set status=p_status,message_id=p_message,updated_at=now()where user_id=p_user and period_start=p_period and claim_id=p_claim and status='sending';
 elsif p_kind='new_release_alert' then update release_email_deliveries set status=p_status,message_id=p_message,updated_at=now()where user_id=p_user and post_id=p_post and claim_id=p_claim and status='sending';else raise exception 'Invalid email kind' using errcode='P1004';end if;
 if found then return true;end if;
 if p_kind='weekly_digest' then return exists(select 1 from digest_deliveries where user_id=p_user and period_start=p_period and claim_id=p_claim and status=p_status and message_id is not distinct from p_message);end if;
 return exists(select 1 from release_email_deliveries where user_id=p_user and post_id=p_post and claim_id=p_claim and status=p_status and message_id is not distinct from p_message);
end $$;

CREATE FUNCTION public.follow_intent_snapshot(p_actor uuid, p_target uuid, p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare receipt social_intents;
begin
 if not exists(select 1 from users where id=p_actor and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_target is null or p_key is null or length(p_key)not between 8 and 200 then raise exception 'Invalid receipt' using errcode='P1004';end if;
 if(select count(*)from social_intents where actor_id=p_actor and action in('follow','unfollow')and intent_key=p_key)>1 then raise exception 'Ambiguous legacy receipt' using errcode='P1001';end if;
 select * into receipt from social_intents where actor_id=p_actor and target_id=p_target and action in('follow','unfollow')and intent_key=p_key;
 if not found or not exists(select 1 from users where id=p_target and(receipt.action='unfollow'or(not is_banned and deleted_at is null)))then raise exception 'Receipt unavailable' using errcode='P1005';end if;
 return jsonb_build_object('actorId',p_actor,'targetId',p_target,'requestKey',p_key,'action',receipt.action,'committedFollowing',receipt.result,'following',exists(select 1 from follows where follower_id=p_actor and following_id=p_target));
end $$;

CREATE FUNCTION public.followed_author_books(p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 return(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'author_name',author_name,'cover_url',cover_url)order by created_at desc,id desc),'[]'::jsonb)from(
  select b.* from books b where b.canonical_edition_id is null and b.work_id in(select canonical_book_work(c.work_id)from follows f join author_work_claims c on c.author_id=f.following_id join users u on u.id=c.author_id where f.follower_id=p_user and u.is_verified_author and not u.is_banned and u.deleted_at is null)order by b.created_at desc,b.id desc limit 10
 )books);
end $$;

CREATE FUNCTION public.fork_reading_list(p_user_id uuid, p_source_id uuid, p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare source reading_lists; target reading_lists; previous content_intents; fingerprint text;
begin
  if p_key is null or length(p_key) not between 8 and 200 then raise exception 'Invalid intent' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id for update;
  fingerprint:=encode(sha256(convert_to(p_source_id::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_user_id and action='reading_list_fork' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting fork intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  select * into source from reading_lists where id=p_source_id and is_public and reading_list_visible(p_user_id,id)for share;
  if not found then raise exception 'Source list unavailable' using errcode='P1005'; end if;
  insert into reading_lists(user_id,name,description,is_public,forked_from) values(p_user_id,source.name,source.description,false,source.id) returning * into target;
  insert into reading_list_books(list_id,book_id,position) select target.id,book_id,position from reading_list_books where list_id=source.id;
  insert into content_intents values(p_user_id,'reading_list_fork',p_key,fingerprint,to_jsonb(target)-'idempotency_key'-'request_hash');
  return to_jsonb(target)-'idempotency_key'-'request_hash';
end $$;

CREATE FUNCTION public.guard_additional_content_intent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare actor uuid; target uuid; room uuid; snapshot jsonb; after_insert boolean:=tg_when='AFTER'; reading_room reading_rooms;
begin
  actor:=(to_jsonb(new)->>tg_argv[0])::uuid;
  target:=case tg_table_name when 'book_passes' then (to_jsonb(new)->>'recipient_id')::uuid when 'author_qa' then (to_jsonb(new)->>'author_id')::uuid else null end;
  if not after_insert then
    perform 1 from users where id in (actor,target) order by id for update;
    if tg_table_name='book_passes' and not exists(select 1 from follows where follower_id=actor and following_id=target) then raise exception 'Follow the recipient first' using errcode='P1003'; end if;
    if tg_table_name='buddy_read_notes' then
      if not exists(select 1 from buddy_read_members where buddy_read_id=new.buddy_read_id and user_id=actor) then raise exception 'Not a participant' using errcode='P1003'; end if;
    end if;
    if tg_table_name in ('reading_room_posts','reading_room_milestones') then
      select * into reading_room from reading_rooms where id=(to_jsonb(new)->>'room_id')::uuid for share;
      if not found or not reading_room.is_active then raise exception 'Room unavailable' using errcode='P1005'; end if;
      if tg_table_name='reading_room_milestones' then
        if reading_room.created_by<>actor then raise exception 'Creator access required' using errcode='P1003'; end if;
      elsif reading_room.created_by<>actor and not exists(select 1 from room_participants where room_id=reading_room.id and user_id=actor) then
        raise exception 'Room membership required' using errcode='P1003';
      end if;
      if tg_table_name='reading_room_posts' then
        if new.milestone_id is not null and not exists(select 1 from reading_room_milestones where id=new.milestone_id and room_id=reading_room.id and unlock_date<=now()) then
          raise exception 'Milestone unavailable' using errcode='P1003';
        end if;
      end if;
    end if;
    if tg_table_name='workshop_submissions' then room:=new.room_id;
    elsif tg_table_name='workshop_feedback' then select room_id into room from workshop_submissions where id=new.submission_id; end if;
    if tg_table_name in ('workshop_submissions','workshop_feedback') and not exists(select 1 from workshop_members where room_id=room and user_id=actor) then raise exception 'Not a workshop member' using errcode='P1003'; end if;
    if tg_table_name in ('workshop_submissions','workshop_feedback') and not exists(select 1 from workshop_rooms where id=room and is_active) then raise exception 'Workshop closed' using errcode='P1004'; end if;
    if tg_table_name='workshop_submissions' then new.word_count:=case when trim(new.excerpt)='' then 0 else cardinality(regexp_split_to_array(trim(new.excerpt),E'\\s+')) end; end if;
    if new.idempotency_key is null then return new; end if;
    if length(new.idempotency_key) not between 8 and 200 or new.request_hash is null or new.request_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid content intent' using errcode='P1004'; end if;
    if exists(select 1 from content_intents where actor_id=actor and action=tg_table_name and intent_key=new.idempotency_key) then raise exception 'Content intent already committed' using errcode='23505'; end if;
  else
    case tg_table_name
      when 'reading_rooms' then insert into room_participants(room_id,user_id) values(new.id,actor) on conflict do nothing;
      when 'workshop_rooms' then insert into workshop_members(room_id,user_id) values(new.id,actor) on conflict do nothing;
      when 'workshop_submissions' then insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values(tg_table_name,new.id::text,'check_badges',jsonb_build_object('userId',actor,'trigger','workshop_submit'));
      when 'book_passes' then insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(new.recipient_id,'book_pass',actor,'book',new.book_id,coalesce(new.message,'A reader passed you a book.'));
      when 'author_qa' then insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(new.author_id,'author_qa_question',actor,'author_qa',new.id,new.question);
      when 'author_posts' then
        if new.type='announcement' then insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('author_post',new.id::text,'author_announcement',jsonb_build_object('userId',actor,'postId',new.id)); end if;
      when 'author_verification_requests' then insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('verification_request',new.id::text,'notify_admins',jsonb_build_object('userId',actor,'requestId',new.id));
      else null;
    end case;
    if new.idempotency_key is not null then
      snapshot:=to_jsonb(new)-'idempotency_key'-'request_hash';
      if tg_table_name='workshop_rooms' then select to_jsonb(r)-'idempotency_key'-'request_hash' into snapshot from workshop_rooms r where id=new.id; end if;
      insert into content_intents values(actor,tg_table_name,new.idempotency_key,new.request_hash,snapshot);
    end if;
  end if;
  return new;
end $_$;

CREATE FUNCTION public.guard_arc_application_decision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if old.status<>'pending' and(new.status is distinct from old.status or new.reader_id is distinct from old.reader_id or new.arc_id is distinct from old.arc_id) then raise exception 'Decision is final' using errcode='P1001';end if;
  if new.status='approved' and old.status<>'approved' then
    if not exists(select 1 from users where id=new.reader_id and not is_banned and deleted_at is null) then raise exception 'Reader unavailable' using errcode='P1005';end if;
    if not exists(select 1 from arcs a where a.id=new.arc_id and a.is_active and(a.close_date is null or a.close_date>now()) and author_owns_book(a.author_id,a.book_id)) then raise exception 'ARC unavailable' using errcode='P1003';end if;
  end if;
  return new;
end $$;

CREATE FUNCTION public.guard_arc_work_application() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not exists(select 1 from users where id=new.reader_id and not is_banned and deleted_at is null) then raise exception 'Reader unavailable' using errcode='P1005';end if;
  if not exists(select 1 from arcs a where a.id=new.arc_id and a.author_id<>new.reader_id and a.is_active and(a.close_date is null or a.close_date>now()) and author_owns_book(a.author_id,a.book_id)) then raise exception 'Verified ARC ownership required' using errcode='P1003';end if;
  return new;
end $$;

CREATE FUNCTION public.guard_author_answer_text() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if new.answer is not null and(not author_answer_has_text(new.answer)or length(new.answer)>2000)then raise exception 'Invalid answer' using errcode='P1004';end if;
 return new;
end $$;

CREATE FUNCTION public.guard_author_book_link() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_table_name='arcs' then if not new.is_active then return new;end if;end if;
  if new.book_id is not null and not author_owns_book(new.author_id,new.book_id) then raise exception 'Verified work ownership required' using errcode='P1003';end if;
  return new;
end $$;

CREATE FUNCTION public.guard_book_edition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare code10 text;code13 text;
begin
  if tg_op='UPDATE' and new.work_id is not distinct from old.work_id and new.canonical_edition_id is not distinct from old.canonical_edition_id
    and new.isbn_10 is not distinct from old.isbn_10 and new.isbn_13 is not distinct from old.isbn_13
    and new.google_books_id is not distinct from old.google_books_id and new.open_library_id is not distinct from old.open_library_id then return new;end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  code10:=catalog_isbn(new.isbn_10,10);code13:=catalog_isbn(new.isbn_13,13);
  if new.isbn_10 is not null and code10 is null or new.isbn_13 is not null and code13 is null
    or code10 is not null and code13 is not null and catalog_isbn13(code10)<>code13 then raise exception 'Invalid edition ISBN' using errcode='P1004';end if;
  new.isbn_10:=code10;new.isbn_13:=coalesce(code13,catalog_isbn13(code10));
  if new.open_library_id is not null and new.open_library_id !~ '^/books/OL[1-9][0-9]*M$' then raise exception 'An edition ID is required' using errcode='P1004';end if;
  if new.work_id is null then
    insert into book_works(id,title,author_name) values(new.id,new.title,new.author_name);new.work_id:=new.id;
  else new.work_id:=canonical_book_work(new.work_id);end if;
  if new.canonical_edition_id is not null and not exists(select 1 from books b where b.id=new.canonical_edition_id and b.canonical_edition_id is null and canonical_book_work(b.work_id)=new.work_id) then raise exception 'Invalid canonical edition' using errcode='P1004';end if;
  return new;
end $_$;

CREATE FUNCTION public.guard_book_pass_accounts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if not exists(select 1 from users where id=new.sender_id and not is_banned and deleted_at is null)or not exists(select 1 from users where id=new.recipient_id and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 return new;
end $$;

CREATE FUNCTION public.guard_buddy_membership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare room buddy_reads;
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1005';end if;
  select * into room from buddy_reads where id=new.buddy_read_id for update;
  if not found then raise exception 'Unknown buddy read' using errcode='P1005';end if;
  if exists(select 1 from buddy_read_members where buddy_read_id=room.id and user_id=new.user_id) then return new;end if;
  if not room.is_active or(room.is_private and room.created_by<>new.user_id) or not exists(select 1 from users where id=room.created_by and not is_banned and deleted_at is null) then raise exception 'Buddy read unavailable' using errcode='P1005';end if;
  if(select count(*) from buddy_read_members where buddy_read_id=room.id)>=room.max_participants then raise exception 'Buddy read full' using errcode='P1004';end if;
  return new;
end $$;

CREATE FUNCTION public.guard_buddy_note_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='UPDATE' and new.buddy_read_id=old.buddy_read_id and new.user_id=old.user_id and new.content=old.content and new.reply_to_id is null then return new; end if;
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  perform 1 from buddy_reads where id=new.buddy_read_id and is_active for share;
  if not found then raise exception 'Buddy read unavailable' using errcode='P1005'; end if;
  perform 1 from buddy_read_members where buddy_read_id=new.buddy_read_id and user_id=new.user_id for share;
  if not found then raise exception 'Not a participant' using errcode='P1003'; end if;
  if length(trim(coalesce(new.content,''))) not between 1 and 2000 then raise exception 'Invalid note' using errcode='P1004'; end if;
  if new.reply_to_id is not null then
    perform 1 from buddy_read_notes where id=new.reply_to_id and buddy_read_id=new.buddy_read_id for share;
    if not found then raise exception 'Reply unavailable' using errcode='P1003'; end if;
  end if;
  return new;
end $$;

CREATE FUNCTION public.guard_canonical_profile_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.role() in ('anon','authenticated') and (
    new.username is distinct from old.username or new.display_name is distinct from old.display_name or new.bio is distinct from old.bio or new.country is distinct from old.country
    or new.avatar_url is distinct from old.avatar_url or new.external_links is distinct from old.external_links or new.user_types is distinct from old.user_types
    or new.genres is distinct from old.genres or new.onboarding_complete is distinct from old.onboarding_complete
  ) then raise exception 'Use the profile API' using errcode='P1003';end if;
  return new;
end $$;

CREATE FUNCTION public.guard_content_intent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare actor uuid; amount integer; reason text; event_key text;
begin
  if new.idempotency_key is null then return new; end if;
  if length(new.idempotency_key) not between 8 and 200 or new.request_hash !~ '^[a-f0-9]{64}$' or new.request_hash is null then raise exception 'Invalid content intent'; end if;
  actor:=(to_jsonb(new)->>tg_argv[0])::uuid;
  if tg_when='BEFORE' then
    perform 1 from users where id=actor and not is_banned and deleted_at is null for update;
    if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
    if exists(select 1 from content_intents where actor_id=actor and action=tg_table_name and intent_key=new.idempotency_key) then
      raise exception 'Content intent already committed' using errcode='23505';
    end if;
  else
    insert into content_intents values(actor,tg_table_name,new.idempotency_key,new.request_hash,to_jsonb(new)-'idempotency_key'-'request_hash');
    case tg_table_name
      when 'reviews' then amount:=20; reason:='write_review'; event_key:='review:'||(to_jsonb(new)->>'book_id');
      when 'quotes' then amount:=10; reason:='post_quote'; event_key:='quote:'||new.id;
      when 'buddy_reads' then insert into buddy_read_members(buddy_read_id,user_id) values(new.id,actor); amount:=25; reason:='start_buddy_read'; event_key:='buddy-read:'||new.id;
      when 'ask_writer_questions' then amount:=5; reason:='ask_question'; event_key:='question:'||new.id;
      when 'ask_writer_answers' then amount:=10; reason:='answer_question'; event_key:='answer:'||new.id;
      when 'reading_sessions' then amount:=5; reason:='reading_session'; event_key:='reading-session:'||new.id;
    end case;
    if tg_table_name='reading_sessions' then
      perform award_xp_once(actor,5,'reading_session',event_key);
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values(tg_table_name,new.id::text,'check_badges',jsonb_build_object('userId',actor,'trigger','streak'));
    else
    insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
      values(tg_table_name,new.id::text,'award_xp',jsonb_build_object('userId',actor,'amount',amount,'reason',reason,'eventKey',event_key,'readingStreak',false));
    end if;
  end if;
  return new;
end $_$;

CREATE FUNCTION public.guard_factor_profile_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if (auth.role() in ('authenticated','anon') or current_user in ('authenticated','anon')) and (new.mfa_version is distinct from old.mfa_version or new.mfa_last_step is distinct from old.mfa_last_step or new.deleted_at is distinct from old.deleted_at or new.google_id is distinct from old.google_id or new.telegram_id is distinct from old.telegram_id or new.auth_not_before is distinct from old.auth_not_before) then
    raise exception 'Factor fields require service authorization';
  end if;
  return new;
end $$;

CREATE FUNCTION public.guard_premium_override() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.role() in ('anon','authenticated') and new.premium_override is distinct from old.premium_override then
    raise exception 'Premium grants require service authorization' using errcode='42501';
  end if;
  return new;
end $$;

CREATE FUNCTION public.guard_privileged_profile_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.role() in ('authenticated','anon') and (
    new.is_admin is distinct from old.is_admin or
    new.is_moderator is distinct from old.is_moderator or
    new.is_premium is distinct from old.is_premium or
    new.is_verified_author is distinct from old.is_verified_author or
    new.is_suspended is distinct from old.is_suspended or
    new.is_banned is distinct from old.is_banned or
    new.xp is distinct from old.xp or
    new.reading_streak is distinct from old.reading_streak or
    new.last_streak_date is distinct from old.last_streak_date or
    new.streak_freeze_tokens is distinct from old.streak_freeze_tokens or
    new.max_reading_streak is distinct from old.max_reading_streak or
    new.writing_streak is distinct from old.writing_streak or
    new.last_writing_date is distinct from old.last_writing_date or
    new.writing_freeze_tokens is distinct from old.writing_freeze_tokens or

    new.email is distinct from old.email or
    new.email_verified is distinct from old.email_verified or
    new.pin_hash is distinct from old.pin_hash or
    new.password_hash is distinct from old.password_hash or
    new.totp_secret is distinct from old.totp_secret or
    new.totp_enabled is distinct from old.totp_enabled or
    new.recovery_codes is distinct from old.recovery_codes
  ) then raise exception 'Privileged profile fields require service authorization'; end if;
  return new;
end $$;

CREATE FUNCTION public.guard_reading_debate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if length(trim(new.question))not between 5 and 200 then raise exception 'Question required' using errcode='P1004';end if;
  return new;
end $$;

CREATE FUNCTION public.guard_reading_list() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if length(trim(new.name)) not between 1 and 100 or length(coalesce(new.description,''))>500 then raise exception 'Invalid list' using errcode='P1004';end if;
  return new;
end $$;

CREATE FUNCTION public.guard_reading_room_content() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare actor uuid;
begin
  actor:=case when tg_table_name='reading_room_posts' then (to_jsonb(new)->>'user_id')::uuid else coalesce((to_jsonb(new)->>'created_by')::uuid,(select created_by from reading_rooms where id=new.room_id)) end;
  perform 1 from users where id=actor and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if length(trim(case when tg_table_name='reading_room_posts' then to_jsonb(new)->>'content' else to_jsonb(new)->>'title' end)) not between 1 and(case when tg_table_name='reading_room_posts' then 2000 else 200 end) then raise exception 'Invalid content' using errcode='P1004';end if;
  return new;
end $$;

CREATE FUNCTION public.guard_reading_room_membership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare room reading_rooms;
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into room from reading_rooms where id=new.room_id for update;
  if not found then raise exception 'Room unavailable' using errcode='P1005';end if;
  if exists(select 1 from room_participants where room_id=new.room_id and user_id=new.user_id) then return new;end if;
  if not room.is_active or not exists(select 1 from users where id=room.created_by and not is_banned and deleted_at is null) then raise exception 'Organizer unavailable' using errcode='P1003';end if;
  return new;
end $$;

CREATE FUNCTION public.guard_referral_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.role() in ('authenticated','anon') and (new.referral_code is distinct from old.referral_code or new.referred_by is distinct from old.referred_by) then
    raise exception 'Referral identity requires service authorization';
  end if;
  return new;
end $$;

CREATE FUNCTION public.guard_ticket_snapshot() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if row(new.id,new.event_id,new.user_id,new.organizer_id,new.amount_paid,new.platform_fee,new.host_amount,new.currency,new.provider,new.created_at,new.idempotency_key) is distinct from row(old.id,old.event_id,old.user_id,old.organizer_id,old.amount_paid,old.platform_fee,old.host_amount,old.currency,old.provider,old.created_at,old.idempotency_key) then raise exception 'Ticket purchase snapshot is immutable' using errcode='P1003'; end if;
  return new;
end $$;

CREATE FUNCTION public.guard_writer_answer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not exists(select 1 from users where id=new.user_id and not is_banned and deleted_at is null and(is_verified_author or xp>1000)) then raise exception 'Verified author or more than 1000 XP required' using errcode='P1003';end if;
  if not exists(select 1 from ask_writer_questions q join users u on u.id=q.user_id where q.id=new.question_id and not u.is_banned and u.deleted_at is null) then raise exception 'Question unavailable' using errcode='P1005';end if;
  if length(btrim(new.answer)) not between 20 and 5000 then raise exception 'Invalid answer' using errcode='P1004';end if;
  new.answer:=btrim(new.answer);return new;
end $$;

CREATE FUNCTION public.guard_writer_best_answer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.best_answer_id is not null and not exists(select 1 from ask_writer_answers a join users u on u.id=a.user_id join users asker on asker.id=new.user_id where a.id=new.best_answer_id and a.question_id=new.id and not u.is_banned and u.deleted_at is null and not asker.is_banned and asker.deleted_at is null) then raise exception 'Answer unavailable' using errcode='P1005';end if;
  return new;
end $$;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_referral_code text;
begin
  -- Generate unique 12-digit referral code
  loop
    v_referral_code := lpad(floor(random() * 1000000000000)::text, 12, '0');
    exit when not exists (select 1 from users where referral_code = v_referral_code);
  end loop;

  insert into users (id, username, display_name, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Reader'),
    v_referral_code
  );
  return new;
end;
$$;

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE FUNCTION public.has_premium_access(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce((select premium_override from users where id=p_user_id),false) or exists(
    select 1 from subscriptions where user_id=p_user_id and status='active' and current_period_end>now()
  );
$$;

CREATE FUNCTION public.import_goodreads_library(p_user_id uuid, p_key text, p_rows jsonb, p_skipped integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;old_source text:=coalesce(current_setting('liravo.catalog_source',true),'');
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  perform set_config('liravo.catalog_source','goodreads',true);
  result:=import_goodreads_library_065(p_user_id,p_key,p_rows,p_skipped);
  perform set_config('liravo.catalog_source',old_source,true);
  insert into legacy_goodreads_import_intents select actor_id,intent_key,fingerprint from content_intents where actor_id=p_user_id and action='goodreads_import' and intent_key=p_key on conflict do nothing;
  return result;
end $$;

CREATE FUNCTION public.import_goodreads_library_052(p_user_id uuid, p_key text, p_rows jsonb, p_skipped integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous content_intents; fingerprint text; item jsonb; book jsonb; shelf uuid; book_ids uuid[]:='{}'; entries jsonb:='[]'; imported integer:=0; skipped integer:=p_skipped; result jsonb; lock_key text;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>2000 or p_skipped is null or p_skipped<0 or jsonb_array_length(p_rows)+p_skipped>2000 then raise exception 'Invalid import' using errcode='P1004'; end if;
  for lock_key in select distinct identity.value from jsonb_array_elements(p_rows) row_data cross join lateral jsonb_each_text(row_data->'book') identity
    where identity.key in ('isbn_13','isbn_10','google_books_id','open_library_id','goodreads_id') and identity.value<>'' order by identity.value loop
    perform pg_advisory_xact_lock(hashtextextended('catalog-book:'||lock_key,0));
  end loop;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('rows',p_rows,'skipped',p_skipped)::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_user_id and action='goodreads_import' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting import intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  perform 1 from books b where b.isbn_13 in(select row_data->'book'->>'isbn_13' from jsonb_array_elements(p_rows) row_data)
    or b.isbn_10 in(select row_data->'book'->>'isbn_10' from jsonb_array_elements(p_rows) row_data)
    or b.google_books_id in(select row_data->'book'->>'google_books_id' from jsonb_array_elements(p_rows) row_data)
    or b.open_library_id in(select row_data->'book'->>'open_library_id' from jsonb_array_elements(p_rows) row_data)
    or b.id in(select identity.book_id from goodreads_book_identities identity join jsonb_array_elements(p_rows) row_data on identity.goodreads_id=row_data->'book'->>'goodreads_id') order by b.id for update;
  for item in select * from jsonb_array_elements(p_rows) loop
    if item->>'shelf' is null or item->>'shelf' not in ('want_to_read','currently_reading','have_read') then raise exception 'Invalid shelf' using errcode='P1004'; end if;
    select id into shelf from shelves where user_id=p_user_id and default_type=item->>'shelf' order by created_at,id limit 1;
    if not found then raise exception 'Default shelf unavailable' using errcode='P1005'; end if;
    book:=store_catalog_book(item->'book');
    if (book->>'id')::uuid=any(book_ids) or exists(select 1 from shelf_books where user_id=p_user_id and book_id=(book->>'id')::uuid) then skipped:=skipped+1;continue;end if;
    book_ids:=array_append(book_ids,(book->>'id')::uuid);
    entries:=entries||jsonb_build_array(jsonb_build_object('shelf_id',shelf,'book_id',book->>'id','finished_at',case when item->>'shelf'='have_read' then item->>'finished_at' else null end));
    imported:=imported+1;
  end loop;
  insert into shelf_books(user_id,shelf_id,book_id,finished_at)
    select p_user_id,entry.shelf_id,entry.book_id,entry.finished_at from jsonb_to_recordset(entries) entry(shelf_id uuid,book_id uuid,finished_at date);
  update books book set
    currently_reading_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=book.id and s.default_type='currently_reading'),
    have_read_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=book.id and s.default_type='have_read'),
    want_to_read_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=book.id and s.default_type='want_to_read') where book.id=any(book_ids);
  update users set books_read_count=count_verified_books(p_user_id) where id=p_user_id;
  result:=jsonb_build_object('imported',imported,'skipped',skipped);
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_user_id,'goodreads_import',p_key,fingerprint,result);
  return result;
end $$;

CREATE FUNCTION public.import_goodreads_library_065(p_user_id uuid, p_key text, p_rows jsonb, p_skipped integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  if exists(select 1 from jsonb_array_elements(p_rows) item where item->'book'->>'open_library_work_id' is not null) then raise exception 'Goodreads imports cannot assert provider work identities' using errcode='P1004';end if;
  return import_goodreads_library_052(p_user_id,p_key,p_rows,p_skipped);
end $$;

CREATE FUNCTION public.import_goodreads_library_v2(p_user_id uuid, p_key text, p_rows jsonb, p_skipped integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous content_intents;legacy_rows jsonb;legacy_hash text;result jsonb;old_source text:=coalesce(current_setting('liravo.catalog_source',true),'');
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>2000 or p_skipped is null or p_skipped<0 or jsonb_array_length(p_rows)+p_skipped>2000 then raise exception 'Invalid import' using errcode='P1004';end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select c.* into previous from content_intents c join legacy_goodreads_import_intents l on l.actor_id=c.actor_id and l.intent_key=c.intent_key and l.fingerprint=c.fingerprint
    where c.actor_id=p_user_id and c.action='goodreads_import' and c.intent_key=p_key;
  if found then
    select coalesce(jsonb_agg(item||jsonb_build_object('book',((item->'book')-array['format','edition_name','open_library_work_id','work_title'])||jsonb_build_object('publisher',null,'page_count',null,'published_year',null,'language','en')) order by ordinality),'[]'::jsonb) into legacy_rows from jsonb_array_elements(p_rows) with ordinality source(item,ordinality);
    legacy_hash:=encode(sha256(convert_to(jsonb_build_object('rows',legacy_rows,'skipped',p_skipped)::text,'UTF8')),'hex');
    if previous.fingerprint=legacy_hash then return previous.response;end if;
  end if;
  perform set_config('liravo.catalog_source','goodreads',true);
  result:=import_goodreads_library_065(p_user_id,p_key,p_rows,p_skipped);
  perform set_config('liravo.catalog_source',old_source,true);
  return result;
end $$;

CREATE FUNCTION public.increment_challenge_vote(p_submission_id uuid, p_delta integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  update writing_challenge_submissions
  set community_votes = greatest(0, community_votes + p_delta)
  where id = p_submission_id;
end;
$$;

CREATE FUNCTION public.increment_review_helpfulness(p_review_id uuid, p_helpful_delta integer, p_unhelpful_delta integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update reviews
  set helpful_votes = greatest(0, helpful_votes + p_helpful_delta),
      unhelpful_votes = greatest(0, unhelpful_votes + p_unhelpful_delta)
  where id = p_review_id;
end;
$$;

CREATE FUNCTION public.increment_streak_atomic(p_user_id uuid, p_kind text, p_today date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare u users; last_day date; streak integer; tokens integer; missed integer;
begin
  if p_kind not in ('reading','writing') or p_today is null then raise exception 'Invalid streak'; end if;
  select * into u from users where id=p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  if p_kind='reading' then last_day:=u.last_streak_date; streak:=u.reading_streak; tokens:=u.streak_freeze_tokens;
  else last_day:=u.last_writing_date; streak:=u.writing_streak; tokens:=u.writing_freeze_tokens; end if;
  if last_day=p_today then return; end if;
  if last_day>p_today then raise exception 'Streak date is in the future'; end if;
  missed:=greatest(0,p_today-last_day-1);
  if last_day is null or missed>tokens then streak:=1;
  else streak:=streak+1; tokens:=tokens-missed; end if;
  if streak in (7,30) then
    tokens:=tokens+1;
    if p_kind='reading' then
      perform award_xp_once(p_user_id,case when streak=7 then 50 else 200 end,'reading_streak_'||streak,'streak:reading:'||p_today);
    end if;
  end if;
  if p_kind='reading' then
    update users set reading_streak=streak,last_streak_date=p_today,streak_freeze_tokens=tokens,max_reading_streak=greatest(max_reading_streak,streak) where id=p_user_id;
  else
    update users set writing_streak=streak,last_writing_date=p_today,writing_freeze_tokens=tokens where id=p_user_id;
  end if;
end $$;

CREATE FUNCTION public.initialize_account_locale(p_user_id uuid, p_locale text, p_replace boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare locale text;initialized boolean;
begin
  if p_locale is null or p_locale not in ('en','fr','de') or p_replace is null then raise exception 'Invalid locale' using errcode='P1004';end if;
  select preferred_locale,locale_initialized into locale,initialized from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_replace or not initialized then
    update users set preferred_locale=p_locale,locale_initialized=true where id=p_user_id returning preferred_locale into locale;
  end if;
  return locale;
end $$;

CREATE FUNCTION public.initialize_reading_shelves() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into shelves(user_id,name,slug,is_default,default_type) values
    (new.id,'Currently Reading','currently-reading',true,'currently_reading'),
    (new.id,'Have Read','have-read',true,'have_read'),
    (new.id,'Want to Read','want-to-read',true,'want_to_read');
  return new;
end $$;

CREATE FUNCTION public.issue_account_recovery(p_email text, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare profile users;
begin
  if (select count(*) from users where lower(email)=p_email)<>1 then return null;end if;
  select * into profile from users where lower(email)=p_email and email_verified and not is_banned and deleted_at is null;
  if not found or not issue_email_challenge(profile.id,p_email,'recover',p_hash) then return null;end if;
  return jsonb_build_object('id',profile.id,'display_name',profile.display_name,'username',profile.username);
end $$;

CREATE FUNCTION public.issue_email_challenge(p_user_id uuid, p_email text, p_purpose text, p_hash text, p_pin_hash text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare profile users;
begin
  if p_purpose is null or p_purpose not in ('verify','recover') or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_email is null or length(p_email)>254 or p_email<>lower(btrim(p_email)) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email challenge' using errcode='P1004';end if;
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then return false;end if;
  if p_purpose='recover' then
    if not profile.email_verified or lower(profile.email) is distinct from p_email then return false;end if;
  else
    if profile.pin_hash is distinct from p_pin_hash then raise exception 'PIN confirmation changed' using errcode='P1001';end if;
    if exists(select 1 from users where lower(email)=p_email and id<>p_user_id) then raise exception 'Email unavailable' using errcode='P1001';end if;
  end if;
  insert into auth_email_challenges(token_hash,user_id,purpose,email,original_email,expected_version,expected_pin_hash,expires_at)
    values(p_hash,p_user_id,p_purpose,p_email,profile.email,profile.mfa_version,profile.pin_hash,now()+case when p_purpose='verify' then interval '24 hours' else interval '1 hour' end)
    on conflict(user_id,purpose) do update set token_hash=excluded.token_hash,email=excluded.email,original_email=excluded.original_email,expected_version=excluded.expected_version,expected_pin_hash=excluded.expected_pin_hash,expires_at=excluded.expires_at,consumed_at=null,created_at=now();
  return true;
end $_$;

CREATE FUNCTION public.issue_email_unsubscribe(p_user uuid, p_kind text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare profile users;token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 select * into profile from users where id=p_user and not is_banned and deleted_at is null and email_verified and email is not null;
 if not found or p_kind is null or p_kind not in('weekly_digest','new_release_alert')then raise exception 'Email unavailable' using errcode='P1003';end if;
 insert into email_unsubscribe_proofs(token_hash,user_id,kind,email_hash)values(encode(sha256(convert_to(token,'UTF8')),'hex'),p_user,p_kind,encode(sha256(convert_to(lower(profile.email),'UTF8')),'hex'));
 return token;
end $$;

CREATE FUNCTION public.join_content_group(p_user_id uuid, p_kind text, p_target uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare workshop workshop_rooms; room reading_rooms; event events;
begin
  perform 1 from users where id=p_user_id and not is_banned for update;
  if not found then raise exception 'Unknown user' using errcode='P1003'; end if;
  if p_kind='workshop' then
    select * into workshop from workshop_rooms where id=p_target for update;
    if not found then raise exception 'Unknown workshop' using errcode='P1005'; end if;
    if exists(select 1 from workshop_members where room_id=p_target and user_id=p_user_id) then return jsonb_build_object('joined',true,'alreadyJoined',true,'member_count',workshop.member_count); end if;
    if not workshop.is_active then raise exception 'Workshop unavailable' using errcode='P1004'; end if;
    insert into workshop_members(room_id,user_id) values(p_target,p_user_id);
    return jsonb_build_object('joined',true,'member_count',workshop.member_count+1);
  elsif p_kind='reading_room' then
    select * into room from reading_rooms where id=p_target for update;
    if not found then raise exception 'Unknown room' using errcode='P1005'; end if;
    if exists(select 1 from room_participants where room_id=p_target and user_id=p_user_id) then return jsonb_build_object('joined',true,'alreadyJoined',true); end if;
    if not room.is_active or (not room.is_public and room.created_by<>p_user_id) then raise exception 'Room unavailable' using errcode='P1003'; end if;
    insert into room_participants(room_id,user_id) values(p_target,p_user_id);
    return jsonb_build_object('joined',true);
  elsif p_kind='event' then
    select * into event from events where id=p_target for update;
    if not found then raise exception 'Unknown event' using errcode='P1005'; end if;
    if exists(select 1 from event_rsvps where event_id=p_target and user_id=p_user_id) then return jsonb_build_object('rsvped',true,'alreadyRsvped',true); end if;
    if event.is_paid or event.event_date<=now() then raise exception 'Event unavailable for RSVP' using errcode='P1004'; end if;
    if event.max_attendees is not null and (select count(*) from event_rsvps where event_id=p_target)>=event.max_attendees then raise exception 'Event full' using errcode='P1004'; end if;
    insert into event_rsvps(event_id,user_id) values(p_target,p_user_id);
    return jsonb_build_object('rsvped',true);
  else raise exception 'Unknown membership' using errcode='P1004'; end if;
end $$;

CREATE FUNCTION public.join_reading_challenge(p_user_id uuid, p_challenge_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target challenges;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into target from challenges where id=p_challenge_id for share;if not found then raise exception 'Challenge not found' using errcode='P1005';end if;
  if exists(select 1 from challenge_participants where challenge_id=p_challenge_id and user_id=p_user_id)then return jsonb_build_object('success',true,'joined',true);end if;
  if not target.is_active or target.start_date>now()or target.end_date<=now()then raise exception 'Challenge is not active' using errcode='P1004';end if;
  insert into challenge_participants(challenge_id,user_id)values(target.id,p_user_id)on conflict do nothing;
  return jsonb_build_object('success',true,'joined',true);
end $$;

CREATE FUNCTION public.leaderboard_snapshot(p_user uuid, p_type text DEFAULT 'global'::text, p_period text DEFAULT 'weekly'::text, p_country text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare start_at timestamptz;end_at timestamptz;target_country text;
begin
  if p_type not in('global','national','friends','reviewers') or p_period not in('weekly','monthly','alltime') then raise exception 'Invalid leaderboard' using errcode='P1004';end if;
  if p_user is not null and not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_type in('national','friends') and p_user is null then raise exception 'Account required' using errcode='P1003';end if;
  if p_type='national' then
    target_country:=upper(coalesce(p_country,(select u.country from users u where u.id=p_user)));
    if target_country is not null and target_country!~'^[A-Z]{2}$' then raise exception 'Invalid country' using errcode='P1004';end if;
  end if;
  if p_period<>'alltime' then
    start_at:=date_trunc(case when p_period='weekly' then 'week' else 'month' end,p_now at time zone 'UTC') at time zone 'UTC';
    end_at:=((start_at at time zone 'UTC')+case when p_period='weekly' then interval '1 week' else interval '1 month' end) at time zone 'UTC';
  end if;
  return(with candidates as materialized(select u.id,u.username,u.display_name,u.avatar_url,u.xp as lifetime_xp from users u
    where not u.is_banned and u.deleted_at is null and(u.profile_visibility='public' or u.id=p_user or exists(select 1 from follows where follower_id=p_user and following_id=u.id))
    and(p_type<>'national' or upper(u.country)=target_country)and(p_type<>'friends' or u.id=p_user or exists(select 1 from follows where follower_id=p_user and following_id=u.id))),
    period_xp as materialized(select x.user_id,sum(x.amount) as amount from xp_ledger x join candidates c on c.id=x.user_id where start_at is not null and x.created_at>=start_at and x.created_at<end_at and x.created_at<=p_now group by x.user_id),
    review_scores as materialized(select r.user_id,count(*) as helpful_votes,count(distinct r.id) as review_count from reviews r join candidates c on c.id=r.user_id join review_helpfulness_votes v on v.review_id=r.id and v.is_helpful
      where p_type='reviewers' and r.moderation_status='published' and not r.is_hidden and(start_at is null or v.cast_at>=start_at and v.cast_at<end_at and v.cast_at<=p_now) group by r.user_id),
    scores as(select c.*,case when p_type='reviewers' then coalesce(r.helpful_votes,0) when p_period='alltime' then c.lifetime_xp else coalesce(x.amount,0)end as score,
      case when p_period='alltime' then c.lifetime_xp else coalesce(x.amount,0)end as xp,coalesce(r.helpful_votes,0) as helpful_votes,coalesce(r.review_count,0) as review_count from candidates c left join period_xp x on x.user_id=c.id left join review_scores r on r.user_id=c.id where p_type<>'reviewers' or r.helpful_votes>0),
    ranked as(select row_number() over(order by score desc,id) as rank,* from scores),page as(select * from ranked order by rank limit greatest(1,least(coalesce(p_limit,50),100)))
    select jsonb_build_object('leaderboard',coalesce((select jsonb_agg(to_jsonb(page)-'score' order by rank) from page),'[]'::jsonb),'type',p_type,'period',p_period,'periodStart',start_at,'periodEnd',end_at,'country',target_country,'generatedAt',p_now));
end $_$;

CREATE FUNCTION public.mark_account_locale_initialized() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin new.locale_initialized:=true;return new;end $$;

CREATE FUNCTION public.moderation_catalog_snapshot(p_user uuid, p_scope text, p_status text DEFAULT 'pending'::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare admin boolean;staff boolean;
begin
  select is_admin,is_admin or is_moderator into admin,staff from users where id=p_user and not is_banned and deleted_at is null;
  if not found or not staff or p_scope='log' and not admin then raise exception 'Moderation access required' using errcode='P1003';end if;
  if p_scope is null or p_scope not in('reports','log','dashboard') or p_status is null or p_status not in('pending','approved','removed','warned','escalated','all') or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 200000 or (p_at is null)<>(p_id is null) then raise exception 'Invalid moderation page' using errcode='P1004';end if;
  if p_scope='dashboard' then return jsonb_build_object('isAdmin',admin,'pending',(select count(*)from content_reports where status='pending'),'today',(select count(*)from content_reports where created_at>=date_trunc('day',now()at time zone 'UTC')at time zone 'UTC'));end if;
  if p_scope='reports' then
    return jsonb_build_object('total',(select count(*)from content_reports where p_status='all' or status=p_status),'rows',coalesce((select jsonb_agg(jsonb_build_object('item',moderation_report_document(p_user,id,admin),'at',created_at,'key',id)order by created_at desc,id desc)from(select id,created_at from content_reports where(p_status='all' or status=p_status)and(p_at is null or(created_at,id)<(p_at,p_id))order by created_at desc,id desc limit p_limit+1 offset p_offset)page),'[]'::jsonb));
  end if;
  return jsonb_build_object('total',(select count(*)from moderation_log),'rows',coalesce((select jsonb_agg(jsonb_build_object('item',to_jsonb(page)||jsonb_build_object('moderator',case when u.id is null then null else jsonb_build_object('username',u.username,'display_name',u.display_name)end,'target',case when target.id is null then null else jsonb_build_object('username',target.username,'display_name',target.display_name)end),'at',page.created_at,'key',page.id)order by page.created_at desc,page.id desc)from(select * from moderation_log where p_at is null or(created_at,id)<(p_at,p_id)order by created_at desc,id desc limit p_limit+1 offset p_offset)page left join users u on u.id=page.moderator_id left join content_reports r on r.id=page.report_id left join reviews v on r.entity_type='review' and v.id=r.entity_id left join quotes q on r.entity_type='quote' and q.id=r.entity_id left join users target on target.id=coalesce(page.target_user_id,case r.entity_type when 'user' then r.entity_id when 'review' then v.user_id when 'quote' then q.user_id end)),'[]'::jsonb));
end $$;

CREATE FUNCTION public.moderation_receipt_snapshot(p_user uuid, p_report uuid, p_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare receipt jsonb;
begin
  if not exists(select 1 from users where id=p_user and(is_admin or is_moderator)and not is_banned and deleted_at is null)then raise exception 'Moderation access required' using errcode='P1003';end if;
  select response into receipt from content_intents where actor_id=p_user and action='report_review' and intent_key=p_key and response->'report'->>'id'=p_report::text;
  if receipt is null then raise exception 'Receipt unavailable' using errcode='P1005';end if;
  return receipt;
end $$;

CREATE FUNCTION public.moderation_report_document(p_actor uuid, p_report uuid, p_admin boolean) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select (to_jsonb(r)-'idempotency_key'-'request_hash')||jsonb_build_object(
    'reporter',jsonb_build_object('username',reporter.username,'display_name',reporter.display_name),
    'moderator',case when moderator.id is null then null else jsonb_build_object('username',moderator.username,'display_name',moderator.display_name)end,
    'target',jsonb_build_object('owner_id',owner.id,'username',owner.username,'display_name',owner.display_name,'label',coalesce(b.title,owner.display_name),'content',left(coalesce(v.content,q.content,owner.bio),2000)),
    'allowed_actions',case when r.status not in('pending','escalated') or owner.id=p_actor or r.status='escalated' and not p_admin then '[]'::jsonb
      else jsonb_build_array('approve')||case when r.entity_type in('review','quote') and owner.id is not null or r.entity_type='user' and p_admin and owner.id is not null then '["remove"]'::jsonb else '[]'::jsonb end||case when owner.id is not null then '["warn"]'::jsonb else '[]'::jsonb end||case when r.status='pending' then '["escalate"]'::jsonb else '[]'::jsonb end end)
  from content_reports r join users reporter on reporter.id=r.reporter_id left join users moderator on moderator.id=r.moderator_id
    left join reviews v on r.entity_type='review' and v.id=r.entity_id left join quotes q on r.entity_type='quote' and q.id=r.entity_id
    left join users owner on owner.id=case r.entity_type when 'user' then r.entity_id when 'review' then v.user_id when 'quote' then q.user_id end
    left join books b on b.id=coalesce(v.book_id,q.book_id) where r.id=p_report;
$$;

CREATE FUNCTION public.mutate_reading_list(p_user uuid, p_list uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target reading_lists;book uuid;
begin
  perform 1 from users where id=p_user and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into target from reading_lists where id=p_list for update;
  if not found then
    if p_action='delete' then return jsonb_build_object('deleted',true);end if;
    raise exception 'List unavailable' using errcode='P1005';
  end if;
  if target.user_id<>p_user then raise exception 'List unavailable' using errcode='P1005';end if;
  if p_action='update' then
    if p_payload='{}'::jsonb or p_payload-array['name','description','is_public']<>'{}'::jsonb then raise exception 'Invalid update' using errcode='P1004';end if;
    update reading_lists set name=case when p_payload?'name' then trim(p_payload->>'name') else name end,
      description=case when p_payload?'description' then trim(p_payload->>'description') else description end,
      is_public=case when p_payload?'is_public' then(p_payload->>'is_public')::boolean else is_public end,updated_at=now() where id=p_list;
  elsif p_action='delete' then delete from reading_lists where id=p_list;return jsonb_build_object('deleted',true);
  elsif p_action in('add','remove') then
    select coalesce(canonical_edition_id,id) into book from books where id=(p_payload->>'book_id')::uuid;
    if book is null then raise exception 'Edition unavailable' using errcode='P1005';end if;
    if p_action='add' then
      if not exists(select 1 from reading_list_books lb join books b on b.id=lb.book_id where list_id=p_list and coalesce(b.canonical_edition_id,b.id)=book) then
        insert into reading_list_books(list_id,book_id) values(p_list,book) on conflict do nothing;
      end if;
    else delete from reading_list_books lb using books b where lb.book_id=b.id and lb.list_id=p_list and coalesce(b.canonical_edition_id,b.id)=book;end if;
  else raise exception 'Invalid action' using errcode='P1004';end if;
  return jsonb_build_object('list',reading_list_document(p_user,p_list),'bookId',book);
end $$;

CREATE FUNCTION public.notify_writer_question() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare recipient uuid;actor uuid;target uuid;question_text text;actor_name text;fact text;legacy text;
begin
  if tg_table_name='ask_writer_answers' then
    select user_id,id,question into recipient,target,question_text from ask_writer_questions where id=new.question_id;
    actor:=new.user_id;fact:='writerAnswer';legacy:='A writer answered your question.';
  else
    if new.best_answer_id is null or new.best_answer_id is not distinct from old.best_answer_id then return new;end if;
    select user_id into recipient from ask_writer_answers where id=new.best_answer_id;
    actor:=new.user_id;target:=new.id;question_text:=new.question;fact:='writerBestAnswer';legacy:='Your answer was selected as the best answer.';
  end if;
  if recipient is not null and recipient<>actor then
    select display_name into actor_name from users where id=actor;
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message,message_key,message_values) values(recipient,'reply',actor,'writer_question',target,legacy,fact,jsonb_build_object('name',actor_name,'content',question_text));
  end if;
  return new;
end $$;

CREATE FUNCTION public.page_followed_lists(p_user_id uuid, p_before timestamp with time zone, p_before_id uuid, p_limit integer DEFAULT 51) RETURNS SETOF public.reading_lists
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select l.* from reading_lists l where l.is_public and reading_list_visible(p_user_id,l.id)
    and (p_before is null or (l.created_at,l.id)<(p_before,p_before_id))
    and exists(select 1 from reading_list_follows f where f.user_id=p_user_id and f.list_id=l.id)
    order by l.created_at desc,l.id desc limit greatest(1,least(p_limit,51));
$$;

CREATE FUNCTION public.premium_status_snapshot(p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  select jsonb_build_object('active',has_premium_access(p_user),'subscriptions',coalesce(jsonb_agg(jsonb_build_object('provider',provider,'paidUntil',current_period_end,'renewalCancelled',renewal_cancelled) order by provider,current_period_end desc nulls last,id),'[]'::jsonb)) into result
  from subscriptions where user_id=p_user and status='active' and current_period_end>now();
  return result;
end $$;

CREATE FUNCTION public.prepare_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare recipient users;actor_name text;preference boolean:=true;parts text[];decision text;content text;context jsonb;
begin
  if tg_op='INSERT' then
    select * into recipient from users where id=new.user_id;
    if not found then return new;end if;
    preference:=case new.type when 'follow' then recipient.notify_follows when 'like' then recipient.notify_likes when 'review_like' then recipient.notify_likes
      when 'reply' then recipient.notify_replies when 'review_comment' then recipient.notify_replies when 'mention' then recipient.notify_mentions
      when 'author_announcement' then recipient.notify_author_announcements when 'new_release' then recipient.notify_new_releases
      when 'challenge_complete' then recipient.notify_challenge_completions when 'arc_granted' then recipient.notify_arc_grants
      when 'buddy_read_invite' then case when new.entity_type='arc' then recipient.notify_arc_grants else true end else true end;
    if not preference then return null;end if;
  elsif new.message is distinct from old.message and new.message_key is not distinct from old.message_key then
    new.message_key:=null;new.message_values:='{}'::jsonb;
  end if;
  if new.message_key is not null then return new;end if;
  select display_name into actor_name from users where id=new.actor_id and not is_banned and deleted_at is null;
  new.message_values:=jsonb_build_object('name',actor_name);
  case new.type
    when 'follow' then new.message_key:='follow';
    when 'like','review_like' then new.message_key:='reviewLike';
    when 'reply','review_comment' then new.message_key:='reviewReply';
    when 'mention' then new.message_key:='mention';
    when 'want_to_read' then new.message_key:='wantToRead';
    when 'challenge_complete' then new.message_key:='challengeComplete';
    when 'account_hardening' then new.message_key:='accountHardening';
    when 'referral' then new.message_key:='referral';new.message_values:=new.message_values||jsonb_build_object('xp',200);
    when 'author_announcement' then new.message_key:='authorAnnouncement';new.message_values:=new.message_values||jsonb_build_object('content',new.message);
    when 'author_qa_question','new_question' then new.message_key:='question';new.message_values:=new.message_values||jsonb_build_object('content',new.message);
    when 'author_verification_request' then new.message_key:='verificationRequest';
    when 'author_qa_answer' then
      if new.entity_type='author_verification_request' then
        new.message_key:=case when new.message='Your author verification has been approved! You now have a verified author badge.' then 'verificationApproved' when new.message='Your author verification request was not approved at this time.' then 'verificationRejected' else 'verificationUpdated' end;
      else
        select left(question,60) into content from author_qa where id=new.entity_id;
        new.message_key:=case when content is not null then 'answerDetail' else 'answer' end;new.message_values:=new.message_values||jsonb_build_object('content',content);
      end if;
    when 'buddy_read_invite','arc_granted' then
      if new.type='arc_granted' then new.message_key:='arcApproved';
      elsif new.entity_type='arc' then
        new.message_key:=case when new.message='A reader applied for your ARC.' then 'arcReceived' when new.message='Your ARC application has been approved!' then 'arcApproved' when new.message='Your ARC application was not approved this time.' then 'arcRejected' else 'arcUpdated' end;
      else new.message_key:='buddyInvite';end if;
    when 'book_pass','book_passed' then
      new.message_key:=case when new.entity_type='pass_the_book_chain' then 'bookChain' when new.message='A reader passed you a book.' then 'bookPassed' else 'bookPassedNote' end;
      new.message_values:=new.message_values||jsonb_build_object('content',new.message);
    when 'reading_goal_milestone' then
      parts:=regexp_match(new.message,'^You have read ([0-9]+) of ([0-9]+) books and reached ([0-9]+)% of your ([0-9]{4}) reading goal\.$');
      new.message_key:='readingGoalGeneric';
      if parts is not null then new.message_key:='readingGoal';new.message_values:=jsonb_build_object('count',parts[1]::numeric,'target',parts[2]::numeric,'percent',parts[3]::numeric,'year',parts[4]);end if;
    when 'badge_earned' then new.message_key:='badgeGeneric';new.message_values:=jsonb_build_object('content',new.message);
    when 'tip' then
      context:=nullif(current_setting('liravo.notification_context',true),'')::jsonb;
      if context->>'userId'=new.user_id::text and context->>'tipId'=new.entity_id::text then
        new.message_key:='tipAmount';new.message_values:=jsonb_build_object('amount',context->>'amount','currency',coalesce(context->>'currency','USD'));
      else
        parts:=regexp_match(new.message,'^You received a ([A-Z]{3}) ([0-9]+(?:\.[0-9]+)?) tip!$');
        new.message_key:='tip';if parts is not null then new.message_key:='tipAmount';new.message_values:=jsonb_build_object('currency',parts[1],'amount',parts[2]);end if;
      end if;
    when 'tip_refunded' then new.message_key:='tipRefunded';
    when 'event_ticket_confirmed' then new.message_key:='ticketConfirmed';
    when 'event_ticket_refunded' then new.message_key:='ticketRefunded';
    when 'promoted_listing_activated' then new.message_key:='promotionActivated';
    when 'appeal_decision' then
      parts:=regexp_match(new.message,'^Your appeal has been (approved|rejected)\. (.*)$','s');new.message_key:='appealUpdated';
      if parts is not null then new.message_key:=case parts[1] when 'approved' then 'appealApproved' else 'appealRejected' end;new.message_values:=jsonb_build_object('content',parts[2]);end if;
    when 'moderation_warning' then
      parts:=regexp_match(new.message,'^Your .+ has received a moderation warning\. Reason: (.*)$','s');
      new.message_key:='moderationWarning';new.message_values:=jsonb_build_object('content',case when parts[1]='Community guidelines violation.' then null else parts[1] end);
    when 'moderation_escalation' then new.message_key:='moderationEscalation';
    else new.message_key:='activity';
  end case;
  return new;
end $_$;

CREATE FUNCTION public.process_outbox_event_atomic(p_event_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare context jsonb;old_context text:=coalesce(current_setting('liravo.notification_context',true),'');result boolean;event outbox_events;
begin
  select * into event from outbox_events where id=p_event_id for update;
  if not found then raise exception 'Unknown outbox event';end if;
  select payload into context from outbox_events where id=p_event_id and event_type='notify_recipient';
  perform set_config('liravo.notification_context',coalesce(context::text,''),true);
  result:=process_outbox_event_atomic_064(p_event_id);
  perform set_config('liravo.notification_context',old_context,true);
  if result and event.event_type in('push_notification','notify_recipient')then
    insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
    values('push_delivery',event.id::text,'deliver_push',event.payload||jsonb_build_object('sourceEventType',event.event_type,'sourceAggregateType',event.aggregate_type))
    on conflict(aggregate_id)where event_type='deliver_push'do nothing;
  end if;
  return result;
end $$;

CREATE FUNCTION public.process_outbox_event_atomic_042(p_event_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e outbox_events; post author_posts; recipients uuid[];
begin
  select * into e from outbox_events where id=p_event_id for update;
  if not found then raise exception 'Unknown outbox event'; end if;
  if e.status='processed' then return false; end if;
  if e.status<>'processing' then raise exception 'Event must be claimed'; end if;
  if e.aggregate_type='tip' then
    perform 1 from users where id in ((e.payload->>'userId')::uuid,(e.payload->>'actorId')::uuid) order by id for update;
    if exists(select 1 from tips where id=e.aggregate_id::uuid and (status='refunded' or (e.event_type='notify_recipient' and refunded_recipient_amount>0))) then
      update outbox_events set status='processed',processed_at=now(),last_error=null where id=e.id;
      return false;
    end if;
  end if;
  if e.event_type='author_announcement' then
    select * into post from author_posts where id=(e.payload->>'postId')::uuid;
    if found then
      select array_agg(follower_id order by follower_id) into recipients from (
        select follower_id from follows where following_id=post.author_id and created_at<=post.created_at
          and (e.payload->>'after' is null or follower_id>(e.payload->>'after')::uuid) order by follower_id limit 101
      ) page;
      perform 1 from users where id=post.author_id or id=any(recipients[1:100]) order by id for key share;
      insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
        select id,'author_announcement',post.author_id,'author_post',post.id,post.title from users where id=any(recipients[1:100]) and coalesce(notify_author_announcements,true);
      if cardinality(recipients)>100 then
        insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
          values(e.aggregate_type,e.aggregate_id,e.event_type,e.payload||jsonb_build_object('after',recipients[100]));
      else update author_posts set followers_notified=true where id=post.id; end if;
    end if;
  elsif e.event_type='notify_admins' then
    perform 1 from users where is_admin or id=(e.payload->>'userId')::uuid order by id for key share;
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
      select id,'author_verification_request',(e.payload->>'userId')::uuid,'author_verification_request',(e.payload->>'requestId')::uuid,'New author verification request' from users where is_admin and not is_banned;
  elsif e.event_type='notify_recipient' then
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
      values((e.payload->>'userId')::uuid,'tip',(e.payload->>'actorId')::uuid,'tip',(e.payload->>'tipId')::uuid,
        'You received a '||coalesce(e.payload->>'currency','USD')||' '||(e.payload->>'amount')||' tip!');
  elsif e.event_type='award_xp' then
    perform award_xp_once((e.payload->>'userId')::uuid,(e.payload->>'amount')::integer,e.payload->>'reason',coalesce(e.payload->>'eventKey','outbox:'||e.id::text));
    if (e.payload->>'readingStreak')::boolean then perform increment_streak_atomic((e.payload->>'userId')::uuid,'reading'); end if;
  elsif e.event_type in ('push_notification','check_badges') then null;
  else raise exception 'Unknown outbox event type'; end if;
  update outbox_events set status='processed',processed_at=now(),last_error=null where id=e.id;
  return true;
end $$;

CREATE FUNCTION public.process_outbox_event_atomic_064(p_event_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare event outbox_events;session reading_sessions;
begin
  select * into event from outbox_events where id=p_event_id for update;
  if not found then raise exception 'Unknown outbox event';end if;
  if event.aggregate_type<>'reading_sessions' or event.event_type<>'award_xp' then return process_outbox_event_atomic_042(p_event_id);end if;
  if event.status='processed' then return false;end if;
  if event.status<>'processing' then raise exception 'Event must be claimed';end if;
  select * into session from reading_sessions where id=event.aggregate_id::uuid;
  if found then
    if session.created_at<=clock_timestamp() then insert into reading_activity_days(user_id,activity_date) values(session.user_id,(session.created_at at time zone 'UTC')::date) on conflict do nothing;end if;
    perform award_xp_once(session.user_id,5,'reading_session','reading-session:'||session.id);
    perform rebuild_reading_streak(session.user_id);
  end if;
  update outbox_events set status='processed',processed_at=now(),last_error=null where id=p_event_id;return true;
end $$;

CREATE FUNCTION public.process_payment_event(p_provider text, p_event_id text, p_payload jsonb, p_correlation_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare t tips; s subscriptions; c payment_captures; kind text; target uuid; owner uuid; recipient uuid; referrer uuid; payment text; paid bigint; tax bigint;
begin
  if p_payload?'ticket_id' or not (p_payload?'payment_id') then return process_payment_event_048(p_provider,p_event_id,p_payload,p_correlation_id); end if;
  if p_provider is null or p_provider not in ('paystack','dodopayments') or p_event_id is null or length(p_event_id) not between 8 and 200
    or p_payload->>'payment_id' is null or length(p_payload->>'payment_id') not between 1 and 150 or p_payload->>'paid_amount_minor' is null or p_payload->>'paid_amount_minor' !~ '^[0-9]+$'
    or p_payload->>'currency' is null or p_payload->>'currency' not in ('USD','NGN','EUR') or p_payload?'tipId' and p_payload?'subscription_id' then raise exception 'Invalid payment capture' using errcode='P1004'; end if;
  payment:=p_payload->>'payment_id';paid:=(p_payload->>'paid_amount_minor')::bigint;tax:=coalesce((p_payload->>'tax_minor')::bigint,0);
  if paid<=0 or tax<0 or tax>paid then raise exception 'Invalid payment amount' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||payment,0));
  if p_payload?'tipId' then
    kind:='tip';select * into t from tips where id=(p_payload->>'tipId')::uuid;
    if not found or t.user_id is null then raise exception 'Tip unavailable' using errcode='P1005'; end if;
    target:=t.id;owner:=t.user_id;recipient:=coalesce(t.recipient_id,t.creator_id);
  else
    kind:='subscription';select * into s from subscriptions where id=(p_payload->>'subscription_id')::uuid;
    if not found then raise exception 'Subscription unavailable' using errcode='P1005'; end if;
    if s.user_id is distinct from (p_payload->>'user_id')::uuid or s.provider is distinct from p_provider
      or (p_payload->>'provider_reference' is not null and s.provider_event_id is distinct from p_payload->>'provider_reference')
      or (s.provider_subscription_id is not null and p_payload->>'provider_subscription_id' is not null and s.provider_subscription_id<>p_payload->>'provider_subscription_id') then raise exception 'Payment binding mismatch' using errcode='P1003'; end if;
    target:=s.id;owner:=s.user_id;
  end if;
  select referred_by into referrer from users where id=owner;
  perform 1 from users where id in (owner,recipient,referrer) order by id for update;
  if kind='tip' then perform 1 from tips where id=target for update;
  else perform 1 from subscriptions where id=target for update; end if;
  begin
    return process_payment_event_048(p_provider,p_event_id,p_payload,p_correlation_id);
  exception when sqlstate 'P1002' then
    select * into c from payment_captures where provider=p_provider and payment_id=payment;
    if found then
      if c.entity_type<>kind or c.entity_id<>target or c.user_id<>owner or c.charged_minor<>paid or c.currency<>p_payload->>'currency' or c.event_id<>p_event_id then raise exception 'Payment capture conflict' using errcode='P1001'; end if;
      perform apply_pending_capture_refunds(p_provider,payment,p_correlation_id);
      return false;
    end if;
    if exists(select 1 from payment_events where provider=p_provider and event_id=p_event_id) then raise exception 'Payment event conflict' using errcode='P1001'; end if;
    insert into payment_events(provider,event_id,payload) values(p_provider,p_event_id,p_payload);
    insert into payment_captures(provider,payment_id,entity_type,entity_id,user_id,recipient_id,currency,charged_minor,event_id,credited)
      values(p_provider,payment,kind,target,owner,recipient,p_payload->>'currency',paid,p_event_id,false);
    update payment_returns set reason='amount_mismatch',correlation_id=p_correlation_id where provider=p_provider and payment_id=payment;
    if kind='subscription' and p_provider='dodopayments' and p_payload->>'provider_subscription_id' is not null then
      update subscriptions set provider_subscription_id=coalesce(provider_subscription_id,p_payload->>'provider_subscription_id') where id=target;
      insert into subscription_cancellations(subscription_id,correlation_id) values(target,p_correlation_id) on conflict do nothing;
      if found then insert into financial_audit_log(target_user_id,action,provider,correlation_id,metadata)
        values(owner,'subscription_cancellation_requested',p_provider,p_correlation_id,jsonb_build_object('subscription_id',target,'reason','payment_amount_mismatch')); end if;
    end if;
    insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
      values(owner,'payment_amount_return_queued',paid::numeric/100,p_payload->>'currency',p_provider,p_event_id,p_correlation_id,jsonb_build_object('entity_type',kind,'entity_id',target,'payment_id',payment));
    perform apply_pending_capture_refunds(p_provider,payment,p_correlation_id);
    return true;
  end;
end $_$;

CREATE FUNCTION public.process_payment_event_047(p_provider text, p_event_id text, p_payload jsonb, p_correlation_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare t tips; s subscriptions; capture payment_captures; capture_payment_id text; paid bigint; tax bigint; end_at timestamptz; owner uuid; recipient uuid; referrer uuid; applied boolean; duplicate boolean; old_payload jsonb;
begin
  if p_payload->>'event'='subscription.cancelled' then
    applied:=process_payment_event_legacy(p_provider,p_event_id,p_payload,p_correlation_id);
    select * into s from subscriptions where id=(p_payload->>'subscription_id')::uuid;
    if s.last_provider_event_at<=(p_payload->>'provider_event_at')::timestamptz then
      update subscriptions set renewal_cancelled=true,status=case when current_period_end>now() then 'active' else 'expired' end where id=s.id;
    end if;
    perform refresh_premium_access(s.user_id);
    return applied;
  end if;
  if p_payload->>'status'='failed' then return process_payment_event_legacy(p_provider,p_event_id,p_payload,p_correlation_id); end if;
  capture_payment_id:=p_payload->>'payment_id';
  if capture_payment_id is null or length(capture_payment_id) not between 1 and 150 or p_payload->>'paid_amount_minor' is null or p_payload->>'paid_amount_minor' !~ '^[0-9]+$' then raise exception 'Invalid captured payment' using errcode='P1004'; end if;
  paid:=(p_payload->>'paid_amount_minor')::bigint;
  tax:=coalesce((p_payload->>'tax_minor')::bigint,0);
  if tax<0 or tax>paid then raise exception 'Invalid payment tax' using errcode='P1002'; end if;
  if paid<=0 or p_payload->>'currency' not in ('USD','NGN','EUR') then raise exception 'Invalid captured payment' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||capture_payment_id,0));
  if p_payload ? 'tipId' then
    select * into t from tips where id=(p_payload->>'tipId')::uuid;
    if not found then raise exception 'Unknown tip'; end if;
    owner:=t.user_id;recipient:=coalesce(t.recipient_id,t.creator_id);
  else
    select * into s from subscriptions where id=(p_payload->>'subscription_id')::uuid;
    if not found then raise exception 'Unknown subscription'; end if;
    owner:=s.user_id;
    end_at:=(p_payload->>'period_end')::timestamptz;
    if p_payload->>'provider_event_at' is null or end_at is null or end_at<=(p_payload->>'provider_event_at')::timestamptz then raise exception 'Verified billing period required' using errcode='P1004'; end if;
  end if;
  if paid-tax<>coalesce(t.amount,s.amount)*100 then raise exception 'Payment amount mismatch' using errcode='P1002'; end if;
  select referred_by into referrer from users where id=owner;
  perform 1 from users where id in (owner,recipient,referrer) order by id for update;
  if t.id is not null then
    select * into t from tips where id=t.id for update;
    if p_payload->>'currency' is distinct from t.currency then raise exception 'Payment currency mismatch' using errcode='P1002'; end if;
  else
    select * into s from subscriptions where id=s.id for update;
    if s.user_id is distinct from (p_payload->>'user_id')::uuid or s.provider is distinct from p_provider
      or (p_payload->>'provider_reference' is not null and s.provider_event_id is distinct from p_payload->>'provider_reference')
      or (s.provider_subscription_id is not null and p_payload->>'provider_subscription_id' is not null and s.provider_subscription_id<>p_payload->>'provider_subscription_id') then raise exception 'Payment binding mismatch' using errcode='P1003'; end if;
    if p_payload->>'currency' is distinct from s.currency then raise exception 'Payment currency mismatch' using errcode='P1002'; end if;
  end if;
  select * into capture from payment_captures where provider=p_provider and payment_captures.payment_id=capture_payment_id;
  if found and (capture.entity_id<>coalesce(t.id,s.id) or capture.charged_minor<>paid or capture.currency<>p_payload->>'currency') then raise exception 'Payment capture conflict' using errcode='P1001'; end if;
  if found and capture.event_id<>p_event_id then raise exception 'Payment identity conflict' using errcode='P1001'; end if;
  if capture.payment_id is not null then
    if s.id is not null then
      if capture.period_end is not null and capture.period_end is distinct from end_at then raise exception 'Paid period conflict' using errcode='P1001'; end if;
      if capture.period_end is null and capture.credited then
        update payment_captures set period_end=end_at where provider=p_provider and payment_captures.payment_id=capture_payment_id;
        update subscriptions set current_period_end=(select max(period_end) from payment_captures where entity_type='subscription' and entity_id=s.id and credited and refunded_minor<charged_minor),
          status=case when end_at>now() then 'active' else 'expired' end where id=s.id;
        insert into financial_audit_log(target_user_id,action,provider,provider_event_id,correlation_id,metadata)
          values(owner,'billing_period_reconciled',p_provider,p_event_id,p_correlation_id,jsonb_build_object('subscription_id',s.id,'period_end',end_at));
        perform refresh_premium_access(owner);
      end if;
    end if;
    perform apply_pending_capture_refunds(p_provider,capture_payment_id,p_correlation_id);
    return false;
  end if;

  duplicate:=capture.payment_id is null and (
    (t.id is not null and t.status in ('completed','refunded')) or
    (s.id is not null and exists(select 1 from payment_captures where entity_type='subscription' and entity_id=s.id and period_end=end_at and credited and refunded_minor<charged_minor))
  );
  if duplicate then
    insert into payment_events(provider,event_id,payload) values(p_provider,p_event_id,p_payload) on conflict do nothing;
    if not found then
      select payload into old_payload from payment_events where provider=p_provider and event_id=p_event_id;
      if old_payload<>p_payload then raise exception 'Event payload conflict' using errcode='P1001'; end if;
      return false;
    end if;
    insert into payment_captures(provider,payment_id,entity_type,entity_id,user_id,recipient_id,currency,charged_minor,period_end,event_id,credited)
      values(p_provider,capture_payment_id,case when t.id is null then 'subscription' else 'tip' end,coalesce(t.id,s.id),owner,recipient,p_payload->>'currency',paid,end_at,p_event_id,false);
    insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
      values(owner,'duplicate_payment_captured',paid::numeric/100,p_payload->>'currency',p_provider,p_event_id,p_correlation_id,jsonb_build_object('entity_id',coalesce(t.id,s.id),'payment_id',capture_payment_id));
    perform apply_pending_capture_refunds(p_provider,capture_payment_id,p_correlation_id);
    return true;
  end if;

  applied:=process_payment_event_legacy(p_provider,p_event_id,p_payload,p_correlation_id);
  if not applied then perform apply_pending_capture_refunds(p_provider,capture_payment_id,p_correlation_id); return false; end if;
  insert into payment_captures(provider,payment_id,entity_type,entity_id,user_id,recipient_id,currency,charged_minor,period_end,event_id)
    values(p_provider,capture_payment_id,case when t.id is null then 'subscription' else 'tip' end,coalesce(t.id,s.id),owner,recipient,p_payload->>'currency',paid,end_at,p_event_id)
    on conflict do nothing;
  update referral_commissions set original_commission_amount=commission_amount where idempotency_key=p_provider||':'||p_event_id and original_commission_amount is null;
  if s.id is not null then
    update subscriptions set current_period_end=(select max(period_end) from payment_captures where entity_type='subscription' and entity_id=s.id and credited and refunded_minor<charged_minor),
      renewal_cancelled=case when p_provider='paystack' then true else coalesce((p_payload->>'renewal_cancelled')::boolean,renewal_cancelled) end where id=s.id;
    perform refresh_premium_access(s.user_id);
  end if;
  perform apply_pending_capture_refunds(p_provider,capture_payment_id,p_correlation_id);
  return true;
end $_$;

CREATE FUNCTION public.process_payment_event_048(p_provider text, p_event_id text, p_payload jsonb, p_correlation_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare t event_tickets; e events; c payment_captures; payment text; paid bigint; tax bigint; referrer uuid; eligible boolean; occupied bigint; original jsonb; applied boolean;
begin
  if not (p_payload?'ticket_id') then
    applied:=process_payment_event_047(p_provider,p_event_id,p_payload,p_correlation_id);
    update payment_returns set correlation_id=coalesce(correlation_id,p_correlation_id) where provider=p_provider and payment_id=p_payload->>'payment_id';
    return applied;
  end if;
  if p_payload?'tipId' or p_payload?'subscription_id' or p_provider not in ('paystack','dodopayments') or p_payload->>'status' is distinct from 'completed'
    or p_payload->>'payment_id' is null or length(p_payload->>'payment_id') not between 1 and 150 or p_payload->>'paid_amount_minor' is null or p_payload->>'paid_amount_minor' !~ '^[0-9]+$'
    or p_payload->>'currency' is null or p_payload->>'currency' not in ('USD','NGN','EUR') then raise exception 'Invalid ticket capture' using errcode='P1004'; end if;
  payment:=p_payload->>'payment_id';paid:=(p_payload->>'paid_amount_minor')::bigint;tax:=coalesce((p_payload->>'tax_minor')::bigint,0);
  if paid<=0 or tax<0 or tax>paid then raise exception 'Invalid ticket amount' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||payment,0));
  select * into t from event_tickets where id=(p_payload->>'ticket_id')::uuid;
  if not found or t.provider<>p_provider or (p_payload->>'provider_reference') is distinct from 'ticket_'||t.id::text or (p_payload->>'user_id') is distinct from t.user_id::text then raise exception 'Ticket binding mismatch' using errcode='P1003'; end if;
  select referred_by into referrer from users where id=t.user_id;
  perform 1 from users where id in (t.user_id,t.organizer_id,referrer) order by id for update;
  select * into e from events where id=t.event_id for update;
  select * into t from event_tickets where id=t.id for update;
  select * into c from payment_captures where provider=p_provider and payment_id=payment;
  if found then
    if c.entity_type<>'ticket' or c.entity_id<>t.id or c.charged_minor<>paid or c.currency<>p_payload->>'currency' or c.event_id<>p_event_id then raise exception 'Ticket capture conflict' using errcode='P1001'; end if;
    perform apply_pending_capture_refunds(p_provider,payment,p_correlation_id);
    return false;
  end if;
  select payload into original from payment_events where provider=p_provider and event_id=p_event_id;
  if found then raise exception 'Ticket event conflict' using errcode='P1001'; end if;
  select count(*) into occupied from event_tickets where event_id=e.id and id<>t.id and (status in ('confirmed','refund_pending','legacy_hold') or status='pending' and reserved_until>now());
  eligible:=t.status in ('pending','expired') and e.event_date>now() and (e.max_attendees is null or occupied<e.max_attendees)
    and paid-tax=t.amount_paid*100 and p_payload->>'currency'=t.currency
    and exists(select 1 from users where id=t.user_id and not is_banned and deleted_at is null) and exists(select 1 from users where id=t.organizer_id and not is_banned and deleted_at is null)
    and not exists(select 1 from event_tickets where event_id=e.id and user_id=t.user_id and id<>t.id and (status in ('confirmed','refund_pending','legacy_hold') or status='pending' and reserved_until>now()));
  insert into payment_events(provider,event_id,payload) values(p_provider,p_event_id,p_payload);
  insert into payment_captures(provider,payment_id,entity_type,entity_id,user_id,recipient_id,currency,charged_minor,event_id,credited)
    values(p_provider,payment,'ticket',t.id,t.user_id,t.organizer_id,p_payload->>'currency',paid,p_event_id,eligible);
  update payment_returns set correlation_id=p_correlation_id where provider=p_provider and payment_id=payment;
  if eligible then
    insert into event_revenue(event_id,organizer_id,amount,currency,ticket_id,original_amount,verified) values(e.id,t.organizer_id,t.host_amount,t.currency,t.id,t.host_amount,true);
    if referrer is not null and referrer<>t.user_id then
      insert into referral_commissions(referrer_id,referred_user_id,transaction_id,transaction_type,gross_transaction_amount,platform_fee_amount,commission_amount,original_commission_amount,idempotency_key,currency)
        values(referrer,t.user_id,t.id,'event_ticket',t.amount_paid,t.platform_fee,round(t.amount_paid*0.1,4),round(t.amount_paid*0.1,4),p_provider||':'||p_event_id,t.currency);
    end if;
    update event_tickets set status='confirmed' where id=t.id;
  elsif t.status not in ('confirmed','refund_pending','refunded','legacy_hold') then update event_tickets set status='refund_pending' where id=t.id;
  end if;
  perform apply_pending_capture_refunds(p_provider,payment,p_correlation_id);
  if eligible and exists(select 1 from event_tickets where id=t.id and status='confirmed') then
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(t.user_id,'event_ticket_confirmed',t.organizer_id,'event',e.id,'Your event ticket is confirmed.');
  end if;
  insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(t.user_id,case when eligible then 'ticket_paid' else 'ticket_payment_return_queued' end,paid::numeric/100,p_payload->>'currency',p_provider,p_event_id,p_correlation_id,jsonb_build_object('ticket_id',t.id,'payment_id',payment));
  update checkout_reconciliations set status='settled',last_error=null where entity_type='ticket' and entity_id=t.id and status<>'processing';
  return true;
end $_$;

CREATE FUNCTION public.process_payment_event_legacy(p_provider text, p_event_id text, p_payload jsonb, p_correlation_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare old_payload jsonb; t tips; s subscriptions; referrer uuid; gross numeric; fee numeric; event_at timestamptz;
begin
  if p_provider is null or p_event_id is null or p_payload is null or p_provider not in ('paystack','dodopayments') or length(p_event_id) not between 8 and 200 then raise exception 'Invalid payment event'; end if;
  insert into payment_events values(p_provider,p_event_id,p_payload,now()) on conflict do nothing;
  if not found then
    select payload into old_payload from payment_events where provider=p_provider and event_id=p_event_id;
    if old_payload <> p_payload then raise exception 'Event payload conflict' using errcode='P1001'; end if;
    return false;
  end if;
  if p_payload ? 'tipId' then
    select * into t from tips where id=(p_payload->>'tipId')::uuid for update;
    if not found then raise exception 'Unknown tip'; end if;
    if t.status='completed' then return false; end if;
    if t.status not in ('pending','failed') then raise exception 'Invalid tip transition'; end if;
    if p_payload->>'status'='completed' and p_payload ? 'paid_amount_minor' and ((p_payload->>'currency') is distinct from t.currency or (p_payload->>'paid_amount_minor')::numeric<t.amount*100) then raise exception 'Payment amount mismatch' using errcode='P1002'; end if;
    if p_payload->>'status' not in ('completed','failed') then raise exception 'Invalid tip status'; end if;
    update tips set status=p_payload->>'status',provider_reference=p_payload->>'providerReference' where id=t.id;
    if p_payload->>'status'='completed' then
      insert into payouts(tip_id,recipient_id,amount,currency,provider) values(t.id,coalesce(t.recipient_id,t.creator_id),coalesce(t.recipient_amount,t.creator_amount),t.currency,p_provider);
      select referred_by into referrer from users where id=t.user_id;
      gross:=t.amount; fee:=t.platform_fee;
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('tip',t.id::text,'notify_recipient',jsonb_build_object('userId',coalesce(t.recipient_id,t.creator_id),'actorId',t.user_id,'tipId',t.id,'amount',t.amount,'currency',t.currency));
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('tip',t.id::text,'award_xp',jsonb_build_object('userId',t.user_id,'amount',5,'reason','tip_sent'));
    end if;
  else
    perform 1 from users where id=(p_payload->>'user_id')::uuid for update;
    select * into s from subscriptions where id=(p_payload->>'subscription_id')::uuid and user_id=(p_payload->>'user_id')::uuid and provider=p_provider for update;
    if not found then raise exception 'Unknown subscription'; end if;
    event_at:=coalesce((p_payload->>'provider_event_at')::timestamptz,now());
    if event_at>now()+interval '5 minutes' then raise exception 'Invalid provider event time'; end if;
    if p_payload->>'provider_subscription_id' is not null and s.provider_subscription_id is not null and s.provider_subscription_id<>p_payload->>'provider_subscription_id' then raise exception 'Subscription binding mismatch' using errcode='P1003'; end if;
    if p_payload->>'event'='subscription.activated' then
      if p_payload ? 'paid_amount_minor' and ((p_payload->>'currency') is distinct from s.currency or (p_payload->>'paid_amount_minor')::numeric<s.amount*100) then raise exception 'Payment amount mismatch' using errcode='P1002'; end if;
      if p_payload->>'provider_reference' is not null and s.provider_event_id is not null and p_payload->>'provider_reference'<>s.provider_event_id then raise exception 'Payment reference mismatch' using errcode='P1003'; end if;
      if s.last_provider_event_at is null or event_at>s.last_provider_event_at or (event_at=s.last_provider_event_at and s.status<>'cancelled') then
        update subscriptions set status='active',activated_at=event_at,last_provider_event_at=event_at,provider_subscription_id=coalesce(s.provider_subscription_id,p_payload->>'provider_subscription_id') where id=s.id;
        update users set is_premium=true where id=s.user_id;
      end if;
      select referred_by into referrer from users where id=s.user_id;
      gross:=s.amount; fee:=gross;
    elsif p_payload->>'event'='subscription.cancelled' then
      if s.last_provider_event_at is null or event_at>=s.last_provider_event_at then
        update subscriptions set status='cancelled',cancelled_at=event_at,last_provider_event_at=event_at,provider_subscription_id=coalesce(s.provider_subscription_id,p_payload->>'provider_subscription_id') where id=s.id;
        update users set is_premium=exists(select 1 from subscriptions where user_id=s.user_id and status='active') where id=s.user_id;
      end if;
    else raise exception 'Invalid subscription event'; end if;
  end if;
  if referrer is not null then
    insert into referral_commissions(referrer_id,referred_user_id,transaction_id,transaction_type,gross_transaction_amount,platform_fee_amount,commission_amount,idempotency_key,currency)
      values(referrer,coalesce(t.user_id,s.user_id),coalesce(t.id,s.id)::text,case when t.id is null then 'subscription' else 'tip' end,gross,fee,fee*0.1,p_provider||':'||p_event_id,coalesce(t.currency,s.currency));
  end if;
  insert into financial_audit_log(target_user_id,action,provider,provider_event_id,correlation_id,metadata)
    values(coalesce(t.user_id,s.user_id),'payment_processed',p_provider,p_event_id,p_correlation_id,p_payload);
  return true;
end $$;

CREATE FUNCTION public.process_refund_event(p_provider text, p_refund_id text, p_payment_id text, p_amount_minor bigint, p_currency text, p_correlation_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare c payment_captures; previous payment_refunds; receipt refund_inbox; t event_tickets; referrer uuid; total bigint; wallet record; pending payout_requests; applied boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||p_payment_id,0));
  select * into c from payment_captures where provider=p_provider and payment_id=p_payment_id;
  if not found or c.entity_type<>'ticket' then
    applied:=process_refund_event_047(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id);
    update payment_returns r set status='completed',claim_token=null,claimed_at=null where r.provider=p_provider and r.payment_id=p_payment_id and exists(select 1 from payment_captures x where x.provider=p_provider and x.payment_id=p_payment_id and refunded_minor=charged_minor);
    return applied;
  end if;
  if p_refund_id is null or length(p_refund_id) not between 1 and 150 or p_amount_minor is null or p_amount_minor<=0 or p_currency is null then raise exception 'Invalid refund' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':refund:'||p_refund_id,0));
  select * into receipt from refund_inbox where provider=p_provider and refund_id=p_refund_id;
  if found and (receipt.payment_id<>p_payment_id or receipt.amount_minor<>p_amount_minor or receipt.currency<>p_currency) then raise exception 'Refund identity conflict' using errcode='P1001'; end if;
  select referrer_id into referrer from referral_commissions where idempotency_key=p_provider||':'||c.event_id and c.credited;
  perform 1 from users where id in (c.user_id,c.recipient_id,referrer) order by id for update;
  select * into t from event_tickets where id=c.entity_id;
  perform 1 from events where id=t.event_id for update;
  select * into t from event_tickets where id=c.entity_id for update;
  select * into previous from payment_refunds where provider=p_provider and refund_id=p_refund_id;
  if found then
    if previous.payment_id<>p_payment_id or previous.amount_minor<>p_amount_minor or previous.currency<>p_currency then raise exception 'Refund identity conflict' using errcode='P1001'; end if;
    return false;
  end if;
  if c.currency<>p_currency or c.refunded_minor+p_amount_minor>c.charged_minor then raise exception 'Refund amount or currency mismatch' using errcode='P1002'; end if;
  total:=c.refunded_minor+p_amount_minor;
  insert into payment_refunds(provider,refund_id,payment_id,amount_minor,currency,correlation_id) values(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id);
  update payment_captures set refunded_minor=total where provider=p_provider and payment_id=p_payment_id;
  if c.credited then
    update event_revenue set amount=round(original_amount*(c.charged_minor-total)/c.charged_minor,2) where ticket_id=t.id;
    update referral_commissions set commission_amount=round(original_commission_amount*(c.charged_minor-total)/c.charged_minor,4),reversed_at=case when total=c.charged_minor then now() else null end where idempotency_key=p_provider||':'||c.event_id;
  end if;
  if total=c.charged_minor and (c.credited or not exists(select 1 from payment_captures where entity_type='ticket' and entity_id=t.id and credited and refunded_minor<charged_minor)) then update event_tickets set status='refunded' where id=t.id; end if;
  for wallet in select c.recipient_id as user_id,c.currency as currency where c.credited union select referrer,c.currency where referrer is not null loop
    for pending in select * from payout_requests where user_id=wallet.user_id and currency=wallet.currency and status='pending' order by created_at desc,id for update loop
      exit when (creator_balance(wallet.user_id,wallet.currency)->>'available')::numeric>=0;
      update payout_requests set status='cancelled',last_error='Cancelled after payment refund' where id=pending.id;
      insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
        values(wallet.user_id,'payout_cancelled_after_refund',pending.amount,pending.currency,p_provider,p_refund_id,p_correlation_id,jsonb_build_object('payout_id',pending.id));
    end loop;
  end loop;
  insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(c.user_id,'payment_refunded',p_amount_minor::numeric/100,p_currency,p_provider,p_refund_id,p_correlation_id,jsonb_build_object('payment_id',p_payment_id,'entity_type','ticket','entity_id',t.id,'total_refunded_minor',total));
  if total=c.charged_minor then
    update payment_returns set status='completed',claim_token=null,claimed_at=null where provider=p_provider and payment_id=p_payment_id;
    insert into notifications(user_id,type,entity_type,entity_id,message) values(c.user_id,'event_ticket_refunded','event',t.event_id,'Your event payment was refunded.');
  end if;
  update refund_inbox set status='processed',claimed_at=null where provider=p_provider and refund_id=p_refund_id;
  return true;
end $$;

CREATE FUNCTION public.process_refund_event_047(p_provider text, p_refund_id text, p_payment_id text, p_amount_minor bigint, p_currency text, p_correlation_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare capture payment_captures; previous payment_refunds; receipt refund_inbox; t tips; referrer uuid; total bigint; reversal record; wallet record; pending payout_requests; new_end timestamptz;
begin
  if p_provider is null or p_provider not in ('paystack','dodopayments') or p_refund_id is null or length(p_refund_id) not between 1 and 150
    or p_payment_id is null or length(p_payment_id) not between 1 and 150 or p_amount_minor is null or p_amount_minor<=0 or p_currency is null or p_currency not in ('USD','NGN','EUR') then raise exception 'Invalid refund' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||p_payment_id,0));
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':refund:'||p_refund_id,0));
  select * into receipt from refund_inbox where provider=p_provider and refund_id=p_refund_id;
  if found and (receipt.payment_id<>p_payment_id or receipt.amount_minor<>p_amount_minor or receipt.currency<>p_currency) then raise exception 'Refund identity conflict' using errcode='P1001'; end if;
  insert into refund_inbox(provider,refund_id,payment_id,amount_minor,currency,correlation_id) values(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id) on conflict do nothing;
  select * into capture from payment_captures where provider=p_provider and payment_id=p_payment_id;
  if not found then return null; end if;
  select referrer_id into referrer from referral_commissions where idempotency_key=p_provider||':'||capture.event_id and capture.credited;
  perform 1 from users where id in (capture.user_id,capture.recipient_id,referrer) order by id for update;
  select * into capture from payment_captures where provider=p_provider and payment_id=p_payment_id for update;
  select * into previous from payment_refunds where provider=p_provider and refund_id=p_refund_id;
  if found then
    if previous.payment_id<>p_payment_id or previous.amount_minor<>p_amount_minor or previous.currency<>p_currency then raise exception 'Refund identity conflict' using errcode='P1001'; end if;
    update refund_inbox set status='processed',claimed_at=null where provider=p_provider and refund_id=p_refund_id;
    return false;
  end if;
  if capture.currency<>p_currency or capture.refunded_minor+p_amount_minor>capture.charged_minor then raise exception 'Refund amount or currency mismatch' using errcode='P1002'; end if;
  insert into payment_refunds(provider,refund_id,payment_id,amount_minor,currency,correlation_id) values(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id);
  total:=capture.refunded_minor+p_amount_minor;
  update payment_captures set refunded_minor=total where provider=p_provider and payment_id=p_payment_id;
  if capture.credited and capture.entity_type='tip' then
    select * into t from tips where id=capture.entity_id for update;
    update tips set refunded_recipient_amount=round(coalesce(recipient_amount,creator_amount)*total/capture.charged_minor,2),
      status=case when total=capture.charged_minor then 'refunded' else 'completed' end where id=t.id;
    if total=capture.charged_minor then
      for reversal in select l.* from xp_ledger l join outbox_events e on l.event_key=coalesce(e.payload->>'eventKey','outbox:'||e.id::text)
        where e.aggregate_type='tip' and e.aggregate_id=t.id::text and e.event_type='award_xp' and l.user_id=t.user_id loop
        insert into xp_reversals(user_id,event_key,amount) values(reversal.user_id,reversal.event_key,reversal.amount) on conflict do nothing;
        if found then update users set xp=greatest(0,xp-reversal.amount) where id=reversal.user_id; end if;
      end loop;
    end if;
  elsif capture.credited then
    select max(period_end) into new_end from payment_captures where entity_type='subscription' and entity_id=capture.entity_id and credited and refunded_minor<charged_minor;
    update subscriptions set current_period_end=new_end,status=case when new_end>now() then 'active' else 'expired' end where id=capture.entity_id;
    perform refresh_premium_access(capture.user_id);
    if p_provider='dodopayments' and (new_end is null or new_end<=now()) then
      insert into subscription_cancellations(subscription_id,correlation_id) values(capture.entity_id,p_correlation_id) on conflict do nothing;
      if found then insert into financial_audit_log(target_user_id,action,provider,correlation_id,metadata)
        values(capture.user_id,'subscription_cancellation_requested',p_provider,p_correlation_id,jsonb_build_object('subscription_id',capture.entity_id,'reason','fully_refunded')); end if;
    end if;
  end if;
  update referral_commissions set commission_amount=round(original_commission_amount*(capture.charged_minor-total)/capture.charged_minor,4),
    reversed_at=case when total=capture.charged_minor then now() else null end where idempotency_key=p_provider||':'||capture.event_id and capture.credited;
  for wallet in select capture.recipient_id as user_id,capture.currency as currency where capture.recipient_id is not null
    union select referrer,capture.currency where referrer is not null loop
    for pending in select * from payout_requests where user_id=wallet.user_id and currency=wallet.currency and status='pending' order by created_at desc,id for update loop
      exit when (creator_balance(wallet.user_id,wallet.currency)->>'available')::numeric>=0;
      update payout_requests set status='cancelled',last_error='Cancelled after payment refund' where id=pending.id;
      insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
        values(wallet.user_id,'payout_cancelled_after_refund',pending.amount,pending.currency,p_provider,p_refund_id,p_correlation_id,jsonb_build_object('payout_id',pending.id));
    end loop;
  end loop;
  if capture.credited and capture.recipient_id is not null then
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
      values(capture.recipient_id,'tip_refunded',capture.user_id,'tip',capture.entity_id,'A tip was refunded. Check your earnings.');
  end if;
  insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(capture.user_id,'payment_refunded',p_amount_minor::numeric/100,p_currency,p_provider,p_refund_id,p_correlation_id,
      jsonb_build_object('payment_id',p_payment_id,'entity_type',capture.entity_type,'entity_id',capture.entity_id,'total_refunded_minor',total));
  update refund_inbox set status='processed',claimed_at=null where provider=p_provider and refund_id=p_refund_id;
  return true;
end $$;

CREATE FUNCTION public.process_subscription_webhook(p_event text, p_user_id uuid, p_subscription_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF p_event = 'subscription.activated' THEN
    UPDATE public.users SET is_premium = true WHERE id = p_user_id;
    IF p_subscription_id IS NOT NULL THEN
      UPDATE public.subscriptions
      SET status = 'active', activated_at = now()
      WHERE id = p_subscription_id;
    END IF;
  ELSIF p_event = 'subscription.cancelled' THEN
    UPDATE public.users SET is_premium = false WHERE id = p_user_id;
    IF p_subscription_id IS NOT NULL THEN
      UPDATE public.subscriptions
      SET status = 'cancelled', cancelled_at = now()
      WHERE id = p_subscription_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported subscription event: %', p_event;
  END IF;
END;
$$;

CREATE FUNCTION public.public_reading_year_snapshot(p_user uuid, p_year integer) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with completed as materialized(select * from reading_year_books(p_user,p_year,true)),genres as(select genre,count(*) as n from completed cross join lateral unnest(genres) genre group by genre order by n desc,genre limit 3)
  select jsonb_build_object('userId',u.id,'displayName',u.display_name,'year',p_year,'booksRead',(select count(*) from completed),'pagesRead',(select coalesce(sum(pages),0) from completed),'topGenres',coalesce((select jsonb_agg(genre order by n desc,genre) from genres),'[]'::jsonb))
  from users u where u.id=p_user and not u.is_banned and u.deleted_at is null;
$$;

CREATE FUNCTION public.publish_writing_prompt(p_date date, p_text text, p_theme text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare prompt writing_prompts;
begin
  if p_date is null or p_text is null or length(p_text) not between 10 and 500 or length(p_theme)>100 then raise exception 'Invalid daily prompt' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended('writing-prompt:'||p_date::text,0));
  select * into prompt from writing_prompts where prompt_date=p_date order by created_at,id limit 1 for update;
  if found then return jsonb_build_object('prompt',to_jsonb(prompt),'created',false); end if;
  insert into writing_prompts(prompt_date,prompt_text,topic_seed,is_active) values(p_date,p_text,p_theme,true) returning * into prompt;
  return jsonb_build_object('prompt',to_jsonb(prompt),'created',true);
end $$;

CREATE FUNCTION public.queue_paid_digest_audience(p_limit integer DEFAULT 40) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare campaign digest_email_campaigns;recipient record;seen integer;last_id uuid;queued integer:=0;inserted integer;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid page' using errcode='P1004';end if;
 insert into digest_email_campaigns(period_start)values((date_trunc('week',now()at time zone 'UTC'))::date)on conflict do nothing;
 if(select count(*)from(select 1 from digest_deliveries where status='pending' or status='failed' and attempts<3 limit 80)pending)>=80 then return 0;end if;
 for campaign in select * from digest_email_campaigns where not audience_complete order by period_start limit 10 for update skip locked loop
  seen:=0;last_id:=campaign.user_cursor;
  for recipient in select id from users where(campaign.user_cursor is null or id>campaign.user_cursor)and not is_banned and deleted_at is null and email_verified and email is not null and email_digest_enabled and has_premium_access(id)order by id limit p_limit loop
   seen:=seen+1;last_id:=recipient.id;
   insert into digest_deliveries(user_id,period_start,status,attempts)values(recipient.id,campaign.period_start,'pending',0)on conflict do nothing;get diagnostics inserted=row_count;queued:=queued+inserted;
  end loop;
  update digest_email_campaigns set user_cursor=last_id,audience_complete=seen<p_limit where period_start=campaign.period_start;
 end loop;
 return queued;
end $$;

CREATE FUNCTION public.queue_release_email_audience(p_campaigns integer DEFAULT 10, p_followers integer DEFAULT 40) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare campaign release_email_campaigns;post author_posts;follower record;seen integer;last_id uuid;queued integer:=0;inserted integer;
begin
 if p_campaigns is null or p_campaigns not between 1 and 20 or p_followers is null or p_followers not between 1 and 100 then raise exception 'Invalid audience page' using errcode='P1004';end if;
 if(select count(*)from(select 1 from release_email_deliveries where status='pending' or status='failed' and attempts<3 limit 80)pending)>=80 then return 0;end if;
 for campaign in select * from release_email_campaigns where not audience_complete order by created_at,post_id limit p_campaigns for update skip locked loop
  select * into post from author_posts where id=campaign.post_id;
  if not found or post.type<>'announcement' or post.book_id is null or not author_owns_book(post.author_id,post.book_id)then update release_email_campaigns set audience_complete=true where post_id=campaign.post_id;continue;end if;
  seen:=0;last_id:=campaign.follower_cursor;
  for follower in select f.follower_id,u.email,u.email_verified,u.is_banned,u.deleted_at,u.notify_new_releases from follows f join users u on u.id=f.follower_id where f.following_id=post.author_id and f.created_at<=post.created_at and(campaign.follower_cursor is null or f.follower_id>campaign.follower_cursor)order by f.follower_id limit p_followers loop
   seen:=seen+1;last_id:=follower.follower_id;
   if follower.email is not null and follower.email_verified and not follower.is_banned and follower.deleted_at is null and follower.notify_new_releases and has_premium_access(follower.follower_id)then insert into release_email_deliveries(post_id,user_id)values(post.id,follower.follower_id)on conflict do nothing;get diagnostics inserted=row_count;queued:=queued+inserted;end if;
  end loop;
  update release_email_campaigns set follower_cursor=last_id,audience_complete=seen<p_followers where post_id=campaign.post_id;
 end loop;
 return queued;
end $$;

CREATE FUNCTION public.queue_review_conversion_reward() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.reviewer_id is not null then
    insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('review_conversions',new.actor_id::text||':'||new.book_id::text,'award_xp',jsonb_build_object('userId',new.reviewer_id,'amount',5,'reason','want_to_read_received','eventKey','review-conversion:'||new.actor_id||':'||new.book_id));
  end if;
  return new;
end $$;

CREATE FUNCTION public.queue_uncredited_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not new.credited then
    insert into payment_returns(provider,payment_id,reason) values(new.provider,new.payment_id,'uncredited_payment') on conflict do nothing;
  end if;
  return new;
end $$;

CREATE FUNCTION public.quote_catalog_snapshot(p_user uuid, p_owner uuid DEFAULT NULL::uuid, p_book uuid DEFAULT NULL::uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare edition uuid;owner_id uuid:=coalesce(p_owner,p_user);
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_book is null then
    if not exists(select 1 from users where id=owner_id and not is_banned and deleted_at is null) then raise exception 'Reader unavailable' using errcode='P1005';end if;
    if not reading_author_visible(p_user,owner_id) then raise exception 'Reader unavailable' using errcode='P1003';end if;
  else
    select coalesce(canonical_edition_id,id) into edition from books where id=p_book;
    if not found then raise exception 'Edition unavailable' using errcode='P1005';end if;
  end if;
  return(with eligible as materialized(select q.id,q.content,q.page_number,q.user_id,q.book_id,q.created_at from quotes q join books b on b.id=q.book_id
    where not q.is_hidden and(case when p_book is null then q.user_id=owner_id else coalesce(b.canonical_edition_id,b.id)=edition end)and reading_author_visible(p_user,q.user_id)),
    page as materialized(select * from eligible where p_at is null or(created_at,id)<(p_at,p_id) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('quotes',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'content',p.content,'page_number',p.page_number,'user_id',p.user_id,'book_id',p.book_id,'created_at',p.created_at,
      'books',reading_edition_document(p.book_id),'users',jsonb_build_object('username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url)) order by p.created_at desc,p.id desc) from page p join users u on u.id=p.user_id),'[]'::jsonb),'total',(select count(*) from eligible)));
end $$;

CREATE FUNCTION public.read_creator_analytics(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object(
    'follower_count',(select count(*) from follows where following_id=p_user_id),
    'review_count',(select count(*) from reviews where user_id=p_user_id and moderation_status='published' and not is_hidden),
    'want_to_read_triggered',(select count(*) from review_conversions where reviewer_id=p_user_id),
    'tips_received',(creator_balance(p_user_id,'USD')->>'tips')::numeric,
    'tips_received_by_currency',(select jsonb_object_agg(currency,(creator_balance(p_user_id,currency)->>'tips')::numeric) from unnest(array['USD','NGN','EUR']) currency)
  );
$$;

CREATE FUNCTION public.read_creator_leaderboard() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with ranked as (
    select u.id as user_id,u.username,u.display_name,u.avatar_url,u.user_types,u.is_verified_author,count(*)::integer as want_to_read_score
    from review_conversions c join users u on u.id=c.reviewer_id
    where c.created_at>=(date_trunc('week',now() at time zone 'UTC') at time zone 'UTC')
      and not u.is_banned and u.deleted_at is null and u.profile_visibility='public'
      and (u.is_creator or u.is_verified_author or u.user_types&&array['creator','author'])
    group by u.id order by count(*) desc,u.username,u.id limit 50
  ) select jsonb_build_object('leaderboard',coalesce(jsonb_agg(to_jsonb(ranked)||jsonb_build_object('total_score',want_to_read_score)
    order by want_to_read_score desc,username,user_id),'[]'::jsonb),
    'week_start',date_trunc('week',now() at time zone 'UTC') at time zone 'UTC') from ranked;
$$;

CREATE FUNCTION public.read_factor_session(p_hash text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',u.id,'email',coalesce(u.email,''),'mfaVersion',u.mfa_version)
    from auth_factor_grants g join users u on u.id=g.user_id where g.session_hash=p_hash and g.mfa_version=u.mfa_version and g.expires_at>now() and u.deleted_at is null and not u.is_banned;
$$;

CREATE FUNCTION public.read_payment_recovery(p_user_id uuid, p_kind text, p_entity_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_kind is null or p_kind not in ('tip','subscription','ticket') then raise exception 'Invalid recovery scope' using errcode='P1004'; end if;
  if not exists(select 1 from users where id=p_user_id and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'charged_minor',charged::text,'refunded_minor',refunded::text,'count',count)) from (
    select currency,sum(charged_minor) as charged,sum(refunded_minor) as refunded,count(*) as count from payment_captures where user_id=p_user_id and entity_type=p_kind and (p_entity_id is null or entity_id=p_entity_id) and not credited group by currency
  ) grouped),'[]'::jsonb);
end $$;

CREATE FUNCTION public.read_room_posts(p_user_id uuid, p_room_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
  if not reading_room_visible(p_room_id,p_user_id) then raise exception 'Room unavailable' using errcode='P1003'; end if;
  select coalesce(jsonb_agg(row_to_json(page) order by created_at,id),'[]'::jsonb) into result from (
    select p.id,p.content,p.milestone_id,p.created_at,jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url) as users
    from reading_room_posts p join users u on u.id=p.user_id left join reading_room_milestones m on m.id=p.milestone_id and m.room_id=p.room_id
    where p.room_id=p_room_id and (p.milestone_id is null or m.unlock_date<=now()) order by p.created_at,p.id limit 100
  ) page;
  return result;
end $$;

CREATE FUNCTION public.read_social_feed(p_user_id uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_kind text DEFAULT NULL::text, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 or not((p_at is null and p_id is null and p_kind is null) or (p_at is not null and p_id is not null and p_kind is not null and p_kind in ('sb','rv'))) then raise exception 'Invalid feed cursor' using errcode='P1004';end if;
  if not exists(select 1 from users where id=p_user_id and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  with followed as (
    select u.id,u.display_name,u.username,u.avatar_url,u.shelf_visibility from follows f join users u on u.id=f.following_id
    where f.follower_id=p_user_id and not u.is_banned and u.deleted_at is null and u.profile_visibility in ('public','followers_only')
  ), candidates as (
    select 'sb'::text as kind,sb.id,sb.added_at as at,b.id as book_id,jsonb_build_object('type','shelf_book','id','sb-'||sb.id,'timestamp',sb.added_at,'userId',u.id,
      'user',jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url),
      'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url),
      'shelf',jsonb_build_object('name',s.name,'default_type',s.default_type),'finishedAt',sb.finished_at) as item
    from followed u join shelf_books sb on sb.user_id=u.id join shelves s on s.id=sb.shelf_id and s.user_id=u.id join books source on source.id=sb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
    where s.is_public and u.shelf_visibility in ('public','followers_only')
    union all
    select 'rv',r.id,r.created_at,b.id,jsonb_build_object('type','review','id','rv-'||r.id,'reviewId',r.id,'timestamp',r.created_at,'userId',u.id,
      'user',jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url),
      'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url),
      'rating',r.rating,'reviewType',r.review_type,'excerpt',left(r.content,200),'hasSpoilers',r.has_spoilers)
    from followed u join reviews r on r.user_id=u.id join books source on source.id=r.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id) where r.moderation_status='published' and not r.is_hidden
  ), page as (
    select * from candidates where p_at is null or (at,kind,id)<(p_at,p_kind,p_id) order by at desc,kind desc,id desc limit p_limit+1
  ) select coalesce(jsonb_agg(item||jsonb_build_object('wantToRead',exists(select 1 from shelf_books mine join shelves own on own.id=mine.shelf_id where mine.user_id=p_user_id and own.user_id=p_user_id and own.default_type='want_to_read' and mine.book_id=any(book_edition_family(page.book_id)))) order by at desc,kind desc,id desc),'[]'::jsonb) into result from page;
  return result;
end $$;

CREATE FUNCTION public.reading_author_visible(p_user uuid, p_author uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists(select 1 from users u where u.id=p_author and not u.is_banned and u.deleted_at is null and(u.profile_visibility='public' or u.id=p_user or exists(select 1 from follows f join users viewer on viewer.id=f.follower_id where f.follower_id=p_user and f.following_id=u.id and not viewer.is_banned and viewer.deleted_at is null)));
$$;

CREATE FUNCTION public.reading_challenge_catalog_snapshot(p_user uuid, p_scope text DEFAULT 'active'::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_scope not in('active','mine')then raise exception 'Invalid catalog' using errcode='P1004';end if;
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
  return(with page as materialized(select c.id,c.created_at from challenges c where(case when p_scope='mine' then exists(select 1 from challenge_participants where challenge_id=c.id and user_id=p_user)else c.is_active and coalesce(c.start_date<=now(),true)and coalesce(c.end_date>now(),true)end)
    and(p_at is null or(c.created_at,c.id)<(p_at,p_id))order by c.created_at desc,c.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('challenges',coalesce((select jsonb_agg(reading_challenge_document(p_user,id)order by created_at desc,id desc)from page),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.reading_challenge_detail_snapshot(p_user uuid, p_challenge uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare document jsonb;
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
  document:=reading_challenge_document(p_user,p_challenge);if document is null then raise exception 'Challenge unavailable' using errcode='P1005';end if;
  return(with page as materialized(select u.id,u.username,u.display_name,u.avatar_url,m.joined_at from challenge_participants m join users u on u.id=m.user_id where m.challenge_id=p_challenge and(p_at is null or(m.joined_at,m.user_id)>(p_at,p_id))order by m.joined_at,m.user_id limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('challenge',document,'participants',coalesce((select jsonb_agg(to_jsonb(page)order by joined_at,id)from page),'[]'::jsonb))||reading_challenge_progress(p_user,p_challenge));
end $$;

CREATE FUNCTION public.reading_challenge_document(p_user uuid, p_challenge uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'type',c.type,'cadence',c.cadence,'start_date',c.start_date,'end_date',c.end_date,'is_active',c.is_active,'goal_books',c.goal_books,'goal_pages',c.goal_pages,'created_at',c.created_at,
    'participant_count',(select count(*)from challenge_participants where challenge_id=c.id),'joined',exists(select 1 from challenge_participants where challenge_id=c.id and user_id=p_user),
    'can_join',c.is_active and coalesce(c.start_date<=now(),true)and coalesce(c.end_date>now(),true)and not exists(select 1 from challenge_participants where challenge_id=c.id and user_id=p_user))
  from challenges c where c.id=p_challenge;
$$;

CREATE FUNCTION public.reading_challenge_progress(p_user_id uuid, p_challenge_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target challenges;participant challenge_participants;books_finished integer;pages_read bigint;
begin
  select * into target from challenges where id=p_challenge_id;if not found then raise exception 'Challenge not found' using errcode='P1005';end if;
  select * into participant from challenge_participants where challenge_id=target.id and user_id=p_user_id;
  if not found then return jsonb_build_object('joined',false,'progress',null);end if;
  select count(*)::integer,coalesce(sum(pages),0)into books_finished,pages_read from(
    select distinct on(canonical_book_work(b.work_id))canonical_book_work(b.work_id)as work_id,coalesce(b.page_count,greatest(0,sb.progress_pages),0)as pages
    from shelf_books sb join shelves s on s.id=sb.shelf_id join books source on source.id=sb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
    where sb.user_id=p_user_id and s.user_id=p_user_id and s.default_type='have_read'
      and sb.finished_at>=(greatest(coalesce(target.start_date,'-infinity'::timestamptz),participant.joined_at)at time zone 'UTC')::date
      and sb.finished_at<=(now()at time zone 'UTC')::date and(target.end_date is null or(sb.finished_at::timestamp at time zone 'UTC')<target.end_date)
    order by canonical_book_work(b.work_id),sb.finished_at desc,sb.id desc
  )finished;
  return jsonb_build_object('joined',true,'joinedAt',participant.joined_at,'progress',jsonb_build_object('booksFinished',books_finished,'pagesRead',pages_read,'goalBooks',target.goal_books,'goalPages',target.goal_pages,
    'booksPercent',case when target.goal_books>0 then least(100,round(books_finished*100.0/target.goal_books))end,'pagesPercent',case when target.goal_pages>0 then least(100,round(pages_read*100.0/target.goal_pages))end));
end $$;

CREATE FUNCTION public.reading_edition_document(p_book uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'isbn_10',b.isbn_10,'isbn_13',b.isbn_13,'language',b.language,'format',b.format)
  from books source join books b on b.id=coalesce(source.canonical_edition_id,source.id) where source.id=p_book;
$$;

CREATE FUNCTION public.reading_goal_snapshot(p_user_id uuid, p_year integer) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with goal as(select * from reading_goals where user_id=p_user_id and year=p_year),completed as(
    select count(distinct canonical_book_work(b.work_id))::integer as count from shelf_books sb join shelves s on s.id=sb.shelf_id join books b on b.id=sb.book_id
    where s.user_id=p_user_id and sb.user_id=p_user_id and s.default_type='have_read' and sb.finished_at>=make_date(p_year,1,1) and sb.finished_at<make_date(p_year+1,1,1)
  ) select jsonb_build_object('goal',(select to_jsonb(goal) from goal),'progress',jsonb_build_object('books_read',completed.count,'year',p_year,'percentage',(select least(100,round(completed.count*100.0/target_books)) from goal))) from completed;
$$;

CREATE FUNCTION public.reading_list_visible(p_viewer uuid,p_list uuid)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
 select exists(select 1 from reading_lists l where l.id=p_list and reading_author_visible(p_viewer,l.user_id)and(l.is_public or l.user_id=p_viewer))
$$;

CREATE FUNCTION public.public_sitemap_partition_count()RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
 select greatest(1,ceil(sum(parts)/5000.0)::integer)from(
  select ceil(count(*)/1000.0)parts from books where canonical_edition_id is null
  union all select ceil(count(*)/1000.0)from users where is_verified_author and not is_banned and deleted_at is null and profile_visibility='public'
  union all select ceil(count(*)/1000.0)from reading_lists l join users u on u.id=l.user_id where l.is_public and not u.is_banned and u.deleted_at is null and u.profile_visibility='public'
 )counts
$$;

CREATE FUNCTION public.public_sitemap_partitions(p_page integer DEFAULT 0)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
begin
 if p_page is null or p_page<0 or p_page>214748 then raise exception 'Invalid sitemap index'using errcode='P1004';end if;
 return(with entries as(
  select 'books'kind,id from books where canonical_edition_id is null
  union all select 'authors',id from users where is_verified_author and not is_banned and deleted_at is null and profile_visibility='public'
  union all select 'lists',l.id from reading_lists l join users u on u.id=l.user_id where l.is_public and not u.is_banned and u.deleted_at is null and u.profile_visibility='public'
 ),numbered as(select kind,id,row_number()over(partition by kind order by id)position from entries),anchors as(
  select kind,case when position=1 then '00000000-0000-0000-0000-000000000000'::uuid else id end first,lead(id)over(partition by kind order by id)until from numbered where(position-1)%1000=0
 ),page as(select * from anchors order by kind,first limit 5000 offset p_page*5000)
 select coalesce(jsonb_agg(to_jsonb(page)order by kind,first),'[]'::jsonb)from page);
end $$;

CREATE FUNCTION public.public_sitemap_page(p_kind text,p_first uuid,p_until uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
begin
 if p_kind is null or p_kind not in('books','authors','lists')or p_first is null or p_until<=p_first then raise exception 'Invalid sitemap page'using errcode='P1004';end if;
 if p_kind='books'then return(select coalesce(jsonb_agg(to_jsonb(page)order by id),'[]'::jsonb)from(select id,'/book/'||id path,updated_at from books where canonical_edition_id is null and id>=p_first and(p_until is null or id<p_until)order by id limit 5001)page);
 elsif p_kind='authors'then return(select coalesce(jsonb_agg(to_jsonb(page)order by id),'[]'::jsonb)from(select id,'/author/'||username path,updated_at from users where is_verified_author and not is_banned and deleted_at is null and profile_visibility='public'and id>=p_first and(p_until is null or id<p_until)order by id limit 5001)page);
 else return(select coalesce(jsonb_agg(to_jsonb(page)order by id),'[]'::jsonb)from(select l.id,'/lists/'||l.id path,l.updated_at from reading_lists l join users u on u.id=l.user_id where l.is_public and not u.is_banned and u.deleted_at is null and u.profile_visibility='public'and l.id>=p_first and(p_until is null or l.id<p_until)order by l.id limit 5001)page);end if;
end $$;

CREATE FUNCTION public.reading_list_catalog_snapshot(p_user uuid, p_scope text DEFAULT 'mine'::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_scope not in('mine','followed') then raise exception 'Invalid scope' using errcode='P1004';end if;
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  return(with page as materialized(select l.id,l.created_at from reading_lists l where
    (case when p_scope='mine' then l.user_id=p_user else l.is_public and reading_list_visible(p_user,l.id)and exists(select 1 from reading_list_follows where list_id=l.id and user_id=p_user) end)
    and(p_at is null or(l.created_at,l.id)<(p_at,p_id)) order by l.created_at desc,l.id desc limit greatest(1,least(coalesce(p_limit,50),50))+1)
    select jsonb_build_object('lists',coalesce((select jsonb_agg(reading_list_document(p_user,id) order by created_at desc,id desc) from page),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.reading_list_detail_snapshot(p_user uuid, p_list uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare document jsonb;
begin
  if p_user is not null and not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  document:=reading_list_document(p_user,p_list);
  if document is null then raise exception 'List unavailable' using errcode='P1005';end if;
  return(with entries as materialized(select distinct on(b.id) b.id,b.title,b.author_name,b.cover_url,b.isbn_10,b.isbn_13,b.language,b.format,lb.added_at
    from reading_list_books lb join books source on source.id=lb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
    where lb.list_id=p_list order by b.id,lb.added_at desc,lb.book_id desc),page as materialized(select * from entries where p_at is null or(added_at,id)<(p_at,p_id) order by added_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('list',document,'books',coalesce((select jsonb_agg(to_jsonb(page) order by added_at desc,id desc) from page),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.reading_list_document(p_user uuid, p_list uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',l.id,'user_id',l.user_id,'name',l.name,'description',l.description,'is_public',l.is_public,'created_at',l.created_at,'updated_at',l.updated_at,
    'book_count',(select count(distinct coalesce(b.canonical_edition_id,b.id)) from reading_list_books lb join books b on b.id=lb.book_id where lb.list_id=l.id),
    'follower_count',(select count(*) from reading_list_follows where list_id=l.id),'is_following',exists(select 1 from reading_list_follows where list_id=l.id and user_id=p_user))
  from reading_lists l where l.id=p_list and reading_list_visible(p_user,l.id);
$$;

CREATE FUNCTION public.reading_room_catalog_snapshot(p_user uuid, p_scope text DEFAULT 'public'::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if p_scope not in('mine','public') then raise exception 'Invalid catalog' using errcode='P1004';end if;
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  return(with page as materialized(select r.id,r.created_at from reading_rooms r where
    (case when p_scope='mine' then r.created_by=p_user or exists(select 1 from room_participants where room_id=r.id and user_id=p_user)
     else r.is_public and r.is_active and exists(select 1 from users where id=r.created_by and not is_banned and deleted_at is null) end)
    and(p_at is null or(r.created_at,r.id)<(p_at,p_id)) order by r.created_at desc,r.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('rooms',coalesce((select jsonb_agg(reading_room_document(p_user,id) order by created_at desc,id desc) from page),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.reading_room_detail_snapshot(p_user uuid, p_room uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform assert_reading_room_access(p_user,p_room);
  return(with page as materialized(select u.id,u.username,u.display_name,u.avatar_url,m.joined_at from room_participants m join users u on u.id=m.user_id where m.room_id=p_room and(p_at is null or(m.joined_at,m.user_id)<(p_at,p_id)) order by m.joined_at desc,m.user_id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('room',reading_room_document(p_user,p_room),'participants',coalesce((select jsonb_agg(to_jsonb(page) order by joined_at desc,id desc) from page),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.reading_room_document(p_user uuid, p_room uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',r.id,'name',r.name,'book_id',r.book_id,'created_by',r.created_by,'created_at',r.created_at,'is_active',r.is_active,'is_public',r.is_public,
    'member_count',members.total,'is_member',members.mine or r.created_by=p_user,'can_join',not members.mine and r.created_by<>p_user and r.is_active and r.is_public and organizer.active,
    'can_post',r.is_active and(members.mine or r.created_by=p_user),'can_manage',r.is_active and r.created_by=p_user,
    'book',case when b.id is not null then jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'isbn_13',b.isbn_13,'language',b.language,'format',b.format) end)
  from reading_rooms r left join books source on source.id=r.book_id left join books b on b.id=coalesce(source.canonical_edition_id,source.id)
  cross join lateral(select count(*) as total,coalesce(bool_or(user_id=p_user),false) as mine from room_participants where room_id=r.id) members
  cross join lateral(select exists(select 1 from users where id=r.created_by and not is_banned and deleted_at is null) as active) organizer
  where r.id=p_room and reading_room_visible(r.id,p_user);
$$;

CREATE FUNCTION public.reading_room_milestone_snapshot(p_user uuid, p_room uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform assert_reading_room_access(p_user,p_room);
  return(with page as materialized(select m.id,m.room_id,m.created_by,m.title,m.unlock_date,m.created_at,m.unlock_date<=now() as is_unlocked,
    case when m.unlock_date<=now() then(select count(*) from reading_room_posts where milestone_id=m.id and room_id=m.room_id) else 0 end as post_count
    from reading_room_milestones m where room_id=p_room and(p_at is null or(unlock_date,id)>(p_at,p_id)) order by unlock_date,id limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('milestones',coalesce((select jsonb_agg(to_jsonb(page) order by unlock_date,id) from page),'[]'::jsonb),'serverNow',now(),'total',(select count(*) from reading_room_milestones where room_id=p_room)));
end $$;

CREATE FUNCTION public.reading_room_posts_snapshot(p_user uuid, p_room uuid, p_general boolean DEFAULT false, p_milestone uuid DEFAULT NULL::uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform assert_reading_room_access(p_user,p_room);
  if p_milestone is not null and not exists(select 1 from reading_room_milestones where id=p_milestone and room_id=p_room and unlock_date<=now()) then raise exception 'Milestone unavailable' using errcode='P1003';end if;
  return(with page as materialized(select p.id,p.user_id,p.room_id,p.content,p.milestone_id,p.created_at,jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url) as users
    from reading_room_posts p join users u on u.id=p.user_id left join reading_room_milestones m on m.id=p.milestone_id and m.room_id=p.room_id
    where p.room_id=p_room and(p.milestone_id is null or m.unlock_date<=now()) and(not p_general or p.milestone_id is null) and(p_milestone is null or p.milestone_id=p_milestone)
      and(p_at is null or(p.created_at,p.id)<(p_at,p_id)) order by p.created_at desc,p.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('posts',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb)));
end $$;

CREATE FUNCTION public.reading_room_visible(p_room_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists(select 1 from reading_rooms r where r.id=p_room_id and (r.is_public or r.created_by=p_user_id
    or exists(select 1 from room_participants m where m.room_id=r.id and m.user_id=p_user_id)));
$$;

CREATE FUNCTION public.reading_year_books(p_user uuid, p_year integer, p_public boolean DEFAULT false) RETURNS TABLE(work_id uuid, id uuid, title text, author_name text, page_count integer, pages integer, genres text[], finished_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select distinct on(canonical_book_work(b.work_id)) canonical_book_work(b.work_id),b.id,b.title,b.author_name,b.page_count,coalesce(b.page_count,greatest(0,sb.progress_pages),0),b.genres,sb.finished_at
  from shelf_books sb join shelves s on s.id=sb.shelf_id join books source on source.id=sb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
  where sb.user_id=p_user and s.user_id=p_user and s.default_type='have_read' and(not p_public or s.is_public)
    and sb.finished_at>=make_timestamptz(p_year,1,1,0,0,0,'UTC') and sb.finished_at<make_timestamptz(p_year+1,1,1,0,0,0,'UTC')
  order by canonical_book_work(b.work_id),sb.finished_at desc,sb.id desc;
$$;

CREATE FUNCTION public.reading_year_snapshot(p_user uuid, p_year integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare profile users;result jsonb;start_at timestamptz:=make_timestamptz(p_year,1,1,0,0,0,'UTC');end_at timestamptz:=make_timestamptz(p_year+1,1,1,0,0,0,'UTC');
begin
  if p_year not between 1900 and 2200 then raise exception 'Invalid year' using errcode='P1004';end if;
  select * into profile from users where id=p_user and not is_banned and deleted_at is null;
  if not found then return null;end if;
  with completed as materialized(select * from reading_year_books(p_user,p_year)),
  genres as(select genre,count(*) as n from completed cross join lateral unnest(genres) genre group by genre order by n desc,genre limit 3),
  reviews_this_year as materialized(select * from reviews where user_id=p_user and moderation_status='published' and created_at>=start_at and created_at<end_at),
  metrics as(select count(*) as books,coalesce(sum(pages),0) as pages from completed),
  longest as(select title,page_count from completed where page_count>0 order by page_count desc,id limit 1),
  shortest as(select title,page_count from completed where page_count>0 order by page_count,id limit 1),
  month as(select extract(month from finished_at at time zone 'UTC')::int as n,count(*) as total from completed group by n order by total desc,n limit 1)
  select jsonb_build_object('stats',jsonb_build_object(
    'booksReadThisYear',metrics.books,'pagesReadThisYear',metrics.pages,'year',p_year,
    'averageRating',coalesce((select round(avg(rating),2) from reviews_this_year),0),
    'readingPace',round(metrics.books::numeric/case when p_year=extract(year from now() at time zone 'UTC') then extract(month from now() at time zone 'UTC') else 12 end,2),
    'favouriteGenre',(select genre from genres order by n desc,genre limit 1),
    'longestBook',(select to_jsonb(longest) from longest),'readingStreakMax',profile.max_reading_streak,
    'currentReadingStreak',case when profile.last_streak_date>=(now() at time zone 'UTC')::date-1 then profile.reading_streak else 0 end,
    'reviewsWrittenThisYear',(select count(*) from reviews_this_year),
    'quotesSavedThisYear',(select count(*) from quotes where user_id=p_user and not is_hidden and created_at>=start_at and created_at<end_at),
    'goal',reading_goal_snapshot(p_user,p_year)),
    'wrapped',jsonb_build_object('userId',p_user,'displayName',profile.display_name,'year',p_year,'booksRead',metrics.books,'pagesRead',metrics.pages,
      'topGenres',coalesce((select jsonb_agg(genre order by n desc,genre) from genres),'[]'::jsonb),
      'topMood',(select mood from reviews_this_year cross join lateral unnest(mood_tags) mood group by mood order by count(*) desc,mood limit 1),
      'streakMax',profile.max_reading_streak,'totalXp',profile.xp,'yearXp',(select coalesce(sum(amount),0) from xp_ledger where user_id=p_user and created_at>=start_at and created_at<end_at),
      'badgesEarned',(select count(*) from user_badges where user_id=p_user and awarded_at>=start_at and awarded_at<end_at),
      'favouriteAuthor',(select author_name from completed group by author_name order by count(*) desc,author_name limit 1),
      'longestBook',(select jsonb_build_object('title',title,'pageCount',page_count) from longest),
      'shortestBook',(select jsonb_build_object('title',title,'pageCount',page_count) from shortest),
      'mostActiveMonthNumber',(select n from month),'publicSummary',public_reading_year_snapshot(p_user,p_year))) into result from metrics;
  return result;
end $$;

CREATE FUNCTION public.rebuild_reading_streak(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare profile users;after_profile users;day date;last_day date;streak integer:=0;maximum integer:=0;tokens integer:=0;missed integer;reward integer;
  expected jsonb:='{}';entry record;removed jsonb;removed_total integer;
begin
  select * into profile from users where id=p_user_id for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  for day in select activity_date from reading_activity_days where user_id=p_user_id and activity_date<=(now() at time zone 'UTC')::date order by 1 loop
    missed:=greatest(0,day-last_day-1);
    if last_day is null or missed>tokens then streak:=1;else streak:=streak+1;tokens:=tokens-missed;end if;
    if streak in (7,30) then
      tokens:=tokens+1;reward:=case when streak=7 then 50 else 200 end;
      expected:=expected||jsonb_build_object('streak:reading:'||day,jsonb_build_object('amount',reward,'reason','reading_streak_'||streak));
    end if;
    maximum:=greatest(maximum,streak);last_day:=day;
  end loop;
  with deleted as (
    delete from xp_ledger x where user_id=p_user_id and event_key like 'streak:reading:%' and reason in ('reading_streak_7','reading_streak_30')
      and (not(expected?event_key) or amount<>(expected->event_key->>'amount')::integer or reason<>expected->event_key->>'reason') returning x.*
  ) select coalesce(sum(amount),0)::integer,coalesce(jsonb_agg(to_jsonb(deleted)),'[]'::jsonb) into removed_total,removed from deleted;
  if removed_total>0 then update users set xp=greatest(0,xp-removed_total) where id=p_user_id;end if;
  for entry in select key,value from jsonb_each(expected) loop perform award_xp_once(p_user_id,(entry.value->>'amount')::integer,entry.value->>'reason',entry.key);end loop;
  update users set reading_streak=streak,last_streak_date=last_day,streak_freeze_tokens=tokens,max_reading_streak=maximum where id=p_user_id returning * into after_profile;
  if (profile.reading_streak,profile.last_streak_date,profile.streak_freeze_tokens,profile.max_reading_streak,profile.xp)
    is distinct from (after_profile.reading_streak,after_profile.last_streak_date,after_profile.streak_freeze_tokens,after_profile.max_reading_streak,after_profile.xp) then
    insert into financial_audit_log(actor_user_id,action,correlation_id,metadata) values(p_user_id,'reading_streak_reconciled','recorded-reading-dates',jsonb_build_object(
      'before',jsonb_build_object('streak',profile.reading_streak,'lastDay',profile.last_streak_date,'freezeTokens',profile.streak_freeze_tokens,'maximum',profile.max_reading_streak,'xp',profile.xp),
      'after',jsonb_build_object('streak',streak,'lastDay',last_day,'freezeTokens',tokens,'maximum',maximum,'xp',after_profile.xp),'removedRewards',removed));
  end if;
end $$;

CREATE FUNCTION public.recommendation_reader_page(p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 40) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 or(p_at is null)<>(p_id is null)then raise exception 'Invalid reader page' using errcode='P1004';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'created_at',created_at)order by created_at,id),'[]'::jsonb)into result from(
  select u.id,u.created_at from users u where not u.is_banned and u.deleted_at is null and(p_at is null or(u.created_at,u.id)>(p_at,p_id))and(
   select count(distinct canonical_book_work(b.work_id))from shelves s join shelf_books sb on sb.shelf_id=s.id and sb.user_id=u.id join books b on b.id=sb.book_id where s.user_id=u.id and s.default_type='have_read'
  )>=3 order by u.created_at,u.id limit p_limit+1
 )page;
 return result;
end $$;

CREATE FUNCTION public.reconcile_capture_and_refund(p_provider text, p_refund_id text, p_payment_id text, p_amount_minor bigint, p_currency text, p_event_id text, p_payload jsonb, p_correlation_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||p_payment_id,0));
  if p_payload->>'payment_id' is distinct from p_payment_id then raise exception 'Payment identity mismatch' using errcode='P1003'; end if;
  perform process_payment_event(p_provider,p_event_id,p_payload,p_correlation_id);
  return process_refund_event(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id);
end $$;

CREATE FUNCTION public.reconcile_google_play_purchase(p_user_id uuid, p_token_id text, p_product_id text, p_provider_state text, p_period_end timestamp with time zone, p_account_id text, p_linked_token_id text, p_verified_at timestamp with time zone, p_acknowledged boolean, p_correlation_id text, p_delivery_id text DEFAULT NULL::text, p_fingerprint text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare subscription subscriptions; linked_owner uuid; account_owner uuid; receipt billing_webhook_receipts;
  active boolean; next_status text; changed boolean;
begin
  if p_user_id is null or p_token_id is null or p_token_id !~ '^gplay_[a-f0-9]{64}$' or p_product_id is null or length(p_product_id) not between 1 and 150
    or p_provider_state is null or p_provider_state not in ('SUBSCRIPTION_STATE_UNSPECIFIED','SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED')
    or p_verified_at is null or p_verified_at>now()+interval '5 minutes' or p_acknowledged is null then raise exception 'Invalid purchase state' using errcode='P1004'; end if;
  if p_delivery_id is not null then perform pg_advisory_xact_lock(hashtextextended('google_delivery:'||p_delivery_id,0)); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_token_id,0));
  select * into subscription from subscriptions where provider='google_play' and provider_event_id=p_token_id;
  if found and subscription.user_id<>p_user_id then raise exception 'Purchase belongs to another account' using errcode='P1003'; end if;
  select user_id into account_owner from billing_accounts where provider='google_play' and account_id=p_account_id;
  if account_owner is not null and account_owner<>p_user_id then raise exception 'Purchase account mismatch' using errcode='P1003'; end if;
  select user_id into linked_owner from subscriptions where provider='google_play' and provider_event_id=p_linked_token_id;
  if linked_owner is not null and linked_owner<>p_user_id then raise exception 'Linked purchase belongs to another account' using errcode='P1003'; end if;
  if subscription.id is null and account_owner is null and linked_owner is null then raise exception 'Purchase account binding is missing' using errcode='P1003'; end if;
  if subscription.provider_account_id is not null and subscription.provider_account_id is distinct from p_account_id then raise exception 'Purchase account binding changed' using errcode='P1003'; end if;
  perform 1 from users where id=p_user_id for update;
  if not found then raise exception 'Unknown user' using errcode='P1005'; end if;
  if p_delivery_id is not null then
    if length(p_delivery_id) not between 1 and 200 or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid billing delivery' using errcode='P1004'; end if;
    select * into receipt from billing_webhook_receipts where provider='google_play' and delivery_id=p_delivery_id for update;
    if found and receipt.fingerprint<>p_fingerprint then raise exception 'Billing delivery conflict' using errcode='P1001'; end if;
    if found and receipt.status='processed' then return jsonb_build_object('id',subscription.id,'active',coalesce(subscription.status='active' and subscription.current_period_end>now(),false),'expiresAt',subscription.current_period_end,'providerState',subscription.provider_state,'acknowledged',subscription.provider_acknowledged,'replay',true); end if;
  end if;
  active:=p_provider_state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') and p_period_end>now();
  next_status:=case when active then 'active' when p_provider_state='SUBSCRIPTION_STATE_PENDING' then 'pending' else 'expired' end;
  if subscription.id is null then
    insert into subscriptions(user_id,provider,status,amount,currency,provider_event_id,provider_product_id,provider_account_id,provider_state,current_period_end,last_verified_at,provider_acknowledged)
      values(p_user_id,'google_play',next_status,0,'USD',p_token_id,p_product_id,p_account_id,p_provider_state,p_period_end,p_verified_at,p_acknowledged) returning * into subscription;
    changed:=true;
  elsif subscription.last_verified_at is null or p_verified_at>=subscription.last_verified_at then
    changed:=subscription.status is distinct from next_status or subscription.current_period_end is distinct from p_period_end or subscription.provider_state is distinct from p_provider_state;
    update subscriptions set status=next_status,current_period_end=p_period_end,provider_state=p_provider_state,last_verified_at=p_verified_at,
      provider_product_id=p_product_id,provider_account_id=coalesce(provider_account_id,p_account_id),provider_acknowledged=p_acknowledged where id=subscription.id returning * into subscription;
  end if;
  if changed then
    insert into financial_audit_log(actor_user_id,target_user_id,action,provider,provider_event_id,correlation_id,metadata)
      values(p_user_id,p_user_id,'google_play_entitlement_verified','google_play',p_token_id,p_correlation_id,jsonb_build_object('state',p_provider_state,'expires_at',p_period_end,'product_id',p_product_id));
  end if;
  if p_delivery_id is not null then
    insert into billing_webhook_receipts(provider,delivery_id,fingerprint,status) values('google_play',p_delivery_id,p_fingerprint,
      case when active and not p_acknowledged then 'pending_ack' else 'processed' end) on conflict do nothing;
  end if;
  perform refresh_premium_access(p_user_id);
  return jsonb_build_object('id',subscription.id,'active',coalesce(subscription.status='active' and subscription.current_period_end>now(),false),'expiresAt',subscription.current_period_end,'providerState',subscription.provider_state,'acknowledged',subscription.provider_acknowledged,'replay',false);
end $_$;

CREATE FUNCTION public.reconcile_payment_return(p_actor uuid, p_provider text, p_payment_id text, p_refund_id text, p_key text, p_evidence jsonb, p_correlation_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare c payment_captures; previous content_intents; referrer uuid; result jsonb; fingerprint text:=jsonb_build_array(p_provider,p_payment_id,p_refund_id)::text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||p_payment_id,0));
  select * into c from payment_captures where provider=p_provider and payment_id=p_payment_id;
  if not found then raise exception 'Payment unavailable' using errcode='P1005'; end if;
  select referrer_id into referrer from referral_commissions where idempotency_key=p_provider||':'||c.event_id;
  perform 1 from users where id in (p_actor,c.user_id,c.recipient_id,referrer) order by id for update;
  if not exists(select 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin required' using errcode='P1003'; end if;
  if p_key is null or length(p_key) not between 8 and 200 or p_refund_id is null or length(p_refund_id) not between 1 and 150 or p_evidence->>'status' is null or p_evidence->>'status' not in ('succeeded','submitted') then raise exception 'Invalid refund evidence' using errcode='P1004'; end if;
  select * into previous from content_intents where actor_id=p_actor and action='payment_return' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting return intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  perform 1 from payment_returns where provider=p_provider and payment_id=p_payment_id for update;
  if not found then raise exception 'Return unavailable' using errcode='P1005'; end if;
  if p_evidence->>'status'<>'succeeded' and exists(select 1 from payment_returns r where r.provider=p_provider and r.payment_id=p_payment_id and r.provider_refund_id is not null and r.provider_refund_id<>p_refund_id
    and not exists(select 1 from payment_refunds f where f.provider=p_provider and f.payment_id=p_payment_id and f.refund_id=r.provider_refund_id)) then raise exception 'Refund binding changed' using errcode='P1001'; end if;
  update payment_returns set provider_refund_id=p_refund_id,status='submitted',claim_token=null,claimed_at=null,next_attempt_at=now(),last_error=null where provider=p_provider and payment_id=p_payment_id;
  if p_evidence->>'status'='succeeded' then
    if p_evidence#>>'{refund,refundId}' is distinct from p_refund_id or p_evidence#>>'{refund,paymentId}' is distinct from p_payment_id then raise exception 'Refund evidence mismatch' using errcode='P1003'; end if;
    perform process_refund_event(p_provider,p_refund_id,p_payment_id,(p_evidence#>>'{refund,amountMinor}')::bigint,p_evidence#>>'{refund,currency}',p_correlation_id);
  end if;
  update payment_returns set status='completed' where provider=p_provider and payment_id=p_payment_id and exists(select 1 from payment_captures where provider=p_provider and payment_id=p_payment_id and refunded_minor=charged_minor);
  select jsonb_build_object('status',status,'refund_id',provider_refund_id) into result from payment_returns where provider=p_provider and payment_id=p_payment_id;
  insert into content_intents values(p_actor,'payment_return',p_key,fingerprint,result);
  insert into financial_audit_log(actor_user_id,target_user_id,action,provider,provider_event_id,idempotency_key,correlation_id,metadata)
    values(p_actor,c.user_id,'payment_return_reconciled',p_provider,p_refund_id,p_key,p_correlation_id,jsonb_build_object('payment_id',p_payment_id,'evidence',p_evidence));
  return result;
end $$;

CREATE FUNCTION public.record_book_link_click(p_user_id uuid, p_book_id uuid, p_link_id text, p_key text, p_link jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare previous content_intents;fingerprint text;store affiliate_stores;click_id uuid;result jsonb;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_link_id is null or p_link_id!~'^(worldcat|audible-(us|fr|de)|[a-f0-9-]{36}):[a-f0-9]{64}$' then raise exception 'Invalid click intent' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  fingerprint:=jsonb_build_array(p_book_id,p_link_id)::text;
  select * into previous from content_intents where actor_id=p_user_id and action='book:click' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting click intent' using errcode='P1001';end if;
    return previous.response;
  end if;
  if p_link is null then raise exception 'Book link unavailable' using errcode='P1005';end if;
  if not coalesce(p_link->>'linkId'=p_link_id and length(p_link->>'name') between 1 and 100 and p_link->>'country'~'^[A-Z]{2}$'
    and jsonb_typeof(p_link->'isAffiliate')='boolean' and jsonb_typeof(p_link->'isPrimary')='boolean',false) then raise exception 'Invalid canonical link' using errcode='P1004';end if;
  perform 1 from books where id=p_book_id for key share;if not found then raise exception 'Book unavailable' using errcode='P1005';end if;
  if p_link->>'storeId' is not null then
    select * into store from affiliate_stores where id=(p_link->>'storeId')::uuid and is_active for share;
    if not found or store.id::text<>split_part(p_link_id,':',1) or (cardinality(store.countries)>0 and not(p_link->>'country'=any(store.countries))) then raise exception 'Book link unavailable' using errcode='P1005';end if;
    if store.updated_at is distinct from (p_link->>'storeVersion')::timestamptz or store.name is distinct from p_link->>'name'
      or store.is_non_affiliate=(p_link->>'isAffiliate')::boolean or (store.priority=1) is distinct from (p_link->>'isPrimary')::boolean then raise exception 'Book link changed' using errcode='P1001';end if;
  elsif split_part(p_link_id,':',1) not in ('worldcat','audible-us','audible-fr','audible-de') then raise exception 'Invalid fallback link' using errcode='P1004';end if;
  insert into affiliate_link_clicks(book_id,user_id_hash,link_type,store_name,country,is_affiliate,link_id,store_id)
    values(p_book_id,encode(sha256(convert_to(p_user_id::text,'UTF8')),'hex'),case when p_link_id like 'audible-%' then 'audio' when (p_link->>'isPrimary')::boolean then 'primary' else 'secondary' end,
      p_link->>'name',p_link->>'country',(p_link->>'isAffiliate')::boolean,p_link_id,(p_link->>'storeId')::uuid) returning id into click_id;
  result:=jsonb_build_object('ok',true,'clickId',click_id);
  insert into content_intents values(p_user_id,'book:click',p_key,fingerprint,result);
  return result;
end $_$;

CREATE FUNCTION public.record_checkout_session(p_user_id uuid, p_kind text, p_entity_id uuid, p_provider text, p_checkout_id text, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare owner uuid; gateway text; previous text;
begin
  if p_kind is null or p_provider is null or p_checkout_id is null or p_url is null or p_kind not in ('tip','subscription') or p_provider not in ('paystack','dodopayments') or p_checkout_id !~ '^[a-zA-Z0-9_-]{1,150}$' or length(p_url) not between 1 and 2000 then raise exception 'Invalid checkout' using errcode='P1004'; end if;
  if (p_provider='paystack' and p_url !~ '^https://checkout\.paystack\.com(/|$)') or (p_provider='dodopayments' and p_url !~ '^https://([a-z0-9-]+\.)*dodopayments\.com(/|$)') then raise exception 'Invalid checkout destination' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  if p_kind='tip' then
    select user_id,case when currency='NGN' then 'paystack' else 'dodopayments' end,provider_checkout_id into owner,gateway,previous from tips where id=p_entity_id for update;
  else
    select user_id,provider,provider_checkout_id into owner,gateway,previous from subscriptions where id=p_entity_id for update;
  end if;
  if owner is distinct from p_user_id or gateway is distinct from p_provider then raise exception 'Checkout binding mismatch' using errcode='P1003'; end if;
  if previous is not null and previous<>p_checkout_id then raise exception 'Checkout identity changed' using errcode='P1001'; end if;
  if p_provider='paystack' and p_checkout_id<>(case when p_kind='tip' then 'tip_' else 'sub_' end||p_entity_id::text) then raise exception 'Checkout reference mismatch' using errcode='P1003'; end if;
  if p_kind='tip' then update tips set checkout_url=p_url,provider_checkout_id=p_checkout_id where id=p_entity_id;
  else update subscriptions set checkout_url=p_url,provider_checkout_id=p_checkout_id where id=p_entity_id; end if;
  update checkout_reconciliations set status='pending',attempts=0,last_checked_at=null,next_attempt_at=now()+interval '1 minute',last_error=null where entity_type=p_kind and entity_id=p_entity_id and status='failed';
end $_$;

CREATE FUNCTION public.record_promotion_click(p_actor uuid, p_id uuid, p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous content_intents; result jsonb; fingerprint text:=p_id::text;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_id is null then raise exception 'Invalid click intent' using errcode='P1004'; end if;
  perform 1 from users where id=p_actor and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into previous from content_intents where actor_id=p_actor and action='promotion:click' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting click intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  update promoted_listings set clicks=clicks+1 where id=p_id and is_active and start_date<=now() and end_date>now();
  if not found then raise exception 'Promotion is not active' using errcode='P1005'; end if;
  result:=jsonb_build_object('ok',true);
  insert into content_intents values(p_actor,'promotion:click',p_key,fingerprint,result);
  return result;
end $$;

CREATE FUNCTION public.record_reading_activity_day() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if new.created_at<=clock_timestamp() then
    insert into reading_activity_days(user_id,activity_date) values(new.user_id,(new.created_at at time zone 'UTC')::date) on conflict do nothing;
    perform rebuild_reading_streak(new.user_id);
  end if;
  return new;
end $$;

CREATE FUNCTION public.record_ticket_checkout(p_user_id uuid, p_ticket_id uuid, p_checkout_id text, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare t event_tickets;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into t from event_tickets where id=p_ticket_id for update;
  if t.user_id is distinct from p_user_id then raise exception 'Ticket binding mismatch' using errcode='P1003'; end if;
  if t.status<>'pending' or t.reserved_until<=now() then raise exception 'Reservation expired' using errcode='P1004'; end if;
  if p_checkout_id is null or p_checkout_id !~ '^[a-zA-Z0-9_-]{1,150}$' or p_url is null or length(p_url)>2000
    or t.provider='paystack' and (p_checkout_id<>'ticket_'||t.id or p_url !~ '^https://checkout\.paystack\.com(/|$)')
    or t.provider='dodopayments' and p_url !~ '^https://([a-z0-9-]+\.)*dodopayments\.com(/|$)' then raise exception 'Invalid checkout' using errcode='P1004'; end if;
  if t.provider_checkout_id is not null and t.provider_checkout_id<>p_checkout_id then raise exception 'Checkout identity changed' using errcode='P1001'; end if;
  update event_tickets set provider_checkout_id=p_checkout_id,checkout_url=p_url where id=t.id;
end $_$;

CREATE FUNCTION public.referral_statistics(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare code text;
begin
  select referral_code into code from users where id=p_user_id and deleted_at is null and not is_banned;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  return jsonb_build_object('referralCode',code,
    'referralCount',(select count(*) from users where referred_by=p_user_id),
    'milestones',(select jsonb_agg(jsonb_build_object('id',m.id,'labelKey',m.label_key,'target',m.target,'xp',m.xp,'earned',exists(select 1 from user_badges where user_id=p_user_id and badge_id=m.id)) order by m.target) from(values('connector','connector',10,500),('ambassador','ambassador',50,2000),('liravo_builder','liravoBuilder',200,5000)) m(id,label_key,target,xp)),
    'xpFromReferrals',(select coalesce(sum(amount),0) from xp_ledger where user_id=p_user_id and reason in ('referral_signup','referral_milestone_10','referral_milestone_50','badge:connector','badge:ambassador','badge:liravo_builder')),
    'topReferrers',coalesce((select jsonb_agg(to_jsonb(r) order by r.count desc,r.id) from(select u.id,u.username,u.display_name,count(invited.id)::integer as count from users u join users invited on invited.referred_by=u.id where not u.is_banned and u.deleted_at is null and u.profile_visibility='public' group by u.id order by count(invited.id) desc,u.id limit 10) r),'[]'::jsonb),
    'earnedByCurrency',coalesce((select jsonb_object_agg(currency,amount) from(select currency,sum(commission_amount)::text as amount from referral_commissions where referrer_id=p_user_id and credited_at is not null group by currency) totals),'{}'::jsonb));
end $$;

CREATE FUNCTION public.refresh_checkout_after_capture() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update checkout_reconciliations set
    status=case when status='processing' then status when new.entity_type='subscription' and new.provider='dodopayments' then 'pending' else 'settled' end,
    attempts=case when status='processing' then attempts else 0 end,
    next_attempt_at=case when status='processing' then next_attempt_at else now()+interval '6 hours' end,
    last_error=null where entity_type=new.entity_type and entity_id=new.entity_id;
  return new;
end $$;

CREATE FUNCTION public.refresh_premium_access(p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare active boolean;
begin
  active:=has_premium_access(p_user_id);
  update users set is_premium=active where id=p_user_id and is_premium is distinct from active;
  return active;
end $$;

CREATE FUNCTION public.refresh_subscription_access() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='DELETE' then perform refresh_premium_access(old.user_id); return old; end if;
  perform refresh_premium_access(new.user_id);
  return new;
end $$;

CREATE FUNCTION public.register_billing_account(p_user_id uuid, p_account_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare owner uuid;
begin
  if p_account_id is null or p_account_id !~ '^[a-f0-9]{64}$' then raise exception 'Invalid account binding' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id for update;
  if not found then raise exception 'Unknown user' using errcode='P1005'; end if;
  insert into billing_accounts(provider,account_id,user_id) values('google_play',p_account_id,p_user_id) on conflict do nothing;
  select user_id into owner from billing_accounts where provider='google_play' and account_id=p_account_id;
  if owner<>p_user_id then raise exception 'Account binding conflict' using errcode='P1003'; end if;
  return p_account_id;
end $_$;

CREATE FUNCTION public.queue_review_moderation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if new.moderation_status='pending'then insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)values('review',new.id::text,'moderate_review',jsonb_build_object('userId',new.user_id,'reviewId',new.id));end if;
 return new;
end $$;

CREATE FUNCTION public.pending_review_snapshot(p_actor uuid,p_at timestamp with time zone DEFAULT NULL,p_id uuid DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if not exists(select 1 from users where id=p_actor and(is_admin or is_moderator)and not is_banned and deleted_at is null)then raise exception 'Moderation access required' using errcode='P1003';end if;
 if p_limit is null or p_limit not between 1 and 50 or(p_at is null)<>(p_id is null)then raise exception 'Invalid page' using errcode='P1004';end if;
 return coalesce((select jsonb_agg(to_jsonb(page)order by created_at desc,id desc)from(
  select r.id,r.user_id,r.book_id,r.content,r.rating,r.created_at,u.username,b.title from reviews r join users u on u.id=r.user_id join books b on b.id=r.book_id
  where r.moderation_status='pending'and not r.is_hidden and(p_at is null or(r.created_at,r.id)<(p_at,p_id))order by r.created_at desc,r.id desc limit p_limit+1
 )page),'[]'::jsonb);
end $$;

CREATE FUNCTION public.finish_review_moderation(p_review uuid,p_status text,p_actor uuid DEFAULT NULL,p_event uuid DEFAULT NULL,p_attempt integer DEFAULT NULL,p_owner uuid DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare item reviews;owner_id uuid;changed boolean:=false;
begin
 if p_status is null or p_status not in('published','removed')or num_nonnulls(p_actor,p_event,p_owner)<>1 then raise exception 'Invalid moderation decision' using errcode='P1004';end if;
 select user_id into owner_id from reviews where id=p_review;if not found then raise exception 'Review unavailable' using errcode='P1005';end if;
 perform 1 from users where id in(owner_id,p_actor,p_owner)order by id for update;
 if p_actor is not null and not exists(select 1 from users where id=p_actor and(is_admin or is_moderator)and not is_banned and deleted_at is null)then raise exception 'Moderation access required' using errcode='P1003';end if;
 if p_owner is not null and(p_owner<>owner_id or p_status<>'published'or not exists(select 1 from users where id=p_owner and not is_banned and deleted_at is null))then raise exception 'Review access required' using errcode='P1003';end if;
 if p_event is not null then
  perform 1 from outbox_events where id=p_event and event_type='moderate_review'and aggregate_id=p_review::text and status='processing'and attempts=p_attempt for update;
  if not found then raise exception 'Moderation claim expired' using errcode='P1001';end if;
 end if;
 select * into item from reviews where id=p_review for update;
 if item.moderation_status='pending'and not item.is_hidden and exists(select 1 from users where id=owner_id and not is_banned and deleted_at is null)then
  update reviews set moderation_status=p_status where id=p_review;item.moderation_status:=p_status;changed:=true;
  if p_status='published'then perform award_xp_once(owner_id,20,'write_review','review:'||item.book_id);end if;
  insert into moderation_log(moderator_id,target_user_id,action,entity_type,entity_id)values(p_actor,owner_id,'review_'||p_status,'review',item.id);
  update content_intents set response=jsonb_set(response,'{moderation_status}',to_jsonb(p_status))where actor_id=owner_id and action='reviews'and intent_key=item.idempotency_key;
  if p_owner is null then insert into notifications(user_id,type,entity_type,entity_id,message,message_key)values(owner_id,'review_moderation','book',item.book_id,'Your review has been checked.',case when p_status='published'then 'reviewPublished'else 'reviewRemoved'end);end if;
 end if;
 if p_event is not null then update outbox_events set status='processed',processed_at=now(),last_error=null where id=p_event and attempts=p_attempt;end if;
 return jsonb_build_object('reviewId',item.id,'userId',owner_id,'status',item.moderation_status,'changed',changed);
end $$;

CREATE FUNCTION public.register_push_subscription(p_user uuid, p_session text, p_channel text, p_endpoint text, p_p256dh text DEFAULT NULL, p_auth text DEFAULT NULL, p_platform text DEFAULT 'web') RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target uuid;
begin
 if p_session is null or p_session!~'^[a-f0-9]{64}$' or p_endpoint is null or length(p_endpoint)not between 10 and 2048 or p_channel is null or p_channel not in('web','expo')then raise exception 'Invalid subscription' using errcode='P1004';end if;
 if p_channel='web'and(p_endpoint!~'^https://'or p_p256dh is null or p_auth is null or p_platform<>'web')or p_channel='expo'and(p_endpoint!~'^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'or p_platform not in('ios','android')or p_p256dh is not null or p_auth is not null)then raise exception 'Invalid subscription' using errcode='P1004';end if;
 perform pg_advisory_xact_lock(hashtextextended('push:session:'||p_session,0));
 if exists(select 1 from revoked_push_sessions where session_hash=p_session)then raise exception 'Session revoked' using errcode='P1003';end if;
 perform 1 from users where id=p_user and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
 perform pg_advisory_xact_lock(hashtextextended('push:endpoint:'||p_endpoint,0));
 delete from push_subscriptions where user_id=p_user and expires_at<=now();
 if(select count(*)from push_subscriptions where user_id=p_user and endpoint<>p_endpoint)>=10 then raise exception 'Subscription limit reached' using errcode='P1004';end if;
 insert into push_subscriptions(user_id,session_hash,channel,endpoint,p256dh,auth,platform)
 values(p_user,p_session,p_channel,p_endpoint,p_p256dh,p_auth,p_platform)
 on conflict(endpoint)do update set user_id=excluded.user_id,session_hash=excluded.session_hash,channel=excluded.channel,p256dh=excluded.p256dh,auth=excluded.auth,platform=excluded.platform,updated_at=now(),expires_at=now()+interval '30 days' returning id into target;
 return target;
end $$;

CREATE FUNCTION public.revoke_push_session(p_session text,p_known boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare removed integer;
begin
 if p_session is null or p_session!~'^[a-f0-9]{64}$'then raise exception 'Invalid session' using errcode='P1004';end if;
 perform pg_advisory_xact_lock(hashtextextended('push:session:'||p_session,0));
 insert into revoked_push_sessions(session_hash)select p_session where p_known or exists(select 1 from push_subscriptions where session_hash=p_session)on conflict do nothing;
 delete from push_subscriptions where session_hash=p_session;get diagnostics removed=row_count;return removed;
end $$;

CREATE FUNCTION public.unregister_push_subscription(p_user uuid,p_session text,p_endpoint text DEFAULT NULL) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare removed integer;
begin
 if p_session is null or p_session!~'^[a-f0-9]{64}$'or length(p_endpoint)>2048 then raise exception 'Invalid subscription' using errcode='P1004';end if;
 delete from push_subscriptions where user_id=p_user and session_hash=p_session and(p_endpoint is null or endpoint=p_endpoint);
 get diagnostics removed=row_count;return removed;
end $$;

CREATE FUNCTION public.ack_push_delivery(p_event uuid,p_attempt integer,p_subscription uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 update outbox_events set payload=jsonb_set(payload,'{deliveryReceipts}',coalesce(payload->'deliveryReceipts','[]'::jsonb)||jsonb_build_array(p_subscription::text))
 where id=p_event and event_type='deliver_push'and status='processing'and attempts=p_attempt
 and not coalesce(payload->'deliveryReceipts','[]'::jsonb)?p_subscription::text
 and exists(select 1 from push_subscriptions where id=p_subscription and user_id=(payload->>'userId')::uuid);
 return found;
end $$;

CREATE FUNCTION public.release_legacy_payout_request(p_actor_id uuid, p_payout_id uuid, p_reference text, p_amount numeric, p_currency text, p_correlation_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare payout payout_requests; owner uuid;
begin
  select user_id into owner from payout_requests where id=p_payout_id;
  perform 1 from users where id in (owner,p_actor_id) order by id for update;
  if p_actor_id is null or not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null) then raise exception 'Forbidden' using errcode='P1003'; end if;
  select * into payout from payout_requests where id=p_payout_id for update;
  if not found then raise exception 'Unknown payout' using errcode='P1005'; end if;
  if payout.idempotency_key not like 'legacy_tip_payout:%' or p_reference is null or length(p_reference) not between 4 and 200
    or p_amount is distinct from payout.amount or p_currency is distinct from payout.currency then raise exception 'Legacy reconciliation mismatch' using errcode='P1002'; end if;
  if payout.status='failed' and payout.settlement_reference=p_reference then return 'failed'; end if;
  if payout.status<>'processing' then raise exception 'Reconciliation conflict' using errcode='P1001'; end if;
  update payout_requests set status='failed',settlement_reference=p_reference,last_error=null,claimed_at=null where id=payout.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(p_actor_id,payout.user_id,'legacy_payout_released',payout.amount,payout.currency,'manual',p_reference,p_correlation_id,jsonb_build_object('payout_id',payout.id));
  return 'failed';
end $$;

CREATE FUNCTION public.request_subscription_cancellation(p_user_id uuid, p_correlation_id text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target subscriptions; total integer;
begin
  perform 1 from users where id=p_user_id for update;
  for target in select * from subscriptions where user_id=p_user_id and provider in ('paystack','dodopayments') and status='active' order by id for update loop
    insert into subscription_cancellations(subscription_id,correlation_id) values(target.id,p_correlation_id) on conflict do nothing;
    if found then
      insert into financial_audit_log(actor_user_id,target_user_id,action,provider,correlation_id,metadata)
        values(p_user_id,p_user_id,'subscription_cancellation_requested',target.provider,p_correlation_id,jsonb_build_object('subscription_id',target.id));
    end if;
  end loop;
  select count(*) into total from subscription_cancellations c join subscriptions s on s.id=c.subscription_id
    where s.user_id=p_user_id and s.provider in ('paystack','dodopayments') and c.status<>'completed';
  return total;
end $$;

CREATE FUNCTION public.reserve_event_ticket(p_user_id uuid, p_event_id uuid, p_key text, p_correlation_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare e events; t event_tickets; host uuid; occupied bigint; intent content_intents;
begin
  if p_key is null or length(p_key) not between 8 and 200 then raise exception 'Invalid ticket intent' using errcode='P1004'; end if;
  select organizer_id into host from events where id=p_event_id;
  perform 1 from users where id in (p_user_id,host) order by id for update;
  if not exists(select 1 from users where id=p_user_id and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into intent from content_intents where actor_id=p_user_id and action='event_ticket' and intent_key=p_key;
  if found then
    if intent.fingerprint<>p_event_id::text then raise exception 'Conflicting ticket intent' using errcode='P1001'; end if;
    select * into t from event_tickets where id=(intent.response->>'ticket_id')::uuid;
    if not found then raise exception 'Ticket unavailable' using errcode='P1005'; end if;
    return to_jsonb(t);
  end if;
  select * into e from events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P1005'; end if;
  if not e.is_paid or e.event_date<=now() or e.ticket_price is null or e.ticket_price<0.5 or e.ticket_price>5000 or e.currency not in ('USD','NGN','EUR') or e.organizer_id=p_user_id
    or not exists(select 1 from users where id=e.organizer_id and not is_banned and deleted_at is null) then raise exception 'Event unavailable' using errcode='P1004'; end if;
  select * into t from event_tickets where event_id=e.id and user_id=p_user_id and (status in ('confirmed','refund_pending','legacy_hold') or status='pending' and reserved_until>now()) order by created_at desc,id limit 1;
  if found then
    insert into content_intents values(p_user_id,'event_ticket',p_key,p_event_id::text,jsonb_build_object('ticket_id',t.id));
    return to_jsonb(t);
  end if;
  select count(*) into occupied from event_tickets where event_id=e.id and (status in ('confirmed','refund_pending','legacy_hold') or status='pending' and reserved_until>now());
  if e.max_attendees is not null and occupied>=e.max_attendees then raise exception 'Event full' using errcode='P1004'; end if;
  insert into event_tickets(event_id,user_id,organizer_id,amount_paid,platform_fee,host_amount,currency,provider,reserved_until,idempotency_key)
    values(e.id,p_user_id,e.organizer_id,e.ticket_price,round(e.ticket_price*0.1,2),e.ticket_price-round(e.ticket_price*0.1,2),e.currency,case when e.currency='NGN' then 'paystack' else 'dodopayments' end,least(e.event_date,now()+interval '20 minutes'),p_key) returning * into t;
  insert into checkout_reconciliations(entity_type,entity_id,user_id,provider,reference) values('ticket',t.id,p_user_id,t.provider,'ticket_'||t.id);
  insert into content_intents values(p_user_id,'event_ticket',p_key,p_event_id::text,jsonb_build_object('ticket_id',t.id));
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,idempotency_key,correlation_id,metadata)
    values(p_user_id,e.organizer_id,'ticket_reserved',t.amount_paid,t.currency,p_key,p_correlation_id,jsonb_build_object('ticket_id',t.id,'event_id',e.id,'reserved_until',t.reserved_until));
  return to_jsonb(t);
end $$;

CREATE FUNCTION public.resolve_direct_social_identity(p_provider text, p_subject text, p_email text, p_display_name text, p_avatar_url text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare profile users;existing jsonb;new_id uuid:=gen_random_uuid();username_base text;
begin
  if p_provider is null or p_provider not in ('google','telegram') or p_subject is null or length(p_subject) not between 1 and 255
    or p_subject~'[[:space:][:cntrl:]]' or (p_provider='telegram' and p_subject!~'^[0-9]{1,20}$')
    or (p_provider='google' and (p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254 or p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    or (p_provider='telegram' and p_email is not null)
    or (p_avatar_url is not null and (length(p_avatar_url)>2048 or p_avatar_url!~'^https?://')) then raise exception 'Invalid provider identity' using errcode='P1004';end if;
  perform 1 from feature_flags where name=p_provider||'_auth'and enabled for share;
  if not found then raise exception 'Sign-in provider unavailable' using errcode='P1003';end if;
  perform pg_advisory_xact_lock(hashtextextended('direct-identity:'||p_provider||':'||p_subject,0));
  select * into profile from users where (p_provider='google' and google_id=p_subject) or (p_provider='telegram' and telegram_id=p_subject) for update;
  if found then
    if profile.is_banned or profile.deleted_at is not null then raise exception 'Account unavailable' using errcode='P1003';end if;
    return to_jsonb(profile);
  end if;
  if p_provider='google' then
    existing:=find_direct_account(p_email);
    if existing is not null then
      select * into profile from users where id=(existing->>'id')::uuid for update;
      if profile.is_banned or profile.deleted_at is not null then raise exception 'Account unavailable' using errcode='P1003';end if;
      if not profile.email_verified or lower(profile.email) is distinct from p_email or (profile.google_id is not null and profile.google_id<>p_subject) then raise exception 'Use the existing sign-in method before linking Google' using errcode='P1001';end if;
      update users set google_id=p_subject where id=profile.id returning * into profile;
      return to_jsonb(profile);
    end if;
  end if;
  username_base:=left(lower(regexp_replace(coalesce(nullif(split_part(p_email,'@',1),''),'tg_'||p_subject),'[^A-Za-z0-9_]','_','g')),20);
  perform create_direct_account(p_id=>new_id,p_email=>p_email,p_username=>username_base||'_'||left(new_id::text,8),p_display_name=>left(coalesce(nullif(btrim(p_display_name),''),username_base),50),p_google_id=>case when p_provider='google' then p_subject end,p_telegram_id=>case when p_provider='telegram' then p_subject end,p_avatar_url=>p_avatar_url);
  update users set email_verified=(p_provider='google') where id=new_id returning * into profile;
  return to_jsonb(profile);
end $_$;

CREATE FUNCTION public.resolve_localized_social_identity(p_provider text, p_subject text, p_email text, p_display_name text, p_avatar_url text, p_locale text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare profile jsonb;
begin
  profile:=resolve_direct_social_identity(p_provider,p_subject,p_email,p_display_name,p_avatar_url);
  perform initialize_account_locale((profile->>'id')::uuid,p_locale);
  return (select to_jsonb(u) from users u where id=(profile->>'id')::uuid);
end $$;

CREATE FUNCTION public.retain_book_edition_identifiers() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare identity record;target uuid:=coalesce(new.canonical_edition_id,new.id);existing uuid;
begin
  for identity in select * from (values('google',new.google_books_id),('openlibrary',new.open_library_id)) as source(provider,identifier) where identifier is not null loop
    select book_id into existing from book_edition_identifiers where provider=identity.provider and identifier=identity.identifier;
    if found and existing<>target then raise exception 'Conflicting edition identity' using errcode='P1001';end if;
    insert into book_edition_identifiers values(identity.provider,identity.identifier,target) on conflict do nothing;
  end loop;
  return new;
end $$;

CREATE FUNCTION public.retain_reading_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if exists(select 1 from shelves where id=new.shelf_id and user_id=new.user_id and default_type='have_read') then
    insert into reading_completions(user_id,book_id,source) values(new.user_id,new.book_id,'history') on conflict do nothing;
  end if;
  return new;
end $$;

CREATE FUNCTION public.retain_reading_work_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into reading_work_completions(user_id,work_id,book_id,source,completed_at)
    select new.user_id,canonical_book_work(work_id),new.book_id,new.source,new.completed_at from books where id=new.book_id on conflict do nothing;
  return new;
end $$;

CREATE FUNCTION public.retain_want_to_read_decision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if exists(select 1 from shelves where id=new.shelf_id and user_id=new.user_id and default_type='want_to_read') then
    insert into review_conversions(actor_id,book_id) values(new.user_id,new.book_id) on conflict do nothing;
  end if;
  return new;
end $$;

CREATE FUNCTION public.save_payout_destination(p_user_id uuid, p_key text, p_data jsonb, p_pin_hash text, p_correlation_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare expected text; previous content_intents; fingerprint text; result jsonb:='{"saved":true}';
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_data is null or jsonb_typeof(p_data)<>'object'
    or p_data->>'provider' is null or p_data->>'provider' not in ('manual','paystack') or p_data->>'currency' is null or p_data->>'currency' not in ('USD','NGN','EUR')
    or length(trim(coalesce(p_data->>'display_name',''))) not between 2 and 100 or length(coalesce(p_data->>'account_number','')) not between 4 and 80
    or p_data->>'account_number' !~ '^[a-zA-Z0-9 -]+$' or length(coalesce(p_data->>'bank_code','')) not between 2 and 40 or p_data->>'bank_code' !~ '^[a-zA-Z0-9-]+$'
    or p_data->>'provider'='paystack' and (p_data->>'currency'<>'NGN' or p_data->>'account_number' !~ '^[0-9]{10}$' or p_data->>'bank_code' !~ '^[0-9]+$') then raise exception 'Invalid destination' using errcode='P1004';end if;
  select pin_hash into expected from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if expected is distinct from p_pin_hash then raise exception 'PIN confirmation required' using errcode='P1003';end if;
  fingerprint:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_user_id and action='payout_destination' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting destination intent' using errcode='P1001';end if;
    return previous.response;
  end if;
  insert into user_payout_methods(user_id,provider,display_name,account_number,bank_code,currency,paystack_recipient_code)
    values(p_user_id,p_data->>'provider',p_data->>'display_name',p_data->>'account_number',p_data->>'bank_code',p_data->>'currency',null)
    on conflict(user_id,provider) do update set display_name=excluded.display_name,account_number=excluded.account_number,bank_code=excluded.bank_code,currency=excluded.currency,paystack_recipient_code=null;
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_user_id,'payout_destination',p_key,fingerprint,result);
  insert into financial_audit_log(actor_user_id,target_user_id,action,idempotency_key,correlation_id,metadata)
    values(p_user_id,p_user_id,'payout_destination_saved',p_key,p_correlation_id,jsonb_build_object('provider',p_data->>'provider','currency',p_data->>'currency','account_last_four',right(p_data->>'account_number',4)));
  return result;
end $_$;

CREATE FUNCTION public.save_taste_profile(p_user_id uuid, p_source jsonb, p_hash text, p_policy text, p_profile jsonb, p_provider text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result ai_taste_profiles;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found or not has_premium_access(p_user_id) then raise exception 'Premium required' using errcode='P1003'; end if;
  if taste_profile_input(p_user_id) is distinct from p_source then raise exception 'Reading data changed' using errcode='P1001'; end if;
  if jsonb_array_length(p_source->'books')<3 then raise exception 'Insufficient reading history' using errcode='P1004'; end if;
  if length(p_hash)<>64 or p_policy is null or p_provider not in ('deepseek','gemini') or jsonb_typeof(p_profile)<>'object' or length(coalesce(p_profile->>'summary','')) not between 1 and 4000 then raise exception 'Invalid profile' using errcode='P1004'; end if;
  select * into result from ai_taste_profiles where user_id=p_user_id;
  if found and result.source_hash=p_hash and result.policy_version=p_policy and result.generated_at>now()-interval '24 hours' then return to_jsonb(result); end if;
  insert into ai_taste_profiles(user_id,profile_text,profile_data,policy_version,source_hash,locale,provider)
    values(p_user_id,p_profile->>'summary',p_profile,p_policy,p_hash,p_source->>'locale',p_provider)
    on conflict(user_id) do update set profile_text=excluded.profile_text,profile_data=excluded.profile_data,policy_version=excluded.policy_version,source_hash=excluded.source_hash,locale=excluded.locale,provider=excluded.provider,generated_at=now() returning * into result;
  return to_jsonb(result);
end $$;

CREATE FUNCTION public.save_writing_plan(p_user_id uuid, p_week date, p_source jsonb, p_hash text, p_policy text, p_tasks jsonb, p_provider text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result writing_plans; current_week date:=date_trunc('week',now() at time zone 'UTC')::date;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found or not has_premium_access(p_user_id) then raise exception 'Premium required' using errcode='P1003'; end if;
  if not exists(select 1 from users where id=p_user_id and 'newbie_writer'=any(user_types)) then raise exception 'Writer access required' using errcode='P1003'; end if;
  if p_week is distinct from current_week or writing_plan_input(p_user_id) is distinct from p_source then raise exception 'Writing data changed' using errcode='P1001'; end if;
  if length(p_hash)<>64 or p_policy is null or p_provider not in ('deepseek','gemini') or jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)<>7 then raise exception 'Invalid writing plan' using errcode='P1004'; end if;
  select * into result from writing_plans where user_id=p_user_id and week_start=p_week;
  if found and result.source_hash=p_hash and result.policy_version=p_policy then return to_jsonb(result); end if;
  insert into writing_plans(user_id,week_start,plan_text,tasks,policy_version,source_hash,locale,provider)
    values(p_user_id,p_week,p_tasks::text,p_tasks,p_policy,p_hash,p_source->>'locale',p_provider)
    on conflict(user_id,week_start) do update set plan_text=excluded.plan_text,tasks=excluded.tasks,policy_version=excluded.policy_version,source_hash=excluded.source_hash,locale=excluded.locale,provider=excluded.provider,created_at=now() returning * into result;
  return to_jsonb(result);
end $$;

CREATE FUNCTION public.seed_content_item(p_kind text, p_key text, p_data jsonb, p_actor_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  return seed_content_item_054(p_kind,p_key,p_data,p_actor_id);
end $$;

CREATE FUNCTION public.seed_content_item_054(p_kind text, p_key text, p_data jsonb, p_actor_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare tracked seed_records; editor users; account jsonb; book jsonb; target uuid; created boolean:=false; repaired boolean:=false; links integer; lock_key text; ref text; prompt jsonb; legacy_email text; anchor date; item_date date;
begin
  if p_kind is null or p_kind not in ('editors','books','lists','challenges','prompts','reviews','quotes') or p_key is null or length(p_key) not between 1 and 200 or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid seed item' using errcode='P1004'; end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('seed-content',0));
  if p_kind='books' then
    for lock_key in select distinct value from jsonb_each_text(p_data) where key in ('isbn_13','isbn_10','google_books_id','open_library_id','goodreads_id') and value<>'' order by value loop
      perform pg_advisory_xact_lock(hashtextextended('catalog-book:'||lock_key,0));
    end loop;
  end if;
  select * into editor from users where username='liravo_editors';
  perform 1 from users where id in (p_actor_id,editor.id) order by id for update;
  if p_actor_id is not null and not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin required' using errcode='P1003'; end if;
  if p_kind='editors' then
    if editor.id is not null then
      if to_regclass('auth.users') is not null then execute 'select email from auth.users where id=$1' into legacy_email using editor.id;end if;
      if (editor.id='00000000-0000-4000-a000-000000000001' or editor.is_verified_author and (editor.email='liravo_editors_system@liravo.internal' or legacy_email='liravo_editors_system@liravo.internal')) is not true then raise exception 'Editors identity requires reconciliation' using errcode='P1001'; end if;
      if editor.password_hash is not null or editor.google_id is not null or editor.telegram_id is not null then raise exception 'Editors account has login identities' using errcode='P1001';end if;
      if editor.is_banned or editor.deleted_at is not null then raise exception 'Editors account unavailable' using errcode='P1003';end if;
      target:=editor.id;
    else
      if exists(select 1 from users where id='00000000-0000-4000-a000-000000000001') then raise exception 'Editors identity conflict' using errcode='P1001'; end if;
      account:=create_direct_account('00000000-0000-4000-a000-000000000001','liravo_editors_system@liravo.internal','liravo_editors','Liravo Editors');target:=(account->>'id')::uuid;created:=true;
    end if;
    update users set user_types=array['creator'],is_verified_author=true,onboarding_complete=true,profile_visibility='public',shelf_visibility='public' where id=target;
  elsif p_kind='books' then
    created:=not exists(select 1 from books where isbn_13=p_data->>'isbn_13' or isbn_10=p_data->>'isbn_10' or google_books_id=p_data->>'google_books_id' or open_library_id=p_data->>'open_library_id');
    book:=store_catalog_book(p_data);target:=(book->>'id')::uuid;
    if p_data?'has_audiobook' then update books set has_audiobook=(p_data->>'has_audiobook')::boolean where id=target and has_audiobook is distinct from (p_data->>'has_audiobook')::boolean;end if;
  else
    if p_kind in ('lists','reviews','quotes') and (editor.id is null or not editor.is_verified_author or editor.deleted_at is not null or editor.is_banned) then raise exception 'Seed editors account first' using errcode='P1005'; end if;
    select * into tracked from seed_records where kind=p_kind and key=p_key;
    target:=tracked.entity_id;
    if p_kind='lists' then
      if length(coalesce(p_data->>'title','')) not between 1 and 200 or jsonb_typeof(p_data->'book_isbns') is distinct from 'array' or jsonb_array_length(p_data->'book_isbns')>1000 then raise exception 'Invalid seed list' using errcode='P1004';end if;
      for ref in select jsonb_array_elements_text(p_data->'book_isbns') loop
        if not exists(select 1 from books where isbn_13=ref) then raise exception 'Seed books before reading lists: %',ref using errcode='P1005';end if;
      end loop;
      if target is not null and not exists(select 1 from reading_lists where id=target and user_id=editor.id) then target:=null;end if;
      if target is null then select id into target from reading_lists where user_id=editor.id and name=p_data->>'title' order by created_at,id limit 1;end if;
      if target is null then insert into reading_lists(user_id,name,description,is_public) values(editor.id,p_data->>'title',p_data->>'description',true) returning id into target;created:=true;end if;
      insert into reading_list_books(list_id,book_id,position)
        select target,b.id,(source.ordinality-1)::integer from jsonb_array_elements_text(p_data->'book_isbns') with ordinality source(isbn,ordinality) join books b on b.isbn_13=source.isbn
        on conflict(list_id,book_id) do update set position=excluded.position where reading_list_books.position is distinct from excluded.position;
      get diagnostics links=row_count;repaired:=not created and links>0;
    elsif p_kind='challenges' then
      if length(coalesce(p_data->>'title','')) not between 1 and 200 or p_data->>'type' not in ('daily','weekly','monthly') or (p_data->>'end_date')::timestamptz<=(p_data->>'start_date')::timestamptz then raise exception 'Invalid seed challenge' using errcode='P1004';end if;
      if target is not null and not exists(select 1 from writing_challenges where id=target) then target:=null;end if;
      if target is null then select id into target from writing_challenges where title=p_data->>'title' order by created_at,id limit 1;end if;
      if target is null then insert into writing_challenges(title,description,type,start_date,end_date,is_active) values(p_data->>'title',p_data->>'description',p_data->>'type',(p_data->>'start_date')::timestamptz,(p_data->>'end_date')::timestamptz,(p_data->>'is_active')::boolean) returning id into target;created:=true;end if;
    elsif p_kind='prompts' then
      if p_data->>'offset' is null or p_data->>'offset' !~ '^[0-9]{1,3}$' or (p_data->>'offset')::integer>365 then raise exception 'Invalid prompt offset' using errcode='P1004';end if;
      if target is not null and not exists(select 1 from writing_prompts where id=target) then target:=null;end if;
      if target is null then
        insert into seed_records(kind,key,metadata) values('anchor','prompts',jsonb_build_object('start_date',(now() at time zone 'UTC')::date+1)) on conflict do nothing;
        select (metadata->>'start_date')::date into anchor from seed_records where kind='anchor' and key='prompts';
        item_date:=anchor+(p_data->>'offset')::integer;
        prompt:=publish_writing_prompt(item_date,p_data->>'prompt_text',p_data->>'topic_seed');target:=(prompt->'prompt'->>'id')::uuid;created:=(prompt->>'created')::boolean;
      end if;
    else
      if not exists(select 1 from books where id=(p_data->>'book_id')::uuid) then raise exception 'Seed book unavailable' using errcode='P1005';end if;
      if p_kind='reviews' then
        if target is not null and not exists(select 1 from reviews where id=target and user_id=editor.id) then target:=null;end if;
        if target is null then select id into target from reviews where user_id=editor.id and book_id=(p_data->>'book_id')::uuid order by created_at,id limit 1;end if;
        if target is null then insert into reviews(user_id,book_id,review_type,rating,content,mood_tags,has_spoilers,moderation_status) values(editor.id,(p_data->>'book_id')::uuid,p_data->>'review_type',(p_data->>'rating')::numeric,p_data->>'content',array(select jsonb_array_elements_text(p_data->'mood_tags')),false,'published') returning id into target;created:=true;end if;
      else
        if target is not null and not exists(select 1 from quotes where id=target and user_id=editor.id) then target:=null;end if;
        if target is null then select id into target from quotes where user_id=editor.id and book_id=(p_data->>'book_id')::uuid and content=p_data->>'content' order by created_at,id limit 1;end if;
        if target is null then insert into quotes(user_id,book_id,content,page_number) values(editor.id,(p_data->>'book_id')::uuid,p_data->>'content',(p_data->>'page_number')::integer) returning id into target;created:=true;end if;
      end if;
    end if;
  end if;
  insert into seed_records(kind,key,entity_id) values(p_kind,p_key,target) on conflict(kind,key) do update set entity_id=excluded.entity_id;
  if created or repaired then insert into financial_audit_log(actor_user_id,action,metadata) values(p_actor_id,'seed_'||p_kind,jsonb_build_object('key',p_key,'entity_id',target,'created',created,'repaired',repaired));end if;
  return jsonb_build_object('id',target,'created',created,'repaired',repaired);
end $_$;

CREATE FUNCTION public.set_account_pin(p_user_id uuid, p_expected_hash text, p_new_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare profile users;
begin
  if p_new_hash is null or p_new_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' then raise exception 'Invalid PIN hash' using errcode='P1004';end if;
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if profile.pin_hash is distinct from p_expected_hash then raise exception 'PIN changed; retry' using errcode='P1001';end if;
  if profile.pin_hash=p_new_hash then return false;end if;
  update users set pin_hash=p_new_hash where id=p_user_id;
  insert into security_events(user_id,event_type,metadata) values(p_user_id,'pin_set',jsonb_build_object('source','settings','replaced',profile.pin_hash is not null));
  return true;
end $_$;

CREATE FUNCTION public.set_admin_edition_audiobook(p_actor uuid, p_book uuid, p_enabled boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare edition uuid;
begin
  if p_enabled is null then raise exception 'Invalid audiobook state' using errcode='P1004';end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  perform 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null for update;if not found then raise exception 'Admin access required' using errcode='P1003';end if;
  select coalesce(canonical_edition_id,id)into edition from books where id=p_book;if edition is null then raise exception 'Book unavailable' using errcode='P1005';end if;
  perform 1 from books where id=any(book_edition_family(edition))order by id for update;
  update books set has_audiobook=p_enabled where id=edition and has_audiobook is distinct from p_enabled;
  return admin_edition_audiobook_snapshot(p_actor,p_book)||jsonb_build_object('updated',true);
end $$;

CREATE FUNCTION public.set_author_work_claim(p_actor uuid, p_author uuid, p_book uuid, p_granted boolean, p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare request_digest text;receipt author_catalog_intents;target_work uuid;result jsonb;previous jsonb;
begin
  if p_actor is null or p_author is null or p_book is null or p_granted is null or length(p_key) not between 8 and 200 or p_key is null then raise exception 'Invalid author catalog intent' using errcode='P1004';end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  perform 1 from users where id in(p_actor,p_author) order by id for update;
  if not exists(select 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin access required' using errcode='P1003';end if;
  request_digest:=encode(sha256(convert_to(jsonb_build_object('author',p_author,'book',p_book,'granted',p_granted)::text,'UTF8')),'hex');
  select * into receipt from author_catalog_intents where actor_id=p_actor and intent_key=p_key;
  if found then
    if receipt.request_hash<>request_digest then raise exception 'Intent already used' using errcode='P1001';end if;
    return receipt.response;
  end if;
  if not exists(select 1 from users where id=p_author) then raise exception 'Author unavailable' using errcode='P1005';end if;
  if p_granted and not exists(select 1 from users where id=p_author and is_verified_author and not is_banned and deleted_at is null) then raise exception 'Verify the author before linking works' using errcode='P1003';end if;
  select canonical_book_work(work_id) into target_work from books where id=p_book for share;
  if not found or target_work is null then raise exception 'Book unavailable' using errcode='P1005';end if;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into previous from author_work_claims c where author_id=p_author and canonical_book_work(work_id)=target_work;
  if p_granted then
    insert into author_work_claims(author_id,work_id,verified_by) values(p_author,target_work,p_actor) on conflict do nothing;
  else
    delete from author_work_claims where author_id=p_author and canonical_book_work(work_id)=target_work;
    insert into book_catalog_audit(book_id,reason,previous_data,resolution)
      select book_id,'author_work_revoked',to_jsonb(a),jsonb_build_object('author_id',p_author,'work_id',target_work) from arcs a where author_id=p_author and is_active and canonical_book_work((select work_id from books where id=a.book_id))=target_work;
    update arcs a set is_active=false where author_id=p_author and is_active and canonical_book_work((select work_id from books where id=a.book_id))=target_work;
    insert into book_catalog_audit(book_id,reason,previous_data,resolution)
      select book_id,'author_post_work_revoked',to_jsonb(p),jsonb_build_object('book_id',null) from author_posts p where author_id=p_author and canonical_book_work((select work_id from books where id=p.book_id))=target_work;
    update author_posts p set book_id=null where author_id=p_author and canonical_book_work((select work_id from books where id=p.book_id))=target_work;
  end if;
  result:=jsonb_build_object('authorId',p_author,'bookId',p_book,'workId',target_work,'granted',p_granted);
  insert into moderation_log(moderator_id,target_user_id,action,entity_type,entity_id,notes)
    values(p_actor,p_author,case when p_granted then 'author_work_granted' else 'author_work_revoked' end,'book_work',target_work,jsonb_build_object('previous',previous,'result',result)::text);
  insert into author_catalog_intents(actor_id,intent_key,request_hash,response) values(p_actor,p_key,request_digest,result);
  return result;
end $$;

CREATE FUNCTION public.set_feature_flag_atomic(p_actor_id uuid, p_name text, p_enabled boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare current_value boolean;
begin
  if p_enabled is null then raise exception 'Invalid flag'; end if;
  if p_name in ('google_auth','telegram_auth') then
    perform 1 from feature_flags where name in ('google_auth','telegram_auth') order by name for update;
  else perform 1 from feature_flags where name=p_name for update; end if;
  perform 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Forbidden' using errcode='P1005'; end if;
  select enabled into current_value from feature_flags where name=p_name;
  if not found then raise exception 'Unknown flag' using errcode='P1003'; end if;
  if current_value=p_enabled then return false; end if;
  if not p_enabled and p_name in ('google_auth','telegram_auth') and not exists(select 1 from feature_flags where name in ('google_auth','telegram_auth') and name<>p_name and enabled) then
    raise exception 'At least one sign-in provider must remain enabled' using errcode='P1006';
  end if;
  update feature_flags set enabled=p_enabled,updated_at=now() where name=p_name;
  return true;
end $$;

CREATE FUNCTION public.set_list_follow(p_user_id uuid, p_list_id uuid, p_following boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target reading_lists;
begin
  perform 1 from users where id=p_user_id and not is_banned for update;
  if not found then raise exception 'Forbidden' using errcode='P1003'; end if;
  if p_following is null then raise exception 'Invalid follow state' using errcode='P1004'; end if;
  select * into target from reading_lists where id=p_list_id for update;
  if not found then
    if not p_following then return false; end if;
    raise exception 'List unavailable' using errcode='P1005';
  end if;
  if p_following then
    if not reading_list_visible(p_user_id,p_list_id)then raise exception 'List unavailable' using errcode='P1003'; end if;
    insert into reading_list_follows(list_id,user_id) values(p_list_id,p_user_id) on conflict do nothing;
  else delete from reading_list_follows where list_id=p_list_id and user_id=p_user_id; end if;
  return p_following;
end $$;

CREATE FUNCTION public.set_premium_override_atomic(p_actor_id uuid, p_user_id uuid, p_enabled boolean, p_correlation_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous boolean;
begin
  perform 1 from users where id in (p_actor_id,p_user_id) order by id for update;
  if not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null) then raise exception 'Forbidden' using errcode='P1003'; end if;
  select premium_override into previous from users where id=p_user_id;
  if not found or p_enabled is null then raise exception 'Unknown user' using errcode='P1005'; end if;
  if previous is distinct from p_enabled then
    update users set premium_override=p_enabled where id=p_user_id;
    insert into financial_audit_log(actor_user_id,target_user_id,action,correlation_id,metadata)
      values(p_actor_id,p_user_id,'premium_grant_changed',p_correlation_id,jsonb_build_object('enabled',p_enabled));
  end if;
  return refresh_premium_access(p_user_id);
end $$;

CREATE FUNCTION public.set_reading_goal(p_user_id uuid, p_year integer, p_target integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result reading_goals;
begin
  if p_year is null or p_year not between 2020 and 2099 or p_target is null or p_target not between 1 and 10000 then raise exception 'Invalid goal' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  insert into reading_goals(user_id,year,target_books) values(p_user_id,p_year,p_target) on conflict(user_id,year) do update set target_books=excluded.target_books,updated_at=now() returning * into result;
  return to_jsonb(result);
end $$;

CREATE FUNCTION public.set_shelf_membership(p_user_id uuid, p_shelf_id uuid, p_book_id uuid, p_add boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare canonical_id uuid;existing_id uuid;family uuid[];result jsonb;
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select coalesce(canonical_edition_id,id) into canonical_id from books where id=p_book_id;
  if canonical_id is null then raise exception 'Book not found' using errcode='P1005';end if;
  family:=book_edition_family(canonical_id);perform 1 from books where id=any(family) order by id for update;
  if p_add then
    select book_id into existing_id from shelf_books where user_id=p_user_id and shelf_id=p_shelf_id and book_id=any(family) order by (book_id=canonical_id) desc,added_at,id limit 1;
    return set_shelf_membership_063(p_user_id,p_shelf_id,coalesce(existing_id,canonical_id),p_add);
  end if;
  for existing_id in select book_id from shelf_books where user_id=p_user_id and shelf_id=p_shelf_id and book_id=any(family) order by book_id loop
    result:=set_shelf_membership_063(p_user_id,p_shelf_id,existing_id,p_add);
  end loop;
  return coalesce(result,set_shelf_membership_063(p_user_id,p_shelf_id,canonical_id,p_add));
end $$;

CREATE FUNCTION public.set_shelf_membership_045(p_user_id uuid, p_shelf_id uuid, p_book_id uuid, p_add boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target shelves;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  perform 1 from books where id=p_book_id for update;
  if not found then raise exception 'Book not found' using errcode='P1005'; end if;
  select * into target from shelves where id=p_shelf_id and user_id=p_user_id for update;
  if not found then raise exception 'Shelf not found' using errcode='P1005'; end if;
  if p_add then
    if not exists(select 1 from books where id=p_book_id) then raise exception 'Book not found' using errcode='P1005'; end if;
    insert into shelf_books(shelf_id,book_id,user_id,started_at,finished_at) values(target.id,p_book_id,p_user_id,
      case when target.default_type='currently_reading' then (now() at time zone 'UTC')::date end,
      case when target.default_type='have_read' then (now() at time zone 'UTC')::date end) on conflict(shelf_id,book_id) do nothing;
  else delete from shelf_books where shelf_id=target.id and book_id=p_book_id and user_id=p_user_id; end if;
  update books set
    currently_reading_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=p_book_id and s.default_type='currently_reading'),
    have_read_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=p_book_id and s.default_type='have_read'),
    want_to_read_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=p_book_id and s.default_type='want_to_read') where id=p_book_id;
  update users set books_read_count=count_verified_books(p_user_id) where id=p_user_id;
  return jsonb_build_object('ok',true,'defaultType',target.default_type);
end $$;

CREATE FUNCTION public.set_shelf_membership_063(p_user_id uuid, p_shelf_id uuid, p_book_id uuid, p_add boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target shelves;result jsonb;reward jsonb;
begin
  if p_add is null then raise exception 'Invalid membership' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  perform 1 from books where id=p_book_id for update;if not found then raise exception 'Book not found' using errcode='P1005';end if;
  select * into target from shelves where id=p_shelf_id and user_id=p_user_id for update;if not found then raise exception 'Shelf not found' using errcode='P1005';end if;
  if p_add and target.default_type='have_read' then insert into reading_completions(user_id,book_id,source) values(p_user_id,p_book_id,'interactive') on conflict do nothing;end if;
  result:=set_shelf_membership_045(p_user_id,p_shelf_id,p_book_id,p_add);
  if p_add and target.default_type='have_read' then
    update shelf_books set finished_at=coalesce(finished_at,(now() at time zone 'UTC')::date) where user_id=p_user_id and shelf_id=p_shelf_id and book_id=p_book_id;
    update users set books_read_count=count_verified_books(p_user_id) where id=p_user_id;
    reward:=claim_reading_reward(p_user_id,'finish_book',p_book_id);
  else select jsonb_build_object('xp',xp,'awarded',0) into reward from users where id=p_user_id;end if;
  return result||jsonb_build_object('xp_awarded',(reward->>'awarded')::integer,'new_total',(reward->>'xp')::integer);
end $$;

CREATE FUNCTION public.settle_payout_request(p_actor_id uuid, p_payout_id uuid, p_status text, p_reference text, p_amount numeric, p_currency text, p_provider_code text, p_correlation_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare payout payout_requests; owner uuid;
begin
  select user_id into owner from payout_requests where id=p_payout_id;
  perform 1 from users where id in (owner,p_actor_id) order by id for update;
  if p_actor_id is not null and not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null) then raise exception 'Forbidden' using errcode='P1003'; end if;
  select * into payout from payout_requests where id=p_payout_id for update;
  if not found then raise exception 'Unknown payout' using errcode='P1005'; end if;
  if p_status is null or p_status not in ('completed','failed','reversed') or p_reference is null or length(p_reference) not between 4 and 200
    or p_amount is distinct from payout.amount or p_currency is distinct from payout.currency then raise exception 'Settlement mismatch' using errcode='P1002'; end if;
  if payout.method='manual' and (p_actor_id is null or p_status<>'completed' or payout.status not in ('processing','completed')) then raise exception 'Admin settlement receipt required' using errcode='P1003'; end if;
  if payout.method='paystack' and p_reference is distinct from payout.transfer_reference then raise exception 'Transfer binding mismatch' using errcode='P1003'; end if;
  if payout.provider_transfer_code is not null and payout.provider_transfer_code is distinct from p_provider_code then raise exception 'Transfer identity conflict' using errcode='P1001'; end if;
  if payout.status='completed' and p_status='completed' then
    if payout.settlement_reference is distinct from p_reference then raise exception 'Settlement conflict' using errcode='P1001'; end if;
    return payout.status;
  end if;
  if payout.status in ('failed','cancelled') then
    if p_status in ('failed','reversed') then return payout.status; end if;
    raise exception 'Terminal payout conflict' using errcode='P1001';
  end if;
  if payout.status='completed' and p_status<>'reversed' then raise exception 'Terminal payout conflict' using errcode='P1001'; end if;
  update payout_requests set status=case when p_status='reversed' then 'failed' else p_status end,settlement_reference=p_reference,provider_transfer_code=p_provider_code,
    completed_at=case when p_status='completed' then now() else null end,claimed_at=null,last_error=null where id=payout.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(p_actor_id,payout.user_id,'payout_'||p_status,payout.amount,payout.currency,payout.method,p_reference,p_correlation_id,jsonb_build_object('payout_id',payout.id,'provider_code',p_provider_code));
  return case when p_status='reversed' then 'failed' else p_status end;
end $$;

CREATE FUNCTION public.share_card_snapshot(p_kind text, p_target uuid, p_owner uuid DEFAULT NULL::uuid, p_actor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare owner_id uuid:=p_owner;reader users;document jsonb;edition uuid;shelf shelves;progress jsonb;challenge challenges;
begin
 if p_actor is not null and not exists(select 1 from users where id=p_actor and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_kind='book'then return reading_edition_document(p_target);end if;
 if p_kind='quote'then
  select q.user_id,jsonb_build_object('content',q.content,'book',reading_edition_document(q.book_id))into owner_id,document from quotes q where q.id=p_target and not q.is_hidden;
 elsif p_kind='review'then
  select r.user_id,jsonb_build_object('content',r.content,'rating',r.rating,'book',reading_edition_document(r.book_id))into owner_id,document from reviews r where r.id=p_target and not r.is_hidden and r.moderation_status='published';
 elsif p_kind='challenge'then
  select * into challenge from challenges where id=p_target;if not found then return null;end if;
  document:=jsonb_build_object('title',challenge.title);
 elsif p_kind='writing-challenge'then
  select jsonb_build_object('title',title)into document from writing_challenges where id=p_target;if document is null then return null;end if;
 elsif p_kind not in('finished','shelf')then raise exception 'Invalid share target' using errcode='P1004';
 end if;
 if p_kind in('quote','review')and document is null then return null;end if;
 if owner_id is null then
  if p_kind in('challenge','writing-challenge')then return document;end if;
  return null;
 end if;
 select * into reader from users where id=owner_id;
 if not found or not reading_author_visible(p_actor,owner_id)then return null;end if;
 if p_kind in('finished','shelf','challenge')then
  select * into shelf from shelves where user_id=owner_id and default_type='have_read';
  if not found then return null;end if;
  if p_actor is distinct from owner_id and(not shelf.is_public or reader.shelf_visibility='private'or(reader.shelf_visibility='followers_only'and not exists(select 1 from follows where follower_id=p_actor and following_id=owner_id)))then return null;end if;
 end if;
 if p_kind='finished'then
  select coalesce(canonical_edition_id,id)into edition from books where id=p_target;if not found then return null;end if;
  if not exists(select 1 from shelf_books sb join books b on b.id=sb.book_id where sb.shelf_id=shelf.id and sb.user_id=owner_id and coalesce(b.canonical_edition_id,b.id)=edition and(sb.finished_at is null or sb.finished_at<=(now()at time zone 'UTC')::date))then return null;end if;
  document:=jsonb_build_object('book',reading_edition_document(edition),'review',(
   select jsonb_build_object('rating',r.rating,'content',r.content)from reviews r join books b on b.id=r.book_id where r.user_id=owner_id and coalesce(b.canonical_edition_id,b.id)=edition and not r.is_hidden and r.moderation_status='published'order by r.created_at desc,r.id desc limit 1));
 elsif p_kind='shelf'then
  document:=jsonb_build_object('books',coalesce((select jsonb_agg(entry->'book'order by at desc,edition_id desc)from(select * from shelf_edition_rows(shelf.id)order by at desc,edition_id desc limit 6)rows),'[]'::jsonb));
 elsif p_kind='challenge'then
  progress:=reading_challenge_progress(owner_id,p_target);if not(progress->>'joined')::boolean then return null;end if;
  progress:=progress->'progress';
  document:=document||jsonb_build_object('progress',progress,'completed',
   (coalesce(challenge.goal_books,0)>0 or coalesce(challenge.goal_pages,0)>0)
   and(coalesce(challenge.goal_books,0)<=0 or(progress->>'booksFinished')::integer>=challenge.goal_books)
   and(coalesce(challenge.goal_pages,0)<=0 or(progress->>'pagesRead')::bigint>=challenge.goal_pages));
 elsif p_kind='writing-challenge'then
  if not exists(select 1 from writing_challenge_participants where challenge_id=p_target and user_id=owner_id)and not exists(select 1 from writing_challenge_submissions where challenge_id=p_target and user_id=owner_id)then return null;end if;
  document:=document||jsonb_build_object('submissionCount',(select count(*)from writing_challenge_submissions where challenge_id=p_target and user_id=owner_id));
 end if;
 return document||jsonb_build_object('reader',jsonb_build_object('display_name',coalesce(nullif(reader.display_name,''),reader.username),'avatar_url',reader.avatar_url));
end $$;

CREATE FUNCTION public.shelf_catalog_snapshot(p_user uuid, p_book uuid DEFAULT NULL::uuid, p_default boolean DEFAULT NULL::boolean, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_year integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'UTC'::text)))::integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target uuid;page jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_limit is null or p_limit not between 1 and 100 or p_year is null or p_year not between 2020 and 2099 or(p_at is null)<>(p_id is null)or(p_at is null)<>(p_default is null)then raise exception 'Invalid shelf page' using errcode='P1004';end if;
 if p_book is not null then select coalesce(canonical_edition_id,id)into target from books where id=p_book;if target is null then raise exception 'Book unavailable' using errcode='P1005';end if;end if;
 select coalesce(jsonb_agg((to_jsonb(s)-'idempotency_key'-'request_hash')||jsonb_build_object('book_count',(
  select count(distinct coalesce(b.canonical_edition_id,b.id))from shelf_books sb join books b on b.id=sb.book_id where sb.shelf_id=s.id and sb.user_id=p_user
 ),'contains_book',exists(select 1 from shelf_books sb join books b on b.id=sb.book_id where sb.shelf_id=s.id and sb.user_id=p_user and coalesce(b.canonical_edition_id,b.id)=target))order by s.is_default desc,s.created_at desc,s.id desc),'[]'::jsonb)into page
 from(select * from shelves where user_id=p_user and(p_at is null or(is_default::integer,created_at,id)<(p_default::integer,p_at,p_id))order by is_default desc,created_at desc,id desc limit p_limit+1)s;
 return jsonb_build_object('shelves',page,'total',(select count(*)from shelves where user_id=p_user),'selectedTotal',(
  select count(distinct s.id)from shelves s join shelf_books sb on sb.shelf_id=s.id and sb.user_id=p_user join books b on b.id=sb.book_id where s.user_id=p_user and coalesce(b.canonical_edition_id,b.id)=target
 ),'reading',reading_goal_snapshot(p_user,p_year));
end $$;

CREATE FUNCTION public.reading_shelf_visible(p_user uuid, p_shelf uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select exists(select 1 from shelves s join users u on u.id=s.user_id where s.id=p_shelf and not u.is_banned and u.deleted_at is null
  and(u.id=p_user or(s.is_public and u.shelf_visibility<>'private' and reading_author_visible(p_user,u.id)
   and(u.shelf_visibility='public'or exists(select 1 from follows f join users viewer on viewer.id=f.follower_id where f.follower_id=p_user and f.following_id=u.id and not viewer.is_banned and viewer.deleted_at is null)))));
$$;

CREATE FUNCTION public.shelf_detail_snapshot(p_user uuid, p_shelf uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare shelf shelves;owner users;total bigint;page jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_limit is null or p_limit not between 1 and 100 or(p_at is null)<>(p_id is null)then raise exception 'Invalid shelf page' using errcode='P1004';end if;
 select * into shelf from shelves where id=p_shelf;if not found then raise exception 'Shelf unavailable' using errcode='P1005';end if;
 if shelf.user_id<>p_user then
  select * into owner from users where id=shelf.user_id;
  if not found or owner.is_banned or owner.deleted_at is not null or not shelf.is_public or owner.shelf_visibility='private'then raise exception 'Shelf is private' using errcode='P1003';end if;
  if(owner.profile_visibility='followers_only'or owner.shelf_visibility='followers_only')and not exists(select 1 from follows where follower_id=p_user and following_id=owner.id)then raise exception 'Shelf is private' using errcode='P1003';end if;
 end if;
 select count(*)into total from shelf_edition_rows(p_shelf);
 select coalesce(jsonb_agg(jsonb_build_object('entry',entry,'at',at,'id',edition_id)order by at desc,edition_id desc),'[]'::jsonb)into page from(select * from shelf_edition_rows(p_shelf)where p_at is null or(at,edition_id)<(p_at,p_id)order by at desc,edition_id desc limit p_limit+1)rows;
 return jsonb_build_object('shelf',(to_jsonb(shelf)-'idempotency_key'-'request_hash')||jsonb_build_object('book_count',total),'total',total,'books',page);
end $$;

CREATE FUNCTION public.shelf_edition_rows(p_shelf uuid) RETURNS TABLE(entry jsonb, at timestamp with time zone, edition_id uuid)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
 with ranked as(
  select sb membership,coalesce(b.canonical_edition_id,b.id)edition_id,max(sb.added_at)over(partition by coalesce(b.canonical_edition_id,b.id))at,
   row_number()over(partition by coalesce(b.canonical_edition_id,b.id)order by sb.updated_at desc,sb.added_at desc,sb.id desc)position
  from shelf_books sb join shelves s on s.id=sb.shelf_id and s.user_id=sb.user_id join books b on b.id=sb.book_id where sb.shelf_id=p_shelf
 )select to_jsonb(membership)||jsonb_build_object('book_id',b.id,'source_book_id',(membership).book_id,'book',to_jsonb(b)),r.at,r.edition_id from ranked r join books b on b.id=r.edition_id where position=1;
$$;

CREATE FUNCTION public.shelf_overlap_snapshot(p_user uuid, p_cohort uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_cohort is not null and(cardinality(p_cohort)>20 or array_position(p_cohort,null)is not null)then raise exception 'Invalid reader cohort' using errcode='P1004';end if;
 with visible as not materialized(select * from discovery_shelf_rows(p_user)),mine as materialized(select distinct work_id from visible where reader_id=p_user and default_type='have_read'),matched as materialized(
  select v.reader_id,count(distinct v.work_id)overlap from visible v join mine on mine.work_id=v.work_id where v.reader_id<>p_user and v.default_type='have_read'and(select count(*)from mine)>=3 and(p_cohort is null or v.reader_id=any(p_cohort))group by v.reader_id having count(distinct v.work_id)>=3 order by overlap desc,v.reader_id limit 20
 ),candidates as materialized(
  select v.* from visible v join matched on matched.reader_id=v.reader_id where v.default_type='have_read'and not exists(select 1 from visible own where own.reader_id=p_user and own.work_id=v.work_id)
 ),ranked as(select work_id,count(distinct reader_id)readers,max(added_at)latest from candidates group by work_id order by readers desc,latest desc,work_id limit 10)
 select jsonb_build_object('signature',(select md5(coalesce(string_agg(work_id::text,','order by work_id),''))from mine),'cohort',coalesce((select jsonb_agg(reader_id order by overlap desc,reader_id)from matched),'[]'::jsonb),'books',coalesce((
  select jsonb_agg(jsonb_build_object('id',b.id,'work_id',r.work_id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url)order by r.readers desc,r.latest desc,r.work_id)
  from ranked r join lateral(select edition_id from candidates where work_id=r.work_id group by edition_id order by count(distinct reader_id)desc,max(added_at)desc,edition_id limit 1)chosen on true join books b on b.id=chosen.edition_id
 ),'[]'::jsonb))into result;
 return result;
end $$;

CREATE FUNCTION public.stamp_helpfulness_vote() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='INSERT' then new.cast_at:=coalesce(new.cast_at,new.created_at,clock_timestamp());
  elsif new.is_helpful is distinct from old.is_helpful then new.cast_at:=clock_timestamp();
  else new.cast_at:=old.cast_at;end if;
  return new;
end $$;

CREATE FUNCTION public.store_catalog_book(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
  result:=store_catalog_book_066(p_data);
  if coalesce(current_setting('liravo.catalog_source',true),'')<>'goodreads' and p_data->>'google_books_id' is not null and p_data->>'average_rating' is not null and (p_data->>'ratings_count')::integer>0 then
    update books set average_rating=(p_data->>'average_rating')::numeric,ratings_count=(p_data->>'ratings_count')::integer,
      metadata_provenance=metadata_provenance||'{"average_rating":"google","ratings_count":"google"}'::jsonb where id=(result->>'id')::uuid returning to_jsonb(books.*) into result;
  end if;
  return result;
end $$;

CREATE FUNCTION public.store_catalog_book_065(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare result books;requested_work book_works;existing_work book_works;matched uuid[];code10 text;code13 text;work_key text:=nullif(p_data->>'open_library_work_id','');edition_key text:=nullif(p_data->>'open_library_id','');identity record;affected_users uuid[];
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  code10:=catalog_isbn(p_data->>'isbn_10',10);code13:=catalog_isbn(p_data->>'isbn_13',13);
  if p_data->>'isbn_10' is not null and code10 is null or p_data->>'isbn_13' is not null and code13 is null
    or code10 is not null and code13 is not null and catalog_isbn13(code10)<>code13 then raise exception 'Invalid edition ISBN' using errcode='P1004';end if;
  code13:=coalesce(code13,catalog_isbn13(code10));
  if length(coalesce(p_data->>'title','')) not between 1 and 500 or length(coalesce(p_data->>'author_name','')) not between 1 and 200
    or coalesce(code13,p_data->>'google_books_id',edition_key,p_data->>'goodreads_id') is null
    or edition_key is not null and edition_key !~ '^/books/OL[1-9][0-9]*M$'
    or work_key is not null and work_key !~ '^/works/OL[1-9][0-9]*W$' then raise exception 'Invalid catalog edition' using errcode='P1004';end if;
  select array_agg(distinct id) into matched from(
    select coalesce(canonical_edition_id,id) as id from books where isbn_13=code13 or isbn_10=code10
    union select book_id from book_edition_identifiers where provider='google' and identifier=p_data->>'google_books_id' or provider='openlibrary' and identifier=edition_key or provider='goodreads' and identifier=p_data->>'goodreads_id'
    union select coalesce(b.canonical_edition_id,b.id) from goodreads_book_identities g join books b on b.id=g.book_id where g.goodreads_id=p_data->>'goodreads_id'
  ) identities;
  if cardinality(matched)>1 then raise exception 'Conflicting edition identities' using errcode='P1001';end if;
  if cardinality(matched)=1 then
    select * into result from books where id=matched[1];
    if code13 is not null and result.isbn_13 is not null and result.isbn_13<>code13 or result.format is not null and p_data->>'format' is not null and result.format<>p_data->>'format' then raise exception 'Provider identity names another edition' using errcode='P1001';end if;
  end if;
  if work_key is not null then
    select * into requested_work from book_works where id=canonical_book_work((select work_id from book_work_identifiers where open_library_id=work_key));
    if result.id is not null then
      select * into existing_work from book_works where id=canonical_book_work(result.work_id);
      if requested_work.id is distinct from existing_work.id and exists(select 1 from book_work_identifiers where work_id=existing_work.id and open_library_id<>work_key) then raise exception 'Conflicting work identity' using errcode='P1001';end if;
      if requested_work.id is null then
        update book_works set open_library_id=work_key,title=coalesce(p_data->>'work_title',title) where id=existing_work.id returning * into requested_work;
      elsif requested_work.id<>existing_work.id then
        select array_agg(distinct sb.user_id) into affected_users from shelf_books sb join books b on b.id=sb.book_id where b.work_id in (existing_work.id,requested_work.id);
        perform 1 from users where id=any(affected_users) order by id for update;
        insert into book_catalog_audit(book_id,reason,previous_data,resolution)
          select id,'provider_work_resolved',jsonb_build_object('work_id',work_id),jsonb_build_object('work_id',requested_work.id,'open_library_work_id',work_key,'isbn_13',code13,'open_library_id',edition_key) from books where work_id=existing_work.id;
        update book_work_identifiers set work_id=requested_work.id where work_id=existing_work.id;
        update book_works set merged_into=requested_work.id where id=existing_work.id;
        update books set work_id=requested_work.id where work_id=existing_work.id;
        update users set books_read_count=count_verified_books(id) where id=any(affected_users);
      end if;
    elsif requested_work.id is null then
      insert into book_works(title,author_name,open_library_id) values(coalesce(p_data->>'work_title',p_data->>'title'),p_data->>'author_name',work_key) returning * into requested_work;
    end if;
  end if;
  if requested_work.id is not null and p_data->>'work_title' is not null then update book_works set title=p_data->>'work_title' where id=requested_work.id;end if;
  if result.id is null then
    insert into books(work_id,google_books_id,open_library_id,isbn_10,isbn_13,title,subtitle,author_name,author_names,publisher,published_year,description,cover_url,page_count,genres,language,average_rating,ratings_count,edition_name,format)
      values(requested_work.id,p_data->>'google_books_id',edition_key,code10,code13,p_data->>'title',p_data->>'subtitle',p_data->>'author_name',
        array(select jsonb_array_elements_text(coalesce(p_data->'author_names','[]'::jsonb))),p_data->>'publisher',(p_data->>'published_year')::integer,p_data->>'description',p_data->>'cover_url',(p_data->>'page_count')::integer,
        array(select jsonb_array_elements_text(coalesce(p_data->'genres','[]'::jsonb))),coalesce(p_data->>'language','en'),(p_data->>'average_rating')::numeric,coalesce((p_data->>'ratings_count')::integer,0),p_data->>'edition_name',p_data->>'format') returning * into result;
  else
    update books set work_id=coalesce(requested_work.id,work_id),isbn_10=coalesce(isbn_10,code10),isbn_13=coalesce(isbn_13,code13),
      google_books_id=coalesce(google_books_id,p_data->>'google_books_id'),open_library_id=coalesce(open_library_id,edition_key),
      publisher=coalesce(publisher,p_data->>'publisher'),page_count=coalesce(page_count,(p_data->>'page_count')::integer),edition_name=coalesce(edition_name,p_data->>'edition_name'),format=coalesce(format,p_data->>'format')
      where id=result.id returning * into result;
  end if;
  for identity in select * from (values('google',p_data->>'google_books_id'),('openlibrary',edition_key),('goodreads',p_data->>'goodreads_id')) as source(provider,identifier) where identifier is not null loop
    insert into book_edition_identifiers values(identity.provider,identity.identifier,result.id) on conflict do nothing;
  end loop;
  if work_key is not null then insert into book_work_identifiers values(work_key,result.work_id) on conflict do nothing;end if;
  if p_data->>'goodreads_id' is not null then insert into goodreads_book_identities values(p_data->>'goodreads_id',result.id) on conflict do nothing;end if;
  return to_jsonb(result);
end $_$;

CREATE FUNCTION public.store_catalog_book_066(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous books;result books;raw jsonb;payload jsonb:=p_data;source_kind text;before_data jsonb;after_data jsonb;document jsonb;provenance jsonb;field text;candidate jsonb;current_value jsonb;field_source text;missing boolean;known boolean;
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  source_kind:=case when current_setting('liravo.catalog_source',true)='goodreads' then 'goodreads'
    when p_data->>'open_library_id' is not null then 'openlibrary' when p_data->>'google_books_id' is not null then 'google'
    when p_data->>'goodreads_id' is not null then 'goodreads' else 'seed' end;
  select b.* into previous from books b where b.id in(
    select coalesce(canonical_edition_id,id) from books where isbn_13=coalesce(catalog_isbn(p_data->>'isbn_13',13),catalog_isbn13(catalog_isbn(p_data->>'isbn_10',10))) or isbn_10=catalog_isbn(p_data->>'isbn_10',10)
    union select book_id from book_edition_identifiers where provider='google' and identifier=p_data->>'google_books_id' or provider='openlibrary' and identifier=p_data->>'open_library_id' or provider='goodreads' and identifier=p_data->>'goodreads_id'
    union select coalesce(b.canonical_edition_id,b.id) from goodreads_book_identities g join books b on b.id=g.book_id where g.goodreads_id=p_data->>'goodreads_id'
  ) order by b.id limit 1;
  if previous.id is not null and (source_kind not in ('google','openlibrary') or coalesce(previous.metadata_provenance->>'format',previous.metadata_source) not in ('google','openlibrary')) then payload:=payload-'format';end if;
  if previous.id is not null and source_kind in ('google','openlibrary') and coalesce(previous.metadata_provenance->>'language',previous.metadata_source) in ('google','openlibrary')
    and previous.language<>'und' and nullif(p_data->>'language','und') is not null and split_part(lower(previous.language),'-',1)<>split_part(lower(p_data->>'language'),'-',1) then raise exception 'Conflicting edition language' using errcode='P1001';end if;
  raw:=store_catalog_book_065(payload);
  select * into result from books where id=(raw->>'id')::uuid;
  document:=to_jsonb(result);provenance:=coalesce(previous.metadata_provenance,'{}'::jsonb);
  for field in select unnest(array['title','subtitle','author_name','author_names','publisher','published_year','description','cover_url','page_count','genres','language','edition_name','format']) loop
    current_value:=case when previous.id is null then document->field else to_jsonb(previous)->field end;
    field_source:=coalesce(provenance->>field,previous.metadata_source,'legacy');
    provenance:=jsonb_set(provenance,array[field],to_jsonb(field_source));
    if previous.id is not null then document:=jsonb_set(document,array[field],coalesce(current_value,'null'::jsonb));end if;
    candidate:=p_data->field;
    missing:=current_value is null or current_value='null'::jsonb or current_value='[]'::jsonb or field='language' and current_value='"und"'::jsonb;
    known:=candidate is not null and candidate<>'null'::jsonb and candidate<>'[]'::jsonb and candidate<>'""'::jsonb
      and not(field='language' and candidate='"und"'::jsonb) and not(field='author_name' and candidate in ('"Unknown"'::jsonb,'"—"'::jsonb));
    if known and (previous.id is null or missing or field_source not in ('google','openlibrary') and source_kind in ('google','openlibrary')) then
      document:=jsonb_set(document,array[field],candidate);provenance:=jsonb_set(provenance,array[field],to_jsonb(source_kind));
    elsif previous.id is null and field='language' and not known then document:=jsonb_set(document,array[field],'"und"'::jsonb);end if;
  end loop;
  update books b set title=document->>'title',subtitle=document->>'subtitle',author_name=document->>'author_name',
    author_names=array(select jsonb_array_elements_text(document->'author_names')),publisher=document->>'publisher',published_year=(document->>'published_year')::integer,
    description=document->>'description',cover_url=document->>'cover_url',page_count=(document->>'page_count')::integer,
    genres=array(select jsonb_array_elements_text(document->'genres')),language=document->>'language',edition_name=document->>'edition_name',format=document->>'format',
    metadata_source=case when previous.id is null or previous.metadata_source not in ('google','openlibrary') and source_kind in ('google','openlibrary') then source_kind else b.metadata_source end,
    metadata_provenance=provenance where b.id=result.id returning * into result;
  if previous.id is not null then
    before_data:=to_jsonb(previous)-array['created_at','updated_at','currently_reading_count','want_to_read_count','have_read_count','search_vector','average_rating','ratings_count'];
    after_data:=to_jsonb(result)-array['created_at','updated_at','currently_reading_count','want_to_read_count','have_read_count','search_vector','average_rating','ratings_count'];
    if before_data is distinct from after_data then insert into book_catalog_audit(book_id,reason,previous_data,resolution) values(result.id,'edition_metadata_enriched',before_data,after_data||jsonb_build_object('provider',source_kind));end if;
    if result.page_count>0 and previous.page_count is distinct from result.page_count then
      with corrections as(
        select sb.id,sb.book_id,sb.user_id,sb.progress_pages,sb.progress_percent,least(100,round(sb.progress_pages*100.0/result.page_count,2)) as percent
        from shelf_books sb where sb.book_id=any(book_edition_family(result.id)) and sb.progress_pages is not null
      ),recorded as(
        insert into book_catalog_audit(book_id,reason,previous_data,resolution)
          select book_id,'provider_progress_recalculated',jsonb_build_object('entry_id',id,'user_id',user_id,'pages',progress_pages,'percent',progress_percent),jsonb_build_object('percent',percent)
          from corrections where progress_percent is distinct from percent returning book_id
      ) update shelf_books sb set progress_percent=corrections.percent from corrections where sb.id=corrections.id and sb.progress_percent is distinct from corrections.percent;
    end if;
  end if;
  return to_jsonb(result);
end $$;

CREATE FUNCTION public.sync_profile_reading_goal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if pg_trigger_depth()>1 or new.annual_reading_goal is not distinct from old.annual_reading_goal then return new; end if;
  if new.annual_reading_goal is null then
    delete from reading_goals where user_id=new.id and year=extract(year from now() at time zone 'UTC')::integer;
  else
    if new.annual_reading_goal not between 1 and 10000 then raise exception 'Invalid goal' using errcode='P1004'; end if;
    insert into reading_goals(user_id,year,target_books) values(new.id,extract(year from now() at time zone 'UTC')::integer,new.annual_reading_goal)
      on conflict(user_id,year) do update set target_books=excluded.target_books,updated_at=now();
  end if;
  return new;
end $$;

CREATE FUNCTION public.sync_reading_goal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op='DELETE' then
    if old.year=extract(year from now() at time zone 'UTC')::integer then update users set annual_reading_goal=null where id=old.user_id; end if;
    return old;
  end if;
  if new.year=extract(year from now() at time zone 'UTC')::integer then update users set annual_reading_goal=new.target_books where id=new.user_id; end if;
  return new;
end $$;

CREATE FUNCTION public.synchronize_content_aliases() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare row_data jsonb:=to_jsonb(new); previous jsonb; legacy jsonb; canonical jsonb;
begin
  legacy:=row_data->tg_argv[0];canonical:=row_data->tg_argv[1];
  if tg_op='UPDATE' then
    previous:=to_jsonb(old);
    if canonical is distinct from previous->tg_argv[1] and legacy is not distinct from previous->tg_argv[0] then legacy:=canonical;
    elsif legacy is distinct from previous->tg_argv[0] and canonical is not distinct from previous->tg_argv[1] then canonical:=legacy; end if;
  end if;
  if legacy is null or legacy='null'::jsonb then legacy:=canonical; end if;
  if canonical is null or canonical='null'::jsonb then canonical:=legacy; end if;
  if legacy is distinct from canonical then raise exception 'Conflicting content columns' using errcode='P1004'; end if;
  new:=jsonb_populate_record(new,jsonb_build_object(tg_argv[0],legacy,tg_argv[1],canonical));
  return new;
end $$;

CREATE FUNCTION public.taste_profile_input(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with finished as materialized(
    select distinct on(canonical_book_work(b.work_id)) canonical_book_work(b.work_id) as work_id,b.id,sb.finished_at
    from shelf_books sb join shelves s on s.id=sb.shelf_id join books source on source.id=sb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
    where sb.user_id=p_user_id and s.user_id=p_user_id and s.default_type='have_read' and sb.finished_at is not null
    order by canonical_book_work(b.work_id),sb.finished_at desc,sb.id desc
  ), recent as(select * from finished order by finished_at desc,id limit 20), entries as(
    select b.id,left(b.title,500) as title,b.genres[1:10] as genres,r.finished_at,
      (select jsonb_build_object('rating',v.rating,'moods',v.mood_tags[1:10]) from reviews v where v.user_id=p_user_id and v.book_id=any(book_edition_family(b.id)) order by v.created_at desc,v.id desc limit 1) as review
    from recent r join books b on b.id=r.id
  ) select jsonb_build_object('locale',case when u.preferred_locale in ('en','fr','de') then u.preferred_locale else 'en' end,'books',coalesce((select jsonb_agg(to_jsonb(e) order by e.finished_at desc,e.id) from entries e),'[]'::jsonb)) from users u where u.id=p_user_id;
$$;

CREATE FUNCTION public.sync_review_like_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare target uuid; review reviews;
begin
  target:=case when tg_op='DELETE' then old.review_id else new.review_id end;
  select * into review from reviews where id=target for update;
  if not found then return null;end if;
  if tg_op='INSERT' and (
    review.is_hidden or review.moderation_status<>'published'
    or not exists(select 1 from users where id=new.user_id and not is_banned and deleted_at is null)
    or not exists(select 1 from users u where u.id=review.user_id and not u.is_banned and u.deleted_at is null
      and (u.id=new.user_id or u.profile_visibility='public' or exists(select 1 from follows where follower_id=new.user_id and following_id=u.id)))
  )then raise exception 'Review unavailable' using errcode='P1005';end if;
  update reviews set likes_count=(select count(*)from review_likes where review_id=target)where id=target;
  return null;
end $$;

CREATE FUNCTION public.toggle_review_like_atomic(p_review_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  return apply_social_intent(p_user_id,p_review_id,'like',gen_random_uuid()::text);
end $$;

CREATE FUNCTION public.touch_affiliate_store_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$begin new.updated_at:=clock_timestamp();return new;end $$;

CREATE FUNCTION public.update_buddy_progress(p_actor_id uuid, p_room_id uuid, p_key text, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare previous content_intents; fingerprint text; room buddy_reads; note buddy_read_notes; result jsonb;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not(p_payload?'current_chapter' or p_payload?'note') or exists(select 1 from jsonb_object_keys(p_payload) key where key not in ('current_chapter','note'))
    or (p_payload?'current_chapter' and (jsonb_typeof(p_payload->'current_chapter')<>'number' or p_payload->>'current_chapter' !~ '^[0-9]{1,6}$' or (p_payload->>'current_chapter')::integer not between 1 and 200000))
    or (p_payload?'note' and (jsonb_typeof(p_payload->'note')<>'string' or length(trim(p_payload->>'note')) not between 1 and 2000)) then raise exception 'Invalid progress' using errcode='P1004'; end if;
  perform 1 from users where id=p_actor_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('room',p_room_id,'payload',p_payload)::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_actor_id and action='buddy_update' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  select * into room from buddy_reads where id=p_room_id for update;
  if not found or not room.is_active then raise exception 'Buddy read unavailable' using errcode='P1005'; end if;
  perform 1 from buddy_read_members where buddy_read_id=p_room_id and user_id=p_actor_id for share;
  if not found then raise exception 'Not a participant' using errcode='P1003'; end if;
  if p_payload?'current_chapter' then update buddy_reads set current_chapter=(p_payload->>'current_chapter')::integer where id=p_room_id returning * into room; end if;
  if p_payload?'note' then insert into buddy_read_notes(buddy_read_id,user_id,content) values(p_room_id,p_actor_id,p_payload->>'note') returning * into note; end if;
  result:=jsonb_build_object('updated',true,'current_chapter',room.current_chapter,'note',case when note.id is null then null else to_jsonb(note)-'idempotency_key'-'request_hash' end);
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_actor_id,'buddy_update',p_key,fingerprint,result);
  return result;
end $_$;

CREATE FUNCTION public.update_payment_return(p_provider text, p_payment_id text, p_claim uuid, p_status text, p_refund_id text, p_error text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare previous payment_returns;
begin
  if p_status not in ('pending','processing','submitted','unknown','completed','failed') then raise exception 'Invalid return state' using errcode='P1004'; end if;
  select * into previous from payment_returns where provider=p_provider and payment_id=p_payment_id and claim_token=p_claim for update;
  if not found then return false; end if;
  update payment_returns set status=p_status,provider_refund_id=coalesce(provider_refund_id,p_refund_id),last_error=left(p_error,100),
    claim_token=case when p_status='processing' then claim_token else null end,claimed_at=case when p_status='processing' then claimed_at else null end,
    next_attempt_at=now()+make_interval(secs=>least(21600,greatest(60,30*power(2,least(attempts,10))::integer))) where provider=p_provider and payment_id=p_payment_id and claim_token=p_claim;
  if previous.status is distinct from p_status or previous.last_error is distinct from p_error or previous.provider_refund_id is null and p_refund_id is not null then
    insert into financial_audit_log(target_user_id,action,provider,provider_event_id,correlation_id,metadata)
      select c.user_id,'payment_return_'||p_status,p_provider,p_refund_id,previous.correlation_id,jsonb_build_object('payment_id',p_payment_id,'attempt',previous.attempts,'error',p_error) from payment_captures c where c.provider=p_provider and c.payment_id=p_payment_id;
  end if;
  return true;
end $$;

CREATE FUNCTION public.update_profile_046(p_user_id uuid, p_changes jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare current_profile users; changed users;
begin
  if jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_changes) as field where field not in ('username','display_name','bio','country','avatar_url','external_links','user_types','genres','onboarding_complete')) then raise exception 'Invalid profile fields' using errcode='P1004'; end if;
  select * into current_profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  changed:=jsonb_populate_record(current_profile,p_changes);
  if changed.username !~ '^[a-z0-9_]{3,30}$' or length(changed.display_name) not between 1 and 50 or length(changed.bio)>280 or cardinality(changed.external_links)>3
    or cardinality(changed.user_types) not between 1 and 4 or not changed.user_types<@array['reader','author','newbie_writer','creator']::text[]
    or cardinality(changed.genres)>20 then raise exception 'Invalid profile' using errcode='P1004'; end if;
  if changed.onboarding_complete and cardinality(changed.genres)<5 then raise exception 'Choose at least five genres' using errcode='P1004'; end if;
  update users set username=changed.username,display_name=changed.display_name,bio=changed.bio,country=changed.country,avatar_url=changed.avatar_url,
    external_links=changed.external_links,user_types=changed.user_types,genres=changed.genres,onboarding_complete=changed.onboarding_complete where id=p_user_id returning * into changed;
  return to_jsonb(changed);
end $_$;

CREATE FUNCTION public.update_profile_055(p_user_id uuid, p_changes jsonb, p_pin_hash text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare profile users; result jsonb;
begin
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_pin_hash is not null then
    if p_changes->>'onboarding_complete' is distinct from 'true' or p_pin_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' then raise exception 'Invalid onboarding PIN' using errcode='P1004';end if;
    if profile.pin_hash is not null and profile.pin_hash<>p_pin_hash then raise exception 'PIN changed; retry' using errcode='P1001';end if;
    if profile.pin_hash is null and profile.onboarding_complete then raise exception 'Use PIN settings after onboarding' using errcode='P1004';end if;
  end if;
  result:=update_profile_046(p_user_id,p_changes);
  if p_pin_hash is not null and profile.pin_hash is null then
    update users set pin_hash=p_pin_hash where id=p_user_id;
    insert into security_events(user_id,event_type,metadata) values(p_user_id,'pin_set',jsonb_build_object('source','onboarding'));
  end if;
  return result;
end $_$;

CREATE FUNCTION public.update_profile_atomic(p_user_id uuid, p_changes jsonb, p_pin_hash text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare profile users;upload profile_avatar_uploads;changes jsonb:=p_changes-'avatar_upload_id';result jsonb;
begin
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_changes?'avatar_upload_id' then
    if coalesce(p_changes->>'avatar_upload_id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' then raise exception 'Invalid avatar reference' using errcode='P1004';end if;
    select * into upload from profile_avatar_uploads where id=(p_changes->>'avatar_upload_id')::uuid and user_id=p_user_id for update;
    if not found or upload.public_url is null or upload.state not in ('uploaded','committed') or (upload.state='uploaded' and upload.expires_at<=now()) then raise exception 'Avatar expired or unavailable' using errcode='P1001';end if;
    if changes?'avatar_url' and changes->>'avatar_url' is distinct from upload.public_url then raise exception 'Conflicting avatar reference' using errcode='P1004';end if;
    changes:=jsonb_set(changes,'{avatar_url}',to_jsonb(upload.public_url));
  elsif changes?'avatar_url' and changes->>'avatar_url' is not null and changes->>'avatar_url' is distinct from profile.avatar_url then raise exception 'Use an owned avatar upload' using errcode='P1004';end if;
  result:=update_profile_055(p_user_id,changes,p_pin_hash);
  if changes?'avatar_url' then
    update profile_avatar_uploads set state='abandoned',expires_at=now() where user_id=p_user_id and state='committed' and public_url is distinct from changes->>'avatar_url';
    if upload.id is not null then update profile_avatar_uploads set state='committed' where id=upload.id;end if;
    if profile.avatar_url is distinct from changes->>'avatar_url' then insert into security_events(user_id,event_type,metadata) values(p_user_id,'avatar_changed',jsonb_build_object('upload_id',upload.id));end if;
  end if;
  return result;
end $_$;

CREATE FUNCTION public.update_shelf_progress(p_user_id uuid, p_entry_id uuid, p_pages integer, p_percent numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare entry shelf_books; pages integer; changed boolean;
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  if (p_pages is null and p_percent is null) or p_pages<0 or p_pages>100000 or p_percent<0 or p_percent>100 then raise exception 'Invalid progress' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select sb.* into entry from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.id=p_entry_id and sb.user_id=p_user_id and s.user_id=p_user_id for update of sb;
  if not found then raise exception 'Shelf entry not found' using errcode='P1005'; end if;
  select page_count into pages from books where id=(select coalesce(canonical_edition_id,id) from books where id=entry.book_id);
  if p_pages is not null and pages>0 and p_pages>pages then raise exception 'Progress exceeds page count' using errcode='P1004'; end if;
  if p_pages is not null and pages>0 then p_percent:=round(p_pages*100.0/pages,2); end if;
  changed:=(p_pages is not null and p_pages is distinct from entry.progress_pages) or (p_percent is not null and p_percent is distinct from entry.progress_percent);
  if changed then
    update shelf_books set progress_pages=coalesce(p_pages,progress_pages),progress_percent=coalesce(p_percent,progress_percent),updated_at=now() where id=entry.id returning * into entry;
    perform award_xp_once(p_user_id,5,'progress_update','progress:'||entry.id||':'||(now() at time zone 'UTC')::date);
  end if;
  return to_jsonb(entry);
end $$;

CREATE FUNCTION public.validate_appeal_report() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare report content_reports;owner_id uuid;kind text;
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if length(trim(new.reason)) not between 10 and 500 then raise exception 'Invalid appeal' using errcode='P1004';end if;
  if new.report_id is not null then
    select * into report from content_reports where id=new.report_id for share;
    if not found then raise exception 'Report unavailable' using errcode='P1005';end if;
    case report.entity_type when 'review' then select user_id into owner_id from reviews where id=report.entity_id;
      when 'quote' then select user_id into owner_id from quotes where id=report.entity_id;
      when 'user' then owner_id:=report.entity_id;else null;end case;
    if owner_id is distinct from new.user_id or report.status not in('removed','warned') then raise exception 'Appealable action required' using errcode='P1003';end if;
    kind:=case when report.entity_type='user' then 'profile' else report.entity_type end;
    if(new.content_type is not null and new.content_type<>kind)or(new.content_id is not null and new.content_id<>report.entity_id)then raise exception 'Conflicting appeal target' using errcode='P1004';end if;
    new.content_type:=kind;new.content_id:=report.entity_id;
  elsif new.content_type is not null or new.content_id is not null then
    case new.content_type when 'review' then select user_id into owner_id from reviews where id=new.content_id;
      when 'quote' then select user_id into owner_id from quotes where id=new.content_id;
      when 'profile' then owner_id:=new.content_id;
      when 'debate' then select user_id into owner_id from book_debates where id=new.content_id;else null;end case;
    if new.content_type is null or new.content_id is null or owner_id is distinct from new.user_id then raise exception 'Owned appeal target required' using errcode='P1003';end if;
  end if;
  return new;
end $$;

CREATE FUNCTION public.writer_question_catalog(p_filter text, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with visible as materialized(
    select q.id,q.user_id,q.question,q.tags,q.created_at,(select count(*) from ask_writer_answers a join users answerer on answerer.id=a.user_id where a.question_id=q.id and not answerer.is_banned and answerer.deleted_at is null) as answer_count,
      jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url,'is_verified_author',u.is_verified_author) as author
    from ask_writer_questions q join users u on u.id=q.user_id where not u.is_banned and u.deleted_at is null
  ), filtered as materialized(select * from visible where p_filter<>'unanswered' or answer_count=0),page as(
    select * from filtered where p_cursor is null or(case when p_filter='most_answered' then(answer_count,created_at,id)<((p_cursor->>'count')::bigint,(p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid) else(created_at,id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid) end)
    order by case when p_filter='most_answered' then answer_count end desc,created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1
  )select jsonb_build_object('total',(select count(*) from filtered),'questions',coalesce((select jsonb_agg(to_jsonb(page) order by case when p_filter='most_answered' then answer_count end desc,created_at desc,id desc) from page),'[]'::jsonb));
$$;

CREATE FUNCTION public.writer_question_thread(p_question uuid, p_viewer uuid DEFAULT NULL::uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with question as(select q.*,jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url,'is_verified_author',u.is_verified_author) as author from ask_writer_questions q join users u on u.id=q.user_id where q.id=p_question and not u.is_banned and u.deleted_at is null),
  visible_answers as not materialized(select a.*,jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url,'is_verified_author',u.is_verified_author) as author from ask_writer_answers a join users u on u.id=a.user_id where a.question_id=p_question and not u.is_banned and u.deleted_at is null),
  page as(select * from visible_answers where id is distinct from(select best_answer_id from question) and(p_before is null or(created_at,id)<(p_before,p_id)) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
  select jsonb_build_object('question',jsonb_build_object('id',q.id,'user_id',q.user_id,'question',q.question,'tags',q.tags,'created_at',q.created_at,'author',q.author,'answer_count',(select count(*) from visible_answers)),
    'bestAnswer',(select to_jsonb(a) from visible_answers a where a.id=q.best_answer_id),
    'answers',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'actorId',p_viewer,'isOwner',coalesce(q.user_id=p_viewer,false),
    'canAnswer',exists(select 1 from users where id=p_viewer and not is_banned and deleted_at is null and(is_verified_author or xp>1000))) from question q;
$$;

CREATE FUNCTION public.writing_prompt_leaderboard(p_period text,p_viewer uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
declare since timestamp with time zone;
begin
 if p_period is null or p_period not in('weekly','monthly','all_time')then raise exception 'Invalid period'using errcode='P1004';end if;
 since:=case p_period when 'weekly'then now()-interval '7 days'when 'monthly'then now()-interval '1 month'else '-infinity'::timestamp with time zone end;
 return coalesce((select jsonb_agg(to_jsonb(ranked)order by rank)from(
  select row_number()over(order by count(*)desc,u.id)rank,u.id user_id,u.display_name,u.username,u.avatar_url,u.xp,count(*)submissions_count
  from writing_prompt_submissions s join users u on u.id=s.user_id
  where s.created_at>=since and reading_author_visible(p_viewer,u.id)
  group by u.id order by count(*)desc,u.id limit 20
 )ranked),'[]'::jsonb);
end $$;
CREATE FUNCTION public.writing_challenge_leaderboard(p_challenge uuid,p_viewer uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $$
 select coalesce(jsonb_agg(to_jsonb(ranked)order by total_words desc,user_id),'[]'::jsonb)from(
  select u.id user_id,coalesce(sum(s.word_count),0)total_words,count(*)submission_count,jsonb_build_object('display_name',u.display_name,'username',u.username)users
  from writing_challenge_submissions s join users u on u.id=s.user_id
  where s.challenge_id=p_challenge and reading_author_visible(p_viewer,u.id)
  group by u.id order by total_words desc,u.id limit 100
 )ranked
$$;

CREATE FUNCTION public.writing_plan_input(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('locale',case when u.preferred_locale in ('en','fr','de') then u.preferred_locale else 'en' end,'genres',u.genres[1:5],'user_types',u.user_types,
    'challenges',coalesce((select jsonb_agg(c.title order by c.id) from(select c.id,left(c.title,200) as title from writing_challenges c join writing_challenge_participants p on p.challenge_id=c.id where p.user_id=u.id order by p.joined_at desc,c.id limit 5)c),'[]'::jsonb)) from users u where u.id=p_user_id;
$$;

CREATE FUNCTION public.writing_progress_snapshot(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with entries as materialized (
    select 'prompt' as kind,coalesce(word_count,0) as words,created_at as submitted_at from writing_prompt_submissions where user_id=p_user_id
    union all
    select 'challenge',coalesce(word_count,0),submitted_at from writing_challenge_submissions where user_id=p_user_id
  ), weeks as (
    select (date_trunc('week',now() at time zone 'UTC')::date-7*n)::date as week_start from generate_series(0,6) n
  ), weekly as (
    select w.week_start,coalesce(sum(e.words),0) as words from weeks w left join entries e
      on e.submitted_at>=w.week_start::timestamp at time zone 'UTC'
      and e.submitted_at<(w.week_start+7)::timestamp at time zone 'UTC'
    group by w.week_start
  )
  select jsonb_build_object(
    'total_words',coalesce((select sum(words) from entries),0),
    'prompts_completed',(select count(*) from entries where kind='prompt'),
    'challenges_completed',(select count(*) from entries where kind='challenge'),
    'workshop_critiques',(select count(*) from workshop_feedback where user_id=p_user_id),
    'writing_streak',u.writing_streak,'xp',u.xp,
    'weekly_words',(select jsonb_agg(jsonb_build_object('week_start',week_start,'words',words) order by week_start) from weekly),
    'badges',coalesce((select jsonb_agg(jsonb_build_object('badge_id',badge_id,'awarded_at',awarded_at) order by awarded_at desc,badge_id) from user_badges where user_id=p_user_id and badge_id in ('first_draft','workshop_regular','prompt_runner','craft_scholar','writing_streak_7','writing_streak_30','first_prompt','prolific_writer')),'[]'::jsonb))
  from users u where u.id=p_user_id and not u.is_banned and u.deleted_at is null;
$$;

-- Indexes, relationships, triggers, row security and permissions.

ALTER TABLE public.book_catalog_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.book_catalog_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE public.events
    ADD CONSTRAINT paid_event_price CHECK (((NOT is_paid) OR ((ticket_price IS NOT NULL) AND ((ticket_price >= 0.5) AND (ticket_price <= (5000)::numeric)) AND (currency = ANY (ARRAY['USD'::text, 'NGN'::text, 'EUR'::text]))))) NOT VALID;

CREATE INDEX appeal_action_cursor ON public.content_reports USING btree (status, COALESCE(resolved_at, created_at) DESC, id DESC);

CREATE INDEX appeal_owner_cursor ON public.appeals USING btree (user_id, created_at DESC, id DESC);

CREATE INDEX appeal_queue_cursor ON public.appeals USING btree (status, created_at, id);

CREATE INDEX appeal_report_status ON public.appeals USING btree (report_id, status, created_at DESC);

CREATE INDEX arc_application_cursor ON public.arc_applications USING btree (arc_id, applied_at DESC, id DESC) INCLUDE (status, reader_id);

CREATE INDEX arc_owner_cursor ON public.arcs USING btree (author_id, created_at DESC, id DESC);

CREATE INDEX arc_public_cursor ON public.arcs USING btree (created_at DESC, id DESC) WHERE is_active;

CREATE INDEX auth_factor_challenge_expiry ON public.auth_factor_challenges USING btree (expires_at);

CREATE INDEX auth_factor_grant_user ON public.auth_factor_grants USING btree (user_id, expires_at);

CREATE INDEX author_qa_answer_cursor ON public.author_qa USING btree (author_id, COALESCE(answered_at, created_at) DESC, id DESC) WHERE (is_public AND (answer IS NOT NULL));

CREATE INDEX author_qa_owner_cursor ON public.author_qa USING btree (author_id, created_at DESC, id DESC);

CREATE INDEX author_work_claims_work ON public.author_work_claims USING btree (work_id, author_id);

CREATE INDEX avatar_upload_cleanup ON public.profile_avatar_uploads USING btree (backend, state, expires_at);

CREATE INDEX avatar_upload_owner ON public.profile_avatar_uploads USING btree (user_id, fingerprint);

CREATE INDEX best_answer_reward_events ON public.xp_ledger USING btree (event_key) WHERE (reason = 'best_answer_chosen'::text);

CREATE INDEX book_chain_cursor ON public.pass_the_book_chains USING btree (created_at DESC, id DESC);

CREATE INDEX book_chain_roster_cursor ON public.pass_the_book_nodes USING btree (chain_id, "position", id);

CREATE INDEX book_edition_identifiers_book ON public.book_edition_identifiers USING btree (book_id);

CREATE INDEX book_pass_received_cursor ON public.book_passes USING btree (recipient_id, created_at DESC, id DESC);

CREATE INDEX book_pass_sent_cursor ON public.book_passes USING btree (sender_id, created_at DESC, id DESC);

CREATE INDEX book_work_identifiers_work ON public.book_work_identifiers USING btree (work_id);

CREATE INDEX books_admin_created ON public.books USING btree (created_at DESC, ((id)::text) DESC) WHERE (canonical_edition_id IS NULL);

CREATE INDEX books_canonical_edition ON public.books USING btree (canonical_edition_id) WHERE (canonical_edition_id IS NOT NULL);

CREATE INDEX books_isbn10_lookup ON public.books USING btree (isbn_10) WHERE (isbn_10 IS NOT NULL);

CREATE INDEX books_work_editions ON public.books USING btree (work_id, id);

CREATE INDEX buddy_catalog_cursor ON public.buddy_reads USING btree (created_at DESC, id DESC);

CREATE INDEX buddy_note_cursor ON public.buddy_read_notes USING btree (buddy_read_id, created_at DESC, id DESC);

CREATE INDEX captures_by_entity ON public.payment_captures USING btree (entity_type, entity_id);

CREATE INDEX captures_owned_recovery ON public.payment_captures USING btree (user_id, entity_type, entity_id) WHERE (NOT credited);

CREATE INDEX challenge_catalog_cursor ON public.challenges USING btree (created_at DESC, id DESC);

CREATE INDEX challenge_roster_cursor ON public.challenge_participants USING btree (challenge_id, joined_at, user_id);

CREATE INDEX checkout_reconciliation_due ON public.checkout_reconciliations USING btree (status, next_attempt_at);

CREATE UNIQUE INDEX custom_theme_single_active ON public.custom_themes USING btree (is_active) WHERE is_active;

CREATE INDEX debate_catalog_cursor ON public.book_debates USING btree (created_at DESC, id DESC);

CREATE INDEX digest_email_pending ON public.digest_deliveries USING btree (status, period_start, user_id);

CREATE INDEX discovery_recent_shelves ON public.shelf_books USING btree (added_at DESC, user_id, book_id);

CREATE INDEX email_unsubscribe_expiry ON public.email_unsubscribe_proofs USING btree (expires_at);

CREATE INDEX event_ticket_capacity ON public.event_tickets USING btree (event_id, status, reserved_until);

CREATE INDEX follows_release_audience ON public.follows USING btree (following_id, follower_id, created_at);

CREATE INDEX goodreads_book_identity_book ON public.goodreads_book_identities USING btree (book_id);

CREATE INDEX helpfulness_period_review ON public.review_helpfulness_votes USING btree (cast_at, review_id) WHERE is_helpful;

CREATE INDEX idx_affiliate_clicks_book ON public.affiliate_link_clicks USING btree (book_id);

CREATE INDEX idx_affiliate_clicks_created ON public.affiliate_link_clicks USING btree (created_at);

CREATE INDEX idx_author_books_author ON public.author_books USING btree (author_id);

CREATE INDEX idx_author_qa_asked_by ON public.author_qa USING btree (asked_by);

CREATE INDEX idx_author_qa_author ON public.author_qa USING btree (author_id);

CREATE INDEX writing_prompt_ranking ON public.writing_prompt_submissions(created_at,user_id);
CREATE INDEX writing_challenge_ranking ON public.writing_challenge_submissions(challenge_id,user_id)INCLUDE(word_count);

CREATE INDEX maintenance_jobs_retention ON public.maintenance_jobs(lease_until,updated_at);

ALTER TABLE public.account_hardening_notices ADD FOREIGN KEY(user_id)REFERENCES public.users(id)ON DELETE CASCADE;
CREATE INDEX books_similarity_author ON public.books(author_name,id)WHERE canonical_edition_id IS NULL;
CREATE INDEX books_similarity_language ON public.books(language,id)WHERE canonical_edition_id IS NULL;
CREATE INDEX books_similarity_genres ON public.books USING gin(genres)WHERE canonical_edition_id IS NULL;
CREATE INDEX books_affiliate_health ON public.books(have_read_count DESC,id)WHERE canonical_edition_id IS NULL;
CREATE INDEX affiliate_health_retention ON public.affiliate_health_log(flagged_at,id);
CREATE UNIQUE INDEX affiliate_health_daily ON public.affiliate_health_log(book_id,issue,((flagged_at AT TIME ZONE 'UTC')::date));
CREATE INDEX affiliate_clicks_health ON public.affiliate_link_clicks(book_id)WHERE is_affiliate;
CREATE INDEX outbox_processed_retention ON public.outbox_events(processed_at,id)WHERE status='processed';
CREATE INDEX outbox_failed_retention ON public.outbox_events(created_at,id)WHERE status='failed';
CREATE INDEX revoked_push_retention ON public.revoked_push_sessions(revoked_at,session_hash);

CREATE INDEX author_posts_cursor ON public.author_posts(author_id,created_at DESC,id DESC);
CREATE INDEX reading_sessions_cursor ON public.reading_sessions(user_id,created_at DESC,id DESC);

CREATE INDEX account_exports_expiry ON public.account_export_jobs(expires_at,id);
CREATE INDEX account_exports_epochs ON public.account_export_jobs(epoch,expires_at);
CREATE INDEX account_export_version_cleanup ON public.account_export_versions(removed_epoch);
CREATE INDEX account_export_current_cleanup ON public.account_export_current(epoch);

CREATE INDEX idx_books_author ON public.books USING btree (author_name);

CREATE INDEX idx_books_google_id ON public.books USING btree (google_books_id);

CREATE INDEX idx_books_isbn13 ON public.books USING btree (isbn_13);

CREATE INDEX idx_books_search ON public.books USING gin (search_vector);

CREATE INDEX idx_brm_brid ON public.buddy_read_messages USING btree (buddy_read_id);

CREATE INDEX idx_evt_token ON public.email_verification_tokens USING btree (token);

CREATE INDEX idx_financial_audit_actor ON public.financial_audit_log USING btree (actor_user_id);

CREATE INDEX idx_financial_audit_created_at ON public.financial_audit_log USING btree (created_at DESC);

CREATE INDEX idx_follows_following ON public.follows USING btree (following_id);

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, is_read);

CREATE INDEX idx_outbox_aggregate ON public.outbox_events USING btree (aggregate_type, aggregate_id);

CREATE INDEX idx_outbox_pending_created ON public.outbox_events USING btree (status, created_at);

CREATE INDEX idx_outbox_retry_scan ON public.outbox_events USING btree (status, next_attempt_at, created_at);

CREATE INDEX idx_pl_active ON public.promoted_listings USING btree (is_active, start_date, end_date);

CREATE INDEX idx_quotes_book ON public.quotes USING btree (book_id);

CREATE INDEX idx_rc_referrer ON public.referral_commissions USING btree (referrer_id);

CREATE INDEX idx_reading_sessions_book ON public.reading_sessions USING btree (book_id);

CREATE INDEX idx_reading_sessions_started ON public.reading_sessions USING btree (started_at);

CREATE INDEX idx_reading_sessions_user ON public.reading_sessions USING btree (user_id);

CREATE INDEX idx_reports_status ON public.content_reports USING btree (status);

CREATE INDEX idx_review_replies_review ON public.review_replies USING btree (review_id);

CREATE INDEX idx_review_replies_user ON public.review_replies USING btree (user_id);

CREATE INDEX idx_reviews_book ON public.reviews USING btree (book_id);

CREATE INDEX idx_reviews_created ON public.reviews USING btree (created_at DESC);

CREATE INDEX idx_reviews_user ON public.reviews USING btree (user_id);

CREATE INDEX idx_rl_user ON public.reading_lists USING btree (user_id);

CREATE INDEX idx_security_events_created ON public.security_events USING btree (created_at);

CREATE INDEX idx_security_events_user ON public.security_events USING btree (user_id);

CREATE INDEX idx_shelf_books_book ON public.shelf_books USING btree (book_id);

CREATE INDEX idx_shelf_books_user ON public.shelf_books USING btree (user_id);

CREATE INDEX idx_shelves_user ON public.shelves USING btree (user_id);



CREATE INDEX idx_sub_status ON public.subscriptions USING btree (status);

CREATE INDEX idx_sub_user ON public.subscriptions USING btree (user_id);

CREATE INDEX idx_tips_creator ON public.tips USING btree (creator_id);

CREATE INDEX idx_tips_recipient ON public.tips USING btree (recipient_id);

CREATE INDEX idx_tips_user ON public.tips USING btree (user_id);

CREATE INDEX idx_users_email_login ON public.users USING btree (email) WHERE (password_hash IS NOT NULL);

CREATE INDEX idx_users_referral_code ON public.users USING btree (referral_code);

CREATE UNIQUE INDEX idx_users_telegram_id ON public.users USING btree (telegram_id) WHERE (telegram_id IS NOT NULL);

CREATE INDEX idx_users_username ON public.users USING btree (username);

CREATE INDEX idx_wcv_submission ON public.writing_challenge_votes USING btree (submission_id);

CREATE INDEX list_follows_user ON public.reading_list_follows USING btree (user_id, list_id);

CREATE INDEX moderation_log_cursor ON public.moderation_log USING btree (created_at DESC, id DESC);

CREATE INDEX notifications_user_cursor ON public.notifications USING btree (user_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX payout_intent ON public.payout_requests USING btree (user_id, idempotency_key);

CREATE UNIQUE INDEX payout_settlement_receipt ON public.payout_requests USING btree (method, settlement_reference) WHERE (settlement_reference IS NOT NULL);

CREATE INDEX payout_work_queue ON public.payout_requests USING btree (next_attempt_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));

CREATE INDEX promotions_admin_created ON public.promoted_listings USING btree (created_at DESC, ((id)::text) DESC);

CREATE UNIQUE INDEX provider_subscription_binding ON public.subscriptions USING btree (provider, provider_subscription_id) WHERE (provider_subscription_id IS NOT NULL);

CREATE INDEX public_lists_cursor ON public.reading_lists USING btree (created_at DESC, id DESC) WHERE is_public;

CREATE INDEX push_subscriptions_owner ON public.push_subscriptions(user_id,expires_at,id);
CREATE INDEX push_subscriptions_session ON public.push_subscriptions(session_hash);
CREATE INDEX push_subscriptions_expiry ON public.push_subscriptions(expires_at,id);
CREATE UNIQUE INDEX outbox_push_delivery_once ON public.outbox_events(aggregate_id) WHERE event_type='deliver_push';

CREATE INDEX reviews_pending_moderation ON public.reviews(created_at DESC,id DESC)WHERE moderation_status='pending'AND NOT is_hidden;
CREATE UNIQUE INDEX outbox_review_moderation_once ON public.outbox_events(aggregate_id)WHERE event_type='moderate_review';

CREATE INDEX quote_book_cursor ON public.quotes USING btree (book_id, created_at DESC, id DESC) WHERE (NOT is_hidden);

CREATE INDEX quote_owner_cursor ON public.quotes USING btree (user_id, created_at DESC, id DESC) WHERE (NOT is_hidden);

CREATE INDEX reading_list_book_cursor ON public.reading_list_books USING btree (list_id, added_at DESC, book_id DESC);

CREATE INDEX reading_list_catalog_cursor ON public.reading_lists USING btree (user_id, created_at DESC, id DESC);

CREATE INDEX reading_lists_user_cursor ON public.reading_lists USING btree (user_id, created_at DESC, id DESC);

CREATE INDEX reading_room_catalog_cursor ON public.reading_rooms USING btree (created_at DESC, id DESC);

CREATE INDEX reading_room_member_cursor ON public.room_participants USING btree (room_id, joined_at DESC, user_id DESC);

CREATE INDEX reading_room_milestone_cursor ON public.reading_room_milestones USING btree (room_id, unlock_date, id);

CREATE INDEX reading_room_post_cursor ON public.reading_room_posts USING btree (room_id, milestone_id, created_at DESC, id DESC);

CREATE INDEX reading_session_activity_days ON public.reading_sessions USING btree (user_id, (((created_at AT TIME ZONE 'UTC'::text))::date));

CREATE UNIQUE INDEX referral_badge_outbox ON public.outbox_events USING btree (aggregate_id) WHERE ((aggregate_type = 'referrals'::text) AND (event_type = 'check_badges'::text));

CREATE INDEX release_email_audience ON public.release_email_campaigns USING btree (created_at, post_id) WHERE (NOT audience_complete);

CREATE INDEX release_email_pending ON public.release_email_deliveries USING btree (status, updated_at, post_id, user_id);

CREATE INDEX reports_all_cursor ON public.content_reports USING btree (created_at DESC, id DESC);

CREATE INDEX reports_queue_cursor ON public.content_reports USING btree (status, created_at DESC, id DESC);

CREATE UNIQUE INDEX review_conversion_xp_event ON public.outbox_events USING btree (aggregate_id) WHERE ((aggregate_type = 'review_conversions'::text) AND (event_type = 'award_xp'::text));

CREATE INDEX review_conversions_review ON public.review_conversions USING btree (review_id) WHERE (review_id IS NOT NULL);

CREATE INDEX review_conversions_reviewer ON public.review_conversions USING btree (reviewer_id, created_at DESC) WHERE (reviewer_id IS NOT NULL);

CREATE INDEX review_conversions_week ON public.review_conversions USING btree (created_at, reviewer_id) WHERE (reviewer_id IS NOT NULL);

CREATE INDEX reviews_feed ON public.reviews USING btree (user_id, created_at DESC, id DESC) WHERE ((moderation_status = 'published'::text) AND (NOT is_hidden));

CREATE INDEX reviews_published_moods ON public.reviews USING gin (mood_tags) WHERE ((moderation_status = 'published'::text) AND (NOT is_hidden));

CREATE INDEX reviews_user_cursor ON public.reviews USING btree (user_id, created_at DESC, id DESC);

CREATE INDEX reviews_visible_helpfulness_cursor ON public.reviews USING btree (book_id, helpful_votes DESC, created_at DESC, id DESC) INCLUDE (user_id, rating) WHERE ((moderation_status = 'published'::text) AND (NOT is_hidden));

CREATE INDEX seasons_admin_created ON public.seasonal_events USING btree (start_date DESC, ((id)::text) DESC);

CREATE INDEX shelf_books_feed ON public.shelf_books USING btree (user_id, added_at DESC, id DESC);

CREATE INDEX shelf_books_latest_edition ON public.shelf_books USING btree (shelf_id, user_id, updated_at DESC, id DESC);

CREATE INDEX shelf_books_user_cursor ON public.shelf_books USING btree (user_id, added_at DESC, id DESC);

CREATE UNIQUE INDEX shelves_intent ON public.shelves USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX subscription_expirations ON public.subscriptions USING btree (current_period_end, user_id) WHERE ((status = 'active'::text) AND (current_period_end IS NOT NULL));

CREATE UNIQUE INDEX subscription_intent ON public.subscriptions USING btree (user_id, idempotency_key);

CREATE INDEX themes_admin_created ON public.custom_themes USING btree (created_at DESC, name DESC);

CREATE UNIQUE INDEX ticket_intent_identity ON public.event_tickets USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE UNIQUE INDEX ticket_revenue_identity ON public.event_revenue USING btree (ticket_id) WHERE (ticket_id IS NOT NULL);

CREATE UNIQUE INDEX tip_intent ON public.tips USING btree (user_id, idempotency_key);

CREATE INDEX users_admin_created ON public.users USING btree (created_at DESC, ((id)::text) DESC);

CREATE INDEX users_avatar_reference ON public.users USING hash (avatar_url) WHERE (avatar_url IS NOT NULL);

CREATE INDEX users_email_lookup ON public.users USING hash (lower(email)) WHERE (email IS NOT NULL);

CREATE UNIQUE INDEX users_google_identity ON public.users USING btree (google_id) WHERE (google_id IS NOT NULL);

CREATE INDEX users_referred_by ON public.users USING btree (referred_by) WHERE (referred_by IS NOT NULL);

CREATE INDEX users_telegram_id_idx ON public.users USING btree (telegram_id) WHERE (telegram_id IS NOT NULL);

CREATE INDEX writer_answer_cursor ON public.ask_writer_answers USING btree (question_id, created_at DESC, id DESC) INCLUDE (user_id);

CREATE INDEX writer_question_cursor ON public.ask_writer_questions USING btree (created_at DESC, id DESC) INCLUDE (user_id);

CREATE INDEX writing_admin_created ON public.writing_challenges USING btree (created_at DESC, ((id)::text) DESC);

CREATE UNIQUE INDEX writing_participant_identity ON public.writing_challenge_participants USING btree (challenge_id, user_id);

CREATE INDEX xp_ledger_period_user ON public.xp_ledger USING btree (created_at, user_id) INCLUDE (amount);

DO $$DECLARE item record;BEGIN
 FOR item IN select tablename from pg_tables where schemaname='public'and tablename<>'maintenance_jobs'LOOP
  EXECUTE format('CREATE TRIGGER maintenance_write_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_maintenance_write()',item.tablename);
 END LOOP;
END $$;

DO $$DECLARE source jsonb;BEGIN
 FOR source IN select value from jsonb_array_elements(public.account_export_sources())LOOP
  EXECUTE format('CREATE TRIGGER account_export_barrier BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.account_export_barrier()',source->>'relation');
  EXECUTE format('CREATE TRIGGER account_export_capture BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_account_export_version()',source->>'relation');
  EXECUTE format('CREATE TRIGGER "00_account_export_mark" AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mark_account_export_version()',source->>'relation');
 END LOOP;
END $$;

CREATE TRIGGER aa_author_post_body BEFORE INSERT OR UPDATE ON public.author_posts FOR EACH ROW EXECUTE FUNCTION public.synchronize_content_aliases('content', 'body');

CREATE TRIGGER aa_book_edition BEFORE INSERT OR UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.guard_book_edition();

CREATE TRIGGER aa_reading_debate_guard BEFORE INSERT OR UPDATE OF question ON public.book_debates FOR EACH ROW EXECUTE FUNCTION public.guard_reading_debate();

CREATE TRIGGER aa_reading_list_guard BEFORE INSERT OR UPDATE OF name, description, is_public ON public.reading_lists FOR EACH ROW EXECUTE FUNCTION public.guard_reading_list();

CREATE TRIGGER aa_reading_room_milestone_guard BEFORE INSERT ON public.reading_room_milestones FOR EACH ROW EXECUTE FUNCTION public.guard_reading_room_content();

CREATE TRIGGER aa_reading_room_name BEFORE INSERT OR UPDATE ON public.reading_rooms FOR EACH ROW EXECUTE FUNCTION public.synchronize_content_aliases('title', 'name');

CREATE TRIGGER aa_reading_room_owner BEFORE INSERT OR UPDATE ON public.reading_rooms FOR EACH ROW EXECUTE FUNCTION public.synchronize_content_aliases('creator_id', 'created_by');

CREATE TRIGGER aa_reading_room_post_guard BEFORE INSERT ON public.reading_room_posts FOR EACH ROW EXECUTE FUNCTION public.guard_reading_room_content();

CREATE TRIGGER aa_record_reading_activity_day BEFORE INSERT ON public.reading_sessions FOR EACH ROW EXECUTE FUNCTION public.record_reading_activity_day();

CREATE TRIGGER aa_shelf_slug BEFORE INSERT ON public.shelves FOR EACH ROW EXECUTE FUNCTION public.default_custom_shelf_slug();

CREATE TRIGGER aa_workshop_initial_count BEFORE INSERT ON public.workshop_rooms FOR EACH ROW EXECUTE FUNCTION public.canonical_workshop_member_count();

CREATE TRIGGER account_locale_initialized BEFORE UPDATE OF preferred_locale ON public.users FOR EACH ROW EXECUTE FUNCTION public.mark_account_locale_initialized();

CREATE TRIGGER appeal_report_owner BEFORE INSERT ON public.appeals FOR EACH ROW EXECUTE FUNCTION public.validate_appeal_report();

CREATE TRIGGER arc_application_decision_guard BEFORE UPDATE OF status, reader_id, arc_id ON public.arc_applications FOR EACH ROW EXECUTE FUNCTION public.guard_arc_application_decision();

CREATE TRIGGER arc_application_work_guard BEFORE INSERT ON public.arc_applications FOR EACH ROW EXECUTE FUNCTION public.guard_arc_work_application();

CREATE TRIGGER author_answer_text_guard BEFORE INSERT OR UPDATE OF answer ON public.author_qa FOR EACH ROW EXECUTE FUNCTION public.guard_author_answer_text();

CREATE TRIGGER author_arc_work_guard BEFORE INSERT OR UPDATE OF book_id, author_id, is_active ON public.arcs FOR EACH ROW EXECUTE FUNCTION public.guard_author_book_link();

CREATE TRIGGER author_post_work_guard BEFORE INSERT OR UPDATE OF book_id, author_id ON public.author_posts FOR EACH ROW EXECUTE FUNCTION public.guard_author_book_link();

CREATE TRIGGER author_release_email AFTER INSERT OR UPDATE OF type, book_id ON public.author_posts FOR EACH ROW EXECUTE FUNCTION public.enqueue_release_email();

CREATE TRIGGER books_search_vector_trigger BEFORE INSERT OR UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.books_search_vector_update();

CREATE TRIGGER buddy_membership_capacity BEFORE INSERT ON public.buddy_read_members FOR EACH ROW EXECUTE FUNCTION public.guard_buddy_membership();

CREATE TRIGGER buddy_note_scope BEFORE INSERT OR UPDATE ON public.buddy_read_notes FOR EACH ROW EXECUTE FUNCTION public.guard_buddy_note_scope();

CREATE TRIGGER canonical_profile_fields BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_profile_fields();

CREATE TRIGGER canonical_workshop_member_count BEFORE UPDATE OF member_count ON public.workshop_rooms FOR EACH ROW EXECUTE FUNCTION public.canonical_workshop_member_count();

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.appeals FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.arcs FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('author_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.ask_writer_answers FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.ask_writer_questions FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.author_posts FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('author_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.author_qa FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('asked_by');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.author_verification_requests FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.book_debates FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.book_passes FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('sender_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.buddy_read_notes FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.buddy_reads FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('created_by');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.community_notes FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('author_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.content_reports FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('reporter_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('organizer_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.reading_lists FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.reading_room_milestones FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('created_by');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.reading_room_posts FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.reading_rooms FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('created_by');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.reading_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.workshop_feedback FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.workshop_rooms FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('facilitator_id');

CREATE TRIGGER content_intent_commit AFTER INSERT ON public.workshop_submissions FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.appeals FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.arcs FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('author_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.ask_writer_answers FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.ask_writer_questions FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.author_posts FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('author_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.author_qa FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('asked_by');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.author_verification_requests FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.book_debates FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.book_passes FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('sender_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.buddy_read_notes FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.buddy_reads FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('created_by');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.community_notes FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('author_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.content_reports FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('reporter_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('organizer_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.reading_lists FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.reading_room_milestones FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('created_by');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.reading_room_posts FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.reading_rooms FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('created_by');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.reading_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.guard_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.workshop_feedback FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.workshop_rooms FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('facilitator_id');

CREATE TRIGGER content_intent_guard BEFORE INSERT ON public.workshop_submissions FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER custom_themes_updated_at BEFORE UPDATE ON public.custom_themes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER enqueue_subscription_checkout AFTER INSERT ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.enqueue_checkout_reconciliation();

CREATE TRIGGER enqueue_tip_checkout AFTER INSERT ON public.tips FOR EACH ROW EXECUTE FUNCTION public.enqueue_checkout_reconciliation();

CREATE TRIGGER factor_profile_guard BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.guard_factor_profile_fields();

CREATE TRIGGER guard_ticket_snapshot BEFORE UPDATE ON public.event_tickets FOR EACH ROW EXECUTE FUNCTION public.guard_ticket_snapshot();

CREATE TRIGGER helpfulness_vote_time BEFORE INSERT OR UPDATE ON public.review_helpfulness_votes FOR EACH ROW EXECUTE FUNCTION public.stamp_helpfulness_vote();

CREATE TRIGGER initialize_reading_shelves AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.initialize_reading_shelves();

CREATE TRIGGER list_follow_count AFTER INSERT OR DELETE ON public.reading_list_follows FOR EACH ROW EXECUTE FUNCTION public.count_list_followers();

CREATE TRIGGER payout_requests_updated_at BEFORE UPDATE ON public.payout_requests FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER prepare_notification BEFORE INSERT OR UPDATE OF message, type, actor_id, entity_type, entity_id ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.prepare_notification();

CREATE TRIGGER queue_review_conversion_reward AFTER INSERT ON public.review_conversions FOR EACH ROW EXECUTE FUNCTION public.queue_review_conversion_reward();

CREATE TRIGGER reading_goal_profile AFTER INSERT OR DELETE OR UPDATE ON public.reading_goals FOR EACH ROW EXECUTE FUNCTION public.sync_reading_goal();

CREATE TRIGGER reading_room_membership_guard BEFORE INSERT ON public.room_participants FOR EACH ROW EXECUTE FUNCTION public.guard_reading_room_membership();

CREATE TRIGGER refresh_checkout_after_capture AFTER INSERT ON public.payment_captures FOR EACH ROW EXECUTE FUNCTION public.refresh_checkout_after_capture();

CREATE TRIGGER retain_book_edition_identifiers AFTER INSERT OR UPDATE OF google_books_id, open_library_id, canonical_edition_id ON public.books FOR EACH ROW EXECUTE FUNCTION public.retain_book_edition_identifiers();

CREATE TRIGGER retain_reading_completion AFTER INSERT OR UPDATE OF shelf_id, book_id, user_id, finished_at ON public.shelf_books FOR EACH ROW EXECUTE FUNCTION public.retain_reading_completion();

CREATE TRIGGER retain_reading_work_completion AFTER INSERT ON public.reading_completions FOR EACH ROW EXECUTE FUNCTION public.retain_reading_work_completion();

CREATE TRIGGER retain_want_to_read_decision AFTER INSERT OR UPDATE OF shelf_id, book_id, user_id ON public.shelf_books FOR EACH ROW EXECUTE FUNCTION public.retain_want_to_read_decision();

CREATE TRIGGER return_uncredited_payment AFTER INSERT ON public.payment_captures FOR EACH ROW EXECUTE FUNCTION public.queue_uncredited_payment();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.affiliate_stores FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.shelf_books FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.shelves FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER shelves_intent_guard BEFORE INSERT ON public.shelves FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER shelves_intent_receipt AFTER INSERT ON public.shelves FOR EACH ROW EXECUTE FUNCTION public.guard_additional_content_intent('user_id');

CREATE TRIGGER subscriptions_premium_access AFTER INSERT OR DELETE OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.refresh_subscription_access();

CREATE TRIGGER sync_profile_reading_goal AFTER UPDATE OF annual_reading_goal ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_profile_reading_goal();

CREATE TRIGGER touch_affiliate_store_version BEFORE UPDATE ON public.affiliate_stores FOR EACH ROW EXECUTE FUNCTION public.touch_affiliate_store_version();

CREATE TRIGGER user_payout_methods_updated_at BEFORE UPDATE ON public.user_payout_methods FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER users_premium_override BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.guard_premium_override();

CREATE TRIGGER users_privileged_fields BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_profile_fields();

CREATE TRIGGER users_referral_identity BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.guard_referral_identity();

CREATE TRIGGER workshop_capacity BEFORE INSERT ON public.workshop_members FOR EACH ROW EXECUTE FUNCTION public.enforce_workshop_capacity();

CREATE TRIGGER workshop_member_count AFTER INSERT OR DELETE ON public.workshop_members FOR EACH ROW EXECUTE FUNCTION public.count_workshop_members();

CREATE TRIGGER writer_answer_guard BEFORE INSERT ON public.ask_writer_answers FOR EACH ROW EXECUTE FUNCTION public.guard_writer_answer();

CREATE TRIGGER writer_answer_notification AFTER INSERT ON public.ask_writer_answers FOR EACH ROW EXECUTE FUNCTION public.notify_writer_question();

CREATE TRIGGER writer_answers_count AFTER INSERT OR DELETE ON public.ask_writer_answers FOR EACH ROW EXECUTE FUNCTION public.count_writer_answers();

CREATE TRIGGER writer_best_answer_guard BEFORE UPDATE OF best_answer_id ON public.ask_writer_questions FOR EACH ROW EXECUTE FUNCTION public.guard_writer_best_answer();

CREATE TRIGGER writer_best_notification AFTER UPDATE OF best_answer_id ON public.ask_writer_questions FOR EACH ROW EXECUTE FUNCTION public.notify_writer_question();

CREATE TRIGGER writing_participants_count AFTER INSERT OR DELETE ON public.writing_challenge_participants FOR EACH ROW EXECUTE FUNCTION public.count_writing_participants();

CREATE TRIGGER zz_book_pass_accounts BEFORE INSERT ON public.book_passes FOR EACH ROW EXECUTE FUNCTION public.guard_book_pass_accounts();

ALTER TABLE ONLY public.affiliate_health_log
    ADD CONSTRAINT affiliate_health_log_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.affiliate_link_clicks
    ADD CONSTRAINT affiliate_link_clicks_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.affiliate_link_clicks
    ADD CONSTRAINT affiliate_link_clicks_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.affiliate_stores(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ai_taste_profiles
    ADD CONSTRAINT ai_taste_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.content_reports(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.arc_applications
    ADD CONSTRAINT arc_applications_arc_id_fkey FOREIGN KEY (arc_id) REFERENCES public.arcs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.arc_applications
    ADD CONSTRAINT arc_applications_reader_id_fkey FOREIGN KEY (reader_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.arcs
    ADD CONSTRAINT arcs_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.arcs
    ADD CONSTRAINT arcs_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ask_writer_answers
    ADD CONSTRAINT ask_writer_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.ask_writer_questions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ask_writer_answers
    ADD CONSTRAINT ask_writer_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ask_writer_questions
    ADD CONSTRAINT ask_writer_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_email_challenges
    ADD CONSTRAINT auth_email_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_factor_challenges
    ADD CONSTRAINT auth_factor_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_factor_grants
    ADD CONSTRAINT auth_factor_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.author_books
    ADD CONSTRAINT author_books_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.author_books
    ADD CONSTRAINT author_books_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.author_catalog_intents
    ADD CONSTRAINT author_catalog_intents_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.author_posts
    ADD CONSTRAINT author_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.author_posts
    ADD CONSTRAINT author_posts_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.author_qa
    ADD CONSTRAINT author_qa_asked_by_fkey FOREIGN KEY (asked_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.author_qa
    ADD CONSTRAINT author_qa_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.author_verification_requests
    ADD CONSTRAINT author_verification_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.author_verification_requests
    ADD CONSTRAINT author_verification_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.author_work_claims
    ADD CONSTRAINT author_work_claims_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.author_work_claims
    ADD CONSTRAINT author_work_claims_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.author_work_claims
    ADD CONSTRAINT author_work_claims_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.book_works(id);

ALTER TABLE ONLY public.billing_accounts
    ADD CONSTRAINT billing_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.book_edition_identifiers
    ADD CONSTRAINT book_edition_identifiers_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.book_passes
    ADD CONSTRAINT book_passes_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.book_passes
    ADD CONSTRAINT book_passes_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.book_passes
    ADD CONSTRAINT book_passes_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.book_work_identifiers
    ADD CONSTRAINT book_work_identifiers_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.book_works(id);

ALTER TABLE ONLY public.book_works
    ADD CONSTRAINT book_works_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.book_works(id);

ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_canonical_edition_id_fkey FOREIGN KEY (canonical_edition_id) REFERENCES public.books(id);

ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.book_works(id);

ALTER TABLE ONLY public.buddy_read_members
    ADD CONSTRAINT buddy_read_members_buddy_read_id_fkey FOREIGN KEY (buddy_read_id) REFERENCES public.buddy_reads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.buddy_read_members
    ADD CONSTRAINT buddy_read_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.buddy_read_messages
    ADD CONSTRAINT buddy_read_messages_buddy_read_id_fkey FOREIGN KEY (buddy_read_id) REFERENCES public.buddy_reads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.buddy_read_messages
    ADD CONSTRAINT buddy_read_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.buddy_read_notes
    ADD CONSTRAINT buddy_read_notes_buddy_read_id_fkey FOREIGN KEY (buddy_read_id) REFERENCES public.buddy_reads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.buddy_read_notes
    ADD CONSTRAINT buddy_read_notes_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.buddy_read_notes(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.buddy_read_notes
    ADD CONSTRAINT buddy_read_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.buddy_reads
    ADD CONSTRAINT buddy_reads_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.buddy_reads
    ADD CONSTRAINT buddy_reads_creator_id_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.challenge_participants
    ADD CONSTRAINT challenge_participants_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.challenges(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.challenge_participants
    ADD CONSTRAINT challenge_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.checkout_reconciliations
    ADD CONSTRAINT checkout_reconciliations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.community_note_ratings
    ADD CONSTRAINT community_note_ratings_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.community_notes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.community_note_ratings
    ADD CONSTRAINT community_note_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.community_notes
    ADD CONSTRAINT community_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.community_notes
    ADD CONSTRAINT community_notes_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.content_intents
    ADD CONSTRAINT content_intents_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.debate_votes
    ADD CONSTRAINT debate_votes_debate_id_fkey FOREIGN KEY (debate_id) REFERENCES public.book_debates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.debate_votes
    ADD CONSTRAINT debate_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.book_debates
    ADD CONSTRAINT debates_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.book_debates
    ADD CONSTRAINT debates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.digest_deliveries
    ADD CONSTRAINT digest_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_unsubscribe_proofs
    ADD CONSTRAINT email_unsubscribe_proofs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.event_revenue
    ADD CONSTRAINT event_revenue_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.event_revenue
    ADD CONSTRAINT event_revenue_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.event_revenue
    ADD CONSTRAINT event_revenue_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.event_tickets(id);

ALTER TABLE ONLY public.event_rsvps
    ADD CONSTRAINT event_rsvps_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.event_rsvps
    ADD CONSTRAINT event_rsvps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.event_tickets
    ADD CONSTRAINT event_tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.event_tickets
    ADD CONSTRAINT event_tickets_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.event_tickets
    ADD CONSTRAINT event_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ask_writer_questions
    ADD CONSTRAINT fk_best_answer FOREIGN KEY (best_answer_id) REFERENCES public.ask_writer_answers(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goodreads_book_identities
    ADD CONSTRAINT goodreads_book_identities_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.legacy_goodreads_import_intents
    ADD CONSTRAINT legacy_goodreads_import_intents_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.moderation_log
    ADD CONSTRAINT moderation_log_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.moderation_log
    ADD CONSTRAINT moderation_log_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.content_reports(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.moderation_log
    ADD CONSTRAINT moderation_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pass_the_book_chains
    ADD CONSTRAINT pass_the_book_chains_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pass_the_book_chains
    ADD CONSTRAINT pass_the_book_chains_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pass_the_book_nodes
    ADD CONSTRAINT pass_the_book_nodes_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES public.pass_the_book_chains(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pass_the_book_nodes
    ADD CONSTRAINT pass_the_book_nodes_nominee_id_fkey FOREIGN KEY (nominee_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.pass_the_book_nodes
    ADD CONSTRAINT pass_the_book_nodes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payment_captures
    ADD CONSTRAINT payment_captures_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.payment_captures
    ADD CONSTRAINT payment_captures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_provider_payment_id_fkey FOREIGN KEY (provider, payment_id) REFERENCES public.payment_captures(provider, payment_id);

ALTER TABLE ONLY public.payment_returns
    ADD CONSTRAINT payment_returns_provider_payment_id_fkey FOREIGN KEY (provider, payment_id) REFERENCES public.payment_captures(provider, payment_id);

ALTER TABLE ONLY public.payout_requests
    ADD CONSTRAINT payout_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_tip_id_fkey FOREIGN KEY (tip_id) REFERENCES public.tips(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.profile_avatar_uploads
    ADD CONSTRAINT profile_avatar_uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.promoted_listings
    ADD CONSTRAINT promoted_listings_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.promoted_listings
    ADD CONSTRAINT promoted_listings_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promoted_listings
    ADD CONSTRAINT promoted_listings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_activity_days
    ADD CONSTRAINT reading_activity_days_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_completions
    ADD CONSTRAINT reading_completions_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_completions
    ADD CONSTRAINT reading_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_goal_milestones
    ADD CONSTRAINT reading_goal_milestones_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_goals
    ADD CONSTRAINT reading_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_list_books
    ADD CONSTRAINT reading_list_books_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_list_books
    ADD CONSTRAINT reading_list_books_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.reading_lists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_list_follows
    ADD CONSTRAINT reading_list_follows_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.reading_lists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_list_follows
    ADD CONSTRAINT reading_list_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_lists
    ADD CONSTRAINT reading_lists_forked_from_fkey FOREIGN KEY (forked_from) REFERENCES public.reading_lists(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reading_lists
    ADD CONSTRAINT reading_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_room_members
    ADD CONSTRAINT reading_room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.reading_rooms(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_room_members
    ADD CONSTRAINT reading_room_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_room_milestones
    ADD CONSTRAINT reading_room_milestones_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.reading_room_milestones
    ADD CONSTRAINT reading_room_milestones_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.reading_rooms(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_room_posts
    ADD CONSTRAINT reading_room_posts_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.reading_room_milestones(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reading_room_posts
    ADD CONSTRAINT reading_room_posts_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.reading_rooms(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_room_posts
    ADD CONSTRAINT reading_room_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_rooms
    ADD CONSTRAINT reading_rooms_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_rooms
    ADD CONSTRAINT reading_rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_rooms
    ADD CONSTRAINT reading_rooms_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_sessions
    ADD CONSTRAINT reading_sessions_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reading_sessions
    ADD CONSTRAINT reading_sessions_shelf_book_id_fkey FOREIGN KEY (shelf_book_id) REFERENCES public.shelf_books(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reading_sessions
    ADD CONSTRAINT reading_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_work_completions
    ADD CONSTRAINT reading_work_completions_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reading_work_completions
    ADD CONSTRAINT reading_work_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reading_work_completions
    ADD CONSTRAINT reading_work_completions_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.book_works(id);

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.referral_commissions
    ADD CONSTRAINT referral_commissions_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_id_fkey FOREIGN KEY (referred_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.release_email_campaigns
    ADD CONSTRAINT release_email_campaigns_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.author_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.release_email_deliveries
    ADD CONSTRAINT release_email_deliveries_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.release_email_campaigns(post_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.release_email_deliveries
    ADD CONSTRAINT release_email_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_conversions
    ADD CONSTRAINT review_conversions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_conversions
    ADD CONSTRAINT review_conversions_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_conversions
    ADD CONSTRAINT review_conversions_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.review_conversions
    ADD CONSTRAINT review_conversions_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.review_helpfulness_votes
    ADD CONSTRAINT review_helpfulness_votes_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_helpfulness_votes
    ADD CONSTRAINT review_helpfulness_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_replies
    ADD CONSTRAINT review_replies_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_replies
    ADD CONSTRAINT review_replies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.reading_rooms(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.seasonal_event_participants
    ADD CONSTRAINT seasonal_event_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.seasonal_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.seasonal_event_participants
    ADD CONSTRAINT seasonal_event_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.shelf_books
    ADD CONSTRAINT shelf_books_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shelf_books
    ADD CONSTRAINT shelf_books_shelf_id_fkey FOREIGN KEY (shelf_id) REFERENCES public.shelves(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shelf_books
    ADD CONSTRAINT shelf_books_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shelves
    ADD CONSTRAINT shelves_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.similar_books_computed
    ADD CONSTRAINT similar_books_computed_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.book_works(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.social_intents
    ADD CONSTRAINT social_intents_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.social_rewards
    ADD CONSTRAINT social_rewards_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.subscription_cancellations
    ADD CONSTRAINT subscription_cancellations_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tips
    ADD CONSTRAINT tips_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tips
    ADD CONSTRAINT tips_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tips
    ADD CONSTRAINT tips_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_payout_methods
    ADD CONSTRAINT user_payout_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.writing_challenge_participants
    ADD CONSTRAINT writing_challenge_participants_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.writing_challenges(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.writing_challenge_participants
    ADD CONSTRAINT writing_challenge_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.writing_challenge_submissions
    ADD CONSTRAINT writing_challenge_submissions_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.writing_challenges(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.writing_challenge_submissions
    ADD CONSTRAINT writing_challenge_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.writing_challenge_votes
    ADD CONSTRAINT writing_challenge_votes_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.writing_challenge_submissions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.writing_challenge_votes
    ADD CONSTRAINT writing_challenge_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.writing_plans
    ADD CONSTRAINT writing_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.writing_prompt_submissions
    ADD CONSTRAINT writing_prompt_submissions_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.writing_prompts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.writing_prompt_submissions
    ADD CONSTRAINT writing_prompt_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workshop_feedback
    ADD CONSTRAINT writing_workshop_feedback_reviewer_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workshop_feedback
    ADD CONSTRAINT writing_workshop_feedback_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.workshop_submissions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workshop_members
    ADD CONSTRAINT writing_workshop_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workshop_members
    ADD CONSTRAINT writing_workshop_members_workshop_id_fkey FOREIGN KEY (room_id) REFERENCES public.workshop_rooms(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workshop_submissions
    ADD CONSTRAINT writing_workshop_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workshop_submissions
    ADD CONSTRAINT writing_workshop_submissions_workshop_id_fkey FOREIGN KEY (room_id) REFERENCES public.workshop_rooms(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workshop_rooms
    ADD CONSTRAINT writing_workshops_creator_id_fkey FOREIGN KEY (facilitator_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.xp_ledger
    ADD CONSTRAINT xp_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.xp_reversals
    ADD CONSTRAINT xp_reversals_user_id_event_key_fkey FOREIGN KEY (user_id, event_key) REFERENCES public.xp_ledger(user_id, event_key);

CREATE TRIGGER review_moderation_queue AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.queue_review_moderation();

CREATE POLICY "Affiliate stores readable" ON public.affiliate_stores FOR SELECT USING ((is_active = true));

CREATE POLICY "Books readable by all" ON public.books FOR SELECT USING (true);

CREATE POLICY "Feature flags readable" ON public.feature_flags FOR SELECT USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Follows readable" ON public.follows FOR SELECT USING (true);

CREATE POLICY "Log affiliate clicks" ON public.affiliate_link_clicks FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) OR (auth.role() = 'anon'::text)));

CREATE POLICY "Participants insert notes" ON public.buddy_read_notes FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.buddy_read_members p
  WHERE ((p.buddy_read_id = buddy_read_notes.buddy_read_id) AND (p.user_id = auth.uid()))))));

CREATE POLICY "Participants read notes" ON public.buddy_read_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.buddy_read_members p
  WHERE ((p.buddy_read_id = buddy_read_notes.buddy_read_id) AND (p.user_id = auth.uid())))));

CREATE POLICY "Public profiles readable" ON public.users FOR SELECT USING (public.reading_author_visible(auth.uid(),id));

CREATE POLICY "Public shelf books readable" ON public.shelf_books FOR SELECT USING (public.reading_shelf_visible(auth.uid(),shelf_id));

CREATE POLICY "Public shelves readable" ON public.shelves FOR SELECT USING (public.reading_shelf_visible(auth.uid(),id));

CREATE POLICY "Published reviews readable" ON public.reviews FOR SELECT USING (((moderation_status = 'published'::text) AND (NOT is_hidden)));

CREATE POLICY "Quotes readable" ON public.quotes FOR SELECT USING ((NOT is_hidden));

CREATE POLICY "Staff append moderation log" ON public.moderation_log FOR INSERT WITH CHECK (((moderator_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin OR users.is_moderator))))));

CREATE POLICY "Staff read moderation log" ON public.moderation_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin OR users.is_moderator)))));

CREATE POLICY "Users can manage their own payout methods" ON public.user_payout_methods USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING ((auth.uid() = id));

CREATE POLICY "Users can view their own payout requests" ON public.payout_requests FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own follows" ON public.follows USING ((auth.uid() = follower_id));

CREATE POLICY "Users manage own push subs" ON public.push_subscriptions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users manage own quotes" ON public.quotes USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own reading goals" ON public.reading_goals USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users manage own reviews" ON public.reviews USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own shelf books" ON public.shelf_books USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own shelves" ON public.shelves USING ((auth.uid() = user_id));

CREATE POLICY "Users see own notifications" ON public.notifications USING ((auth.uid() = user_id));

CREATE POLICY "Users submit reports" ON public.content_reports FOR INSERT WITH CHECK ((auth.uid() = reporter_id));

CREATE POLICY ab_delete_own ON public.author_books FOR DELETE USING ((auth.uid() = author_id));

CREATE POLICY ab_insert_own ON public.author_books FOR INSERT WITH CHECK ((auth.uid() = author_id));

CREATE POLICY ab_select_all ON public.author_books FOR SELECT USING (true);

ALTER TABLE public.affiliate_health_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.affiliate_link_clicks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.affiliate_stores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_taste_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.arc_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY arc_applications_insert ON public.arc_applications FOR INSERT WITH CHECK ((reader_id = auth.uid()));

CREATE POLICY arc_applications_select ON public.arc_applications FOR SELECT USING (((reader_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.arcs
  WHERE ((arcs.id = arc_applications.arc_id) AND (arcs.author_id = auth.uid()))))));

CREATE POLICY arc_applications_update_author ON public.arc_applications FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.arcs
  WHERE ((arcs.id = arc_applications.arc_id) AND (arcs.author_id = auth.uid())))));

ALTER TABLE public.arcs ENABLE ROW LEVEL SECURITY;

CREATE POLICY arcs_delete_own ON public.arcs FOR DELETE USING ((author_id = auth.uid()));

CREATE POLICY arcs_insert_own ON public.arcs FOR INSERT WITH CHECK ((author_id = auth.uid()));

CREATE POLICY arcs_select ON public.arcs FOR SELECT USING ((is_active OR (author_id = auth.uid())));

CREATE POLICY arcs_update_own ON public.arcs FOR UPDATE USING ((author_id = auth.uid()));

ALTER TABLE public.ask_writer_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ask_writer_answers_insert_own ON public.ask_writer_answers FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY ask_writer_answers_select_all ON public.ask_writer_answers FOR SELECT USING (true);

CREATE POLICY ask_writer_answers_update_own ON public.ask_writer_answers FOR UPDATE USING ((user_id = auth.uid()));

ALTER TABLE public.ask_writer_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ask_writer_questions_insert_own ON public.ask_writer_questions FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY ask_writer_questions_select_all ON public.ask_writer_questions FOR SELECT USING (true);

CREATE POLICY ask_writer_questions_update_own ON public.ask_writer_questions FOR UPDATE USING ((user_id = auth.uid()));

CREATE POLICY atp_select_own ON public.ai_taste_profiles FOR SELECT USING ((user_id = auth.uid()));

ALTER TABLE public.auth_email_challenges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auth_factor_challenges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auth_factor_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_factor_session ON public.affiliate_health_log AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.affiliate_link_clicks AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.affiliate_stores AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.ai_taste_profiles AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.appeals AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.arc_applications AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.arcs AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.ask_writer_answers AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.ask_writer_questions AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.auth_factor_challenges AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.auth_factor_grants AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.author_books AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.author_posts AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.author_qa AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.author_verification_requests AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.billing_accounts AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.billing_webhook_receipts AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.book_debates AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.book_passes AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.books AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.buddy_read_members AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.buddy_read_messages AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.buddy_read_notes AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.buddy_reads AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.challenge_participants AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.challenges AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.community_note_ratings AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.community_notes AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.content_intents AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.content_reports AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.custom_themes AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.debate_votes AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.digest_deliveries AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.email_verification_tokens AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.event_revenue AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.event_rsvps AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.event_tickets AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.events AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.feature_flags AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.financial_audit_log AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.follows AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.leaderboard_snapshots AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.moderation_log AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.notifications AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.outbox_events AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.pass_the_book_chains AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.pass_the_book_nodes AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.payment_captures AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.payment_events AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.payment_refunds AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.payout_requests AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.payouts AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.promoted_listings AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.quotes AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_goal_milestones AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_goals AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_list_books AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_list_follows AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_lists AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_room_members AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_room_milestones AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_room_posts AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_rooms AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reading_sessions AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.referral_commissions AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.referrals AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.refund_inbox AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.review_helpfulness_votes AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.review_replies AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.reviews AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.room_participants AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.seasonal_event_participants AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.seasonal_events AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.security_events AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.shelf_books AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.shelves AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.similar_books_computed AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.social_intents AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.social_rewards AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.subscription_cancellations AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.subscriptions AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.tips AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.user_badges AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.user_payout_methods AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.users AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.push_subscriptions AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.workshop_feedback AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.workshop_members AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.workshop_rooms AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.workshop_submissions AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.writing_challenge_participants AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.writing_challenge_submissions AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.writing_challenge_votes AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.writing_challenges AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.writing_plans AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.writing_prompt_submissions AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.writing_prompts AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.xp_ledger AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

CREATE POLICY authenticated_factor_session ON public.xp_reversals AS RESTRICTIVE TO authenticated USING (public.factor_session_authorized()) WITH CHECK (public.factor_session_authorized());

ALTER TABLE public.author_books ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.author_catalog_intents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.author_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY author_posts_delete_own ON public.author_posts FOR DELETE USING ((author_id = auth.uid()));

CREATE POLICY author_posts_insert_own ON public.author_posts FOR INSERT WITH CHECK ((author_id = auth.uid()));

CREATE POLICY author_posts_select_all ON public.author_posts FOR SELECT USING(public.reading_author_visible(auth.uid(),author_id));

CREATE POLICY author_posts_update_own ON public.author_posts FOR UPDATE USING ((author_id = auth.uid()));

ALTER TABLE public.author_qa ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.author_verification_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.author_work_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY badge_profile_visibility ON public.user_badges FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = user_badges.user_id) AND (NOT users.is_banned) AND (users.profile_visibility = 'public'::text)))) OR (auth.uid() = user_id)));

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_webhook_receipts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.book_catalog_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.book_debates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.book_edition_identifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY book_pass_parties ON public.book_passes FOR SELECT TO authenticated USING (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));

ALTER TABLE public.book_passes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.book_work_identifiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.book_works ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.buddy_read_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY buddy_read_members_delete_own ON public.buddy_read_members FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY buddy_read_members_insert ON public.buddy_read_members FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY buddy_read_members_select ON public.buddy_read_members FOR SELECT USING (public.buddy_read_visible(buddy_read_id));

ALTER TABLE public.buddy_read_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY buddy_read_messages_delete_own ON public.buddy_read_messages FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY buddy_read_messages_insert ON public.buddy_read_messages FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.buddy_read_members
  WHERE ((buddy_read_members.buddy_read_id = buddy_read_messages.buddy_read_id) AND (buddy_read_members.user_id = auth.uid()))))));

CREATE POLICY buddy_read_messages_select ON public.buddy_read_messages FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.buddy_read_members
  WHERE ((buddy_read_members.buddy_read_id = buddy_read_messages.buddy_read_id) AND (buddy_read_members.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.buddy_reads br
  WHERE ((br.id = buddy_read_messages.buddy_read_id) AND (br.created_by = auth.uid()))))));

ALTER TABLE public.buddy_read_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.buddy_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY buddy_reads_delete_own ON public.buddy_reads FOR DELETE USING ((created_by = auth.uid()));

CREATE POLICY buddy_reads_insert ON public.buddy_reads FOR INSERT WITH CHECK ((created_by = auth.uid()));

CREATE POLICY buddy_reads_select ON public.buddy_reads FOR SELECT USING (public.buddy_read_visible(id));

CREATE POLICY buddy_reads_update_own ON public.buddy_reads FOR UPDATE USING ((created_by = auth.uid()));

ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY challenge_participants_delete_own ON public.challenge_participants FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY challenge_participants_insert_own ON public.challenge_participants FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY challenge_participants_select_all ON public.challenge_participants FOR SELECT USING (true);

CREATE POLICY challenge_participants_update_own ON public.challenge_participants FOR UPDATE USING ((user_id = auth.uid()));

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY challenges_select_active ON public.challenges FOR SELECT USING (is_active);

ALTER TABLE public.checkout_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY cn_delete_own ON public.community_notes FOR DELETE USING ((author_id = auth.uid()));

CREATE POLICY cn_insert_own ON public.community_notes FOR INSERT WITH CHECK ((author_id = auth.uid()));

CREATE POLICY cn_select_visible ON public.community_notes FOR SELECT USING ((is_visible AND (deleted_at IS NULL)));

ALTER TABLE public.community_note_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_note_ratings_insert_own ON public.community_note_ratings FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY community_note_ratings_select_all ON public.community_note_ratings FOR SELECT USING (true);

CREATE POLICY community_note_ratings_update_own ON public.community_note_ratings FOR UPDATE USING ((user_id = auth.uid()));

ALTER TABLE public.community_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.content_intents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.custom_themes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.debate_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY debates_insert_own ON public.book_debates FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY debates_select_all ON public.book_debates FOR SELECT USING (true);

ALTER TABLE public.digest_deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.digest_email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY dv_insert_own ON public.debate_votes FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY dv_select_all ON public.debate_votes FOR SELECT USING (true);

ALTER TABLE public.email_unsubscribe_proofs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.event_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_revenue_select_own ON public.event_revenue FOR SELECT USING ((organizer_id = auth.uid()));

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_rsvps_delete_own ON public.event_rsvps FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY event_rsvps_insert ON public.event_rsvps FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY event_rsvps_select ON public.event_rsvps FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_rsvps.event_id) AND (events.organizer_id = auth.uid()))))));

ALTER TABLE public.event_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_tickets_select ON public.event_tickets FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_tickets.event_id) AND (events.organizer_id = auth.uid()))))));

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_insert_own ON public.events FOR INSERT WITH CHECK ((organizer_id = auth.uid()));

CREATE POLICY events_select ON public.events FOR SELECT USING ((is_published OR (organizer_id = auth.uid())));

CREATE POLICY events_update_own ON public.events FOR UPDATE USING ((organizer_id = auth.uid()));

CREATE POLICY evt_select_own ON public.email_verification_tokens FOR SELECT USING ((user_id = auth.uid()));

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_audit_log_select_own ON public.financial_audit_log FOR SELECT USING (((actor_user_id = auth.uid()) OR (target_user_id = auth.uid())));

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.goodreads_book_identities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legacy_goodreads_import_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY legacy_room_member_visibility ON public.reading_room_members FOR SELECT TO authenticated USING (public.can_read_reading_room(room_id));

CREATE POLICY ls_select_all ON public.leaderboard_snapshots FOR SELECT USING (true);

ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY paid_taste_profile ON public.ai_taste_profiles AS RESTRICTIVE FOR SELECT TO authenticated USING (public.ai_profile_authorized('taste'::text));

CREATE POLICY paid_writing_plan ON public.writing_plans AS RESTRICTIVE FOR SELECT TO authenticated USING (public.ai_profile_authorized('writing'::text));

ALTER TABLE public.pass_the_book_chains ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pass_the_book_nodes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_captures ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_returns ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY payouts_select_own ON public.payouts FOR SELECT USING ((recipient_id = auth.uid()));

ALTER TABLE public.profile_avatar_uploads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.promoted_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY promoted_listings_insert_own ON public.promoted_listings FOR INSERT WITH CHECK ((author_id = auth.uid()));

CREATE POLICY promoted_listings_select ON public.promoted_listings FOR SELECT USING ((is_active OR (author_id = auth.uid())));

CREATE POLICY promoted_listings_update_own ON public.promoted_listings FOR UPDATE USING ((author_id = auth.uid()));

CREATE POLICY ptbc_insert_own ON public.pass_the_book_chains FOR INSERT WITH CHECK ((auth.uid() = creator_id));

CREATE POLICY ptbc_select_all ON public.pass_the_book_chains FOR SELECT USING (true);

CREATE POLICY ptbn_insert_own ON public.pass_the_book_nodes FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY ptbn_select_all ON public.pass_the_book_nodes FOR SELECT USING (true);

CREATE POLICY public_book_works ON public.book_works FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY qa_insert_reader ON public.author_qa FOR INSERT WITH CHECK ((auth.uid() = asked_by));

CREATE POLICY qa_select_public ON public.author_qa FOR SELECT USING (((is_public = true) OR (auth.uid() = asked_by) OR (auth.uid() = author_id)));

CREATE POLICY qa_update_author ON public.author_qa FOR UPDATE USING ((auth.uid() = author_id));

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reading_activity_days ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reading_completions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reading_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY reading_goals_delete_own ON public.reading_goals FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY reading_goals_insert_own ON public.reading_goals FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY reading_goals_select_own ON public.reading_goals FOR SELECT USING ((user_id = auth.uid()));

CREATE POLICY reading_goals_update_own ON public.reading_goals FOR UPDATE USING ((user_id = auth.uid()));

ALTER TABLE public.reading_list_books ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reading_list_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY reading_list_follows_delete_own ON public.reading_list_follows FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY reading_list_follows_insert_own ON public.reading_list_follows FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY reading_list_follows_select_all ON public.reading_list_follows FOR SELECT USING(user_id=auth.uid()or public.reading_list_visible(auth.uid(),list_id));

ALTER TABLE public.reading_lists ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reading_room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY reading_room_members_delete_own ON public.reading_room_members FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY reading_room_members_insert ON public.reading_room_members FOR INSERT WITH CHECK ((user_id = auth.uid()));

ALTER TABLE public.reading_room_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY reading_room_milestones_delete_own ON public.reading_room_milestones FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.reading_rooms
  WHERE ((reading_rooms.id = reading_room_milestones.room_id) AND (reading_rooms.creator_id = auth.uid())))));

CREATE POLICY reading_room_milestones_insert ON public.reading_room_milestones FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.reading_rooms
  WHERE ((reading_rooms.id = reading_room_milestones.room_id) AND (reading_rooms.creator_id = auth.uid())))));

ALTER TABLE public.reading_room_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY reading_room_posts_delete_own ON public.reading_room_posts FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY reading_room_posts_insert ON public.reading_room_posts FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.reading_rooms rr
  WHERE ((rr.id = reading_room_posts.room_id) AND ((rr.creator_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.reading_room_members
          WHERE ((reading_room_members.room_id = rr.id) AND (reading_room_members.user_id = auth.uid()))))))))));

ALTER TABLE public.reading_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY reading_rooms_delete_own ON public.reading_rooms FOR DELETE USING ((creator_id = auth.uid()));

CREATE POLICY reading_rooms_insert ON public.reading_rooms FOR INSERT WITH CHECK ((creator_id = auth.uid()));

CREATE POLICY reading_rooms_update_own ON public.reading_rooms FOR UPDATE USING ((creator_id = auth.uid()));

ALTER TABLE public.reading_work_completions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY referral_commissions_select_own ON public.referral_commissions FOR SELECT USING ((referrer_id = auth.uid()));

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY referrals_select_own ON public.referrals FOR SELECT USING (((referrer_id = auth.uid()) OR (referred_id = auth.uid())));

ALTER TABLE public.refund_inbox ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.release_email_campaigns ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.release_email_deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.review_conversions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY rl_delete_own ON public.reading_lists FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY rl_insert_own ON public.reading_lists FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY rl_select_public ON public.reading_lists FOR SELECT USING(public.reading_list_visible(auth.uid(),id));

CREATE POLICY rl_update_own ON public.reading_lists FOR UPDATE USING ((user_id = auth.uid()));

CREATE POLICY rlb_select ON public.reading_list_books FOR SELECT USING(public.reading_list_visible(auth.uid(),list_id));

CREATE POLICY room_milestone_visibility ON public.reading_room_milestones FOR SELECT TO authenticated USING (public.can_read_reading_room(room_id));

CREATE POLICY room_participant_visibility ON public.room_participants FOR SELECT TO authenticated USING (public.can_read_reading_room(room_id));

ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_post_visibility ON public.reading_room_posts FOR SELECT TO authenticated USING ((public.can_read_reading_room(room_id) AND ((milestone_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.reading_room_milestones m
  WHERE ((m.id = reading_room_posts.milestone_id) AND (m.room_id = reading_room_posts.room_id) AND (m.unlock_date <= now())))))));

CREATE POLICY room_visibility ON public.reading_rooms FOR SELECT TO authenticated USING (public.can_read_reading_room(id));

CREATE POLICY rp_delete_own ON public.room_participants FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY rp_insert_own ON public.room_participants FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY rrm_delete_creator ON public.reading_room_milestones FOR DELETE USING ((auth.uid() = ( SELECT reading_rooms.created_by
   FROM public.reading_rooms
  WHERE (reading_rooms.id = reading_room_milestones.room_id))));

CREATE POLICY rrm_insert_creator ON public.reading_room_milestones FOR INSERT WITH CHECK ((auth.uid() = ( SELECT reading_rooms.created_by
   FROM public.reading_rooms
  WHERE (reading_rooms.id = reading_room_milestones.room_id))));

CREATE POLICY rrp_delete_own ON public.reading_room_posts FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY rrp_insert_member ON public.reading_room_posts FOR INSERT WITH CHECK (((auth.uid() = user_id) AND ((auth.uid() = ( SELECT reading_rooms.created_by
   FROM public.reading_rooms
  WHERE (reading_rooms.id = reading_room_posts.room_id))) OR (EXISTS ( SELECT 1
   FROM public.room_participants
  WHERE ((room_participants.room_id = reading_room_posts.room_id) AND (room_participants.user_id = auth.uid())))))));

ALTER TABLE public.seasonal_event_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY seasonal_event_participants_delete_own ON public.seasonal_event_participants FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY seasonal_event_participants_insert_own ON public.seasonal_event_participants FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY seasonal_event_participants_select_all ON public.seasonal_event_participants FOR SELECT USING (true);

ALTER TABLE public.seasonal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY seasonal_events_select_published ON public.seasonal_events FOR SELECT USING (is_published);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY security_events_select_own ON public.security_events FOR SELECT USING ((user_id = auth.uid()));

ALTER TABLE public.seed_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shelf_books ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shelves ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_intents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_rewards ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT USING ((user_id = auth.uid()));

CREATE POLICY themes_select_all ON public.custom_themes FOR SELECT USING (true);

ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY tips_select_own ON public.tips FOR SELECT USING (((user_id = auth.uid()) OR (recipient_id = auth.uid()) OR (creator_id = auth.uid())));

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_payout_methods ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY wc_select_all ON public.writing_challenges FOR SELECT USING (true);

CREATE POLICY wcs_insert_own ON public.writing_challenge_submissions FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY wcs_select_all ON public.writing_challenge_submissions FOR SELECT USING (true);

CREATE POLICY wcv_delete_own ON public.writing_challenge_votes FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY wcv_insert_own ON public.writing_challenge_votes FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY wcv_select_all ON public.writing_challenge_votes FOR SELECT USING (true);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workshop_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY workshop_feedback_visibility ON public.workshop_feedback FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.workshop_submissions s
  WHERE ((s.id = workshop_feedback.submission_id) AND public.can_read_workshop(s.room_id)))));

CREATE POLICY workshop_member_visibility ON public.workshop_members FOR SELECT TO authenticated USING (public.can_read_workshop(room_id));

ALTER TABLE public.workshop_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workshop_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY workshop_submission_visibility ON public.workshop_submissions FOR SELECT TO authenticated USING (public.can_read_workshop(room_id));

ALTER TABLE public.workshop_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY wp_select_all ON public.writing_prompts FOR SELECT USING (true);

ALTER TABLE public.writing_challenge_participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.writing_challenge_submissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.writing_challenge_votes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.writing_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY writing_participants_read ON public.writing_challenge_participants FOR SELECT USING (true);

ALTER TABLE public.writing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY writing_plans_delete_own ON public.writing_plans FOR DELETE USING ((user_id = auth.uid()));

CREATE POLICY writing_plans_insert_own ON public.writing_plans FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY writing_plans_select_own ON public.writing_plans FOR SELECT USING ((user_id = auth.uid()));

CREATE POLICY writing_plans_update_own ON public.writing_plans FOR UPDATE USING ((user_id = auth.uid()));

ALTER TABLE public.writing_prompt_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY writing_prompt_submissions_insert_own ON public.writing_prompt_submissions FOR INSERT WITH CHECK ((user_id = auth.uid()));

CREATE POLICY writing_prompt_submissions_select_own ON public.writing_prompt_submissions FOR SELECT USING ((user_id = auth.uid()));

CREATE POLICY writing_prompt_submissions_update_own ON public.writing_prompt_submissions FOR UPDATE USING ((user_id = auth.uid()));

ALTER TABLE public.writing_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY writing_workshops_delete_own ON public.workshop_rooms FOR DELETE USING ((facilitator_id = auth.uid()));

CREATE POLICY writing_workshops_insert_own ON public.workshop_rooms FOR INSERT WITH CHECK ((facilitator_id = auth.uid()));

CREATE POLICY writing_workshops_select ON public.workshop_rooms FOR SELECT USING ((is_active OR (facilitator_id = auth.uid())));

CREATE POLICY writing_workshops_update_own ON public.workshop_rooms FOR UPDATE USING ((facilitator_id = auth.uid()));

ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.xp_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_likes ADD CONSTRAINT review_likes_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE CASCADE;
ALTER TABLE public.review_likes ADD CONSTRAINT review_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
CREATE INDEX review_likes_user ON public.review_likes (user_id);
CREATE TRIGGER review_like_count AFTER INSERT OR DELETE ON public.review_likes FOR EACH ROW EXECUTE FUNCTION public.sync_review_like_count();
ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_likes_own ON public.review_likes FOR SELECT TO authenticated USING (user_id=auth.uid());

-- Reset inherited browser privileges before applying explicit application grants.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
DO $permissions$
DECLARE routine record;
BEGIN
  FOR routine IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',routine.signature);
  END LOOP;
END $permissions$;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE affiliate_health_log TO service_role;
GRANT SELECT ON TABLE affiliate_link_clicks TO anon;
GRANT SELECT ON TABLE affiliate_link_clicks TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE affiliate_link_clicks TO service_role;
GRANT SELECT ON TABLE affiliate_stores TO anon;
GRANT SELECT ON TABLE affiliate_stores TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE affiliate_stores TO service_role;
GRANT SELECT ON TABLE ai_taste_profiles TO anon;
GRANT SELECT ON TABLE ai_taste_profiles TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE ai_taste_profiles TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE appeals TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE arc_applications TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE arcs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE ask_writer_answers TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE ask_writer_questions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth_email_challenges TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth_factor_challenges TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth_factor_grants TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE author_books TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE author_catalog_intents TO service_role;
GRANT SELECT ON TABLE author_posts TO anon;
GRANT SELECT ON TABLE author_posts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE author_posts TO service_role;
GRANT SELECT ON TABLE author_qa TO anon;
GRANT SELECT ON TABLE author_qa TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE author_qa TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE author_verification_requests TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE author_work_claims TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE billing_accounts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE billing_webhook_receipts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE book_catalog_audit TO service_role;
GRANT SELECT ON TABLE book_debates TO anon;
GRANT SELECT ON TABLE book_debates TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE book_debates TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE book_edition_identifiers TO service_role;
GRANT SELECT ON TABLE book_passes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE book_passes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE book_work_identifiers TO service_role;
GRANT SELECT ON TABLE book_works TO anon;
GRANT SELECT ON TABLE book_works TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE book_works TO service_role;
GRANT SELECT ON TABLE books TO anon;
GRANT SELECT ON TABLE books TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE books TO service_role;
GRANT SELECT ON TABLE buddy_read_members TO anon;
GRANT SELECT ON TABLE buddy_read_members TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE buddy_read_members TO service_role;
GRANT SELECT ON TABLE buddy_read_messages TO anon;
GRANT SELECT ON TABLE buddy_read_messages TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE buddy_read_messages TO service_role;
GRANT SELECT ON TABLE buddy_read_notes TO anon;
GRANT SELECT ON TABLE buddy_read_notes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE buddy_read_notes TO service_role;
GRANT SELECT ON TABLE buddy_reads TO anon;
GRANT SELECT ON TABLE buddy_reads TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE buddy_reads TO service_role;
GRANT SELECT ON TABLE challenge_participants TO anon;
GRANT SELECT ON TABLE challenge_participants TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE challenge_participants TO service_role;
GRANT SELECT ON TABLE challenges TO anon;
GRANT SELECT ON TABLE challenges TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE challenges TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE checkout_reconciliations TO service_role;
GRANT SELECT ON TABLE community_note_ratings TO anon;
GRANT SELECT ON TABLE community_note_ratings TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE community_note_ratings TO service_role;
GRANT SELECT ON TABLE community_notes TO anon;
GRANT SELECT ON TABLE community_notes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE community_notes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE content_intents TO service_role;
GRANT SELECT ON TABLE content_reports TO anon;
GRANT SELECT ON TABLE content_reports TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE content_reports TO service_role;
GRANT SELECT ON TABLE custom_themes TO anon;
GRANT SELECT ON TABLE custom_themes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE custom_themes TO service_role;
GRANT SELECT ON TABLE debate_votes TO anon;
GRANT SELECT ON TABLE debate_votes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE debate_votes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE digest_deliveries TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE digest_email_campaigns TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE email_unsubscribe_proofs TO service_role;
GRANT SELECT ON TABLE event_revenue TO anon;
GRANT SELECT ON TABLE event_revenue TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE event_revenue TO service_role;
GRANT SELECT ON TABLE event_rsvps TO anon;
GRANT SELECT ON TABLE event_rsvps TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE event_rsvps TO service_role;
GRANT SELECT ON TABLE event_tickets TO anon;
GRANT SELECT ON TABLE event_tickets TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE event_tickets TO service_role;
GRANT SELECT ON TABLE events TO anon;
GRANT SELECT ON TABLE events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE events TO service_role;
GRANT SELECT ON TABLE feature_flags TO anon;
GRANT SELECT ON TABLE feature_flags TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE feature_flags TO service_role;
GRANT SELECT ON TABLE financial_audit_log TO anon;
GRANT SELECT ON TABLE financial_audit_log TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE financial_audit_log TO service_role;
GRANT SELECT ON TABLE follows TO anon;
GRANT SELECT ON TABLE follows TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE follows TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE goodreads_book_identities TO service_role;
GRANT SELECT ON TABLE leaderboard_snapshots TO anon;
GRANT SELECT ON TABLE leaderboard_snapshots TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE leaderboard_snapshots TO service_role;
GRANT SELECT ON TABLE legacy_goodreads_import_intents TO service_role;
GRANT SELECT ON TABLE moderation_log TO anon;
GRANT SELECT ON TABLE moderation_log TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE moderation_log TO service_role;
GRANT SELECT ON TABLE notifications TO anon;
GRANT SELECT ON TABLE notifications TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE notifications TO service_role;
GRANT SELECT ON TABLE outbox_events TO anon;
GRANT SELECT ON TABLE outbox_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE outbox_events TO service_role;
GRANT SELECT ON TABLE pass_the_book_chains TO anon;
GRANT SELECT ON TABLE pass_the_book_chains TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE pass_the_book_chains TO service_role;
GRANT SELECT ON TABLE pass_the_book_nodes TO anon;
GRANT SELECT ON TABLE pass_the_book_nodes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE pass_the_book_nodes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE payment_captures TO service_role;
GRANT SELECT ON TABLE payment_events TO anon;
GRANT SELECT ON TABLE payment_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE payment_events TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE payment_refunds TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE payment_returns TO service_role;
GRANT SELECT ON TABLE payout_requests TO anon;
GRANT SELECT ON TABLE payout_requests TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE payout_requests TO service_role;
GRANT SELECT ON TABLE payouts TO anon;
GRANT SELECT ON TABLE payouts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE payouts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE profile_avatar_uploads TO service_role;
GRANT SELECT ON TABLE promoted_listings TO anon;
GRANT SELECT ON TABLE promoted_listings TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE promoted_listings TO service_role;
GRANT SELECT ON TABLE quotes TO anon;
GRANT SELECT ON TABLE quotes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE quotes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_activity_days TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_completions TO service_role;
GRANT SELECT ON TABLE reading_goal_milestones TO anon;
GRANT SELECT ON TABLE reading_goal_milestones TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_goal_milestones TO service_role;
GRANT SELECT ON TABLE reading_goals TO anon;
GRANT SELECT ON TABLE reading_goals TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_goals TO service_role;
GRANT SELECT ON TABLE reading_list_books TO anon;
GRANT SELECT ON TABLE reading_list_books TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_list_books TO service_role;
GRANT SELECT ON TABLE reading_list_follows TO anon;
GRANT SELECT ON TABLE reading_list_follows TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_list_follows TO service_role;
GRANT SELECT ON TABLE reading_lists TO anon;
GRANT SELECT ON TABLE reading_lists TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_lists TO service_role;
GRANT SELECT ON TABLE reading_room_members TO anon;
GRANT SELECT ON TABLE reading_room_members TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_room_members TO service_role;
GRANT SELECT ON TABLE reading_room_milestones TO anon;
GRANT SELECT ON TABLE reading_room_milestones TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_room_milestones TO service_role;
GRANT SELECT ON TABLE reading_room_posts TO anon;
GRANT SELECT ON TABLE reading_room_posts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_room_posts TO service_role;
GRANT SELECT ON TABLE reading_rooms TO anon;
GRANT SELECT ON TABLE reading_rooms TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_rooms TO service_role;
GRANT SELECT ON TABLE reading_sessions TO anon;
GRANT SELECT ON TABLE reading_sessions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_sessions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reading_work_completions TO service_role;
GRANT SELECT ON TABLE referral_commissions TO anon;
GRANT SELECT ON TABLE referral_commissions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE referral_commissions TO service_role;
GRANT SELECT ON TABLE referrals TO anon;
GRANT SELECT ON TABLE referrals TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE referrals TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE refund_inbox TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE release_email_campaigns TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE release_email_deliveries TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE review_conversions TO service_role;
GRANT SELECT ON TABLE review_helpfulness_votes TO anon;
GRANT SELECT ON TABLE review_helpfulness_votes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE review_helpfulness_votes TO service_role;
GRANT SELECT ON TABLE review_replies TO anon;
GRANT SELECT ON TABLE review_replies TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE review_replies TO service_role;
GRANT SELECT ON TABLE reviews TO anon;
GRANT SELECT ON TABLE reviews TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE reviews TO service_role;
GRANT SELECT ON TABLE room_participants TO anon;
GRANT SELECT ON TABLE room_participants TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE room_participants TO service_role;
GRANT SELECT ON TABLE seasonal_event_participants TO anon;
GRANT SELECT ON TABLE seasonal_event_participants TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE seasonal_event_participants TO service_role;
GRANT SELECT ON TABLE seasonal_events TO anon;
GRANT SELECT ON TABLE seasonal_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE seasonal_events TO service_role;
GRANT SELECT ON TABLE security_events TO anon;
GRANT SELECT ON TABLE security_events TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE security_events TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE seed_records TO service_role;
GRANT SELECT ON TABLE shelf_books TO anon;
GRANT SELECT ON TABLE shelf_books TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE shelf_books TO service_role;
GRANT SELECT ON TABLE shelves TO anon;
GRANT SELECT ON TABLE shelves TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE shelves TO service_role;
GRANT SELECT ON TABLE similar_books_computed TO anon;
GRANT SELECT ON TABLE similar_books_computed TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE similar_books_computed TO service_role;
GRANT SELECT ON TABLE social_intents TO anon;
GRANT SELECT ON TABLE social_intents TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE social_intents TO service_role;
GRANT SELECT ON TABLE social_rewards TO anon;
GRANT SELECT ON TABLE social_rewards TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE social_rewards TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE subscription_cancellations TO service_role;
GRANT SELECT ON TABLE subscriptions TO anon;
GRANT SELECT ON TABLE subscriptions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE subscriptions TO service_role;
GRANT SELECT ON TABLE tips TO anon;
GRANT SELECT ON TABLE tips TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE tips TO service_role;
GRANT SELECT ON TABLE user_badges TO anon;
GRANT SELECT ON TABLE user_badges TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE user_badges TO service_role;
GRANT SELECT ON TABLE user_payout_methods TO anon;
GRANT SELECT ON TABLE user_payout_methods TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE user_payout_methods TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE users TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE push_subscriptions TO service_role;
GRANT SELECT ON TABLE workshop_feedback TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE workshop_feedback TO service_role;
GRANT SELECT ON TABLE workshop_members TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE workshop_members TO service_role;
GRANT SELECT ON TABLE workshop_rooms TO anon;
GRANT SELECT ON TABLE workshop_rooms TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE workshop_rooms TO service_role;
GRANT SELECT ON TABLE workshop_submissions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE workshop_submissions TO service_role;
GRANT SELECT ON TABLE writing_challenge_participants TO anon;
GRANT SELECT ON TABLE writing_challenge_participants TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE writing_challenge_participants TO service_role;
GRANT SELECT ON TABLE writing_challenge_submissions TO anon;
GRANT SELECT ON TABLE writing_challenge_submissions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE writing_challenge_submissions TO service_role;
GRANT SELECT ON TABLE writing_challenge_votes TO anon;
GRANT SELECT ON TABLE writing_challenge_votes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE writing_challenge_votes TO service_role;
GRANT SELECT ON TABLE writing_challenges TO anon;
GRANT SELECT ON TABLE writing_challenges TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE writing_challenges TO service_role;
GRANT SELECT ON TABLE writing_plans TO anon;
GRANT SELECT ON TABLE writing_plans TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE writing_plans TO service_role;
GRANT SELECT ON TABLE writing_prompt_submissions TO anon;
GRANT SELECT ON TABLE writing_prompt_submissions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE writing_prompt_submissions TO service_role;
GRANT SELECT ON TABLE writing_prompts TO anon;
GRANT SELECT ON TABLE writing_prompts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE writing_prompts TO service_role;
GRANT SELECT ON TABLE xp_ledger TO anon;
GRANT SELECT ON TABLE xp_ledger TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE xp_ledger TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE xp_reversals TO service_role;
GRANT UPDATE (question, is_active) ON TABLE book_debates TO authenticated;
GRANT UPDATE (is_read) ON TABLE notifications TO authenticated;
GRANT SELECT (id, username, display_name, bio, avatar_url, banner_url, country, user_types, genres, is_admin, is_moderator, is_verified_author, is_creator, is_suspended, is_banned, suspension_reason, xp, reading_streak, streak_freeze_tokens, last_streak_date, annual_reading_goal, books_read_count, referral_code, referred_by, email_verified, totp_enabled, external_links, profile_visibility, shelf_visibility, show_referrer, onboarding_complete, email_prompt_shown_at, email_prompt_dismissed_at, created_at, updated_at, email_digest_enabled, is_premium, account_hardening_email_prompted_at, account_hardening_2fa_prompted_at, writing_streak, last_writing_date, writing_freeze_tokens, max_reading_streak, hardening_prompt_7d_sent_at, hardening_prompt_30d_sent_at, notify_follows, notify_likes, notify_replies, notify_mentions, notify_author_announcements, notify_new_releases, notify_challenge_completions, notify_arc_grants, preferred_locale) ON TABLE users TO anon;
GRANT SELECT (id, username, display_name, bio, avatar_url, banner_url, country, user_types, genres, is_admin, is_moderator, is_verified_author, is_creator, is_suspended, is_banned, suspension_reason, xp, reading_streak, streak_freeze_tokens, last_streak_date, annual_reading_goal, books_read_count, referral_code, referred_by, email_verified, totp_enabled, external_links, profile_visibility, shelf_visibility, show_referrer, onboarding_complete, email_prompt_shown_at, email_prompt_dismissed_at, created_at, updated_at, email_digest_enabled, is_premium, account_hardening_email_prompted_at, account_hardening_2fa_prompted_at, writing_streak, last_writing_date, writing_freeze_tokens, max_reading_streak, hardening_prompt_7d_sent_at, hardening_prompt_30d_sent_at, notify_follows, notify_likes, notify_replies, notify_mentions, notify_author_announcements, notify_new_releases, notify_challenge_completions, notify_arc_grants, preferred_locale) ON TABLE users TO authenticated;
ALTER TABLE public.account_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_export_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_export_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.account_export_jobs,public.account_export_current,public.account_export_versions TO service_role;
GRANT USAGE,SELECT,UPDATE ON SEQUENCE public.account_export_epoch,public.account_export_floor TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_owned_content(uuid,text,jsonb,text,text)TO service_role;
GRANT EXECUTE ON FUNCTION public.start_account_export(uuid,text,text),public.account_export_page(uuid,uuid,text,jsonb,integer),public.cleanup_account_exports(integer)TO service_role;
GRANT EXECUTE ON FUNCTION admin_catalog_snapshot(uuid,text,text,timestamp with time zone,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION admin_edition_audiobook_snapshot(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION ai_profile_authorized(text) TO authenticated;
GRANT EXECUTE ON FUNCTION ai_profile_authorized(text) TO service_role;
GRANT EXECUTE ON FUNCTION appeal_action_document(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION appeal_catalog_snapshot(uuid,text,text,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION appeal_document(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION appeal_receipt_snapshot(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION apply_admin_configuration(uuid,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION apply_book_chain_intent(uuid,text,uuid,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION apply_book_interaction(uuid,uuid,text,text,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION apply_community_intent(uuid,text,uuid,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION apply_follow_intent_snapshot(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION apply_promotion_intent(uuid,text,uuid,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION apply_shelf_membership_intent(uuid,uuid,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION apply_social_intent(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION apply_writing_intent(uuid,text,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION arc_application_snapshot(uuid,uuid,text,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION arc_catalog_snapshot(uuid,boolean,timestamp with time zone,uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION arc_offer_document(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION assert_reading_room_access(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION attribute_referral_atomic(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION author_analytics_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION author_answer_has_text(text) TO service_role;
GRANT EXECUTE ON FUNCTION author_answer_receipt_snapshot(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION author_catalog_snapshot(uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION author_owns_book(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION author_question_owner_snapshot(uuid,text,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION author_question_snapshot(uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION award_badge_atomic(uuid,text,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION award_reading_goal_milestones(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION award_xp_once(uuid,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION begin_avatar_upload(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION begin_factor_challenge(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION book_authors_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION book_chain_node_document(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION book_chain_roster_snapshot(uuid,uuid,integer,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION book_edition_family(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION book_pass_catalog_snapshot(uuid,text,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION book_pass_receipt_snapshot(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION book_review_snapshot(uuid,integer,integer,timestamp with time zone,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION book_work_snapshot(uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION books_search_vector_update() TO service_role;
GRANT EXECUTE ON FUNCTION buddy_catalog_snapshot(uuid,text,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION buddy_detail_snapshot(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION buddy_notes_snapshot(uuid,uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION buddy_read_document(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION buddy_read_visible(uuid) TO anon;
GRANT EXECUTE ON FUNCTION buddy_read_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION buddy_read_visible(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION can_read_reading_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_read_reading_room(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION can_read_workshop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_read_workshop(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_payout_request(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION canonical_book_work(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cast_debate_vote(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_book_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_isbn(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_isbn13(text) TO service_role;
GRANT EXECUTE ON FUNCTION claim_avatar_cleanup(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_checkout_reconciliations(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_digest_delivery(uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION claim_digest_email_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_factor_challenge(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION claim_outbox_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_paid_digest(uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION claim_payment_returns(integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_payout_request(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION claim_reading_reward(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION claim_refund_reconciliation(integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_release_email_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION claim_subscription_cancellations(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_email_unsubscribe_proofs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_factor_sessions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION complete_google_play_delivery(uuid,text,boolean,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION complete_subscription_cancellation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION consume_email_challenge(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION consume_email_unsubscribe(text) TO service_role;
GRANT EXECUTE ON FUNCTION content_creation_receipt_snapshot(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION count_list_followers() TO anon;
GRANT EXECUTE ON FUNCTION count_list_followers() TO authenticated;
GRANT EXECUTE ON FUNCTION count_list_followers() TO service_role;
GRANT EXECUTE ON FUNCTION count_list_followers() TO PUBLIC;
GRANT EXECUTE ON FUNCTION count_reading_works(uuid,text[],timestamp with time zone,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION count_verified_books(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION count_workshop_members() TO anon;
GRANT EXECUTE ON FUNCTION count_workshop_members() TO authenticated;
GRANT EXECUTE ON FUNCTION count_workshop_members() TO service_role;
GRANT EXECUTE ON FUNCTION count_workshop_members() TO PUBLIC;
GRANT EXECUTE ON FUNCTION count_writer_answers() TO anon;
GRANT EXECUTE ON FUNCTION count_writer_answers() TO authenticated;
GRANT EXECUTE ON FUNCTION count_writer_answers() TO service_role;
GRANT EXECUTE ON FUNCTION count_writer_answers() TO PUBLIC;
GRANT EXECUTE ON FUNCTION count_writing_participants() TO anon;
GRANT EXECUTE ON FUNCTION count_writing_participants() TO authenticated;
GRANT EXECUTE ON FUNCTION count_writing_participants() TO service_role;
GRANT EXECUTE ON FUNCTION count_writing_participants() TO PUBLIC;
GRANT EXECUTE ON FUNCTION create_direct_account(uuid,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION create_localized_direct_account(uuid,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION create_payout_request_atomic(uuid,numeric,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION create_subscription_intent(uuid,text,text,numeric,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION create_tip_transaction(uuid,uuid,numeric,numeric,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION creator_balance(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION debate_catalog_snapshot(uuid,text,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION debate_detail_snapshot(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION debate_document(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION default_custom_shelf_slug() TO anon;
GRANT EXECUTE ON FUNCTION default_custom_shelf_slug() TO authenticated;
GRANT EXECUTE ON FUNCTION default_custom_shelf_slug() TO service_role;
GRANT EXECUTE ON FUNCTION default_custom_shelf_slug() TO PUBLIC;
GRANT EXECUTE ON FUNCTION defer_payout_request(uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION disable_factor_atomic(uuid,integer,bigint,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION discover_mood_books(text,integer,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION discovery_friends_snapshot(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION discovery_gems_snapshot(integer) TO service_role;
GRANT EXECUTE ON FUNCTION discovery_shelf_rows(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION discovery_trending_snapshot(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION enforce_workshop_capacity() TO anon;
GRANT EXECUTE ON FUNCTION enforce_workshop_capacity() TO authenticated;
GRANT EXECUTE ON FUNCTION enforce_workshop_capacity() TO service_role;
GRANT EXECUTE ON FUNCTION enforce_workshop_capacity() TO PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_release_email() TO service_role;
GRANT EXECUTE ON FUNCTION expire_subscription_entitlements(integer) TO service_role;
GRANT EXECUTE ON FUNCTION factor_session_authorized() TO authenticated;
GRANT EXECUTE ON FUNCTION factor_session_authorized() TO service_role;
GRANT EXECUTE ON FUNCTION financial_integrity_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION find_direct_account(text) TO service_role;
GRANT EXECUTE ON FUNCTION finish_avatar_cleanup(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION finish_avatar_upload(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION finish_checkout_reconciliation(text,uuid,uuid,boolean,boolean,integer,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION finish_factor_challenge(text,text,integer,bigint,text,text,text,text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION finish_paid_email(text,uuid,uuid,text,text,date,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION follow_intent_snapshot(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION followed_author_books(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION fork_reading_list(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION guard_additional_content_intent() TO anon;
GRANT EXECUTE ON FUNCTION guard_additional_content_intent() TO authenticated;
GRANT EXECUTE ON FUNCTION guard_additional_content_intent() TO service_role;
GRANT EXECUTE ON FUNCTION guard_additional_content_intent() TO PUBLIC;
GRANT EXECUTE ON FUNCTION guard_arc_application_decision() TO service_role;
GRANT EXECUTE ON FUNCTION guard_arc_work_application() TO service_role;
GRANT EXECUTE ON FUNCTION guard_author_answer_text() TO service_role;
GRANT EXECUTE ON FUNCTION guard_author_book_link() TO service_role;
GRANT EXECUTE ON FUNCTION guard_book_edition() TO service_role;
GRANT EXECUTE ON FUNCTION guard_book_pass_accounts() TO service_role;
GRANT EXECUTE ON FUNCTION guard_buddy_membership() TO service_role;
GRANT EXECUTE ON FUNCTION guard_buddy_note_scope() TO service_role;
GRANT EXECUTE ON FUNCTION guard_canonical_profile_fields() TO service_role;
GRANT EXECUTE ON FUNCTION guard_content_intent() TO anon;
GRANT EXECUTE ON FUNCTION guard_content_intent() TO authenticated;
GRANT EXECUTE ON FUNCTION guard_content_intent() TO service_role;
GRANT EXECUTE ON FUNCTION guard_content_intent() TO PUBLIC;
GRANT EXECUTE ON FUNCTION guard_factor_profile_fields() TO anon;
GRANT EXECUTE ON FUNCTION guard_factor_profile_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION guard_factor_profile_fields() TO service_role;
GRANT EXECUTE ON FUNCTION guard_factor_profile_fields() TO PUBLIC;
GRANT EXECUTE ON FUNCTION guard_premium_override() TO anon;
GRANT EXECUTE ON FUNCTION guard_premium_override() TO authenticated;
GRANT EXECUTE ON FUNCTION guard_premium_override() TO service_role;
GRANT EXECUTE ON FUNCTION guard_premium_override() TO PUBLIC;
GRANT EXECUTE ON FUNCTION guard_privileged_profile_fields() TO anon;
GRANT EXECUTE ON FUNCTION guard_privileged_profile_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION guard_privileged_profile_fields() TO service_role;
GRANT EXECUTE ON FUNCTION guard_privileged_profile_fields() TO PUBLIC;
GRANT EXECUTE ON FUNCTION guard_reading_debate() TO service_role;
GRANT EXECUTE ON FUNCTION guard_reading_list() TO service_role;
GRANT EXECUTE ON FUNCTION guard_reading_room_content() TO service_role;
GRANT EXECUTE ON FUNCTION guard_reading_room_membership() TO service_role;
GRANT EXECUTE ON FUNCTION guard_referral_identity() TO anon;
GRANT EXECUTE ON FUNCTION guard_referral_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION guard_referral_identity() TO service_role;
GRANT EXECUTE ON FUNCTION guard_referral_identity() TO PUBLIC;
GRANT EXECUTE ON FUNCTION guard_writer_answer() TO service_role;
GRANT EXECUTE ON FUNCTION guard_writer_best_answer() TO service_role;
GRANT EXECUTE ON FUNCTION handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION handle_new_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION handle_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION handle_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION handle_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION handle_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION has_premium_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION import_goodreads_library(uuid,text,jsonb,integer) TO service_role;
GRANT EXECUTE ON FUNCTION import_goodreads_library_v2(uuid,text,jsonb,integer) TO service_role;
GRANT EXECUTE ON FUNCTION increment_review_helpfulness(uuid,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION increment_streak_atomic(uuid,text,date) TO service_role;
GRANT EXECUTE ON FUNCTION initialize_account_locale(uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION initialize_reading_shelves() TO anon;
GRANT EXECUTE ON FUNCTION initialize_reading_shelves() TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_reading_shelves() TO service_role;
GRANT EXECUTE ON FUNCTION initialize_reading_shelves() TO PUBLIC;
GRANT EXECUTE ON FUNCTION issue_account_recovery(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION issue_email_challenge(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION issue_email_unsubscribe(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION join_content_group(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION join_reading_challenge(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION leaderboard_snapshot(uuid,text,text,text,integer,timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION moderation_catalog_snapshot(uuid,text,text,timestamp with time zone,uuid,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION moderation_receipt_snapshot(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION moderation_report_document(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION mutate_reading_list(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION notify_writer_question() TO service_role;
GRANT EXECUTE ON FUNCTION page_followed_lists(uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION premium_status_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION process_outbox_event_atomic(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION process_payment_event(text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION process_refund_event(text,text,text,bigint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION process_subscription_webhook(text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public_reading_year_snapshot(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION publish_writing_prompt(date,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION queue_paid_digest_audience(integer) TO service_role;
GRANT EXECUTE ON FUNCTION queue_release_email_audience(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION queue_review_conversion_reward() TO service_role;
GRANT EXECUTE ON FUNCTION quote_catalog_snapshot(uuid,uuid,uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION read_creator_analytics(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION read_creator_leaderboard() TO service_role;
GRANT EXECUTE ON FUNCTION read_factor_session(text) TO service_role;
GRANT EXECUTE ON FUNCTION read_payment_recovery(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION read_room_posts(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION read_social_feed(uuid,timestamp with time zone,uuid,text,integer) TO service_role;
ALTER TABLE public.revoked_push_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revoked_push_sessions TO service_role;
GRANT EXECUTE ON FUNCTION pending_review_snapshot(uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION finish_review_moderation(uuid,text,uuid,uuid,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION register_push_subscription(uuid,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION revoke_push_session(text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION unregister_push_subscription(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION ack_push_delivery(uuid,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reading_author_visible(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reading_shelf_visible(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION reading_author_visible(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reading_challenge_catalog_snapshot(uuid,text,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reading_challenge_detail_snapshot(uuid,uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reading_challenge_document(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reading_challenge_progress(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reading_edition_document(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reading_goal_snapshot(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reading_list_catalog_snapshot(uuid,text,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reading_list_detail_snapshot(uuid,uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reading_list_document(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reading_room_catalog_snapshot(uuid,text,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reading_room_detail_snapshot(uuid,uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reading_room_document(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reading_room_milestone_snapshot(uuid,uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reading_room_posts_snapshot(uuid,uuid,boolean,uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reading_room_visible(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reading_year_books(uuid,integer,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION reading_year_snapshot(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION rebuild_reading_streak(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION recommendation_reader_page(timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_capture_and_refund(text,text,text,bigint,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_google_play_purchase(uuid,text,text,text,timestamp with time zone,text,text,timestamp with time zone,boolean,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_payment_return(uuid,text,text,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION record_book_link_click(uuid,uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION record_checkout_session(uuid,text,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION record_promotion_click(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION record_reading_activity_day() TO service_role;
GRANT EXECUTE ON FUNCTION record_ticket_checkout(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION referral_statistics(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION refresh_premium_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION refresh_subscription_access() TO anon;
GRANT EXECUTE ON FUNCTION refresh_subscription_access() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_subscription_access() TO service_role;
GRANT EXECUTE ON FUNCTION refresh_subscription_access() TO PUBLIC;
GRANT EXECUTE ON FUNCTION register_billing_account(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION release_legacy_payout_request(uuid,uuid,text,numeric,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION request_subscription_cancellation(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_event_ticket(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION resolve_direct_social_identity(text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION resolve_localized_social_identity(text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION retain_book_edition_identifiers() TO service_role;
GRANT EXECUTE ON FUNCTION retain_reading_completion() TO service_role;
GRANT EXECUTE ON FUNCTION retain_reading_work_completion() TO service_role;
GRANT EXECUTE ON FUNCTION retain_want_to_read_decision() TO service_role;
GRANT EXECUTE ON FUNCTION save_payout_destination(uuid,text,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION save_taste_profile(uuid,jsonb,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION save_writing_plan(uuid,date,jsonb,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION seed_content_item(text,text,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION set_account_pin(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION set_admin_edition_audiobook(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION set_author_work_claim(uuid,uuid,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION set_feature_flag_atomic(uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION set_list_follow(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION set_premium_override_atomic(uuid,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION set_reading_goal(uuid,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION set_shelf_membership(uuid,uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION settle_payout_request(uuid,uuid,text,text,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION share_card_snapshot(text,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION shelf_catalog_snapshot(uuid,uuid,boolean,timestamp with time zone,uuid,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION shelf_detail_snapshot(uuid,uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION shelf_edition_rows(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION shelf_overlap_snapshot(uuid,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION stamp_helpfulness_vote() TO service_role;
GRANT EXECUTE ON FUNCTION store_catalog_book(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION sync_profile_reading_goal() TO anon;
GRANT EXECUTE ON FUNCTION sync_profile_reading_goal() TO authenticated;
GRANT EXECUTE ON FUNCTION sync_profile_reading_goal() TO service_role;
GRANT EXECUTE ON FUNCTION sync_profile_reading_goal() TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_reading_goal() TO anon;
GRANT EXECUTE ON FUNCTION sync_reading_goal() TO authenticated;
GRANT EXECUTE ON FUNCTION sync_reading_goal() TO service_role;
GRANT EXECUTE ON FUNCTION sync_reading_goal() TO PUBLIC;
GRANT EXECUTE ON FUNCTION synchronize_content_aliases() TO anon;
GRANT EXECUTE ON FUNCTION synchronize_content_aliases() TO authenticated;
GRANT EXECUTE ON FUNCTION synchronize_content_aliases() TO service_role;
GRANT EXECUTE ON FUNCTION synchronize_content_aliases() TO PUBLIC;
GRANT EXECUTE ON FUNCTION taste_profile_input(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION toggle_review_like_atomic(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION touch_affiliate_store_version() TO service_role;
GRANT EXECUTE ON FUNCTION update_buddy_progress(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION update_payment_return(text,text,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION update_profile_atomic(uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION update_shelf_progress(uuid,uuid,integer,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION validate_appeal_report() TO anon;
GRANT EXECUTE ON FUNCTION validate_appeal_report() TO authenticated;
GRANT EXECUTE ON FUNCTION validate_appeal_report() TO service_role;
GRANT EXECUTE ON FUNCTION validate_appeal_report() TO PUBLIC;
GRANT EXECUTE ON FUNCTION writer_question_catalog(text,jsonb,integer) TO service_role;
GRANT EXECUTE ON FUNCTION writer_question_thread(uuid,uuid,timestamp with time zone,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION writing_plan_input(uuid) TO service_role;
ALTER TABLE public.account_hardening_notices ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.account_hardening_notices TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_batch_cursor(text),public.compute_similar_books_batch(integer),public.similar_book_snapshot(uuid),public.account_hardening_batch(integer),public.check_affiliate_health(),public.prune_operational_history(integer)TO service_role;
ALTER TABLE public.maintenance_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.maintenance_jobs TO service_role;
GRANT EXECUTE ON FUNCTION public.check_maintenance_lease(text,uuid,bigint),public.claim_maintenance_job(text,uuid),public.release_maintenance_job(text,uuid,bigint),public.run_maintenance_rpc(text,uuid,bigint,text,jsonb)TO service_role;
GRANT EXECUTE ON FUNCTION public.reading_list_visible(uuid,uuid)TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.public_sitemap_partition_count(),public.public_sitemap_partitions(integer),public.public_sitemap_page(text,uuid,uuid)TO service_role;
GRANT EXECUTE ON FUNCTION writing_progress_snapshot(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.writing_prompt_leaderboard(text,uuid),public.writing_challenge_leaderboard(uuid,uuid)FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.writing_prompt_leaderboard(text,uuid),public.writing_challenge_leaderboard(uuid,uuid)TO service_role;


GRANT SELECT, INSERT, DELETE ON public.review_likes TO service_role;
GRANT SELECT ON public.review_likes TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_review_like_count() TO service_role;

-- Supabase integrations; plain PostgreSQL uses the application authentication layer.
DO $integrations$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    CREATE POLICY avatar_insert_requires_service ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'avatars');
    CREATE POLICY avatar_update_requires_service ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id<>'avatars') WITH CHECK(bucket_id<>'avatars');
    CREATE POLICY avatar_delete_requires_service ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'avatars');
  END IF;
END $integrations$;

-- Default configuration.

INSERT INTO public.feature_flags (name, enabled, description) VALUES
  ('community_notes', false, 'Community contextual notes on content'),
  ('creator_tips', true, 'Tip creators and authors'),
  ('events', true, 'Author/creator events'),
  ('google_auth', true, 'Enable Google OAuth login'),
  ('newbie_writer_track', true, 'Newbie writer features'),
  ('premium_subscriptions', true, 'Premium tier subscriptions'),
  ('referral_system', true, 'Referral codes and commissions'),
  ('telegram_auth', true, 'Enable Telegram OAuth login');

INSERT INTO public.affiliate_stores (name, countries, url_template, affiliate_tag, is_active, priority, is_non_affiliate) VALUES
  ('Amazon AU', ARRAY['AU']::text[], 'https://www.amazon.com.au/s?k={isbn}&tag={tag}', 'liravo-au-22', true, 1, false),
  ('Amazon CA', ARRAY['CA']::text[], 'https://www.amazon.ca/s?k={isbn}&tag={tag}', 'liravo-ca-21', true, 1, false),
  ('Amazon UK', ARRAY['GB']::text[], 'https://www.amazon.co.uk/s?k={isbn}&tag={tag}', 'liravo-uk-21', true, 1, false),
  ('Amazon US', ARRAY['US']::text[], 'https://www.amazon.com/s?k={isbn}&tag={tag}', 'liravo-20', true, 1, false),
  ('Bücher.de', ARRAY['DE']::text[], 'https://www.buecher.de/suchergebnis/?q={isbn}', '', true, 3, true),
  ('Decitre', ARRAY['FR']::text[], 'https://www.decitre.fr/recherche/result.aspx?q={isbn}', '', true, 3, true),
  ('Fnac', ARRAY['FR']::text[], 'https://www.fnac.com/SearchResult/ResultList.aspx?Search={isbn}', '', true, 2, true),
  ('Project Gutenberg', ARRAY[]::text[], 'https://www.gutenberg.org/ebooks/search/?query={title}', NULL, true, 200, true),
  ('Thalia', ARRAY['DE']::text[], 'https://www.thalia.de/suche?sq={isbn}', '', true, 2, true),
  ('WorldCat', ARRAY[]::text[], 'https://www.worldcat.org/search?q={isbn}', NULL, true, 300, true);

SET LOCAL check_function_bodies = true;
NOTIFY pgrst, 'reload schema';
COMMIT;
