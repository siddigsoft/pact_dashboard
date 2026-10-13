export const ALLOWED_EMAIL_DOMAINS = ['pactorg.com', 'pactorg.org'];

export const isAllowedEmailDomain = (email: string): boolean => {
  const domain = email.trim().split('@')[1]?.toLowerCase();
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
};
