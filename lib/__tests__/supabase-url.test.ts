import { describe, it, expect } from "vitest";
import { urlDoSupabase } from "../supabase/url";

describe("urlDoSupabase", () => {
  it("remove o caminho e a barra final", () => {
    expect(urlDoSupabase("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(urlDoSupabase(" https://abc.supabase.co/ ")).toBe("https://abc.supabase.co");
    expect(urlDoSupabase("https://abc.supabase.co")).toBe("https://abc.supabase.co");
  });
});
