// Generated from 001_schema.sql (2721f53b2b0794f2ffb35d96effb9811822a4f49867a62e08c58565939f7e8a0).
import {pgTable,boolean,uuid,integer,bigint,numeric,doublePrecision,jsonb,timestamp,date,text,customType,primaryKey}from'drizzle-orm/pg-core';
import {sql}from'drizzle-orm';
import type {Json}from'@/types/database.generated';
const tsvector=customType<{data:string}>({dataType:()=> 'tsvector'});
export const accountExportCurrent=pgTable("account_export_current",{"table_name":text("table_name").notNull(),"row_key":jsonb("row_key").$type<Json>().notNull(),"epoch":bigint("epoch",{mode:'bigint'}).notNull()},table=>[primaryKey({name:"account_export_current_pkey",columns:[table["table_name"],table["row_key"]]})]);
export const accountExportJobs=pgTable("account_export_jobs",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"request_key":text("request_key").notNull(),"format":text("format").notNull(),"epoch":bigint("epoch",{mode:'bigint'}).notNull(),"datasets":jsonb("datasets").$type<Json>().notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("clock_timestamp()")).notNull(),"expires_at":timestamp("expires_at",{mode:'string',withTimezone:true}).default(sql.raw("(clock_timestamp() + '24:00:00'::interval)")).notNull()},table=>[primaryKey({name:"account_export_jobs_pkey",columns:[table["id"]]})]);
export const accountExportVersions=pgTable("account_export_versions",{"table_name":text("table_name").notNull(),"row_key":jsonb("row_key").$type<Json>().notNull(),"born_epoch":bigint("born_epoch",{mode:'bigint'}).notNull(),"removed_epoch":bigint("removed_epoch",{mode:'bigint'}).notNull(),"data":jsonb("data").$type<Json>().notNull()},table=>[primaryKey({name:"account_export_versions_pkey",columns:[table["table_name"],table["row_key"],table["born_epoch"],table["removed_epoch"]]})]);
export const accountHardeningNotices=pgTable("account_hardening_notices",{"user_id":uuid("user_id").notNull(),"stage":integer("stage").notNull(),"notified_at":timestamp("notified_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"account_hardening_notices_pkey",columns:[table["user_id"],table["stage"]]})]);
export const affiliateHealthLog=pgTable("affiliate_health_log",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"book_id":uuid("book_id").notNull(),"book_title":text("book_title").notNull(),"issue":text("issue").notNull(),"flagged_at":timestamp("flagged_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"affiliate_health_log_pkey",columns:[table["id"]]})]);
export const affiliateLinkClicks=pgTable("affiliate_link_clicks",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"book_id":uuid("book_id").notNull(),"user_id_hash":text("user_id_hash"),"link_type":text("link_type").notNull(),"store_name":text("store_name"),"country":text("country"),"is_affiliate":boolean("is_affiliate").default(sql.raw("true")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"link_id":text("link_id"),"store_id":uuid("store_id")},table=>[primaryKey({name:"affiliate_link_clicks_pkey",columns:[table["id"]]})]);
export const affiliateStores=pgTable("affiliate_stores",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"name":text("name").notNull(),"countries":text("countries").array().default(sql.raw("'{}'::text[]")).notNull(),"url_template":text("url_template").notNull(),"affiliate_tag":text("affiliate_tag"),"is_active":boolean("is_active").default(sql.raw("true")).notNull(),"priority":integer("priority").default(sql.raw("100")).notNull(),"is_non_affiliate":boolean("is_non_affiliate").default(sql.raw("false")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"affiliate_stores_pkey",columns:[table["id"]]})]);
export const aiTasteProfiles=pgTable("ai_taste_profiles",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"profile_text":text("profile_text").notNull(),"generated_at":timestamp("generated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"profile_data":jsonb("profile_data").$type<Json>(),"policy_version":text("policy_version"),"source_hash":text("source_hash"),"locale":text("locale"),"provider":text("provider")},table=>[primaryKey({name:"ai_taste_profiles_pkey",columns:[table["id"]]})]);
export const appeals=pgTable("appeals",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"report_id":uuid("report_id"),"reason":text("reason").notNull(),"content_type":text("content_type"),"content_id":uuid("content_id"),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"reviewed_by":uuid("reviewed_by"),"reviewer_note":text("reviewer_note"),"reviewed_at":timestamp("reviewed_at",{mode:'string',withTimezone:true}),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"appeals_pkey",columns:[table["id"]]})]);
export const arcApplications=pgTable("arc_applications",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"arc_id":uuid("arc_id").notNull(),"reader_id":uuid("reader_id").notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"applied_at":timestamp("applied_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"reviewed_at":timestamp("reviewed_at",{mode:'string',withTimezone:true})},table=>[primaryKey({name:"arc_applications_pkey",columns:[table["id"]]})]);
export const arcs=pgTable("arcs",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"author_id":uuid("author_id").notNull(),"book_id":uuid("book_id").notNull(),"description":text("description"),"reader_slots":integer("reader_slots").default(sql.raw("5")).notNull(),"close_date":timestamp("close_date",{mode:'string',withTimezone:true}),"is_active":boolean("is_active").default(sql.raw("true")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"arcs_pkey",columns:[table["id"]]})]);
export const askWriterAnswers=pgTable("ask_writer_answers",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"question_id":uuid("question_id").notNull(),"user_id":uuid("user_id").notNull(),"answer":text("answer").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"ask_writer_answers_pkey",columns:[table["id"]]})]);
export const askWriterQuestions=pgTable("ask_writer_questions",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"question":text("question").notNull(),"best_answer_id":uuid("best_answer_id"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"tags":text("tags").array().default(sql.raw("'{}'::text[]")).notNull(),"answer_count":integer("answer_count").default(sql.raw("0")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"ask_writer_questions_pkey",columns:[table["id"]]})]);
export const authEmailChallenges=pgTable("auth_email_challenges",{"token_hash":text("token_hash").notNull(),"user_id":uuid("user_id").notNull(),"purpose":text("purpose").notNull(),"email":text("email").notNull(),"original_email":text("original_email"),"expected_version":integer("expected_version").notNull(),"expected_pin_hash":text("expected_pin_hash"),"expires_at":timestamp("expires_at",{mode:'string',withTimezone:true}).notNull(),"consumed_at":timestamp("consumed_at",{mode:'string',withTimezone:true}),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"auth_email_challenges_pkey",columns:[table["token_hash"]]})]);
export const authFactorChallenges=pgTable("auth_factor_challenges",{"token_hash":text("token_hash").notNull(),"user_id":uuid("user_id").notNull(),"kind":text("kind").notNull(),"expected_version":integer("expected_version").notNull(),"provider_session_hash":text("provider_session_hash"),"encrypted_payload":text("encrypted_payload"),"attempts":integer("attempts").default(sql.raw("0")).notNull(),"verified_at":timestamp("verified_at",{mode:'string',withTimezone:true}),"grant_hash":text("grant_hash"),"expires_at":timestamp("expires_at",{mode:'string',withTimezone:true}).default(sql.raw("(now() + '00:05:00'::interval)")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"auth_factor_challenges_pkey",columns:[table["token_hash"]]})]);
export const authFactorGrants=pgTable("auth_factor_grants",{"session_hash":text("session_hash").notNull(),"user_id":uuid("user_id").notNull(),"mfa_version":integer("mfa_version").notNull(),"expires_at":timestamp("expires_at",{mode:'string',withTimezone:true}).default(sql.raw("(now() + '7 days'::interval)")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"auth_factor_grants_pkey",columns:[table["session_hash"]]})]);
export const authorBooks=pgTable("author_books",{"author_id":uuid("author_id").notNull(),"book_id":uuid("book_id").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"author_books_pkey",columns:[table["author_id"],table["book_id"]]})]);
export const authorCatalogIntents=pgTable("author_catalog_intents",{"actor_id":uuid("actor_id").notNull(),"intent_key":text("intent_key").notNull(),"request_hash":text("request_hash").notNull(),"response":jsonb("response").$type<Json>().notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"author_catalog_intents_pkey",columns:[table["actor_id"],table["intent_key"]]})]);
export const authorPosts=pgTable("author_posts",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"author_id":uuid("author_id").notNull(),"title":text("title").notNull(),"content":text("content").notNull(),"book_id":uuid("book_id"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"body":text("body"),"type":text("type").default(sql.raw("'blog'::text")).notNull(),"followers_notified":boolean("followers_notified").default(sql.raw("false")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"author_posts_pkey",columns:[table["id"]]})]);
export const authorQa=pgTable("author_qa",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"author_id":uuid("author_id").notNull(),"asked_by":uuid("asked_by"),"question":text("question").notNull(),"answer":text("answer"),"is_public":boolean("is_public").default(sql.raw("true")).notNull(),"answered_at":timestamp("answered_at",{mode:'string',withTimezone:true}),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"author_qa_pkey",columns:[table["id"]]})]);
export const authorVerificationRequests=pgTable("author_verification_requests",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"pen_name":text("pen_name").notNull(),"publisher":text("publisher"),"book_titles":text("book_titles").notNull(),"website_url":text("website_url"),"social_proof_url":text("social_proof_url"),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash"),"reviewed_by":uuid("reviewed_by"),"reviewed_at":timestamp("reviewed_at",{mode:'string',withTimezone:true})},table=>[primaryKey({name:"author_verification_requests_pkey",columns:[table["id"]]})]);
export const authorWorkClaims=pgTable("author_work_claims",{"author_id":uuid("author_id").notNull(),"work_id":uuid("work_id").notNull(),"verified_by":uuid("verified_by"),"verified_at":timestamp("verified_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"author_work_claims_pkey",columns:[table["author_id"],table["work_id"]]})]);
export const billingAccounts=pgTable("billing_accounts",{"provider":text("provider").notNull(),"account_id":text("account_id").notNull(),"user_id":uuid("user_id").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"billing_accounts_pkey",columns:[table["provider"],table["account_id"]]})]);
export const billingWebhookReceipts=pgTable("billing_webhook_receipts",{"provider":text("provider").notNull(),"delivery_id":text("delivery_id").notNull(),"fingerprint":text("fingerprint").notNull(),"status":text("status").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"billing_webhook_receipts_pkey",columns:[table["provider"],table["delivery_id"]]})]);
export const bookCatalogAudit=pgTable("book_catalog_audit",{"id":bigint("id",{mode:'bigint'}).generatedAlwaysAsIdentity().notNull(),"book_id":uuid("book_id").notNull(),"reason":text("reason").notNull(),"previous_data":jsonb("previous_data").$type<Json>().notNull(),"resolution":jsonb("resolution").$type<Json>().notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"book_catalog_audit_pkey",columns:[table["id"]]})]);
export const bookDebates=pgTable("book_debates",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"book_id":uuid("book_id").notNull(),"user_id":uuid("user_id").notNull(),"question":text("question").notNull(),"yes_count":integer("yes_count").default(sql.raw("0")).notNull(),"no_count":integer("no_count").default(sql.raw("0")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"is_active":boolean("is_active").default(sql.raw("true")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"debates_pkey",columns:[table["id"]]})]);
export const bookEditionIdentifiers=pgTable("book_edition_identifiers",{"provider":text("provider").notNull(),"identifier":text("identifier").notNull(),"book_id":uuid("book_id").notNull()},table=>[primaryKey({name:"book_edition_identifiers_pkey",columns:[table["provider"],table["identifier"]]})]);
export const bookPasses=pgTable("book_passes",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"sender_id":uuid("sender_id").notNull(),"recipient_id":uuid("recipient_id").notNull(),"book_id":uuid("book_id").notNull(),"message":text("message"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"book_passes_pkey",columns:[table["id"]]})]);
export const bookWorkIdentifiers=pgTable("book_work_identifiers",{"open_library_id":text("open_library_id").notNull(),"work_id":uuid("work_id").notNull()},table=>[primaryKey({name:"book_work_identifiers_pkey",columns:[table["open_library_id"]]})]);
export const bookWorks=pgTable("book_works",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"title":text("title").notNull(),"author_name":text("author_name").notNull(),"open_library_id":text("open_library_id"),"merged_into":uuid("merged_into"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"book_works_pkey",columns:[table["id"]]})]);
export const books=pgTable("books",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"google_books_id":text("google_books_id"),"open_library_id":text("open_library_id"),"isbn_10":text("isbn_10"),"isbn_13":text("isbn_13"),"title":text("title").notNull(),"subtitle":text("subtitle"),"author_name":text("author_name").notNull(),"author_names":text("author_names").array().default(sql.raw("'{}'::text[]")).notNull(),"publisher":text("publisher"),"published_year":integer("published_year"),"description":text("description"),"cover_url":text("cover_url"),"page_count":integer("page_count"),"genres":text("genres").array().default(sql.raw("'{}'::text[]")).notNull(),"language":text("language").default(sql.raw("'en'::text")).notNull(),"has_audiobook":boolean("has_audiobook").default(sql.raw("false")).notNull(),"average_rating":numeric("average_rating"),"ratings_count":integer("ratings_count").default(sql.raw("0")).notNull(),"currently_reading_count":integer("currently_reading_count").default(sql.raw("0")).notNull(),"want_to_read_count":integer("want_to_read_count").default(sql.raw("0")).notNull(),"have_read_count":integer("have_read_count").default(sql.raw("0")).notNull(),"similar_book_ids":uuid("similar_book_ids").array(),"search_vector":tsvector("search_vector"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"work_id":uuid("work_id").notNull(),"canonical_edition_id":uuid("canonical_edition_id"),"edition_name":text("edition_name"),"format":text("format"),"metadata_source":text("metadata_source").default(sql.raw("'legacy'::text")).notNull(),"metadata_provenance":jsonb("metadata_provenance").$type<Json>().default(sql.raw("'{}'::jsonb")).notNull()},table=>[primaryKey({name:"books_pkey",columns:[table["id"]]})]);
export const buddyReadMembers=pgTable("buddy_read_members",{"buddy_read_id":uuid("buddy_read_id").notNull(),"user_id":uuid("user_id").notNull(),"joined_at":timestamp("joined_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"buddy_read_members_pkey",columns:[table["buddy_read_id"],table["user_id"]]})]);
export const buddyReadMessages=pgTable("buddy_read_messages",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"buddy_read_id":uuid("buddy_read_id").notNull(),"user_id":uuid("user_id").notNull(),"content":text("content").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"buddy_read_messages_pkey",columns:[table["id"]]})]);
export const buddyReadNotes=pgTable("buddy_read_notes",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"buddy_read_id":uuid("buddy_read_id").notNull(),"user_id":uuid("user_id").notNull(),"content":text("content").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"reply_to_id":uuid("reply_to_id"),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"buddy_read_notes_pkey",columns:[table["id"]]})]);
export const buddyReads=pgTable("buddy_reads",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"book_id":uuid("book_id").notNull(),"created_by":uuid("created_by").notNull(),"title":text("title"),"max_participants":integer("max_participants").default(sql.raw("20")).notNull(),"is_private":boolean("is_private").default(sql.raw("false")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"current_chapter":integer("current_chapter").default(sql.raw("1")).notNull(),"is_active":boolean("is_active").default(sql.raw("true")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"buddy_reads_pkey",columns:[table["id"]]})]);
export const challengeParticipants=pgTable("challenge_participants",{"challenge_id":uuid("challenge_id").notNull(),"user_id":uuid("user_id").notNull(),"progress":integer("progress").default(sql.raw("0")).notNull(),"completed":boolean("completed").default(sql.raw("false")).notNull(),"joined_at":timestamp("joined_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"completed_at":timestamp("completed_at",{mode:'string',withTimezone:true})},table=>[primaryKey({name:"challenge_participants_pkey",columns:[table["challenge_id"],table["user_id"]]})]);
export const challenges=pgTable("challenges",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"title":text("title").notNull(),"description":text("description"),"type":text("type").default(sql.raw("'reading'::text")).notNull(),"start_date":timestamp("start_date",{mode:'string',withTimezone:true}),"end_date":timestamp("end_date",{mode:'string',withTimezone:true}),"badge_name":text("badge_name"),"is_active":boolean("is_active").default(sql.raw("true")).notNull(),"created_by":uuid("created_by"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"cadence":text("cadence").default(sql.raw("'weekly'::text")).notNull(),"goal_books":integer("goal_books"),"goal_pages":integer("goal_pages")},table=>[primaryKey({name:"challenges_pkey",columns:[table["id"]]})]);
export const checkoutReconciliations=pgTable("checkout_reconciliations",{"entity_type":text("entity_type").notNull(),"entity_id":uuid("entity_id").notNull(),"user_id":uuid("user_id").notNull(),"provider":text("provider").notNull(),"reference":text("reference").notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"attempts":integer("attempts").default(sql.raw("0")).notNull(),"claim_token":uuid("claim_token"),"claimed_at":timestamp("claimed_at",{mode:'string',withTimezone:true}),"last_checked_at":timestamp("last_checked_at",{mode:'string',withTimezone:true}),"next_attempt_at":timestamp("next_attempt_at",{mode:'string',withTimezone:true}).default(sql.raw("(now() + '00:01:00'::interval)")).notNull(),"scan_page":integer("scan_page").default(sql.raw("0")).notNull(),"last_error":text("last_error"),"correlation_id":text("correlation_id"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"checkout_reconciliations_pkey",columns:[table["entity_type"],table["entity_id"]]})]);
export const communityNoteRatings=pgTable("community_note_ratings",{"note_id":uuid("note_id").notNull(),"user_id":uuid("user_id").notNull(),"is_helpful":boolean("is_helpful").notNull(),"rated_at":timestamp("rated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"community_note_ratings_pkey",columns:[table["note_id"],table["user_id"]]})]);
export const communityNotes=pgTable("community_notes",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"content_type":text("content_type").notNull(),"content_id":uuid("content_id").notNull(),"author_id":uuid("author_id").notNull(),"note_text":text("note_text").notNull(),"helpful_votes":integer("helpful_votes").default(sql.raw("0")).notNull(),"unhelpful_votes":integer("unhelpful_votes").default(sql.raw("0")).notNull(),"is_visible":boolean("is_visible").default(sql.raw("false")).notNull(),"deleted_at":timestamp("deleted_at",{mode:'string',withTimezone:true}),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"reviewed_by":uuid("reviewed_by"),"reviewed_at":timestamp("reviewed_at",{mode:'string',withTimezone:true}),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"community_notes_pkey",columns:[table["id"]]})]);
export const contentIntents=pgTable("content_intents",{"actor_id":uuid("actor_id").notNull(),"action":text("action").notNull(),"intent_key":text("intent_key").notNull(),"fingerprint":text("fingerprint").notNull(),"response":jsonb("response").$type<Json>().notNull()},table=>[primaryKey({name:"content_intents_pkey",columns:[table["actor_id"],table["action"],table["intent_key"]]})]);
export const contentReports=pgTable("content_reports",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"reporter_id":uuid("reporter_id").notNull(),"entity_type":text("entity_type").notNull(),"entity_id":uuid("entity_id").notNull(),"reason":text("reason").notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"moderator_id":uuid("moderator_id"),"moderator_note":text("moderator_note"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"resolved_at":timestamp("resolved_at",{mode:'string',withTimezone:true}),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"content_reports_pkey",columns:[table["id"]]})]);
export const customThemes=pgTable("custom_themes",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"name":text("name").notNull(),"css_overrides":text("css_overrides").default(sql.raw("''::text")).notNull(),"is_active":boolean("is_active").default(sql.raw("false")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"custom_themes_pkey",columns:[table["id"]]})]);
export const debateVotes=pgTable("debate_votes",{"debate_id":uuid("debate_id").notNull(),"user_id":uuid("user_id").notNull(),"vote":text("vote").notNull(),"argument":text("argument"),"voted_at":timestamp("voted_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"debate_votes_pkey",columns:[table["debate_id"],table["user_id"]]})]);
export const digestDeliveries=pgTable("digest_deliveries",{"user_id":uuid("user_id").notNull(),"period_start":date("period_start",{mode:'string'}).notNull(),"status":text("status").notNull(),"attempts":integer("attempts").default(sql.raw("1")).notNull(),"message_id":text("message_id"),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"claim_id":uuid("claim_id")},table=>[primaryKey({name:"digest_deliveries_pkey",columns:[table["user_id"],table["period_start"]]})]);
export const digestEmailCampaigns=pgTable("digest_email_campaigns",{"period_start":date("period_start",{mode:'string'}).notNull(),"user_cursor":uuid("user_cursor"),"audience_complete":boolean("audience_complete").default(sql.raw("false")).notNull()},table=>[primaryKey({name:"digest_email_campaigns_pkey",columns:[table["period_start"]]})]);
export const emailUnsubscribeProofs=pgTable("email_unsubscribe_proofs",{"token_hash":text("token_hash").notNull(),"user_id":uuid("user_id").notNull(),"kind":text("kind").notNull(),"email_hash":text("email_hash").notNull(),"expires_at":timestamp("expires_at",{mode:'string',withTimezone:true}).default(sql.raw("(now() + '180 days'::interval)")).notNull(),"consumed_at":timestamp("consumed_at",{mode:'string',withTimezone:true})},table=>[primaryKey({name:"email_unsubscribe_proofs_pkey",columns:[table["token_hash"]]})]);
export const emailVerificationTokens=pgTable("email_verification_tokens",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"email":text("email").notNull(),"token":text("token").notNull(),"expires_at":timestamp("expires_at",{mode:'string',withTimezone:true}).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"email_verification_tokens_pkey",columns:[table["id"]]})]);
export const eventRevenue=pgTable("event_revenue",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"event_id":uuid("event_id").notNull(),"organizer_id":uuid("organizer_id").notNull(),"amount":numeric("amount").notNull(),"currency":text("currency").default(sql.raw("'USD'::text")).notNull(),"recorded_at":timestamp("recorded_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"ticket_id":uuid("ticket_id"),"original_amount":numeric("original_amount"),"verified":boolean("verified").default(sql.raw("false")).notNull()},table=>[primaryKey({name:"event_revenue_pkey",columns:[table["id"]]})]);
export const eventRsvps=pgTable("event_rsvps",{"event_id":uuid("event_id").notNull(),"user_id":uuid("user_id").notNull(),"rsvped_at":timestamp("rsvped_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"event_rsvps_pkey",columns:[table["event_id"],table["user_id"]]})]);
export const eventTickets=pgTable("event_tickets",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"event_id":uuid("event_id").notNull(),"user_id":uuid("user_id").notNull(),"amount_paid":numeric("amount_paid").notNull(),"currency":text("currency").default(sql.raw("'USD'::text")).notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"organizer_id":uuid("organizer_id").notNull(),"platform_fee":numeric("platform_fee").notNull(),"host_amount":numeric("host_amount").notNull(),"provider":text("provider").notNull(),"provider_checkout_id":text("provider_checkout_id"),"checkout_url":text("checkout_url"),"reserved_until":timestamp("reserved_until",{mode:'string',withTimezone:true}),"idempotency_key":text("idempotency_key")},table=>[primaryKey({name:"event_tickets_pkey",columns:[table["id"]]})]);
export const events=pgTable("events",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"organizer_id":uuid("organizer_id").notNull(),"book_id":uuid("book_id"),"title":text("title").notNull(),"description":text("description"),"event_date":timestamp("event_date",{mode:'string',withTimezone:true}).notNull(),"external_url":text("external_url"),"is_paid":boolean("is_paid").default(sql.raw("false")).notNull(),"ticket_price":numeric("ticket_price"),"currency":text("currency").default(sql.raw("'USD'::text")),"platform_fee_pct":numeric("platform_fee_pct").default(sql.raw("10.00")).notNull(),"is_published":boolean("is_published").default(sql.raw("false")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"max_attendees":integer("max_attendees"),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"events_pkey",columns:[table["id"]]})]);
export const featureFlags=pgTable("feature_flags",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"name":text("name").notNull(),"enabled":boolean("enabled").default(sql.raw("true")).notNull(),"description":text("description"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"feature_flags_pkey",columns:[table["id"]]})]);
export const financialAuditLog=pgTable("financial_audit_log",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"actor_user_id":uuid("actor_user_id"),"target_user_id":uuid("target_user_id"),"action":text("action").notNull(),"amount":numeric("amount"),"currency":text("currency"),"idempotency_key":text("idempotency_key"),"provider":text("provider"),"provider_event_id":text("provider_event_id"),"correlation_id":text("correlation_id"),"metadata":jsonb("metadata").$type<Json>().default(sql.raw("'{}'::jsonb")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"financial_audit_log_pkey",columns:[table["id"]]})]);
export const follows=pgTable("follows",{"follower_id":uuid("follower_id").notNull(),"following_id":uuid("following_id").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"follows_pkey",columns:[table["follower_id"],table["following_id"]]})]);
export const goodreadsBookIdentities=pgTable("goodreads_book_identities",{"goodreads_id":text("goodreads_id").notNull(),"book_id":uuid("book_id").notNull()},table=>[primaryKey({name:"goodreads_book_identities_pkey",columns:[table["goodreads_id"]]})]);
export const leaderboardSnapshots=pgTable("leaderboard_snapshots",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"board_type":text("board_type").notNull(),"snapshot_date":date("snapshot_date",{mode:'string'}).notNull(),"data":jsonb("data").$type<Json>().default(sql.raw("'[]'::jsonb")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"leaderboard_snapshots_pkey",columns:[table["id"]]})]);
export const legacyGoodreadsImportIntents=pgTable("legacy_goodreads_import_intents",{"actor_id":uuid("actor_id").notNull(),"intent_key":text("intent_key").notNull(),"fingerprint":text("fingerprint").notNull()},table=>[primaryKey({name:"legacy_goodreads_import_intents_pkey",columns:[table["actor_id"],table["intent_key"]]})]);
export const maintenanceJobs=pgTable("maintenance_jobs",{"name":text("name").notNull(),"owner":uuid("owner"),"epoch":bigint("epoch",{mode:'bigint'}).default(sql.raw("0")).notNull(),"lease_until":timestamp("lease_until",{mode:'string',withTimezone:true}).default(sql.raw("'-infinity'::timestamp with time zone")).notNull(),"after_id":uuid("after_id"),"cycle_started_at":timestamp("cycle_started_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"maintenance_jobs_pkey",columns:[table["name"]]})]);
export const moderationLog=pgTable("moderation_log",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"moderator_id":uuid("moderator_id"),"target_user_id":uuid("target_user_id"),"report_id":uuid("report_id"),"action":text("action").notNull(),"reason":text("reason"),"notes":text("notes"),"entity_type":text("entity_type"),"entity_id":uuid("entity_id"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"moderation_log_pkey",columns:[table["id"]]})]);
export const notifications=pgTable("notifications",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"type":text("type").notNull(),"actor_id":uuid("actor_id"),"entity_type":text("entity_type"),"entity_id":uuid("entity_id"),"message":text("message").notNull(),"is_read":boolean("is_read").default(sql.raw("false")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"message_key":text("message_key"),"message_values":jsonb("message_values").$type<Json>().default(sql.raw("'{}'::jsonb")).notNull()},table=>[primaryKey({name:"notifications_pkey",columns:[table["id"]]})]);
export const outboxEvents=pgTable("outbox_events",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"aggregate_type":text("aggregate_type").notNull(),"aggregate_id":text("aggregate_id").notNull(),"event_type":text("event_type").notNull(),"payload":jsonb("payload").$type<Json>().notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"attempts":integer("attempts").default(sql.raw("0")).notNull(),"last_error":text("last_error"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"processed_at":timestamp("processed_at",{mode:'string',withTimezone:true}),"next_attempt_at":timestamp("next_attempt_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"claimed_at":timestamp("claimed_at",{mode:'string',withTimezone:true})},table=>[primaryKey({name:"outbox_events_pkey",columns:[table["id"]]})]);
export const passTheBookChains=pgTable("pass_the_book_chains",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"book_id":uuid("book_id").notNull(),"creator_id":uuid("creator_id").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"pass_the_book_chains_pkey",columns:[table["id"]]})]);
export const passTheBookNodes=pgTable("pass_the_book_nodes",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"chain_id":uuid("chain_id").notNull(),"user_id":uuid("user_id").notNull(),"nominee_id":uuid("nominee_id"),"note":text("note"),"position":integer("position").default(sql.raw("0")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"pass_the_book_nodes_pkey",columns:[table["id"]]})]);
export const paymentCaptures=pgTable("payment_captures",{"provider":text("provider").notNull(),"payment_id":text("payment_id").notNull(),"entity_type":text("entity_type").notNull(),"entity_id":uuid("entity_id").notNull(),"user_id":uuid("user_id").notNull(),"recipient_id":uuid("recipient_id"),"currency":text("currency").notNull(),"charged_minor":bigint("charged_minor",{mode:'bigint'}).notNull(),"credited":boolean("credited").default(sql.raw("true")).notNull(),"refunded_minor":bigint("refunded_minor",{mode:'bigint'}).default(sql.raw("0")).notNull(),"period_end":timestamp("period_end",{mode:'string',withTimezone:true}),"event_id":text("event_id").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"payment_captures_pkey",columns:[table["provider"],table["payment_id"]]})]);
export const paymentEvents=pgTable("payment_events",{"provider":text("provider").notNull(),"event_id":text("event_id").notNull(),"payload":jsonb("payload").$type<Json>().notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"payment_events_pkey",columns:[table["provider"],table["event_id"]]})]);
export const paymentRefunds=pgTable("payment_refunds",{"provider":text("provider").notNull(),"refund_id":text("refund_id").notNull(),"payment_id":text("payment_id").notNull(),"amount_minor":bigint("amount_minor",{mode:'bigint'}).notNull(),"currency":text("currency").notNull(),"correlation_id":text("correlation_id"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"payment_refunds_pkey",columns:[table["provider"],table["refund_id"]]})]);
export const paymentReturns=pgTable("payment_returns",{"provider":text("provider").notNull(),"payment_id":text("payment_id").notNull(),"reason":text("reason").notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"provider_refund_id":text("provider_refund_id"),"attempts":integer("attempts").default(sql.raw("0")).notNull(),"claim_token":uuid("claim_token"),"claimed_at":timestamp("claimed_at",{mode:'string',withTimezone:true}),"next_attempt_at":timestamp("next_attempt_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"correlation_id":text("correlation_id"),"last_error":text("last_error"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"payment_returns_pkey",columns:[table["provider"],table["payment_id"]]})]);
export const payoutRequests=pgTable("payout_requests",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"amount":numeric("amount").notNull(),"method":text("method").default(sql.raw("'dodopayments'::text")).notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"idempotency_key":text("idempotency_key"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"currency":text("currency").default(sql.raw("'USD'::text")).notNull(),"destination":jsonb("destination").$type<Json>(),"transfer_reference":text("transfer_reference"),"provider_transfer_code":text("provider_transfer_code"),"provider_recipient_code":text("provider_recipient_code"),"settlement_reference":text("settlement_reference"),"claimed_at":timestamp("claimed_at",{mode:'string',withTimezone:true}),"next_attempt_at":timestamp("next_attempt_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"attempts":integer("attempts").default(sql.raw("0")).notNull(),"last_error":text("last_error"),"completed_at":timestamp("completed_at",{mode:'string',withTimezone:true})},table=>[primaryKey({name:"payout_requests_pkey",columns:[table["id"]]})]);
export const payouts=pgTable("payouts",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"tip_id":uuid("tip_id"),"recipient_id":uuid("recipient_id"),"amount":numeric("amount").notNull(),"currency":text("currency").default(sql.raw("'USD'::text")).notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"provider":text("provider"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"payouts_pkey",columns:[table["id"]]})]);
export const profileAvatarUploads=pgTable("profile_avatar_uploads",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id"),"fingerprint":text("fingerprint").notNull(),"backend":text("backend").notNull(),"bucket":text("bucket").notNull(),"path":text("path").notNull(),"public_url":text("public_url"),"state":text("state").default(sql.raw("'pending'::text")).notNull(),"expires_at":timestamp("expires_at",{mode:'string',withTimezone:true}).default(sql.raw("(now() + '24:00:00'::interval)")).notNull(),"claim_token":uuid("claim_token"),"claimed_until":timestamp("claimed_until",{mode:'string',withTimezone:true}),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"profile_avatar_uploads_pkey",columns:[table["id"]]})]);
export const promotedListings=pgTable("promoted_listings",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"book_id":uuid("book_id").notNull(),"author_id":uuid("author_id"),"placement":text("placement").default(sql.raw("'discover_top'::text")).notNull(),"is_active":boolean("is_active").default(sql.raw("false")).notNull(),"start_date":timestamp("start_date",{mode:'string',withTimezone:true}),"end_date":timestamp("end_date",{mode:'string',withTimezone:true}),"clicks":integer("clicks").default(sql.raw("0")).notNull(),"price_usd":numeric("price_usd"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"created_by":uuid("created_by")},table=>[primaryKey({name:"promoted_listings_pkey",columns:[table["id"]]})]);
export const pushSubscriptions=pgTable("push_subscriptions",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"channel":text("channel").notNull(),"endpoint":text("endpoint").notNull(),"session_hash":text("session_hash").notNull(),"p256dh":text("p256dh"),"auth":text("auth"),"platform":text("platform").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"expires_at":timestamp("expires_at",{mode:'string',withTimezone:true}).default(sql.raw("(now() + '30 days'::interval)")).notNull()},table=>[primaryKey({name:"push_subscriptions_pkey",columns:[table["id"]]})]);
export const quotes=pgTable("quotes",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"book_id":uuid("book_id").notNull(),"content":text("content").notNull(),"page_number":integer("page_number"),"is_hidden":boolean("is_hidden").default(sql.raw("false")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"quotes_pkey",columns:[table["id"]]})]);
export const readingActivityDays=pgTable("reading_activity_days",{"user_id":uuid("user_id").notNull(),"activity_date":date("activity_date",{mode:'string'}).notNull()},table=>[primaryKey({name:"reading_activity_days_pkey",columns:[table["user_id"],table["activity_date"]]})]);
export const readingCompletions=pgTable("reading_completions",{"user_id":uuid("user_id").notNull(),"book_id":uuid("book_id").notNull(),"source":text("source").notNull(),"completed_at":timestamp("completed_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"reading_completions_pkey",columns:[table["user_id"],table["book_id"]]})]);
export const readingGoalMilestones=pgTable("reading_goal_milestones",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"year":integer("year").notNull(),"milestone":integer("milestone").notNull(),"fired_at":timestamp("fired_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"reading_goal_milestones_pkey",columns:[table["id"]]})]);
export const readingGoals=pgTable("reading_goals",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"year":integer("year").notNull(),"target_books":integer("target_books").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"reading_goals_pkey",columns:[table["id"]]})]);
export const readingListBooks=pgTable("reading_list_books",{"list_id":uuid("list_id").notNull(),"book_id":uuid("book_id").notNull(),"position":integer("position").default(sql.raw("0")).notNull(),"added_at":timestamp("added_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"reading_list_books_pkey",columns:[table["list_id"],table["book_id"]]})]);
export const readingListFollows=pgTable("reading_list_follows",{"list_id":uuid("list_id").notNull(),"user_id":uuid("user_id").notNull(),"followed_at":timestamp("followed_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"reading_list_follows_pkey",columns:[table["list_id"],table["user_id"]]})]);
export const readingLists=pgTable("reading_lists",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"name":text("name").notNull(),"description":text("description"),"cover_url":text("cover_url"),"is_public":boolean("is_public").default(sql.raw("true")).notNull(),"forked_from":uuid("forked_from"),"follower_count":integer("follower_count").default(sql.raw("0")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"list_type":text("list_type").default(sql.raw("'standard'::text")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"reading_lists_pkey",columns:[table["id"]]})]);
export const readingRoomMembers=pgTable("reading_room_members",{"room_id":uuid("room_id").notNull(),"user_id":uuid("user_id").notNull(),"joined_at":timestamp("joined_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"reading_room_members_pkey",columns:[table["room_id"],table["user_id"]]})]);
export const readingRoomMilestones=pgTable("reading_room_milestones",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"room_id":uuid("room_id").notNull(),"title":text("title").notNull(),"unlock_date":timestamp("unlock_date",{mode:'string',withTimezone:true}).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"created_by":uuid("created_by"),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"reading_room_milestones_pkey",columns:[table["id"]]})]);
export const readingRoomPosts=pgTable("reading_room_posts",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"room_id":uuid("room_id").notNull(),"milestone_id":uuid("milestone_id"),"user_id":uuid("user_id").notNull(),"content":text("content").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"reading_room_posts_pkey",columns:[table["id"]]})]);
export const readingRooms=pgTable("reading_rooms",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"book_id":uuid("book_id"),"creator_id":uuid("creator_id").notNull(),"title":text("title").notNull(),"is_public":boolean("is_public").default(sql.raw("true")).notNull(),"is_active":boolean("is_active").default(sql.raw("true")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"created_by":uuid("created_by"),"name":text("name"),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"reading_rooms_pkey",columns:[table["id"]]})]);
export const readingSessions=pgTable("reading_sessions",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"book_id":uuid("book_id"),"shelf_book_id":uuid("shelf_book_id"),"started_at":timestamp("started_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"ended_at":timestamp("ended_at",{mode:'string',withTimezone:true}),"pages_read":integer("pages_read"),"notes":text("notes"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"reading_sessions_pkey",columns:[table["id"]]})]);
export const readingWorkCompletions=pgTable("reading_work_completions",{"user_id":uuid("user_id").notNull(),"work_id":uuid("work_id").notNull(),"book_id":uuid("book_id"),"source":text("source").notNull(),"completed_at":timestamp("completed_at",{mode:'string',withTimezone:true}).notNull(),"rewarded_at":timestamp("rewarded_at",{mode:'string',withTimezone:true})},table=>[primaryKey({name:"reading_work_completions_pkey",columns:[table["user_id"],table["work_id"]]})]);
export const referralCommissions=pgTable("referral_commissions",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"referrer_id":uuid("referrer_id").notNull(),"referred_user_id":uuid("referred_user_id"),"transaction_id":text("transaction_id").notNull(),"transaction_type":text("transaction_type").notNull(),"gross_transaction_amount":numeric("gross_transaction_amount").notNull(),"platform_fee_amount":numeric("platform_fee_amount").notNull(),"commission_rate":numeric("commission_rate").default(sql.raw("0.10")).notNull(),"commission_amount":numeric("commission_amount").notNull(),"credited_at":timestamp("credited_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"reversed_at":timestamp("reversed_at",{mode:'string',withTimezone:true}),"idempotency_key":text("idempotency_key"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"original_commission_amount":numeric("original_commission_amount"),"currency":text("currency").default(sql.raw("'USD'::text")).notNull()},table=>[primaryKey({name:"referral_commissions_pkey",columns:[table["id"]]})]);
export const referrals=pgTable("referrals",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"referrer_id":uuid("referrer_id").notNull(),"referred_id":uuid("referred_id").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"referrals_pkey",columns:[table["id"]]})]);
export const refundInbox=pgTable("refund_inbox",{"provider":text("provider").notNull(),"refund_id":text("refund_id").notNull(),"payment_id":text("payment_id").notNull(),"amount_minor":bigint("amount_minor",{mode:'bigint'}).notNull(),"currency":text("currency").notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"attempts":integer("attempts").default(sql.raw("0")).notNull(),"claimed_at":timestamp("claimed_at",{mode:'string',withTimezone:true}),"next_attempt_at":timestamp("next_attempt_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"correlation_id":text("correlation_id"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"refund_inbox_pkey",columns:[table["provider"],table["refund_id"]]})]);
export const releaseEmailCampaigns=pgTable("release_email_campaigns",{"post_id":uuid("post_id").notNull(),"follower_cursor":uuid("follower_cursor"),"audience_complete":boolean("audience_complete").default(sql.raw("false")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"release_email_campaigns_pkey",columns:[table["post_id"]]})]);
export const releaseEmailDeliveries=pgTable("release_email_deliveries",{"post_id":uuid("post_id").notNull(),"user_id":uuid("user_id").notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"attempts":integer("attempts").default(sql.raw("0")).notNull(),"claim_id":uuid("claim_id"),"message_id":text("message_id"),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"release_email_deliveries_pkey",columns:[table["post_id"],table["user_id"]]})]);
export const reviewConversions=pgTable("review_conversions",{"actor_id":uuid("actor_id").notNull(),"book_id":uuid("book_id").notNull(),"review_id":uuid("review_id"),"reviewer_id":uuid("reviewer_id"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"review_conversions_pkey",columns:[table["actor_id"],table["book_id"]]})]);
export const reviewHelpfulnessVotes=pgTable("review_helpfulness_votes",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"review_id":uuid("review_id").notNull(),"user_id":uuid("user_id").notNull(),"is_helpful":boolean("is_helpful").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"cast_at":timestamp("cast_at",{mode:'string',withTimezone:true}).notNull()},table=>[primaryKey({name:"review_helpfulness_votes_pkey",columns:[table["id"]]})]);
export const reviewLikes=pgTable("review_likes",{"review_id":uuid("review_id").notNull(),"user_id":uuid("user_id").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"review_likes_pkey",columns:[table["review_id"],table["user_id"]]})]);
export const reviewReplies=pgTable("review_replies",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"review_id":uuid("review_id").notNull(),"user_id":uuid("user_id").notNull(),"content":text("content").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"review_replies_pkey",columns:[table["id"]]})]);
export const reviews=pgTable("reviews",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"book_id":uuid("book_id").notNull(),"review_type":text("review_type").default(sql.raw("'short'::text")).notNull(),"rating":integer("rating").notNull(),"content":text("content"),"mood_tags":text("mood_tags").array().default(sql.raw("'{}'::text[]")).notNull(),"has_spoilers":boolean("has_spoilers").default(sql.raw("false")).notNull(),"read_date":date("read_date",{mode:'string'}),"edition_read":text("edition_read"),"likes_count":integer("likes_count").default(sql.raw("0")).notNull(),"want_to_read_count":integer("want_to_read_count").default(sql.raw("0")).notNull(),"helpful_votes":integer("helpful_votes").default(sql.raw("0")).notNull(),"unhelpful_votes":integer("unhelpful_votes").default(sql.raw("0")).notNull(),"is_hidden":boolean("is_hidden").default(sql.raw("false")).notNull(),"moderation_status":text("moderation_status").default(sql.raw("'published'::text")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"reviews_pkey",columns:[table["id"]]})]);
export const revokedPushSessions=pgTable("revoked_push_sessions",{"session_hash":text("session_hash").notNull(),"revoked_at":timestamp("revoked_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"revoked_push_sessions_pkey",columns:[table["session_hash"]]})]);
export const roomParticipants=pgTable("room_participants",{"room_id":uuid("room_id").notNull(),"user_id":uuid("user_id").notNull(),"joined_at":timestamp("joined_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"room_participants_pkey",columns:[table["room_id"],table["user_id"]]})]);
export const seasonalEventParticipants=pgTable("seasonal_event_participants",{"event_id":uuid("event_id").notNull(),"user_id":uuid("user_id").notNull(),"joined_at":timestamp("joined_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"seasonal_event_participants_pkey",columns:[table["event_id"],table["user_id"]]})]);
export const seasonalEvents=pgTable("seasonal_events",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"name":text("name").notNull(),"theme":text("theme"),"start_date":timestamp("start_date",{mode:'string',withTimezone:true}).notNull(),"end_date":timestamp("end_date",{mode:'string',withTimezone:true}).notNull(),"badge_name":text("badge_name"),"is_published":boolean("is_published").default(sql.raw("false")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"badge_id":text("badge_id")},table=>[primaryKey({name:"seasonal_events_pkey",columns:[table["id"]]})]);
export const securityEvents=pgTable("security_events",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id"),"event_type":text("event_type").notNull(),"ip_hash":text("ip_hash"),"auth_provider":text("auth_provider"),"metadata":jsonb("metadata").$type<Json>(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"security_events_pkey",columns:[table["id"]]})]);
export const seedRecords=pgTable("seed_records",{"kind":text("kind").notNull(),"key":text("key").notNull(),"entity_id":uuid("entity_id"),"metadata":jsonb("metadata").$type<Json>().default(sql.raw("'{}'::jsonb")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"seed_records_pkey",columns:[table["kind"],table["key"]]})]);
export const shelfBooks=pgTable("shelf_books",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"shelf_id":uuid("shelf_id").notNull(),"book_id":uuid("book_id").notNull(),"user_id":uuid("user_id").notNull(),"progress_pages":integer("progress_pages"),"progress_percent":numeric("progress_percent"),"started_at":date("started_at",{mode:'string'}),"finished_at":date("finished_at",{mode:'string'}),"edition_read":text("edition_read"),"added_at":timestamp("added_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"shelf_books_pkey",columns:[table["id"]]})]);
export const shelves=pgTable("shelves",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"name":text("name").notNull(),"slug":text("slug").notNull(),"is_default":boolean("is_default").default(sql.raw("false")).notNull(),"default_type":text("default_type"),"is_public":boolean("is_public").default(sql.raw("true")).notNull(),"description":text("description"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"shelves_pkey",columns:[table["id"]]})]);
export const similarBooksComputed=pgTable("similar_books_computed",{"work_id":uuid("work_id").notNull(),"similar_ids":uuid("similar_ids").array().default(sql.raw("'{}'::uuid[]")).notNull(),"computed_at":timestamp("computed_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"similar_books_computed_pkey",columns:[table["work_id"]]})]);
export const socialIntents=pgTable("social_intents",{"actor_id":uuid("actor_id").notNull(),"action":text("action").notNull(),"intent_key":text("intent_key").notNull(),"target_id":uuid("target_id").notNull(),"result":boolean("result").notNull()},table=>[primaryKey({name:"social_intents_pkey",columns:[table["actor_id"],table["action"],table["intent_key"]]})]);
export const socialRewards=pgTable("social_rewards",{"actor_id":uuid("actor_id").notNull(),"action":text("action").notNull(),"target_id":uuid("target_id").notNull()},table=>[primaryKey({name:"social_rewards_pkey",columns:[table["actor_id"],table["action"],table["target_id"]]})]);
export const subscriptionCancellations=pgTable("subscription_cancellations",{"subscription_id":uuid("subscription_id").notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"attempts":integer("attempts").default(sql.raw("0")).notNull(),"claimed_at":timestamp("claimed_at",{mode:'string',withTimezone:true}),"next_attempt_at":timestamp("next_attempt_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"correlation_id":text("correlation_id"),"last_error":text("last_error"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"completed_at":timestamp("completed_at",{mode:'string',withTimezone:true})},table=>[primaryKey({name:"subscription_cancellations_pkey",columns:[table["subscription_id"]]})]);
export const subscriptions=pgTable("subscriptions",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"provider":text("provider").notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"amount":numeric("amount").notNull(),"currency":text("currency").default(sql.raw("'USD'::text")).notNull(),"provider_event_id":text("provider_event_id"),"current_period_end":timestamp("current_period_end",{mode:'string',withTimezone:true}),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"checkout_url":text("checkout_url"),"provider_subscription_id":text("provider_subscription_id"),"last_provider_event_at":timestamp("last_provider_event_at",{mode:'string',withTimezone:true}),"activated_at":timestamp("activated_at",{mode:'string',withTimezone:true}),"cancelled_at":timestamp("cancelled_at",{mode:'string',withTimezone:true}),"provider_product_id":text("provider_product_id"),"provider_account_id":text("provider_account_id"),"provider_state":text("provider_state"),"last_verified_at":timestamp("last_verified_at",{mode:'string',withTimezone:true}),"provider_acknowledged":boolean("provider_acknowledged").default(sql.raw("true")).notNull(),"renewal_cancelled":boolean("renewal_cancelled").default(sql.raw("false")).notNull(),"provider_checkout_id":text("provider_checkout_id")},table=>[primaryKey({name:"subscriptions_pkey",columns:[table["id"]]})]);
export const tips=pgTable("tips",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"recipient_id":uuid("recipient_id"),"creator_id":uuid("creator_id"),"amount":numeric("amount").notNull(),"platform_fee":numeric("platform_fee").notNull(),"recipient_amount":numeric("recipient_amount"),"creator_amount":numeric("creator_amount"),"currency":text("currency").default(sql.raw("'USD'::text")).notNull(),"status":text("status").default(sql.raw("'pending'::text")).notNull(),"provider_reference":text("provider_reference"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"idempotency_key":text("idempotency_key"),"checkout_url":text("checkout_url"),"refunded_recipient_amount":numeric("refunded_recipient_amount").default(sql.raw("0")).notNull(),"provider_checkout_id":text("provider_checkout_id")},table=>[primaryKey({name:"tips_pkey",columns:[table["id"]]})]);
export const userBadges=pgTable("user_badges",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"badge_id":text("badge_id").notNull(),"awarded_at":timestamp("awarded_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"user_badges_pkey",columns:[table["id"]]})]);
export const userPayoutMethods=pgTable("user_payout_methods",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"provider":text("provider").notNull(),"display_name":text("display_name").notNull(),"account_number":text("account_number").notNull(),"bank_code":text("bank_code").notNull(),"currency":text("currency").default(sql.raw("'NGN'::text")).notNull(),"paystack_recipient_code":text("paystack_recipient_code"),"is_default":boolean("is_default").default(sql.raw("false")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"user_payout_methods_pkey",columns:[table["id"]]})]);
export const users=pgTable("users",{"id":uuid("id").notNull(),"username":text("username").notNull(),"display_name":text("display_name").notNull(),"bio":text("bio"),"avatar_url":text("avatar_url"),"banner_url":text("banner_url"),"country":text("country"),"user_types":text("user_types").array().default(sql.raw("'{reader}'::text[]")).notNull(),"genres":text("genres").array().default(sql.raw("'{}'::text[]")).notNull(),"is_admin":boolean("is_admin").default(sql.raw("false")).notNull(),"is_moderator":boolean("is_moderator").default(sql.raw("false")).notNull(),"is_verified_author":boolean("is_verified_author").default(sql.raw("false")).notNull(),"is_creator":boolean("is_creator").default(sql.raw("false")).notNull(),"is_suspended":boolean("is_suspended").default(sql.raw("false")).notNull(),"is_banned":boolean("is_banned").default(sql.raw("false")).notNull(),"suspension_reason":text("suspension_reason"),"xp":integer("xp").default(sql.raw("0")).notNull(),"reading_streak":integer("reading_streak").default(sql.raw("0")).notNull(),"streak_freeze_tokens":integer("streak_freeze_tokens").default(sql.raw("0")).notNull(),"last_streak_date":date("last_streak_date",{mode:'string'}),"annual_reading_goal":integer("annual_reading_goal"),"books_read_count":integer("books_read_count").default(sql.raw("0")).notNull(),"referral_code":text("referral_code").notNull(),"referred_by":uuid("referred_by"),"email":text("email"),"email_verified":boolean("email_verified").default(sql.raw("false")).notNull(),"pin_hash":text("pin_hash"),"totp_secret":text("totp_secret"),"totp_enabled":boolean("totp_enabled").default(sql.raw("false")).notNull(),"recovery_codes":text("recovery_codes").array(),"external_links":text("external_links").array().default(sql.raw("'{}'::text[]")).notNull(),"profile_visibility":text("profile_visibility").default(sql.raw("'public'::text")).notNull(),"shelf_visibility":text("shelf_visibility").default(sql.raw("'public'::text")).notNull(),"show_referrer":boolean("show_referrer").default(sql.raw("true")).notNull(),"onboarding_complete":boolean("onboarding_complete").default(sql.raw("false")).notNull(),"email_prompt_shown_at":timestamp("email_prompt_shown_at",{mode:'string',withTimezone:true}),"email_prompt_dismissed_at":timestamp("email_prompt_dismissed_at",{mode:'string',withTimezone:true}),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"updated_at":timestamp("updated_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"email_digest_enabled":boolean("email_digest_enabled").default(sql.raw("true")).notNull(),"is_premium":boolean("is_premium").default(sql.raw("false")).notNull(),"unsubscribe_token":text("unsubscribe_token"),"account_hardening_email_prompted_at":timestamp("account_hardening_email_prompted_at",{mode:'string',withTimezone:true}),"account_hardening_2fa_prompted_at":timestamp("account_hardening_2fa_prompted_at",{mode:'string',withTimezone:true}),"password_hash":text("password_hash"),"telegram_id":text("telegram_id"),"writing_streak":integer("writing_streak").default(sql.raw("0")).notNull(),"last_writing_date":date("last_writing_date",{mode:'string'}),"writing_freeze_tokens":integer("writing_freeze_tokens").default(sql.raw("0")).notNull(),"max_reading_streak":integer("max_reading_streak").default(sql.raw("0")).notNull(),"hardening_prompt_7d_sent_at":timestamp("hardening_prompt_7d_sent_at",{mode:'string',withTimezone:true}),"hardening_prompt_30d_sent_at":timestamp("hardening_prompt_30d_sent_at",{mode:'string',withTimezone:true}),"notify_follows":boolean("notify_follows").default(sql.raw("true")).notNull(),"notify_likes":boolean("notify_likes").default(sql.raw("true")).notNull(),"notify_replies":boolean("notify_replies").default(sql.raw("true")).notNull(),"notify_mentions":boolean("notify_mentions").default(sql.raw("true")).notNull(),"notify_author_announcements":boolean("notify_author_announcements").default(sql.raw("true")).notNull(),"notify_new_releases":boolean("notify_new_releases").default(sql.raw("true")).notNull(),"notify_challenge_completions":boolean("notify_challenge_completions").default(sql.raw("true")).notNull(),"notify_arc_grants":boolean("notify_arc_grants").default(sql.raw("true")).notNull(),"preferred_locale":text("preferred_locale").default(sql.raw("'en'::text")).notNull(),"premium_override":boolean("premium_override").default(sql.raw("false")).notNull(),"deleted_at":timestamp("deleted_at",{mode:'string',withTimezone:true}),"mfa_version":integer("mfa_version").default(sql.raw("0")).notNull(),"mfa_last_step":bigint("mfa_last_step",{mode:'bigint'}),"google_id":text("google_id"),"auth_not_before":bigint("auth_not_before",{mode:'bigint'}).default(sql.raw("0")).notNull(),"locale_initialized":boolean("locale_initialized").default(sql.raw("false")).notNull()},table=>[primaryKey({name:"users_pkey",columns:[table["id"]]})]);
export const workshopFeedback=pgTable("workshop_feedback",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"submission_id":uuid("submission_id").notNull(),"user_id":uuid("user_id").notNull(),"what_worked":text("what_worked"),"what_to_improve":text("what_to_improve"),"specific_suggestion":text("specific_suggestion"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"comment":text("comment").default(sql.raw("''::text")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"writing_workshop_feedback_pkey",columns:[table["id"]]})]);
export const workshopMembers=pgTable("workshop_members",{"room_id":uuid("room_id").notNull(),"user_id":uuid("user_id").notNull(),"joined_at":timestamp("joined_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"writing_workshop_members_pkey",columns:[table["room_id"],table["user_id"]]})]);
export const workshopRooms=pgTable("workshop_rooms",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"facilitator_id":uuid("facilitator_id").notNull(),"name":text("name").notNull(),"topic":text("topic"),"max_members":integer("max_members").default(sql.raw("8")).notNull(),"is_active":boolean("is_active").default(sql.raw("true")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"member_count":integer("member_count").default(sql.raw("0")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"writing_workshops_pkey",columns:[table["id"]]})]);
export const workshopSubmissions=pgTable("workshop_submissions",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"room_id":uuid("room_id").notNull(),"user_id":uuid("user_id").notNull(),"excerpt":text("excerpt").notNull(),"word_count":integer("word_count"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"title":text("title").default(sql.raw("''::text")).notNull(),"idempotency_key":text("idempotency_key"),"request_hash":text("request_hash")},table=>[primaryKey({name:"writing_workshop_submissions_pkey",columns:[table["id"]]})]);
export const writingChallengeParticipants=pgTable("writing_challenge_participants",{"challenge_id":uuid("challenge_id").notNull(),"user_id":uuid("user_id").notNull(),"joined_at":timestamp("joined_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"writing_challenge_participants_pkey",columns:[table["challenge_id"],table["user_id"]]})]);
export const writingChallengeSubmissions=pgTable("writing_challenge_submissions",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"challenge_id":uuid("challenge_id").notNull(),"user_id":uuid("user_id").notNull(),"content":text("content").notNull(),"word_count":integer("word_count"),"ai_feedback":text("ai_feedback"),"community_votes":integer("community_votes").default(sql.raw("0")).notNull(),"submitted_at":timestamp("submitted_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"title":text("title"),"body":text("body")},table=>[primaryKey({name:"writing_challenge_submissions_pkey",columns:[table["id"]]})]);
export const writingChallengeVotes=pgTable("writing_challenge_votes",{"submission_id":uuid("submission_id").notNull(),"user_id":uuid("user_id").notNull(),"voted_at":timestamp("voted_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"writing_challenge_votes_pkey",columns:[table["submission_id"],table["user_id"]]})]);
export const writingChallenges=pgTable("writing_challenges",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"title":text("title").notNull(),"description":text("description"),"type":text("type").default(sql.raw("'weekly'::text")).notNull(),"start_date":timestamp("start_date",{mode:'string',withTimezone:true}),"end_date":timestamp("end_date",{mode:'string',withTimezone:true}),"is_active":boolean("is_active").default(sql.raw("true")).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"goal_type":text("goal_type").default(sql.raw("'submission_count'::text")).notNull(),"goal_value":integer("goal_value").default(sql.raw("1")).notNull(),"participant_count":integer("participant_count").default(sql.raw("0")).notNull()},table=>[primaryKey({name:"writing_challenges_pkey",columns:[table["id"]]})]);
export const writingPlans=pgTable("writing_plans",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"user_id":uuid("user_id").notNull(),"plan_text":text("plan_text").notNull(),"week_start":date("week_start",{mode:'string'}).notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull(),"tasks":jsonb("tasks").$type<Json>(),"policy_version":text("policy_version"),"source_hash":text("source_hash"),"locale":text("locale"),"provider":text("provider")},table=>[primaryKey({name:"writing_plans_pkey",columns:[table["id"]]})]);
export const writingPromptSubmissions=pgTable("writing_prompt_submissions",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"prompt_id":uuid("prompt_id").notNull(),"user_id":uuid("user_id").notNull(),"content":text("content").notNull(),"word_count":integer("word_count"),"ai_feedback":text("ai_feedback"),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"writing_prompt_submissions_pkey",columns:[table["id"]]})]);
export const writingPrompts=pgTable("writing_prompts",{"id":uuid("id").default(sql.raw("gen_random_uuid()")).notNull(),"prompt_text":text("prompt_text").notNull(),"topic_seed":text("topic_seed"),"is_active":boolean("is_active").default(sql.raw("true")).notNull(),"prompt_date":date("prompt_date",{mode:'string'}),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"writing_prompts_pkey",columns:[table["id"]]})]);
export const xpLedger=pgTable("xp_ledger",{"user_id":uuid("user_id").notNull(),"event_key":text("event_key").notNull(),"amount":integer("amount").notNull(),"reason":text("reason").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"xp_ledger_pkey",columns:[table["user_id"],table["event_key"]]})]);
export const xpReversals=pgTable("xp_reversals",{"user_id":uuid("user_id").notNull(),"event_key":text("event_key").notNull(),"amount":integer("amount").notNull(),"created_at":timestamp("created_at",{mode:'string',withTimezone:true}).default(sql.raw("now()")).notNull()},table=>[primaryKey({name:"xp_reversals_pkey",columns:[table["user_id"],table["event_key"]]})]);
export const schema={"account_export_current":accountExportCurrent,"account_export_jobs":accountExportJobs,"account_export_versions":accountExportVersions,"account_hardening_notices":accountHardeningNotices,"affiliate_health_log":affiliateHealthLog,"affiliate_link_clicks":affiliateLinkClicks,"affiliate_stores":affiliateStores,"ai_taste_profiles":aiTasteProfiles,"appeals":appeals,"arc_applications":arcApplications,"arcs":arcs,"ask_writer_answers":askWriterAnswers,"ask_writer_questions":askWriterQuestions,"auth_email_challenges":authEmailChallenges,"auth_factor_challenges":authFactorChallenges,"auth_factor_grants":authFactorGrants,"author_books":authorBooks,"author_catalog_intents":authorCatalogIntents,"author_posts":authorPosts,"author_qa":authorQa,"author_verification_requests":authorVerificationRequests,"author_work_claims":authorWorkClaims,"billing_accounts":billingAccounts,"billing_webhook_receipts":billingWebhookReceipts,"book_catalog_audit":bookCatalogAudit,"book_debates":bookDebates,"book_edition_identifiers":bookEditionIdentifiers,"book_passes":bookPasses,"book_work_identifiers":bookWorkIdentifiers,"book_works":bookWorks,"books":books,"buddy_read_members":buddyReadMembers,"buddy_read_messages":buddyReadMessages,"buddy_read_notes":buddyReadNotes,"buddy_reads":buddyReads,"challenge_participants":challengeParticipants,"challenges":challenges,"checkout_reconciliations":checkoutReconciliations,"community_note_ratings":communityNoteRatings,"community_notes":communityNotes,"content_intents":contentIntents,"content_reports":contentReports,"custom_themes":customThemes,"debate_votes":debateVotes,"digest_deliveries":digestDeliveries,"digest_email_campaigns":digestEmailCampaigns,"email_unsubscribe_proofs":emailUnsubscribeProofs,"email_verification_tokens":emailVerificationTokens,"event_revenue":eventRevenue,"event_rsvps":eventRsvps,"event_tickets":eventTickets,"events":events,"feature_flags":featureFlags,"financial_audit_log":financialAuditLog,"follows":follows,"goodreads_book_identities":goodreadsBookIdentities,"leaderboard_snapshots":leaderboardSnapshots,"legacy_goodreads_import_intents":legacyGoodreadsImportIntents,"maintenance_jobs":maintenanceJobs,"moderation_log":moderationLog,"notifications":notifications,"outbox_events":outboxEvents,"pass_the_book_chains":passTheBookChains,"pass_the_book_nodes":passTheBookNodes,"payment_captures":paymentCaptures,"payment_events":paymentEvents,"payment_refunds":paymentRefunds,"payment_returns":paymentReturns,"payout_requests":payoutRequests,"payouts":payouts,"profile_avatar_uploads":profileAvatarUploads,"promoted_listings":promotedListings,"push_subscriptions":pushSubscriptions,"quotes":quotes,"reading_activity_days":readingActivityDays,"reading_completions":readingCompletions,"reading_goal_milestones":readingGoalMilestones,"reading_goals":readingGoals,"reading_list_books":readingListBooks,"reading_list_follows":readingListFollows,"reading_lists":readingLists,"reading_room_members":readingRoomMembers,"reading_room_milestones":readingRoomMilestones,"reading_room_posts":readingRoomPosts,"reading_rooms":readingRooms,"reading_sessions":readingSessions,"reading_work_completions":readingWorkCompletions,"referral_commissions":referralCommissions,"referrals":referrals,"refund_inbox":refundInbox,"release_email_campaigns":releaseEmailCampaigns,"release_email_deliveries":releaseEmailDeliveries,"review_conversions":reviewConversions,"review_helpfulness_votes":reviewHelpfulnessVotes,"review_likes":reviewLikes,"review_replies":reviewReplies,"reviews":reviews,"revoked_push_sessions":revokedPushSessions,"room_participants":roomParticipants,"seasonal_event_participants":seasonalEventParticipants,"seasonal_events":seasonalEvents,"security_events":securityEvents,"seed_records":seedRecords,"shelf_books":shelfBooks,"shelves":shelves,"similar_books_computed":similarBooksComputed,"social_intents":socialIntents,"social_rewards":socialRewards,"subscription_cancellations":subscriptionCancellations,"subscriptions":subscriptions,"tips":tips,"user_badges":userBadges,"user_payout_methods":userPayoutMethods,"users":users,"workshop_feedback":workshopFeedback,"workshop_members":workshopMembers,"workshop_rooms":workshopRooms,"workshop_submissions":workshopSubmissions,"writing_challenge_participants":writingChallengeParticipants,"writing_challenge_submissions":writingChallengeSubmissions,"writing_challenge_votes":writingChallengeVotes,"writing_challenges":writingChallenges,"writing_plans":writingPlans,"writing_prompt_submissions":writingPromptSubmissions,"writing_prompts":writingPrompts,"xp_ledger":xpLedger,"xp_reversals":xpReversals};
export const primaryKeys=[{"table_name":"account_export_current","name":"account_export_current_pkey","columns":["table_name","row_key"]},{"table_name":"account_export_jobs","name":"account_export_jobs_pkey","columns":["id"]},{"table_name":"account_export_versions","name":"account_export_versions_pkey","columns":["table_name","row_key","born_epoch","removed_epoch"]},{"table_name":"account_hardening_notices","name":"account_hardening_notices_pkey","columns":["user_id","stage"]},{"table_name":"affiliate_health_log","name":"affiliate_health_log_pkey","columns":["id"]},{"table_name":"affiliate_link_clicks","name":"affiliate_link_clicks_pkey","columns":["id"]},{"table_name":"affiliate_stores","name":"affiliate_stores_pkey","columns":["id"]},{"table_name":"ai_taste_profiles","name":"ai_taste_profiles_pkey","columns":["id"]},{"table_name":"appeals","name":"appeals_pkey","columns":["id"]},{"table_name":"arc_applications","name":"arc_applications_pkey","columns":["id"]},{"table_name":"arcs","name":"arcs_pkey","columns":["id"]},{"table_name":"ask_writer_answers","name":"ask_writer_answers_pkey","columns":["id"]},{"table_name":"ask_writer_questions","name":"ask_writer_questions_pkey","columns":["id"]},{"table_name":"auth_email_challenges","name":"auth_email_challenges_pkey","columns":["token_hash"]},{"table_name":"auth_factor_challenges","name":"auth_factor_challenges_pkey","columns":["token_hash"]},{"table_name":"auth_factor_grants","name":"auth_factor_grants_pkey","columns":["session_hash"]},{"table_name":"author_books","name":"author_books_pkey","columns":["author_id","book_id"]},{"table_name":"author_catalog_intents","name":"author_catalog_intents_pkey","columns":["actor_id","intent_key"]},{"table_name":"author_posts","name":"author_posts_pkey","columns":["id"]},{"table_name":"author_qa","name":"author_qa_pkey","columns":["id"]},{"table_name":"author_verification_requests","name":"author_verification_requests_pkey","columns":["id"]},{"table_name":"author_work_claims","name":"author_work_claims_pkey","columns":["author_id","work_id"]},{"table_name":"billing_accounts","name":"billing_accounts_pkey","columns":["provider","account_id"]},{"table_name":"billing_webhook_receipts","name":"billing_webhook_receipts_pkey","columns":["provider","delivery_id"]},{"table_name":"book_catalog_audit","name":"book_catalog_audit_pkey","columns":["id"]},{"table_name":"book_debates","name":"debates_pkey","columns":["id"]},{"table_name":"book_edition_identifiers","name":"book_edition_identifiers_pkey","columns":["provider","identifier"]},{"table_name":"book_passes","name":"book_passes_pkey","columns":["id"]},{"table_name":"book_work_identifiers","name":"book_work_identifiers_pkey","columns":["open_library_id"]},{"table_name":"book_works","name":"book_works_pkey","columns":["id"]},{"table_name":"books","name":"books_pkey","columns":["id"]},{"table_name":"buddy_read_members","name":"buddy_read_members_pkey","columns":["buddy_read_id","user_id"]},{"table_name":"buddy_read_messages","name":"buddy_read_messages_pkey","columns":["id"]},{"table_name":"buddy_read_notes","name":"buddy_read_notes_pkey","columns":["id"]},{"table_name":"buddy_reads","name":"buddy_reads_pkey","columns":["id"]},{"table_name":"challenge_participants","name":"challenge_participants_pkey","columns":["challenge_id","user_id"]},{"table_name":"challenges","name":"challenges_pkey","columns":["id"]},{"table_name":"checkout_reconciliations","name":"checkout_reconciliations_pkey","columns":["entity_type","entity_id"]},{"table_name":"community_note_ratings","name":"community_note_ratings_pkey","columns":["note_id","user_id"]},{"table_name":"community_notes","name":"community_notes_pkey","columns":["id"]},{"table_name":"content_intents","name":"content_intents_pkey","columns":["actor_id","action","intent_key"]},{"table_name":"content_reports","name":"content_reports_pkey","columns":["id"]},{"table_name":"custom_themes","name":"custom_themes_pkey","columns":["id"]},{"table_name":"debate_votes","name":"debate_votes_pkey","columns":["debate_id","user_id"]},{"table_name":"digest_deliveries","name":"digest_deliveries_pkey","columns":["user_id","period_start"]},{"table_name":"digest_email_campaigns","name":"digest_email_campaigns_pkey","columns":["period_start"]},{"table_name":"email_unsubscribe_proofs","name":"email_unsubscribe_proofs_pkey","columns":["token_hash"]},{"table_name":"email_verification_tokens","name":"email_verification_tokens_pkey","columns":["id"]},{"table_name":"event_revenue","name":"event_revenue_pkey","columns":["id"]},{"table_name":"event_rsvps","name":"event_rsvps_pkey","columns":["event_id","user_id"]},{"table_name":"event_tickets","name":"event_tickets_pkey","columns":["id"]},{"table_name":"events","name":"events_pkey","columns":["id"]},{"table_name":"feature_flags","name":"feature_flags_pkey","columns":["id"]},{"table_name":"financial_audit_log","name":"financial_audit_log_pkey","columns":["id"]},{"table_name":"follows","name":"follows_pkey","columns":["follower_id","following_id"]},{"table_name":"goodreads_book_identities","name":"goodreads_book_identities_pkey","columns":["goodreads_id"]},{"table_name":"leaderboard_snapshots","name":"leaderboard_snapshots_pkey","columns":["id"]},{"table_name":"legacy_goodreads_import_intents","name":"legacy_goodreads_import_intents_pkey","columns":["actor_id","intent_key"]},{"table_name":"maintenance_jobs","name":"maintenance_jobs_pkey","columns":["name"]},{"table_name":"moderation_log","name":"moderation_log_pkey","columns":["id"]},{"table_name":"notifications","name":"notifications_pkey","columns":["id"]},{"table_name":"outbox_events","name":"outbox_events_pkey","columns":["id"]},{"table_name":"pass_the_book_chains","name":"pass_the_book_chains_pkey","columns":["id"]},{"table_name":"pass_the_book_nodes","name":"pass_the_book_nodes_pkey","columns":["id"]},{"table_name":"payment_captures","name":"payment_captures_pkey","columns":["provider","payment_id"]},{"table_name":"payment_events","name":"payment_events_pkey","columns":["provider","event_id"]},{"table_name":"payment_refunds","name":"payment_refunds_pkey","columns":["provider","refund_id"]},{"table_name":"payment_returns","name":"payment_returns_pkey","columns":["provider","payment_id"]},{"table_name":"payout_requests","name":"payout_requests_pkey","columns":["id"]},{"table_name":"payouts","name":"payouts_pkey","columns":["id"]},{"table_name":"profile_avatar_uploads","name":"profile_avatar_uploads_pkey","columns":["id"]},{"table_name":"promoted_listings","name":"promoted_listings_pkey","columns":["id"]},{"table_name":"push_subscriptions","name":"push_subscriptions_pkey","columns":["id"]},{"table_name":"quotes","name":"quotes_pkey","columns":["id"]},{"table_name":"reading_activity_days","name":"reading_activity_days_pkey","columns":["user_id","activity_date"]},{"table_name":"reading_completions","name":"reading_completions_pkey","columns":["user_id","book_id"]},{"table_name":"reading_goal_milestones","name":"reading_goal_milestones_pkey","columns":["id"]},{"table_name":"reading_goals","name":"reading_goals_pkey","columns":["id"]},{"table_name":"reading_list_books","name":"reading_list_books_pkey","columns":["list_id","book_id"]},{"table_name":"reading_list_follows","name":"reading_list_follows_pkey","columns":["list_id","user_id"]},{"table_name":"reading_lists","name":"reading_lists_pkey","columns":["id"]},{"table_name":"reading_room_members","name":"reading_room_members_pkey","columns":["room_id","user_id"]},{"table_name":"reading_room_milestones","name":"reading_room_milestones_pkey","columns":["id"]},{"table_name":"reading_room_posts","name":"reading_room_posts_pkey","columns":["id"]},{"table_name":"reading_rooms","name":"reading_rooms_pkey","columns":["id"]},{"table_name":"reading_sessions","name":"reading_sessions_pkey","columns":["id"]},{"table_name":"reading_work_completions","name":"reading_work_completions_pkey","columns":["user_id","work_id"]},{"table_name":"referral_commissions","name":"referral_commissions_pkey","columns":["id"]},{"table_name":"referrals","name":"referrals_pkey","columns":["id"]},{"table_name":"refund_inbox","name":"refund_inbox_pkey","columns":["provider","refund_id"]},{"table_name":"release_email_campaigns","name":"release_email_campaigns_pkey","columns":["post_id"]},{"table_name":"release_email_deliveries","name":"release_email_deliveries_pkey","columns":["post_id","user_id"]},{"table_name":"review_conversions","name":"review_conversions_pkey","columns":["actor_id","book_id"]},{"table_name":"review_helpfulness_votes","name":"review_helpfulness_votes_pkey","columns":["id"]},{"table_name":"review_likes","name":"review_likes_pkey","columns":["review_id","user_id"]},{"table_name":"review_replies","name":"review_replies_pkey","columns":["id"]},{"table_name":"reviews","name":"reviews_pkey","columns":["id"]},{"table_name":"revoked_push_sessions","name":"revoked_push_sessions_pkey","columns":["session_hash"]},{"table_name":"room_participants","name":"room_participants_pkey","columns":["room_id","user_id"]},{"table_name":"seasonal_event_participants","name":"seasonal_event_participants_pkey","columns":["event_id","user_id"]},{"table_name":"seasonal_events","name":"seasonal_events_pkey","columns":["id"]},{"table_name":"security_events","name":"security_events_pkey","columns":["id"]},{"table_name":"seed_records","name":"seed_records_pkey","columns":["kind","key"]},{"table_name":"shelf_books","name":"shelf_books_pkey","columns":["id"]},{"table_name":"shelves","name":"shelves_pkey","columns":["id"]},{"table_name":"similar_books_computed","name":"similar_books_computed_pkey","columns":["work_id"]},{"table_name":"social_intents","name":"social_intents_pkey","columns":["actor_id","action","intent_key"]},{"table_name":"social_rewards","name":"social_rewards_pkey","columns":["actor_id","action","target_id"]},{"table_name":"subscription_cancellations","name":"subscription_cancellations_pkey","columns":["subscription_id"]},{"table_name":"subscriptions","name":"subscriptions_pkey","columns":["id"]},{"table_name":"tips","name":"tips_pkey","columns":["id"]},{"table_name":"user_badges","name":"user_badges_pkey","columns":["id"]},{"table_name":"user_payout_methods","name":"user_payout_methods_pkey","columns":["id"]},{"table_name":"users","name":"users_pkey","columns":["id"]},{"table_name":"workshop_feedback","name":"writing_workshop_feedback_pkey","columns":["id"]},{"table_name":"workshop_members","name":"writing_workshop_members_pkey","columns":["room_id","user_id"]},{"table_name":"workshop_rooms","name":"writing_workshops_pkey","columns":["id"]},{"table_name":"workshop_submissions","name":"writing_workshop_submissions_pkey","columns":["id"]},{"table_name":"writing_challenge_participants","name":"writing_challenge_participants_pkey","columns":["challenge_id","user_id"]},{"table_name":"writing_challenge_submissions","name":"writing_challenge_submissions_pkey","columns":["id"]},{"table_name":"writing_challenge_votes","name":"writing_challenge_votes_pkey","columns":["submission_id","user_id"]},{"table_name":"writing_challenges","name":"writing_challenges_pkey","columns":["id"]},{"table_name":"writing_plans","name":"writing_plans_pkey","columns":["id"]},{"table_name":"writing_prompt_submissions","name":"writing_prompt_submissions_pkey","columns":["id"]},{"table_name":"writing_prompts","name":"writing_prompts_pkey","columns":["id"]},{"table_name":"xp_ledger","name":"xp_ledger_pkey","columns":["user_id","event_key"]},{"table_name":"xp_reversals","name":"xp_reversals_pkey","columns":["user_id","event_key"]}]as const;
export const foreignKeys=[
  {
    "name": "account_hardening_notices_user_id_fkey",
    "source_table": "account_hardening_notices",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "affiliate_health_log_book_id_fkey",
    "source_table": "affiliate_health_log",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "affiliate_link_clicks_book_id_fkey",
    "source_table": "affiliate_link_clicks",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "affiliate_link_clicks_store_id_fkey",
    "source_table": "affiliate_link_clicks",
    "target_table": "affiliate_stores",
    "source_columns": [
      "store_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "ai_taste_profiles_user_id_fkey",
    "source_table": "ai_taste_profiles",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": true
  },
  {
    "name": "appeals_report_id_fkey",
    "source_table": "appeals",
    "target_table": "content_reports",
    "source_columns": [
      "report_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "appeals_reviewed_by_fkey",
    "source_table": "appeals",
    "target_table": "users",
    "source_columns": [
      "reviewed_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "appeals_user_id_fkey",
    "source_table": "appeals",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "arc_applications_arc_id_fkey",
    "source_table": "arc_applications",
    "target_table": "arcs",
    "source_columns": [
      "arc_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "arc_applications_reader_id_fkey",
    "source_table": "arc_applications",
    "target_table": "users",
    "source_columns": [
      "reader_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "arcs_author_id_fkey",
    "source_table": "arcs",
    "target_table": "users",
    "source_columns": [
      "author_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "arcs_book_id_fkey",
    "source_table": "arcs",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "ask_writer_answers_question_id_fkey",
    "source_table": "ask_writer_answers",
    "target_table": "ask_writer_questions",
    "source_columns": [
      "question_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "ask_writer_answers_user_id_fkey",
    "source_table": "ask_writer_answers",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "ask_writer_questions_user_id_fkey",
    "source_table": "ask_writer_questions",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "fk_best_answer",
    "source_table": "ask_writer_questions",
    "target_table": "ask_writer_answers",
    "source_columns": [
      "best_answer_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "auth_email_challenges_user_id_fkey",
    "source_table": "auth_email_challenges",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "auth_factor_challenges_user_id_fkey",
    "source_table": "auth_factor_challenges",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "auth_factor_grants_user_id_fkey",
    "source_table": "auth_factor_grants",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_books_author_id_fkey",
    "source_table": "author_books",
    "target_table": "users",
    "source_columns": [
      "author_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_books_book_id_fkey",
    "source_table": "author_books",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_catalog_intents_actor_id_fkey",
    "source_table": "author_catalog_intents",
    "target_table": "users",
    "source_columns": [
      "actor_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_posts_author_id_fkey",
    "source_table": "author_posts",
    "target_table": "users",
    "source_columns": [
      "author_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_posts_book_id_fkey",
    "source_table": "author_posts",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_qa_asked_by_fkey",
    "source_table": "author_qa",
    "target_table": "users",
    "source_columns": [
      "asked_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_qa_author_id_fkey",
    "source_table": "author_qa",
    "target_table": "users",
    "source_columns": [
      "author_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_verification_requests_reviewed_by_fkey",
    "source_table": "author_verification_requests",
    "target_table": "users",
    "source_columns": [
      "reviewed_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_verification_requests_user_id_fkey",
    "source_table": "author_verification_requests",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_work_claims_author_id_fkey",
    "source_table": "author_work_claims",
    "target_table": "users",
    "source_columns": [
      "author_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_work_claims_verified_by_fkey",
    "source_table": "author_work_claims",
    "target_table": "users",
    "source_columns": [
      "verified_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "author_work_claims_work_id_fkey",
    "source_table": "author_work_claims",
    "target_table": "book_works",
    "source_columns": [
      "work_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "billing_accounts_user_id_fkey",
    "source_table": "billing_accounts",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "debates_book_id_fkey",
    "source_table": "book_debates",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "debates_user_id_fkey",
    "source_table": "book_debates",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "book_edition_identifiers_book_id_fkey",
    "source_table": "book_edition_identifiers",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "book_passes_book_id_fkey",
    "source_table": "book_passes",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "book_passes_recipient_id_fkey",
    "source_table": "book_passes",
    "target_table": "users",
    "source_columns": [
      "recipient_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "book_passes_sender_id_fkey",
    "source_table": "book_passes",
    "target_table": "users",
    "source_columns": [
      "sender_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "book_work_identifiers_work_id_fkey",
    "source_table": "book_work_identifiers",
    "target_table": "book_works",
    "source_columns": [
      "work_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "book_works_merged_into_fkey",
    "source_table": "book_works",
    "target_table": "book_works",
    "source_columns": [
      "merged_into"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "books_canonical_edition_id_fkey",
    "source_table": "books",
    "target_table": "books",
    "source_columns": [
      "canonical_edition_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "books_work_id_fkey",
    "source_table": "books",
    "target_table": "book_works",
    "source_columns": [
      "work_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "buddy_read_members_buddy_read_id_fkey",
    "source_table": "buddy_read_members",
    "target_table": "buddy_reads",
    "source_columns": [
      "buddy_read_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "buddy_read_members_user_id_fkey",
    "source_table": "buddy_read_members",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "buddy_read_messages_buddy_read_id_fkey",
    "source_table": "buddy_read_messages",
    "target_table": "buddy_reads",
    "source_columns": [
      "buddy_read_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "buddy_read_messages_user_id_fkey",
    "source_table": "buddy_read_messages",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "buddy_read_notes_buddy_read_id_fkey",
    "source_table": "buddy_read_notes",
    "target_table": "buddy_reads",
    "source_columns": [
      "buddy_read_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "buddy_read_notes_reply_to_id_fkey",
    "source_table": "buddy_read_notes",
    "target_table": "buddy_read_notes",
    "source_columns": [
      "reply_to_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "buddy_read_notes_user_id_fkey",
    "source_table": "buddy_read_notes",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "buddy_reads_book_id_fkey",
    "source_table": "buddy_reads",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "buddy_reads_creator_id_fkey",
    "source_table": "buddy_reads",
    "target_table": "users",
    "source_columns": [
      "created_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "challenge_participants_challenge_id_fkey",
    "source_table": "challenge_participants",
    "target_table": "challenges",
    "source_columns": [
      "challenge_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "challenge_participants_user_id_fkey",
    "source_table": "challenge_participants",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "challenges_created_by_fkey",
    "source_table": "challenges",
    "target_table": "users",
    "source_columns": [
      "created_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "checkout_reconciliations_user_id_fkey",
    "source_table": "checkout_reconciliations",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "community_note_ratings_note_id_fkey",
    "source_table": "community_note_ratings",
    "target_table": "community_notes",
    "source_columns": [
      "note_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "community_note_ratings_user_id_fkey",
    "source_table": "community_note_ratings",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "community_notes_author_id_fkey",
    "source_table": "community_notes",
    "target_table": "users",
    "source_columns": [
      "author_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "community_notes_reviewed_by_fkey",
    "source_table": "community_notes",
    "target_table": "users",
    "source_columns": [
      "reviewed_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "content_intents_actor_id_fkey",
    "source_table": "content_intents",
    "target_table": "users",
    "source_columns": [
      "actor_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "content_reports_moderator_id_fkey",
    "source_table": "content_reports",
    "target_table": "users",
    "source_columns": [
      "moderator_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "content_reports_reporter_id_fkey",
    "source_table": "content_reports",
    "target_table": "users",
    "source_columns": [
      "reporter_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "debate_votes_debate_id_fkey",
    "source_table": "debate_votes",
    "target_table": "book_debates",
    "source_columns": [
      "debate_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "debate_votes_user_id_fkey",
    "source_table": "debate_votes",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "digest_deliveries_user_id_fkey",
    "source_table": "digest_deliveries",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "email_unsubscribe_proofs_user_id_fkey",
    "source_table": "email_unsubscribe_proofs",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "email_verification_tokens_user_id_fkey",
    "source_table": "email_verification_tokens",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": true
  },
  {
    "name": "event_revenue_event_id_fkey",
    "source_table": "event_revenue",
    "target_table": "events",
    "source_columns": [
      "event_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "event_revenue_organizer_id_fkey",
    "source_table": "event_revenue",
    "target_table": "users",
    "source_columns": [
      "organizer_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "event_revenue_ticket_id_fkey",
    "source_table": "event_revenue",
    "target_table": "event_tickets",
    "source_columns": [
      "ticket_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "event_rsvps_event_id_fkey",
    "source_table": "event_rsvps",
    "target_table": "events",
    "source_columns": [
      "event_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "event_rsvps_user_id_fkey",
    "source_table": "event_rsvps",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "event_tickets_event_id_fkey",
    "source_table": "event_tickets",
    "target_table": "events",
    "source_columns": [
      "event_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "event_tickets_organizer_id_fkey",
    "source_table": "event_tickets",
    "target_table": "users",
    "source_columns": [
      "organizer_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "event_tickets_user_id_fkey",
    "source_table": "event_tickets",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "events_book_id_fkey",
    "source_table": "events",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "events_organizer_id_fkey",
    "source_table": "events",
    "target_table": "users",
    "source_columns": [
      "organizer_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "follows_follower_id_fkey",
    "source_table": "follows",
    "target_table": "users",
    "source_columns": [
      "follower_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "follows_following_id_fkey",
    "source_table": "follows",
    "target_table": "users",
    "source_columns": [
      "following_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "goodreads_book_identities_book_id_fkey",
    "source_table": "goodreads_book_identities",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "legacy_goodreads_import_intents_actor_id_fkey",
    "source_table": "legacy_goodreads_import_intents",
    "target_table": "users",
    "source_columns": [
      "actor_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "moderation_log_moderator_id_fkey",
    "source_table": "moderation_log",
    "target_table": "users",
    "source_columns": [
      "moderator_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "moderation_log_report_id_fkey",
    "source_table": "moderation_log",
    "target_table": "content_reports",
    "source_columns": [
      "report_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "moderation_log_target_user_id_fkey",
    "source_table": "moderation_log",
    "target_table": "users",
    "source_columns": [
      "target_user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "notifications_actor_id_fkey",
    "source_table": "notifications",
    "target_table": "users",
    "source_columns": [
      "actor_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "notifications_user_id_fkey",
    "source_table": "notifications",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "pass_the_book_chains_book_id_fkey",
    "source_table": "pass_the_book_chains",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "pass_the_book_chains_creator_id_fkey",
    "source_table": "pass_the_book_chains",
    "target_table": "users",
    "source_columns": [
      "creator_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "pass_the_book_nodes_chain_id_fkey",
    "source_table": "pass_the_book_nodes",
    "target_table": "pass_the_book_chains",
    "source_columns": [
      "chain_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "pass_the_book_nodes_nominee_id_fkey",
    "source_table": "pass_the_book_nodes",
    "target_table": "users",
    "source_columns": [
      "nominee_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "pass_the_book_nodes_user_id_fkey",
    "source_table": "pass_the_book_nodes",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "payment_captures_recipient_id_fkey",
    "source_table": "payment_captures",
    "target_table": "users",
    "source_columns": [
      "recipient_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "payment_captures_user_id_fkey",
    "source_table": "payment_captures",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "payment_refunds_provider_payment_id_fkey",
    "source_table": "payment_refunds",
    "target_table": "payment_captures",
    "source_columns": [
      "provider",
      "payment_id"
    ],
    "target_columns": [
      "provider",
      "payment_id"
    ],
    "source_unique": false
  },
  {
    "name": "payment_returns_provider_payment_id_fkey",
    "source_table": "payment_returns",
    "target_table": "payment_captures",
    "source_columns": [
      "provider",
      "payment_id"
    ],
    "target_columns": [
      "provider",
      "payment_id"
    ],
    "source_unique": true
  },
  {
    "name": "payout_requests_user_id_fkey",
    "source_table": "payout_requests",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "payouts_recipient_id_fkey",
    "source_table": "payouts",
    "target_table": "users",
    "source_columns": [
      "recipient_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "payouts_tip_id_fkey",
    "source_table": "payouts",
    "target_table": "tips",
    "source_columns": [
      "tip_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "profile_avatar_uploads_user_id_fkey",
    "source_table": "profile_avatar_uploads",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "promoted_listings_author_id_fkey",
    "source_table": "promoted_listings",
    "target_table": "users",
    "source_columns": [
      "author_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "promoted_listings_book_id_fkey",
    "source_table": "promoted_listings",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "promoted_listings_created_by_fkey",
    "source_table": "promoted_listings",
    "target_table": "users",
    "source_columns": [
      "created_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "push_subscriptions_user_id_fkey",
    "source_table": "push_subscriptions",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "quotes_book_id_fkey",
    "source_table": "quotes",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "quotes_user_id_fkey",
    "source_table": "quotes",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_activity_days_user_id_fkey",
    "source_table": "reading_activity_days",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_completions_book_id_fkey",
    "source_table": "reading_completions",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_completions_user_id_fkey",
    "source_table": "reading_completions",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_goal_milestones_user_id_fkey",
    "source_table": "reading_goal_milestones",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_goals_user_id_fkey",
    "source_table": "reading_goals",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_list_books_book_id_fkey",
    "source_table": "reading_list_books",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_list_books_list_id_fkey",
    "source_table": "reading_list_books",
    "target_table": "reading_lists",
    "source_columns": [
      "list_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_list_follows_list_id_fkey",
    "source_table": "reading_list_follows",
    "target_table": "reading_lists",
    "source_columns": [
      "list_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_list_follows_user_id_fkey",
    "source_table": "reading_list_follows",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_lists_forked_from_fkey",
    "source_table": "reading_lists",
    "target_table": "reading_lists",
    "source_columns": [
      "forked_from"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_lists_user_id_fkey",
    "source_table": "reading_lists",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_room_members_room_id_fkey",
    "source_table": "reading_room_members",
    "target_table": "reading_rooms",
    "source_columns": [
      "room_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_room_members_user_id_fkey",
    "source_table": "reading_room_members",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_room_milestones_created_by_fkey",
    "source_table": "reading_room_milestones",
    "target_table": "users",
    "source_columns": [
      "created_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_room_milestones_room_id_fkey",
    "source_table": "reading_room_milestones",
    "target_table": "reading_rooms",
    "source_columns": [
      "room_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_room_posts_milestone_id_fkey",
    "source_table": "reading_room_posts",
    "target_table": "reading_room_milestones",
    "source_columns": [
      "milestone_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_room_posts_room_id_fkey",
    "source_table": "reading_room_posts",
    "target_table": "reading_rooms",
    "source_columns": [
      "room_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_room_posts_user_id_fkey",
    "source_table": "reading_room_posts",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_rooms_book_id_fkey",
    "source_table": "reading_rooms",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_rooms_created_by_fkey",
    "source_table": "reading_rooms",
    "target_table": "users",
    "source_columns": [
      "created_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_rooms_creator_id_fkey",
    "source_table": "reading_rooms",
    "target_table": "users",
    "source_columns": [
      "creator_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_sessions_book_id_fkey",
    "source_table": "reading_sessions",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_sessions_shelf_book_id_fkey",
    "source_table": "reading_sessions",
    "target_table": "shelf_books",
    "source_columns": [
      "shelf_book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_sessions_user_id_fkey",
    "source_table": "reading_sessions",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_work_completions_book_id_fkey",
    "source_table": "reading_work_completions",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_work_completions_user_id_fkey",
    "source_table": "reading_work_completions",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reading_work_completions_work_id_fkey",
    "source_table": "reading_work_completions",
    "target_table": "book_works",
    "source_columns": [
      "work_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "referral_commissions_referred_user_id_fkey",
    "source_table": "referral_commissions",
    "target_table": "users",
    "source_columns": [
      "referred_user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "referral_commissions_referrer_id_fkey",
    "source_table": "referral_commissions",
    "target_table": "users",
    "source_columns": [
      "referrer_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "referrals_referred_id_fkey",
    "source_table": "referrals",
    "target_table": "users",
    "source_columns": [
      "referred_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "referrals_referrer_id_fkey",
    "source_table": "referrals",
    "target_table": "users",
    "source_columns": [
      "referrer_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "release_email_campaigns_post_id_fkey",
    "source_table": "release_email_campaigns",
    "target_table": "author_posts",
    "source_columns": [
      "post_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": true
  },
  {
    "name": "release_email_deliveries_post_id_fkey",
    "source_table": "release_email_deliveries",
    "target_table": "release_email_campaigns",
    "source_columns": [
      "post_id"
    ],
    "target_columns": [
      "post_id"
    ],
    "source_unique": false
  },
  {
    "name": "release_email_deliveries_user_id_fkey",
    "source_table": "release_email_deliveries",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_conversions_actor_id_fkey",
    "source_table": "review_conversions",
    "target_table": "users",
    "source_columns": [
      "actor_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_conversions_book_id_fkey",
    "source_table": "review_conversions",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_conversions_review_id_fkey",
    "source_table": "review_conversions",
    "target_table": "reviews",
    "source_columns": [
      "review_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_conversions_reviewer_id_fkey",
    "source_table": "review_conversions",
    "target_table": "users",
    "source_columns": [
      "reviewer_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_helpfulness_votes_review_id_fkey",
    "source_table": "review_helpfulness_votes",
    "target_table": "reviews",
    "source_columns": [
      "review_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_helpfulness_votes_user_id_fkey",
    "source_table": "review_helpfulness_votes",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_likes_review_id_fkey",
    "source_table": "review_likes",
    "target_table": "reviews",
    "source_columns": [
      "review_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_likes_user_id_fkey",
    "source_table": "review_likes",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_replies_review_id_fkey",
    "source_table": "review_replies",
    "target_table": "reviews",
    "source_columns": [
      "review_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "review_replies_user_id_fkey",
    "source_table": "review_replies",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reviews_book_id_fkey",
    "source_table": "reviews",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "reviews_user_id_fkey",
    "source_table": "reviews",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "room_participants_room_id_fkey",
    "source_table": "room_participants",
    "target_table": "reading_rooms",
    "source_columns": [
      "room_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "room_participants_user_id_fkey",
    "source_table": "room_participants",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "seasonal_event_participants_event_id_fkey",
    "source_table": "seasonal_event_participants",
    "target_table": "seasonal_events",
    "source_columns": [
      "event_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "seasonal_event_participants_user_id_fkey",
    "source_table": "seasonal_event_participants",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "security_events_user_id_fkey",
    "source_table": "security_events",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "shelf_books_book_id_fkey",
    "source_table": "shelf_books",
    "target_table": "books",
    "source_columns": [
      "book_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "shelf_books_shelf_id_fkey",
    "source_table": "shelf_books",
    "target_table": "shelves",
    "source_columns": [
      "shelf_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "shelf_books_user_id_fkey",
    "source_table": "shelf_books",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "shelves_user_id_fkey",
    "source_table": "shelves",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "similar_books_computed_work_id_fkey",
    "source_table": "similar_books_computed",
    "target_table": "book_works",
    "source_columns": [
      "work_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": true
  },
  {
    "name": "social_intents_actor_id_fkey",
    "source_table": "social_intents",
    "target_table": "users",
    "source_columns": [
      "actor_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "social_rewards_actor_id_fkey",
    "source_table": "social_rewards",
    "target_table": "users",
    "source_columns": [
      "actor_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "subscription_cancellations_subscription_id_fkey",
    "source_table": "subscription_cancellations",
    "target_table": "subscriptions",
    "source_columns": [
      "subscription_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": true
  },
  {
    "name": "subscriptions_user_id_fkey",
    "source_table": "subscriptions",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "tips_creator_id_fkey",
    "source_table": "tips",
    "target_table": "users",
    "source_columns": [
      "creator_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "tips_recipient_id_fkey",
    "source_table": "tips",
    "target_table": "users",
    "source_columns": [
      "recipient_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "tips_user_id_fkey",
    "source_table": "tips",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "user_badges_user_id_fkey",
    "source_table": "user_badges",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "user_payout_methods_user_id_fkey",
    "source_table": "user_payout_methods",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "users_referred_by_fkey",
    "source_table": "users",
    "target_table": "users",
    "source_columns": [
      "referred_by"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_workshop_feedback_reviewer_id_fkey",
    "source_table": "workshop_feedback",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_workshop_feedback_submission_id_fkey",
    "source_table": "workshop_feedback",
    "target_table": "workshop_submissions",
    "source_columns": [
      "submission_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_workshop_members_user_id_fkey",
    "source_table": "workshop_members",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_workshop_members_workshop_id_fkey",
    "source_table": "workshop_members",
    "target_table": "workshop_rooms",
    "source_columns": [
      "room_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_workshops_creator_id_fkey",
    "source_table": "workshop_rooms",
    "target_table": "users",
    "source_columns": [
      "facilitator_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_workshop_submissions_user_id_fkey",
    "source_table": "workshop_submissions",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_workshop_submissions_workshop_id_fkey",
    "source_table": "workshop_submissions",
    "target_table": "workshop_rooms",
    "source_columns": [
      "room_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_challenge_participants_challenge_id_fkey",
    "source_table": "writing_challenge_participants",
    "target_table": "writing_challenges",
    "source_columns": [
      "challenge_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_challenge_participants_user_id_fkey",
    "source_table": "writing_challenge_participants",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_challenge_submissions_challenge_id_fkey",
    "source_table": "writing_challenge_submissions",
    "target_table": "writing_challenges",
    "source_columns": [
      "challenge_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_challenge_submissions_user_id_fkey",
    "source_table": "writing_challenge_submissions",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_challenge_votes_submission_id_fkey",
    "source_table": "writing_challenge_votes",
    "target_table": "writing_challenge_submissions",
    "source_columns": [
      "submission_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_challenge_votes_user_id_fkey",
    "source_table": "writing_challenge_votes",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_plans_user_id_fkey",
    "source_table": "writing_plans",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_prompt_submissions_prompt_id_fkey",
    "source_table": "writing_prompt_submissions",
    "target_table": "writing_prompts",
    "source_columns": [
      "prompt_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "writing_prompt_submissions_user_id_fkey",
    "source_table": "writing_prompt_submissions",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "xp_ledger_user_id_fkey",
    "source_table": "xp_ledger",
    "target_table": "users",
    "source_columns": [
      "user_id"
    ],
    "target_columns": [
      "id"
    ],
    "source_unique": false
  },
  {
    "name": "xp_reversals_user_id_event_key_fkey",
    "source_table": "xp_reversals",
    "target_table": "xp_ledger",
    "source_columns": [
      "user_id",
      "event_key"
    ],
    "target_columns": [
      "user_id",
      "event_key"
    ],
    "source_unique": true
  }
]as const;
