export interface InteractionLocaleResolutionDeps {
  loadCached: () => Promise<string | undefined>;
  setupDefault: () => Promise<void>;
  reload: () => Promise<string | undefined>;
  fallbackLocale: string;
  onError?: (error: unknown) => void;
}

export async function resolveInteractionLocale(
  deps: InteractionLocaleResolutionDeps,
): Promise<string> {
  let locale: string | undefined;

  try {
    locale = await deps.loadCached();
  } catch (error) {
    deps.onError?.(error);
  }

  if (!locale) {
    try {
      await deps.setupDefault();
    } catch (error) {
      deps.onError?.(error);
    }

    try {
      locale = await deps.reload();
    } catch (error) {
      deps.onError?.(error);
    }
  }

  return locale || deps.fallbackLocale || "en";
}
