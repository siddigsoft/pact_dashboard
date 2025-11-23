# Classification System Security Requirements

## Current Implementation Status

### ✅ Client-Side Security (Implemented)
1. **UI Authorization Guards** (`src/hooks/use-authorization.ts`)
   - `canEditFeeStructures()`: Restricts fee structure editing UI to admin/ICT roles only
   - `canManageFinances()`: Allows viewing classifications for admin/ICT/financial admin

2. **Context-Level Validation** (`src/context/classification/ClassificationContext.tsx`)
   - `updateFeeStructure()`: Validates user role before executing Supabase queries
   - Throws authorization error for non-admin/non-ICT users
   - Provides user-friendly error messages via toast notifications

3. **Component-Level Guards** (`src/pages/Classifications.tsx`)
   - Edit buttons only visible to authorized users
   - Prevents accidental unauthorized access attempts

### ⚠️ Server-Side Security (REQUIRED - Not Yet Implemented)

**CRITICAL: The following Supabase RLS policies must be implemented to prevent privilege escalation attacks.**

Client-side checks can be bypassed by:
- Direct Supabase API calls via browser console
- Spoofing currentUser context data
- Using Supabase client directly without going through ClassificationContext

## Required Supabase RLS Policies

### Table: `classification_fee_structures`

```sql
-- Policy 1: Allow SELECT for users with finance permissions (admin, ICT, financial admin)
CREATE POLICY "fee_structures_select_policy"
ON classification_fee_structures
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND LOWER(ur.role) IN ('admin', 'ict', 'financialadmin')
  )
);

-- Policy 2: Allow UPDATE only for admin and ICT roles
CREATE POLICY "fee_structures_update_policy"
ON classification_fee_structures
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND LOWER(ur.role) IN ('admin', 'ict')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND LOWER(ur.role) IN ('admin', 'ict')
  )
);

-- Policy 3: Allow INSERT only for admin and ICT roles
CREATE POLICY "fee_structures_insert_policy"
ON classification_fee_structures
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND LOWER(ur.role) IN ('admin', 'ict')
  )
);

-- Policy 4: Prevent DELETE (use soft delete via is_active instead)
CREATE POLICY "fee_structures_delete_policy"
ON classification_fee_structures
FOR DELETE
TO authenticated
USING (false); -- Never allow hard deletes
```

### Enable RLS on the table

```sql
ALTER TABLE classification_fee_structures ENABLE ROW LEVEL SECURITY;
```

## Implementation Steps

1. **Database Administrator**: Execute the above SQL policies in Supabase SQL Editor
2. **Testing**: Verify that:
   - Admin users can update fee structures
   - ICT users can update fee structures
   - Financial admin users CANNOT update fee structures (read-only)
   - Unauthorized direct API calls are blocked by Supabase
3. **Regression Tests**: Add automated tests for authorization scenarios

## Testing Checklist

### Positive Tests (Should Succeed)
- [ ] Admin user can edit fee structures via UI
- [ ] ICT user can edit fee structures via UI
- [ ] Admin user can create new fee structures
- [ ] All authorized users can view fee structures

### Negative Tests (Should Fail)
- [ ] Financial admin cannot edit fee structures via UI
- [ ] Financial admin cannot bypass UI to edit via console/API
- [ ] Coordinator/Supervisor roles cannot access classifications page
- [ ] Direct Supabase calls to update fees are blocked for non-admin users

## Security Architecture

### Defense in Depth Layers

1. **Layer 1: UI Guards** (UX optimization)
   - Hides unauthorized options
   - Provides immediate feedback
   - Reduces accidental access attempts

2. **Layer 2: Context Validation** (Client-side safety)
   - Validates before API calls
   - Catches developer mistakes
   - Provides clear error messages

3. **Layer 3: Supabase RLS** (True security enforcement) ⚠️ MISSING
   - **Critical**: Prevents all unauthorized database access
   - Cannot be bypassed from client
   - Enforced at database level

## Current Security Gap

**Status**: Client-side layers (1-2) are implemented. Layer 3 (Supabase RLS) is REQUIRED but not yet implemented.

**Risk**: Without RLS policies, attackers can bypass UI/context guards and directly manipulate fee structures using:
```javascript
// ATTACK VECTOR (currently possible without RLS):
const { data, error } = await supabase
  .from('classification_fee_structures')
  .update({ site_visit_base_fee_cents: 999999 })
  .eq('id', 'fee-structure-id');
```

**Mitigation**: Implement RLS policies immediately to close this privilege escalation vulnerability.

## Recommended Next Steps

1. **Immediate**: Apply Supabase RLS policies to `classification_fee_structures` table
2. **Short-term**: Add RLS policies to related tables (`user_classifications`, `classification_history`)
3. **Medium-term**: Implement automated regression tests for authorization scenarios
4. **Long-term**: Consider using Supabase Edge Functions for complex authorization logic

## References

- [Supabase Row Level Security Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- PACT Platform Authorization Design: `src/hooks/use-authorization.ts`
