-- ============================================================
-- RENTORA — UNIVERSAL PG MANAGEMENT SAAS PLATFORM
-- MULTI-TENANT ISOLATION & ONBOARDING MIGRATION SCHEMA
-- ============================================================

-- 1. Extend 'properties' table to support customizable PG metadata,
-- address hierarchy, and payment QR configuration
ALTER TABLE IF EXISTS public.properties
ADD COLUMN IF NOT EXISTS pg_type TEXT DEFAULT 'Co-living',
ADD COLUMN IF NOT EXISTS locality TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS pin_code TEXT,
ADD COLUMN IF NOT EXISTS upi_id TEXT,
ADD COLUMN IF NOT EXISTS upi_qr_type TEXT DEFAULT 'dynamic',
ADD COLUMN IF NOT EXISTS buildings_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_capacity INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS security_deposit NUMERIC DEFAULT 5000,
ADD COLUMN IF NOT EXISTS rent_due_date INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS late_fee_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS late_fee_amount NUMERIC DEFAULT 50,
ADD COLUMN IF NOT EXISTS late_fee_grace_days INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS facilities JSONB DEFAULT '["Wi-Fi", "Housekeeping", "Water (RO)", "Security / CCTV"]'::jsonb,
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'English',
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- 2. Extend 'user_settings' table for SaaS notifications & tenant preferences
ALTER TABLE IF EXISTS public.user_settings
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"rentDue": true, "paymentReceived": true, "vacantBed": false}'::jsonb,
ADD COLUMN IF NOT EXISTS pg_config JSONB DEFAULT '{}'::jsonb;

-- 3. Ensure Row-Level Security (RLS) is strictly enforced across all PG tables
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- 4. Verify / Recreate Tenant Isolation Policies (Scoped to authenticated owner)
DROP POLICY IF EXISTS "Users can only access own properties" ON public.properties;
CREATE POLICY "Users can only access own properties"
ON public.properties FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access own floors" ON public.floors;
CREATE POLICY "Users can only access own floors"
ON public.floors FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access own rooms" ON public.rooms;
CREATE POLICY "Users can only access own rooms"
ON public.rooms FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access own beds" ON public.beds;
CREATE POLICY "Users can only access own beds"
ON public.beds FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access own tenants" ON public.tenants;
CREATE POLICY "Users can only access own tenants"
ON public.tenants FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access own payments" ON public.payments;
CREATE POLICY "Users can only access own payments"
ON public.payments FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access own expenses" ON public.expenses;
CREATE POLICY "Users can only access own expenses"
ON public.expenses FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access own other_income" ON public.other_income;
CREATE POLICY "Users can only access own other_income"
ON public.other_income FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access own agreements" ON public.agreements;
CREATE POLICY "Users can only access own agreements"
ON public.agreements FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only access own settings" ON public.user_settings;
CREATE POLICY "Users can only access own settings"
ON public.user_settings FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
