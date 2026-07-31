import { ZenlessZoneZero } from "@yeci226/hoyoapi";

type ZzzClientConstructor<T> = new (options: any) => T;

export function createZzzClient<T = ZenlessZoneZero>(
  options: ConstructorParameters<typeof ZenlessZoneZero>[0],
  ClientConstructor: ZzzClientConstructor<T> = ZenlessZoneZero as unknown as ZzzClientConstructor<T>,
): T {
  return new ClientConstructor(options);
}
