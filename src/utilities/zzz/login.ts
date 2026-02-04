import NodeRSA from "node-rsa";
import { getUserGameUid } from "../utilities.js";

function encrypt(source: string) {
  const publicKeyPem = `
    -----BEGIN PUBLIC KEY-----
    MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4PMS2JVMwBsOIrYWRluY
    wEiFZL7Aphtm9z5Eu/anzJ09nB00uhW+ScrDWFECPwpQto/GlOJYCUwVM/raQpAj
    /xvcjK5tNVzzK94mhk+j9RiQ+aWHaTXmOgurhxSp3YbwlRDvOgcq5yPiTz0+kSeK
    ZJcGeJ95bvJ+hJ/UMP0Zx2qB5PElZmiKvfiNqVUk8A8oxLJdBB5eCpqWV6CUqDKQ
    KSQP4sM0mZvQ1Sr4UcACVcYgYnCbTZMWhJTWkrNXqI8TMomekgny3y+d6NX/cFa6
    6jozFIF4HCX5aW8bp8C8vq2tFvFbleQ/Q3CU56EWWKMrOcpmFtRmC18s9biZBVR/
    8QIDAQAB
    -----END PUBLIC KEY-----
    `;

  const key = new NodeRSA(publicKeyPem);
  key.setOptions({ encryptionScheme: "pkcs1" });

  return key.encrypt(source, "base64");
}

async function loginAccount(
  account: string,
  password: string,
  captchaResult?: any,
) {
  const URL =
    "https://passport-api-sg.hoyolab.com/account/ma-passport/api/webLoginByPassword";

  const payload = {
    account: encrypt(account),
    password: encrypt(password),
    token_type: 6,
  };

  const headers: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "x-rpc-app_id": "c9oqaq3s3gu8",
    "x-rpc-client_type": "4",
    "x-rpc-sdk_version": "2.49.0",
    "x-rpc-game_biz": "bbs_oversea",
    "x-rpc-language": "zh-tw",
    "x-rpc-source": "v2.webLogin",
    "x-rpc-device_id": "59898f79-b602-48c7-9af4-38e7d6f8a659",
    "x-rpc-device_fp": "38d7f38a087c3",
    "x-rpc-device_model": "Chrome 144.0.0.0",
    "x-rpc-device_name": "Chrome",
    "x-rpc-device_os": "Windows 10 64-bit",
    Origin: "https://account.hoyolab.com",
    Referer: "https://account.hoyolab.com/",
  };

  if (captchaResult) {
    headers["x-rpc-aigis"] = Buffer.from(
      JSON.stringify(captchaResult),
    ).toString("base64");
  }

  try {
    const response = await fetch(URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData: any = await response.json();

    // Check for Geetest
    if (responseData.message === "Human-machine verification required.") {
      return {
        captcha: true,
        data: responseData.data,
      };
    }

    if (responseData.retcode !== 0) {
      throw new Error(`登入失敗: ${responseData.message}`);
    }

    const result = response.headers;
    const cookie = parseCookie(result.get("set-cookie") || "");

    const { uid, nickname } = await getUserGameUid(cookie);

    return {
      cookie,
      uid,
      nickname,
    };
  } catch (error) {
    throw error;
  }
}

function parseCookie(cookie: string) {
  const cookieArray = cookie.split(";");
  const parsedCookie: Record<string, string> = {};

  for (const cookie of cookieArray) {
    const [key, value] = cookie.split("=");
    const cleanKey = key.trim().replace("Secure, ", "");
    if (value !== undefined) {
      parsedCookie[cleanKey] = value;
    }
  }

  return `ltoken_v2=${parsedCookie.ltoken_v2}; ltuid_v2=${parsedCookie.ltuid_v2}; cookie_token_v2=${parsedCookie.cookie_token_v2}; account_mid_v2=${parsedCookie.account_mid_v2};`;
}

export default loginAccount;
