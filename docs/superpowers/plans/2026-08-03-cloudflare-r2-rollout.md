# Cloudflare R2 Archive Rollout Plan (Fast Track)

**Project:** PACT Workspace Hub — company archive storage  
**Decision:** Proceed with **Cloudflare R2** (approved by Mohamed Yousif)  
**Pace:** Fast track — **build = 1 day**  
**Start:** Monday **3 August 2026**  
**Owner (tech):** Mukisa Vaniah Christian  
**Sponsor:** Mohamed Yousif  

---

## Why Cloudflare R2

- Supabase stays for day-to-day systems.
- R2 is for older / rarely touched company records (archive).
- Zero egress (download) fees → predictable cost.
- At ~1TB: ~$180/year storage; activity fees negligible for internal archive use.
- Comparison docs: *Storage Comparison Summary* + *Backblaze vs Cloudflare*.

---

## One-week timeline (starts Monday)

| Day | Date | Phase | What happens | Done when |
|-----|------|--------|--------------|-----------|
| **Mon** | 3 Aug | **Pay & account** | Create/confirm Cloudflare account, enable R2, billing on org card, create bucket + API token | Account live, bucket exists, credentials shared securely with eng |
| **Tue** | 4 Aug | **Build (1 day)** | Wire Workspace Hub / archive upload path to R2 (S3-compatible), env vars, folder structure, basic permissions | Staging/prod can upload + list + download a test file from R2 |
| **Wed** | 5 Aug | **Test** | Eng + 1–2 pilot users: upload, open, rename/delete, permissions, fail cases | Test checklist signed off; no blockers |
| **Thu** | 6 Aug | **Train the team** | Short session (30–45 min): how to upload, where files live, naming rules, who to ask | Attendance logged; 1-pager guide shared |
| **Fri →** | 7 Aug onward | **Team uploading** | Team starts uploading live archive content; eng on standby for support | First real folders populated; issues triaged same day |

---

## Day-by-day detail

### Monday 3 Aug — Pay & set up

**Morning (sponsor / finance)**
- [ ] Approve Cloudflare billing (R2 enabled)
- [ ] Confirm payer / invoice contact

**Afternoon (eng + sponsor if needed)**
- [ ] Create Cloudflare account under PACT (or use existing)
- [ ] Enable **R2**
- [ ] Create bucket e.g. `pact-workspace-archive`
- [ ] Create API token (read/write limited to that bucket)
- [ ] Store secrets in secure place (not chat/email body)
- [ ] Note expected cost band: ~$14–$18/year at 80–100GB; scales with storage

**Exit criteria:** eng has working Access Key ID + Secret + Account ID + bucket name.

---

### Tuesday 4 Aug — Build (one day only)

**Scope for the single build day (must fit in one day):**
- [ ] Add R2 config (endpoint, bucket, keys) to app env
- [ ] Upload path in Workspace Hub → R2
- [ ] Download / open link for archived files
- [ ] Simple folder/prefix convention (e.g. `archive/YYYY/dept/...`)
- [ ] Error messages if upload fails
- [ ] Deploy to production (or staging first if deploy gate requires it — still same day)

**Out of scope for Tuesday (do later if needed):**
- Full CDN / DNS for `app.pactorg.com`
- Bulk auto-migration of all ~25k historical files
- Complex search/indexing beyond current Hub behaviour

**Exit criteria:** demo upload of 3–5 real sample files works end-to-end for a non-eng user account.

---

### Wednesday 5 Aug — Test

**Checklist**
- [ ] Upload PDF, DOCX, image, large file (~50–100MB if realistic)
- [ ] Open / download each file
- [ ] Wrong permission / logged-out behaviour
- [ ] Network fail / retry
- [ ] Confirm file appears in Cloudflare R2 dashboard
- [ ] Confirm cost meters look sane (no surprise Class A/B spikes)

**Pilot users:** 1–2 people who will later train others (e.g. admin + ops).

**Exit criteria:** written “go / no-go” for Thursday training.

---

### Thursday 6 Aug — Teach the team

**Session (~30–45 min)**
1. Why we chose R2 (1 min)
2. Where to click in Workspace Hub (live demo)
3. Naming & folder rules
4. What **not** to upload (secrets, personal data without clearance)
5. How to report a problem
6. Hands-on: each person uploads one sample file

**Deliverables**
- [ ] 1-page PDF/Notion guide
- [ ] Recording (optional)
- [ ] Support channel / owner named

---

### Friday 7 Aug onward — Team uploading

- [ ] Open upload window for real archive content
- [ ] Eng on call for first 2 business days
- [ ] Daily 10-min check: any failed uploads / access issues
- [ ] By end of week 1: core folders started (HR / Finance / Ops / Projects — adjust to real structure)

**Note on historical ~25k files:** this fast-track plan focuses on **going live + team uploads**. A separate bulk-migration pass can be scheduled the following week if Mohamed wants the old stock moved automatically.

---

## Roles

| Role | Person | Responsibility |
|------|--------|----------------|
| Sponsor / payer | Mohamed Yousif | Billing approval, go/no-go |
| Build & deploy | Mukisa (eng) | Mon setup support, Tue build, Wed test lead |
| Pilot testers | TBD (2 people) | Wed checklist |
| Trainers / users | Team | Thu training, Fri+ uploads |

---

## Cost snapshot (from comparison docs)

| Archive size | Cloudflare R2 (approx.) |
|--------------|-------------------------|
| 80GB (today) | ~$14/year |
| 100GB | ~$18/year |
| 500GB | ~$90/year |
| 1TB | ~$180/year |

Egress (downloads): **$0**. Class A/B ops free under generous allowances for internal use.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Billing delay on Monday | Prep account invite Sunday; sponsor available Mon AM |
| Build slips past 1 day | Strict Tuesday scope; defer bulk migrate & CDN |
| Team confusion on upload | Live training + 1-pager + named support owner |
| Wrong files uploaded | Clear “do not upload” list in training |

---

## Success criteria (end of week)

1. Cloudflare R2 paid and active  
2. Workspace Hub can upload/open archive files from R2  
3. Tests passed  
4. Team trained  
5. Real uploads happening (not just demos)

---

## Next after this week (optional)

- Week of 10 Aug: bulk migrate historical archive (if required)  
- Later: Cloudflare CDN/WAF in front of `app.pactorg.com` (separate decision)

---

*Prepared for Mohamed Yousif — PACT Command Center / Workspace Hub archive.*
