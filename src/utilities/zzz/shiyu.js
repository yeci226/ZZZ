import { failedReply } from "../utilities.js";

export async function getShiyu(interaction, tr, user, zzz) {
  const res = await zzz.record.shiyuDefense();
  if (!res.has_data) return failedReply(interaction, "沒有深淵資料喔><");

  console.log(res.all_floor_detail[0].node_1.monster_info);
  console.log(res.all_floor_detail[0].node_2.monster_info);

  console.log(res.all_floor_detail[1].node_1.monster_info);
  console.log(res.all_floor_detail[1].node_2.monster_info);

  console.log(res.all_floor_detail[2].node_1.monster_info);
  console.log(res.all_floor_detail[2].node_2.monster_info);
}

/**
 * res
 * {
    schedule_id: 62001,
    begin_time: '1720036800',
    end_time: '1722455999',
    rating_list: [ { times: 2, rating: 'B' }, { times: 1, rating: 'A' } ],
    has_data: true,
    all_floor_detail: [
        {
        layer_index: 3,
        rating: 'B',
        layer_id: 6200103,
        buffs: [Array],
        node_1: [Object],
        node_2: [Object],
        challenge_time: '1721185938',
        zone_name: '劇變節點第三防線',
        floor_challenge_time: [Object]
        },
        {
        layer_index: 2,
        rating: 'B',
        layer_id: 6200102,
        buffs: [Array],
        node_1: [Object],
        node_2: [Object],
        challenge_time: '1721185338',
        zone_name: '劇變節點第二防線',
        floor_challenge_time: [Object]
        },
        {
        layer_index: 1,
        rating: 'A',
        layer_id: 6200101,
        buffs: [Array],
        node_1: [Object],
        node_2: [Object],
        challenge_time: '1721139894',
        zone_name: '劇變節點第一防線',
        floor_challenge_time: [Object]
        }
    ],
    fast_layer_time: 418,
    max_layer: 3,
    hadal_begin_time: { year: 2024, month: 7, day: 4, hour: 4, minute: 0, second: 0 },
    hadal_end_time: { year: 2024, month: 8, day: 1, hour: 3, minute: 59, second: 59 }
    }
 */

/**
 * all_floor_detail
 * [
    {
        layer_index: 3,
        rating: 'B',
        layer_id: 6200103,
        buffs: [ [Object] ],
        node_1: {
        avatars: [Array],
        buddy: [Object],
        element_type_list: [Array],
        monster_info: [Object]
        },
        node_2: {
        avatars: [Array],
        buddy: [Object],
        element_type_list: [Array],
        monster_info: [Object]
        },
        challenge_time: '1721185938',
        zone_name: '劇變節點第三防線',
        floor_challenge_time: { year: 2024, month: 7, day: 17, hour: 11, minute: 12, second: 18 }
    },
    {
        layer_index: 2,
        rating: 'B',
        layer_id: 6200102,
        buffs: [ [Object] ],
        node_1: {
        avatars: [Array],
        buddy: [Object],
        element_type_list: [Array],
        monster_info: [Object]
        },
        node_2: {
        avatars: [Array],
        buddy: [Object],
        element_type_list: [Array],
        monster_info: [Object]
        },
        challenge_time: '1721185338',
        zone_name: '劇變節點第二防線',
        floor_challenge_time: { year: 2024, month: 7, day: 17, hour: 11, minute: 2, second: 18 }
    },
    {
        layer_index: 1,
        rating: 'A',
        layer_id: 6200101,
        buffs: [ [Object] ],
        node_1: {
        avatars: [Array],
        buddy: [Object],
        element_type_list: [Array],
        monster_info: [Object]
        },
        node_2: {
        avatars: [Array],
        buddy: [Object],
        element_type_list: [Array],
        monster_info: [Object]
        },
        challenge_time: '1721139894',
        zone_name: '劇變節點第一防線',
        floor_challenge_time: { year: 2024, month: 7, day: 16, hour: 22, minute: 24, second: 54 }
    }
    ]
 */

/**
 * all_floor_detail[0]
 * {
    layer_index: 3,
    rating: 'B',
    layer_id: 6200103,
    buffs: [
        {
        title: '凌弱戰術',
        text: '· 當場上有普通敵人時，代理人對菁英敵人和首領敵人造成的傷害降低25%，對普通敵人造成的傷害提升50%。\\n· 代理人造成的<color=#98eff0>冰屬性傷害</color>和<color=#fe437e>以太傷害</color>提升20%，<color=#ffffff>[普通攻擊]</color>和<color=#ffffff>[衝刺攻擊]</color>造成的傷害提升50%。'
        }
    ],
    node_1: {
        avatars: [ [Object], [Object], [Object] ],
        buddy: { id: 53010, rarity: 'A', level: 20 },
        element_type_list: [ 201, 200 ],
        monster_info: { level: 55, list: [Array] }
    },
    node_2: {
        avatars: [ [Object], [Object], [Object] ],
        buddy: { id: 54001, rarity: 'S', level: 50 },
        element_type_list: [ 202, 200 ],
        monster_info: { level: 55, list: [Array] }
    },
    challenge_time: '1721185938',
    zone_name: '劇變節點第三防線',
    floor_challenge_time: { year: 2024, month: 7, day: 17, hour: 11, minute: 12, second: 18 }
    }
 */

/**
 * all_floor_detail[0].node_1
 * {
    avatars: [
        { id: 1181, level: 50, rarity: 'S', element_type: 203 },
        { id: 1281, level: 48, rarity: 'A', element_type: 200 },
        { id: 1151, level: 40, rarity: 'A', element_type: 201 }
    ],
    buddy: { id: 53010, rarity: 'A', level: 20 },
    element_type_list: [ 201, 200 ],
    monster_info: { level: 55, list: [ [Object], [Object], [Object], [Object] ] }
    }
 */

/**
 * all_floor_detail[0].node_1.monster_info
 * {
    level: 55,
    list: [
        { id: 20008, name: '「捷足巡遊者」', weak_element_type: 201 },
        { id: 20009, name: '重裝炮手', weak_element_type: 201 },
        { id: 10008, name: '戍衛獵兵', weak_element_type: 201 },
        { id: 10005, name: '掠襲獵兵', weak_element_type: 201 }
    ]
    }
 */

/**
 * element_type_list
 *  200: "physic",
    201: "fire",
    202: "ice",
    203: "thunder",
    205: "ether",
 */
