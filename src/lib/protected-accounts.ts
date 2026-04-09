/**
 * Protected owner account — this user's role and super admin status
 * cannot be changed by anyone, including other super admins.
 * Protected at both the database level (trigger) and application level.
 */
export const PROTECTED_OWNER_ID = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b';
export const PROTECTED_OWNER_EMAIL = 'siddigsoft123@gmail.com';

export function isProtectedOwner(userId?: string | null): boolean {
  return !!userId && userId === PROTECTED_OWNER_ID;
}
