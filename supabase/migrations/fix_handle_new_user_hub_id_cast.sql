-- Fix handle_new_user function to NOT cast hubId to UUID
-- The hub_id column in profiles is TEXT, not UUID
-- This restores the correct behavior that matches the schema

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    role,
    hub_id,
    state_id,
    locality_id,
    phone,
    employee_id,
    avatar_url,
    status,
    created_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'dataCollector'),
    NEW.raw_user_meta_data->>'hubId',  -- NO CAST - hub_id is TEXT, not UUID
    NEW.raw_user_meta_data->>'stateId',
    NEW.raw_user_meta_data->>'localityId',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'employeeId',
    NEW.raw_user_meta_data->>'avatar',
    'pending',
    NOW()
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- The trigger is already created, this just fixes the function

