---
name: Scanner duplicate reporting
description: User-required duplicate evidence and totals in bank transfer scanner exports.
---

Keep duplicate receipt rows in scanner exports, visibly highlighted, and provide totals including duplicates and counting each transaction once. Show duplicate counts and account/transaction breakdowns. Preserve the same duplicate evidence when saving or adding scans to an existing session.

**Why:** The user needs to audit repeated receipts in exported files rather than lose the evidence through automatic removal.

**How to apply:** Identify duplicates by non-empty transaction ID, not account or amount alone. State the count-once policy and flag conflicting account/amount evidence for review; never silently treat missing IDs as the same transaction.

Saved scanner records must retain the complete extracted details, user notes, verification flags, confidence, filenames and processing status through reloads. Clearly distinguish saved data from original image files.

**Why:** The user asked to make sure Save keeps all information, including while a scan is slow or incomplete.

**How to apply:** Do not silently drop failed/incomplete rows or repeated transaction IDs. Explain when re-uploading an original image is required instead of implying that a saved data record includes the image itself.
