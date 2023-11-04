const axios = require("axios");

async function getNews(lang, type) {
  return await axios({
    headers: { Origin: "https://www.hoyolab.com", "X-Rpc-Language": lang },
    method: "get",
    url: "https://bbs-api-os.hoyolab.com/community/post/wapi/getNewsList",
    params: { gids: 8, page_size: 25, type: type },
  }).then((response) => response.data);
}

module.exports = { getNews };
