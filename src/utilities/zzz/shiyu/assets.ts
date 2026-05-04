import { loadImageAsync } from "./utils.js";

export const zzzStaticUrl =
  "https://act-webstatic.hoyoverse.com/game_record/zzz";
export const bangbooRectangleUrl = `${zzzStaticUrl}/bangboo_rectangle_avatar/bangboo_rectangle_avatar_`;

export async function loadShiyuAssets() {
  const imagePaths = [
    `./src/assets/images/icons/shiyu/rating-corner-a.png`,
    `./src/assets/images/icons/shiyu/rating-corner-b.png`,
    `./src/assets/images/icons/shiyu/rating-corner-s.png`,
    `./src/assets/images/icons/shiyu/rating-a.png`,
    `./src/assets/images/icons/shiyu/rating-b.png`,
    `./src/assets/images/icons/shiyu/rating-s.png`,
    `./src/assets/images/icons/shiyu/rating-s_plus.png`,
    `./src/assets/images/icons/shiyu/team-1.png`,
    `./src/assets/images/icons/shiyu/team-2.png`,
    `./src/assets/images/icons/shiyu/team-3.png`,
  ];

  const elementImages = await Promise.all([
    loadImageAsync(`./src/assets/images/icons/element/physic.webp`),
    loadImageAsync(`./src/assets/images/icons/element/fire.webp`),
    loadImageAsync(`./src/assets/images/icons/element/ice.webp`),
    loadImageAsync(`./src/assets/images/icons/element/thunder.webp`),
    loadImageAsync(`./src/assets/images/icons/element/ether.webp`),
  ]);

  const images = await Promise.all(
    imagePaths.map((path) =>
      loadImageAsync(path, "./src/assets/images/None.png").catch((err) => {
        console.error(`Error loading image ${path}`, err);
        return loadImageAsync("./src/assets/images/None.png");
      })
    )
  );

  const buffImg = await loadImageAsync(
    "./src/assets/images/icons/deadly/buff.png"
  );

  const [
    ratingCornerA,
    ratingCornerB,
    ratingCornerS,
    ratingA,
    ratingB,
    ratingS,
    ratingSPlus,
    team1,
    team2,
    team3,
    ...restImages
  ] = images;

  return {
    elementImages,
    buffImg,
    ratingCornerA,
    ratingCornerB,
    ratingCornerS,
    ratingA,
    ratingB,
    ratingS,
    ratingSPlus,
    team1,
    team2,
    team3,
  };
}

export async function loadDynamicImages(floors: any[]) {
  const imagePaths: string[] = [];
  // Collect avatar/buddy images
  for (const floor of floors) {
    for (const node of floor.nodes) {
      if (node.avatar_list) {
        for (const avatar of node.avatar_list) {
          if (avatar.role_square_url) imagePaths.push(avatar.role_square_url);
          else imagePaths.push(`./src/assets/images/agents/${avatar.id}.webp`);
        }
      } else if (node.avatars) {
        // Fallback for old structure if needed
        for (const avatar of node.avatars) {
          if (avatar.role_square_url) imagePaths.push(avatar.role_square_url);
          else imagePaths.push(`./src/assets/images/agents/${avatar.id}.webp`);
        }
      }

      const buddy = node.buddy;
      if (buddy) {
        if (buddy.bangboo_rectangle_url)
          imagePaths.push(buddy.bangboo_rectangle_url);
        else imagePaths.push(`${bangbooRectangleUrl}${buddy.id}.png`);
      }
    }
  }

  const images = await Promise.all(
    imagePaths.map((path) =>
      loadImageAsync(path, "./src/assets/images/None.png").catch((err) => {
        console.error(`Error loading image ${path}`, err);
        return loadImageAsync("./src/assets/images/None.png");
      })
    )
  );
  return images;
}
