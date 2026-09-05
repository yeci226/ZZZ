export async function isGachaPublic(
  db: { get(key: string): Promise<unknown> | unknown },
  ownerId: string,
): Promise<boolean> {
  return (await db.get(`${ownerId}.gachaPublic`)) !== false;
}

export async function canViewPrivateGacha(
  db: { get(key: string): Promise<unknown> | unknown },
  viewerId: string,
  ownerId: string,
): Promise<boolean> {
  return viewerId === ownerId || isGachaPublic(db, ownerId);
}

