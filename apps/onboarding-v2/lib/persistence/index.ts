import type { AppConfig } from "@/lib/config/env";
import { InMemoryOnboardingRepository } from "@/lib/persistence/memory";
import type { OnboardingRepository } from "@/lib/persistence/types";
import { SupabaseOnboardingRepository } from "@/lib/persistence/supabase";

const memoryRepository = new InMemoryOnboardingRepository();

export function createOnboardingRepository(config: AppConfig): OnboardingRepository {
  if (config.appEnv === "production") return new SupabaseOnboardingRepository(config);
  if (process.env.ONBOARDING_REPOSITORY === "supabase") return new SupabaseOnboardingRepository(config);
  return memoryRepository;
}
