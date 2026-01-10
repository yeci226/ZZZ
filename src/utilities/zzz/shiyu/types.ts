export interface ShiyuBuff {
  identifier: string;
  title: string;
  text: string;
  icon?: string;
}

export interface ShiyuNode {
  node_id: string;
  challenge_time?: any; // Define more specifically if needed
  is_get_medal?: boolean;
  score?: number;
  battle_time?: number;
  monster_pic?: string;
  buffer?: ShiyuBuff;
  avatars?: any[]; // Keep as any[] or define Avatar interface if possible
  avatar_list?: any[];
  buddy?: any;
  rating?: string;
}

export interface ShiyuFloor {
  level: number;
  zone_name: string;
  rating: string;
  buffs: ShiyuBuff[];
  nodes: ShiyuNode[];
  totalTime: number;
  challenge_time?: any;
}

export interface ShiyuContext {
  tr: (key: string, args?: any) => string;
  userLocale: string;
  selectedFont: string;
}
