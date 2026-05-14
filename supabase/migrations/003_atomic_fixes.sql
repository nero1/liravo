-- Atomicity and integrity hardening migration

DO $$
BEGIN
  IF to_regclass('public.review_likes') IS NOT NULL THEN
    EXECUTE 'create unique index if not exists review_likes_review_user_uniq on public.review_likes(review_id, user_id)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.toggle_review_like_atomic(
  p_review_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM public.review_likes
  WHERE review_id = p_review_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count > 0 THEN
    UPDATE public.reviews
    SET likes_count = GREATEST(0, likes_count - 1), updated_at = now()
    WHERE id = p_review_id;
    RETURN false;
  END IF;

  INSERT INTO public.review_likes(review_id, user_id)
  VALUES (p_review_id, p_user_id)
  ON CONFLICT (review_id, user_id) DO NOTHING;

  UPDATE public.reviews
  SET likes_count = likes_count + 1, updated_at = now()
  WHERE id = p_review_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_subscription_webhook(
  p_event text,
  p_user_id uuid,
  p_subscription_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
