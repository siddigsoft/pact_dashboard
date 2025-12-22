-- Create payment_methods table for wallet payment options
-- This table stores user payment methods for withdrawals

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('bank', 'mobile_money', 'card')),
  name text NOT NULL, -- Display name (e.g., "Bank of Khartoum", "MTN Mobile Money")
  account_number text, -- For bank accounts
  bank_name text, -- For bank accounts
  phone_number text, -- For mobile money
  card_number text, -- For cards (should be encrypted)
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Ensure only one default per user
  UNIQUE(user_id, is_default) DEFERRABLE INITIALLY DEFERRED
);

-- Add RLS policies
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Users can only see their own payment methods
CREATE POLICY "Users can view own payment methods" ON public.payment_methods
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own payment methods
CREATE POLICY "Users can insert own payment methods" ON public.payment_methods
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own payment methods
CREATE POLICY "Users can update own payment methods" ON public.payment_methods
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own payment methods
CREATE POLICY "Users can delete own payment methods" ON public.payment_methods
  FOR DELETE USING (auth.uid() = user_id);

-- Function to ensure only one default payment method per user
CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting is_default to true, unset all other defaults for this user
  IF NEW.is_default = true THEN
    UPDATE public.payment_methods
    SET is_default = false, updated_at = now()
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;

  -- If this is the first payment method, make it default
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_methods
    WHERE user_id = NEW.user_id AND is_default = true
  ) THEN
    NEW.is_default := true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain single default
CREATE TRIGGER ensure_single_default_trigger
  BEFORE INSERT OR UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION ensure_single_default_payment_method();

-- Indexes for performance
CREATE INDEX idx_payment_methods_user_id ON public.payment_methods(user_id);
CREATE INDEX idx_payment_methods_type ON public.payment_methods(type);
CREATE INDEX idx_payment_methods_is_default ON public.payment_methods(user_id, is_default);