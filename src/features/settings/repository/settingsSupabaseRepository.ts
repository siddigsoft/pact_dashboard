import { supabase } from '@/integrations/supabase/client';

export async function signInWithPasswordForBiometricVerification(params: {
  email: string;
  password: string;
}): Promise<{ error: any | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });

  return { error };
}

export async function uploadAvatarAndUpdateUserProfile(params: {
  userId: string;
  filePath: string;
  file: File;
}): Promise<{ avatarUrl: string }> {
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(params.filePath, params.file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(params.filePath);
  const avatarUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', params.userId);

  if (updateError) throw updateError;

  return { avatarUrl };
}

export async function invokeSelfChangePassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ data: any; error: any }> {
  const { data, error } = await supabase.functions.invoke('self-change-password', {
    body: {
      currentPassword: params.currentPassword,
      newPassword: params.newPassword,
    },
  });

  return { data, error };
}

