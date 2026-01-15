-- Create payment_methods table
-- Stores user payment method preferences (bank, mobile money, card)
-- Complements payout_requests table which handles individual withdrawal requests

CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Payment method type
    type TEXT NOT NULL CHECK (type IN ('bank', 'mobile_money', 'card')),
    
    -- Generic fields
    name TEXT NOT NULL,  -- Display name (e.g., "My Bank Account", "Zain Mobile Money")
    details TEXT,       -- Masked details for display (e.g., "Account: ***1234")
    is_default BOOLEAN DEFAULT FALSE,
    
    -- Bank transfer fields
    bank_name TEXT,
    account_number TEXT,  -- Should be encrypted in production
    account_holder_name TEXT,
    
    -- Mobile money fields
    provider_name TEXT,  -- e.g., "Zain", "MTN", "Sudani"
    phone_number TEXT,   -- Should be encrypted in production
    
    -- Card fields
    cardholder_name TEXT,
    card_number TEXT,    -- Should be encrypted in production (never store full numbers)
    card_last_four TEXT, -- Last 4 digits for display
    
    -- Metadata
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    verified BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure user has only one default payment method
    CONSTRAINT one_default_per_user UNIQUE (user_id) WHERE is_default = TRUE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON public.payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_type ON public.payment_methods(type);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON public.payment_methods(is_default);
CREATE INDEX IF NOT EXISTS idx_payment_methods_status ON public.payment_methods(status);
CREATE INDEX IF NOT EXISTS idx_payment_methods_created_at ON public.payment_methods(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
DO $$
BEGIN
    -- Users can view their own payment methods
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payment_methods' 
        AND policyname = 'Users can view their own payment methods'
    ) THEN
        CREATE POLICY "Users can view their own payment methods"
            ON public.payment_methods FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    -- Users can insert their own payment methods
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payment_methods' 
        AND policyname = 'Users can insert their own payment methods'
    ) THEN
        CREATE POLICY "Users can insert their own payment methods"
            ON public.payment_methods FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    -- Users can update their own payment methods
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payment_methods' 
        AND policyname = 'Users can update their own payment methods'
    ) THEN
        CREATE POLICY "Users can update their own payment methods"
            ON public.payment_methods FOR UPDATE
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    -- Users can delete their own payment methods
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payment_methods' 
        AND policyname = 'Users can delete their own payment methods'
    ) THEN
        CREATE POLICY "Users can delete their own payment methods"
            ON public.payment_methods FOR DELETE
            USING (auth.uid() = user_id);
    END IF;

    -- Admins can view all payment methods
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payment_methods' 
        AND policyname = 'Admins can view all payment methods'
    ) THEN
        CREATE POLICY "Admins can view all payment methods"
            ON public.payment_methods FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('Admin', 'admin')
                )
            );
    END IF;
END $$;

-- Create trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION public.update_payment_methods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_methods_updated_at_trigger ON public.payment_methods;
CREATE TRIGGER payment_methods_updated_at_trigger
    BEFORE UPDATE ON public.payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION public.update_payment_methods_updated_at();

-- Add comments
COMMENT ON TABLE public.payment_methods IS 'Stores payment methods for users to receive funds/withdrawals';
COMMENT ON COLUMN public.payment_methods.name IS 'Display name for the payment method';
COMMENT ON COLUMN public.payment_methods.details IS 'Masked display details (e.g., last 4 digits)';
COMMENT ON COLUMN public.payment_methods.is_default IS 'Whether this is the default payment method for the user';
COMMENT ON COLUMN public.payment_methods.verified IS 'Whether the payment method has been verified';
