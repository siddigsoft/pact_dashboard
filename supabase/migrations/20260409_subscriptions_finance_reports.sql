-- Subscriptions table for tracking recurring company costs
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor text NOT NULL,
  category text NOT NULL DEFAULT 'software' CHECK (category IN ('software', 'infrastructure', 'services', 'other')),
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  renewal_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Notification settings for subscription thresholds
CREATE TABLE IF NOT EXISTS public.subscription_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_cost_threshold numeric(12, 2) NOT NULL DEFAULT 10000,
  currency text NOT NULL DEFAULT 'USD',
  renewal_alert_days integer NOT NULL DEFAULT 7,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default settings row if not exists
INSERT INTO public.subscription_notification_settings (monthly_cost_threshold, currency, renewal_alert_days)
SELECT 10000, 'USD', 7
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_notification_settings);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions: admin and financial admins can view/manage
-- CountryDirector can view for budget oversight; auditors do NOT have access (finance data sensitivity)
CREATE POLICY "subscriptions_select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin', 'country_director', 'countryDirector', 'CountryDirector')
    )
  );

CREATE POLICY "subscriptions_insert" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin')
    )
  );

CREATE POLICY "subscriptions_update" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin')
    )
  );

CREATE POLICY "subscriptions_delete" ON public.subscriptions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin')
    )
  );

-- RLS for notification settings (admin and financial admins only)
CREATE POLICY "sub_notif_settings_select" ON public.subscription_notification_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin')
    )
  );

CREATE POLICY "sub_notif_settings_insert" ON public.subscription_notification_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin')
    )
  );

CREATE POLICY "sub_notif_settings_update" ON public.subscription_notification_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin')
    )
  );
