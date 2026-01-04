-- Cost Predictions System Tables
-- Run this in Supabase SQL Editor to create the required tables

-- Create historical_site_costs table for storing historical cost data
CREATE TABLE IF NOT EXISTS public.historical_site_costs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    site_id TEXT NOT NULL,
    site_name TEXT NOT NULL,
    state_id TEXT NOT NULL,
    locality_id TEXT NOT NULL,
    hub_id TEXT,
    visit_date DATE NOT NULL,
    actual_cost DECIMAL(12, 2) NOT NULL,
    transport_mode TEXT,
    gps_latitude DOUBLE PRECISION,
    gps_longitude DOUBLE PRECISION,
    gps_source TEXT CHECK (gps_source IN ('registry', 'mmp', 'upload', 'manual')),
    data_collector_id TEXT,
    collector_distance_km DECIMAL(8, 2),
    mmp_id TEXT,
    source TEXT NOT NULL CHECK (source IN ('historical_upload', 'live')),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create cost_predictions cache table for faster lookups
CREATE TABLE IF NOT EXISTS public.cost_predictions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    site_id TEXT NOT NULL UNIQUE,
    predicted_cost DECIMAL(12, 2) NOT NULL,
    confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    algorithm_used TEXT NOT NULL CHECK (algorithm_used IN ('exponential_smoothing', 'locality_median', 'state_median', 'hub_median')),
    visit_count INTEGER NOT NULL DEFAULT 0,
    last_calculated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_historical_costs_site ON public.historical_site_costs(site_id);
CREATE INDEX IF NOT EXISTS idx_historical_costs_state ON public.historical_site_costs(state_id);
CREATE INDEX IF NOT EXISTS idx_historical_costs_locality ON public.historical_site_costs(locality_id);
CREATE INDEX IF NOT EXISTS idx_historical_costs_hub ON public.historical_site_costs(hub_id);
CREATE INDEX IF NOT EXISTS idx_historical_costs_date ON public.historical_site_costs(visit_date);
CREATE INDEX IF NOT EXISTS idx_historical_costs_collector ON public.historical_site_costs(data_collector_id);
CREATE INDEX IF NOT EXISTS idx_cost_predictions_site ON public.cost_predictions(site_id);

-- Enable Row Level Security
ALTER TABLE public.historical_site_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_predictions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for historical_site_costs
CREATE POLICY "Allow read access to historical_site_costs for authenticated users" 
    ON public.historical_site_costs FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow insert to historical_site_costs for finance admins" 
    ON public.historical_site_costs FOR INSERT 
    TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin', 'financeAdmin', 'finance')
        )
    );

CREATE POLICY "Allow update to historical_site_costs for finance admins" 
    ON public.historical_site_costs FOR UPDATE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin', 'financeAdmin', 'finance')
        )
    );

CREATE POLICY "Allow delete from historical_site_costs for admins" 
    ON public.historical_site_costs FOR DELETE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

-- RLS Policies for cost_predictions
CREATE POLICY "Allow read access to cost_predictions for authenticated users" 
    ON public.cost_predictions FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow insert to cost_predictions for finance admins" 
    ON public.cost_predictions FOR INSERT 
    TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin', 'financeAdmin', 'finance')
        )
    );

CREATE POLICY "Allow update to cost_predictions for finance admins" 
    ON public.cost_predictions FOR UPDATE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin', 'financeAdmin', 'finance')
        )
    );

-- Add current_latitude and current_longitude to profiles if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_latitude') THEN
        ALTER TABLE public.profiles ADD COLUMN current_latitude DOUBLE PRECISION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_longitude') THEN
        ALTER TABLE public.profiles ADD COLUMN current_longitude DOUBLE PRECISION;
    END IF;
END $$;

-- Create function to update cost prediction cache
CREATE OR REPLACE FUNCTION update_cost_prediction_cache()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or insert the prediction cache for this site
    INSERT INTO public.cost_predictions (site_id, predicted_cost, confidence, algorithm_used, visit_count, last_calculated)
    SELECT 
        NEW.site_id,
        AVG(actual_cost),
        CASE 
            WHEN COUNT(*) >= 3 THEN 80
            WHEN COUNT(*) >= 1 THEN 60
            ELSE 40
        END,
        CASE 
            WHEN COUNT(*) >= 3 THEN 'exponential_smoothing'
            ELSE 'locality_median'
        END,
        COUNT(*),
        NOW()
    FROM public.historical_site_costs
    WHERE site_id = NEW.site_id
    ON CONFLICT (site_id) 
    DO UPDATE SET
        predicted_cost = EXCLUDED.predicted_cost,
        confidence = EXCLUDED.confidence,
        algorithm_used = EXCLUDED.algorithm_used,
        visit_count = EXCLUDED.visit_count,
        last_calculated = NOW(),
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update prediction cache
DROP TRIGGER IF EXISTS trigger_update_cost_prediction ON public.historical_site_costs;
CREATE TRIGGER trigger_update_cost_prediction
    AFTER INSERT OR UPDATE ON public.historical_site_costs
    FOR EACH ROW
    EXECUTE FUNCTION update_cost_prediction_cache();
