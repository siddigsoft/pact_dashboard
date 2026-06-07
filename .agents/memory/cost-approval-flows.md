---
name: CostSubmission 4-tier approval flows
description: Rules and pitfalls for the 4-tier cost submission approval system in CostSubmission.tsx
---

## Flow definitions
- Coordinator: T1=Supervisor → T2=FOM → T3=CountryDirector → T4=Admin (hasFourTiers)
- Supervisor: T1=FOM → T2=CountryDirector → T3=Admin (hasThreeTiers)
- FOM: T1=CountryDirector → T2=Admin
- CD: T1=Admin

## Key predicates
- `hasFourTiers(oc)` — isCoordinatorSubmission OR tier4_status not null/undefined
- `hasThreeTiers(oc)` — isSupervisorSubmission only
- Role normalisation: `.toLowerCase().replace(/[\s_-]/g, '')` so 'country_director', 'Country Director', 'countrydirector' all normalise to 'countrydirector'
- FOM DB roles: 'fom' and 'fieldoperationmanager' (NOT 'Field Operation Manager (FOM)' — display name ≠ DB value)

## Recurring pitfall checklist
Every place that handles tiers must include tier 4:
1. TypeScript union types: `tier: 1 | 2 | 3 | 4` in all state/function signatures
2. Arabic tier label maps: `{ 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' }`
3. `handleGroupApproval` switch/if must have a tier 4 branch
4. Send-back and recall must clear tier3 AND tier4 fields (not just tier1/tier2)
5. Notification `nextRoles` arrays must use DB role values, not display names

**Why:** The 4-tier coordinator flow was added later; many existing code paths only had 1/2/3 and silently failed or showed undefined for tier 4.
