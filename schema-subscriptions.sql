-- ============================================================
-- RENTORA — SAAS SUBSCRIPTIONS, 10-DAY TRIAL & LICENSES SCHEMA
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/epgipizdldvrevihxyqf/sql
-- ============================================================

-- 1. Create table for user subscriptions
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT,
    status TEXT NOT NULL DEFAULT 'trialing', -- 'trialing', 'active', 'expired', 'pending_approval'
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    subscription_end TIMESTAMPTZ,
    plan_name TEXT DEFAULT 'Monthly Pro',
    price_inr NUMERIC DEFAULT 1500,
    last_payment_ref TEXT,
    last_payment_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure dynamic trial columns exist if table was already created
ALTER TABLE public.user_subscriptions 
    ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;

-- 2. Enable Row-Level Security (RLS)
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Allow users to view their own subscription
DROP POLICY IF EXISTS "Users can read own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can read own subscription"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 4. Policy: Allow users to insert / update their own subscription
DROP POLICY IF EXISTS "Users can upsert own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can upsert own subscription"
ON public.user_subscriptions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_subscription_timestamp ON public.user_subscriptions;
CREATE TRIGGER trigger_update_user_subscription_timestamp
    BEFORE UPDATE ON public.user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_subscription_timestamp();

-- 6. Optional: Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
