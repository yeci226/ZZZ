import { ShiyuContext, ShiyuFloor } from "./types.js";

export function processShiyuData(
  hadalData: any,
  context: ShiyuContext
): ShiyuFloor[] {
  const { tr } = context;
  const floors: ShiyuFloor[] = [];

  const processLayer = (layerData: any, level: number): ShiyuFloor | null => {
    if (!layerData) return null;

    // Determine rating
    let rating = layerData.rating;
    // Fallback for top floor if missing (sometimes only in brief)
    if (!rating && level === 5 && hadalData.hadal_info_v2.brief) {
      rating = hadalData.hadal_info_v2.brief.rating;
    }

    // Normalize nodes
    const nodes = layerData.layer_challenge_info_list || [];

    // Normalize buffs
    const buffs = [];
    if (layerData.buffer) {
      buffs.push(layerData.buffer);
    }

    // Calculate total battle time from nodes
    let totalTime = 0;
    nodes.forEach((node: any) => {
      totalTime += node.battle_time || 0;
    });

    return {
      level,
      zone_name:
        level === 1
          ? tr("FirstFrontier") || "劇變節點第一防線"
          : level === 2
            ? tr("SecondFrontier") || "劇變節點第二防線"
            : level === 3
              ? tr("ThirdFrontier") || "劇變節點第三防線"
              : level === 4
                ? tr("FourthFrontier") || "劇變節點第四防線"
                : tr("FifthFrontier") || "劇變節點第五防線",
      rating: rating || "X",
      buffs,
      nodes,
      totalTime,
      challenge_time: layerData.challenge_time,
    };
  };

  const layers = [
    { key: "first_layer_detail", level: 1 },
    { key: "second_layer_detail", level: 2 },
    { key: "third_layer_detail", level: 3 },
    { key: "fourth_layer_detail", level: 4 },
    { key: "fitfh_layer_detail", altKey: "fifth_layer_detail", level: 5 },
  ];

  for (const layer of layers) {
    const data =
      hadalData.hadal_info_v2[layer.key] ||
      (layer.altKey ? hadalData.hadal_info_v2[layer.altKey] : null);
    if (data) {
      const l = processLayer(data, layer.level);
      if (l) floors.push(l);
    }
  }

  // Sort floors descending (5, 4...)
  floors.sort((a, b) => b.level - a.level);

  return floors;
}
