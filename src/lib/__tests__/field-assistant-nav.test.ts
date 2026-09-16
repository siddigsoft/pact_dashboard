import { describe, expect, it } from "vitest";
import { evaluateManifestPageAccess, getManifestNavigationPages, type CurrentUserAccessManifest } from "@/lib/current-user-access";

const manifest = (overrides: Partial<CurrentUserAccessManifest> = {}): CurrentUserAccessManifest => ({
  user_id: "salma",
  roles: ["Field Assistant"],
  page_role_configs: {
    dashboard: ["all", "SMT", "Field Assistant"],
    "my-projects": ["Field Assistant"],
    notifications: ["all", "SMT", "Field Assistant"],
    "notification-history": ["Field Assistant"],
    mmp: ["Field Assistant"],
    "cost-approval": ["Field Assistant"],
  },
  page_overrides: {},
  action_overrides: {},
  role_permissions: [],
  generated_at: "2026-09-16T00:00:00.000Z",
  ...overrides,
});

describe("field assistant nav", () => {
  it("allows dashboard from role config", () => {
    expect(evaluateManifestPageAccess(manifest(), "dashboard").allowed).toBe(true);
  });
  it("returns nav pages for field assistant grants", () => {
    const pages = getManifestNavigationPages(manifest());
    const slugs = pages.map((p) => p.slug);
    // Ordinary page grants surface in nav. Action-protected destinations (mmp)
    // still need a matching role/action permission before the route check admits them.
    expect(slugs).toEqual(expect.arrayContaining(["dashboard", "my-projects", "notifications", "cost-approval"]));
    expect(pages.length).toBeGreaterThan(0);
  });

  it("maps granted pages onto sidebar parent sections", async () => {
    const { getPageNavigationGroup } = await import("@/lib/access-registry");
    const pages = getManifestNavigationPages(manifest());
    const parents = pages.map((page) => getPageNavigationGroup(page.group)?.parentGroup);
    expect(parents.every(Boolean)).toBe(true);
    expect(parents).toEqual(expect.arrayContaining(["workspace", "finance"]));
  });
  it("allows via user override when role config empty", () => {
    const m = manifest({
      page_role_configs: {},
      page_overrides: { dashboard: { is_blocked: false }, "my-projects": { is_blocked: false } },
    });
    expect(getManifestNavigationPages(m).map((p) => p.slug)).toEqual(
      expect.arrayContaining(["dashboard", "my-projects"]),
    );
  });
});
