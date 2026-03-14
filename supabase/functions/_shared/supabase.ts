import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function createAnonClient(req: Request) {
  const url = getEnv("SUPABASE_URL");
  const anon = getEnv("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";

  return createClient(url, anon, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
}

export function createServiceClient() {
  const url = getEnv("SUPABASE_URL");
  const service = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service);
}

export async function requireUser(req: Request) {
  const supabase = createAnonClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Not authenticated");
  return data.user;
}

export async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  const service = createServiceClient();
  const { data, error } = await service.from("profiles").select("role").eq("user_id", user.id).single();
  if (error) throw error;
  if (data?.role !== "admin") throw new Error("Admin access required");
  return user;
}

