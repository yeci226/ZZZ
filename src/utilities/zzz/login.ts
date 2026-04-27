import NodeRSA from "node-rsa";
import crypto from "crypto";
import { getUserGameUid } from "../utilities.js";

const LOGIN_PUBLIC_KEY = `
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

// DS salt for app login endpoint
const APP_LOGIN_DS_SALT = "IZPgfb0dRPtBeLuFkdDznSZ6f4wWt6y2";

const APP_LOGIN_URL =
  "https://sg-public-api.hoyoverse.com/account/ma-passport/api/appLoginByPassword";
const GET_BY_STOKEN_URL =
  "https://sg-public-api.hoyoverse.com/account/ma-passport/token/getBySToken";
const SEND_EMAIL_CODE_URL =
  "https://sg-public-api.hoyoverse.com/account/ma-verifier/api/createEmailCaptchaByActionTicket";
const VERIFY_EMAIL_URL =
  "https://sg-public-api.hoyoverse.com/account/ma-verifier/api/verifyActionTicketPartly";
const WEB_LOGIN_URL =
  "https://passport-api-sg.hoyolab.com/account/ma-passport/api/webLoginByPassword";

function encrypt(source: string) {
  const key = new NodeRSA(LOGIN_PUBLIC_KEY);
  key.setOptions({ encryptionScheme: "pkcs1" });
  return key.encrypt(source, "base64");
}

function generateDS(body: object): string {
  const t = Math.floor(Date.now() / 1000);
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const r = Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  const b = JSON.stringify(body);
  const hash = crypto
    .createHash("md5")
    .update(`salt=${APP_LOGIN_DS_SALT}&t=${t}&r=${r}&b=${b}&q=`)
    .digest("hex");
  return `${t},${r},${hash}`;
}

export function generateDeviceId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length: 16 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

export async function sendEmailVerification(
  actionTicket: any,
  deviceId?: string,
  captchaResult?: any,
): Promise<{ captcha?: any }> {
  const ticket = actionTicket?.verify_str?.ticket ?? actionTicket?.ticket ?? actionTicket;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-rpc-app_id": "c9oqaq3s3gu8",
    "x-rpc-client_type": "2",
  };
  if (deviceId) headers["x-rpc-device_id"] = deviceId;
  if (captchaResult) {
    const isV4 = !!captchaResult.lot_number;
    const sessionId = String(captchaResult.session_id || "");
    const mmtData = isV4
      ? {
          captcha_id: captchaResult.captcha_id || captchaResult.gt,
          lot_number: captchaResult.lot_number,
          pass_token: captchaResult.pass_token,
          gen_time: captchaResult.gen_time,
          captcha_output: captchaResult.captcha_output,
        }
      : {
          geetest_challenge: captchaResult.geetest_challenge,
          geetest_validate: captchaResult.geetest_validate,
          geetest_seccode: captchaResult.geetest_seccode,
        };
    headers["x-rpc-aigis"] = `${sessionId};${Buffer.from(JSON.stringify(mmtData)).toString("base64")}`;
  }

  const response = await fetch(SEND_EMAIL_CODE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action_type: "verify_for_component",
      action_ticket: ticket,
    }),
  });
  const data: any = await response.json();

  if (data.retcode === -3101) {
    let captchaData: any = {};
    let aigisData: any = {};
    const aigisHeader = response.headers.get("x-rpc-aigis");
    if (aigisHeader) {
      try {
        aigisData = JSON.parse(aigisHeader);
        captchaData = typeof aigisData.data === "string" ? JSON.parse(aigisData.data) : aigisData.data;
      } catch {
        const semiIdx = aigisHeader.indexOf(";");
        if (semiIdx !== -1) {
          aigisData.session_id = aigisHeader.slice(0, semiIdx);
          try { captchaData = JSON.parse(Buffer.from(aigisHeader.slice(semiIdx + 1), "base64").toString()); } catch {}
        }
      }
    }
    return {
      captcha: {
        geetestId: captchaData?.gt || captchaData?.captcha_id,
        challenge: captchaData?.challenge,
        riskType: aigisData?.mmt_type,
        risk_type: captchaData?.risk_type,
        success: captchaData?.success,
        new_captcha: captchaData?.new_captcha,
        aigisSessionId: aigisData?.session_id,
        lot_number: captchaData?.lot_number,
        captcha_id: captchaData?.gt,
      },
    };
  }

  if (data.retcode !== 0) throw new Error(data.message || `retcode ${data.retcode}`);
  return {};
}

export async function verifyEmailCode(
  code: string,
  actionTicket: any,
  deviceId?: string,
): Promise<void> {
  const ticket = actionTicket?.verify_str?.ticket ?? actionTicket?.ticket ?? actionTicket;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-rpc-app_id": "c9oqaq3s3gu8",
    "x-rpc-client_type": "2",
  };
  if (deviceId) headers["x-rpc-device_id"] = deviceId;
  const response = await fetch(VERIFY_EMAIL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action_type: "verify_for_component",
      action_ticket: ticket,
      email_captcha: code,
      verify_method: 2,
    }),
  });
  const data: any = await response.json();
  if (data.retcode !== 0) throw new Error(`驗證碼錯誤: ${data.message}`);
}

export async function appLoginAccount(
  account: string,
  password: string,
  deviceId: string,
  captchaResult?: any,
  actionTicket?: any,
) {
  const payload = {
    account: encrypt(account),
    password: encrypt(password),
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-rpc-app_id": "c9oqaq3s3gu8",
    "x-rpc-client_type": "2",
    "x-rpc-aigis_v4": "true",
    "x-rpc-app_version": "4.8.0",
    "x-rpc-sdk_version": "2.2.0",
    "x-rpc-device_id": deviceId,
    ds: generateDS(payload),
  };

  if (actionTicket) {
    // Serialize ActionTicket back to the header format genshin.py uses
    const ticketForHeader = {
      ...actionTicket,
      verify_str: JSON.stringify(actionTicket.verify_str),
    };
    headers["x-rpc-verify"] = JSON.stringify(ticketForHeader);
  }

  if (captchaResult) {
    const isV4 = !!captchaResult.lot_number;
    const sessionId = String(captchaResult.session_id || captchaResult.aigisSessionId || "");
    const mmtData = isV4
      ? {
          captcha_id: captchaResult.captcha_id || captchaResult.gt,
          lot_number: captchaResult.lot_number,
          pass_token: captchaResult.pass_token,
          gen_time: captchaResult.gen_time,
          captcha_output: captchaResult.captcha_output,
        }
      : {
          geetest_challenge: captchaResult.geetest_challenge,
          geetest_validate: captchaResult.geetest_validate,
          geetest_seccode: captchaResult.geetest_seccode,
        };
    const b64data = Buffer.from(JSON.stringify(mmtData)).toString("base64");
    // genshin.py format: "{session_id};{base64(json(mmt_data))}"
    headers["x-rpc-aigis"] = `${sessionId};${b64data}`;
    console.log("[AppLogin] aigis header (genshin.py fmt):", headers["x-rpc-aigis"]);
    console.log("[AppLogin] captchaResult:", JSON.stringify(captchaResult));
  }

  const response = await fetch(APP_LOGIN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: any = await response.json();
  const aigisHeader = response.headers.get("x-rpc-aigis");

  // Captcha triggered
  if (data.retcode === -3101) {
    let captchaData: any = {};
    let aigisData: any = {};
    if (aigisHeader) {
      // HoYo may return plain JSON or genshin.py format "{session_id};{base64}"
      try {
        aigisData = JSON.parse(aigisHeader);
        captchaData =
          typeof aigisData.data === "string"
            ? JSON.parse(aigisData.data)
            : aigisData.data;
      } catch {
        // genshin.py format: "{session_id};{base64(data)}"
        const semiIdx = aigisHeader.indexOf(";");
        if (semiIdx !== -1) {
          aigisData.session_id = aigisHeader.slice(0, semiIdx);
          try {
            captchaData = JSON.parse(
              Buffer.from(aigisHeader.slice(semiIdx + 1), "base64").toString(),
            );
          } catch {}
        }
      }
      console.log("[AppLogin] -3101 aigis response:", aigisHeader);
    }
    return {
      captcha: true,
      data: {
        captcha: {
          geetestId: captchaData?.gt || captchaData?.captcha_id,
          challenge: captchaData?.challenge,
          riskType: aigisData?.mmt_type,
          risk_type: captchaData?.risk_type,
          success: captchaData?.success,
          new_captcha: captchaData?.new_captcha,
          aigisSessionId: aigisData?.session_id,
          // v4 fields
          lot_number: captchaData?.lot_number,
          captcha_id: captchaData?.gt,
        },
      },
    };
  }

  // Email verification required — extract ActionTicket from response header
  if (data.retcode === -3239) {
    const verifyHeader = response.headers.get("x-rpc-verify");
    console.log("[AppLogin] -3239 x-rpc-verify header:", verifyHeader);
    if (!verifyHeader) throw new Error("Email 驗證失敗：未取得驗證 ticket");
    const raw = JSON.parse(verifyHeader);
    const actionTicket = {
      risk_ticket: raw.risk_ticket,
      verify_str:
        typeof raw.verify_str === "string"
          ? JSON.parse(raw.verify_str)
          : raw.verify_str,
    };
    console.log("[AppLogin] -3239 actionTicket:", JSON.stringify(actionTicket));
    return { emailVerification: true, actionTicket };
  }

  if (data.retcode !== 0) {
    throw new Error(`登入失敗: ${data.message || data.retcode}`);
  }

  const stoken = data.data.token.token;
  const ltuid_v2 = data.data.user_info.aid;
  const ltmid_v2 = data.data.user_info.mid;

  // Exchange stoken for ltoken_v2 + cookie_token_v2
  const fullCookies = await exchangeStokenForCookies(
    stoken,
    ltuid_v2,
    ltmid_v2,
  );

  const cookie = [
    `stoken=${stoken}`,
    `ltuid_v2=${ltuid_v2}`,
    `ltmid_v2=${ltmid_v2}`,
    `account_id_v2=${ltuid_v2}`,
    `account_mid_v2=${ltmid_v2}`,
    `ltoken_v2=${fullCookies.ltoken_v2}`,
    `cookie_token_v2=${fullCookies.cookie_token_v2}`,
  ].join("; ");

  const { uid, nickname } = await getUserGameUid(cookie);

  return { cookie, uid, nickname, stoken, ltuid_v2, ltmid_v2 };
}

export async function exchangeStokenForCookies(
  stoken: string,
  ltuid_v2: string,
  ltmid_v2: string,
): Promise<{ ltoken_v2: string; cookie_token_v2: string }> {
  const t = Math.floor(Date.now() / 1000);
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const r = Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  const ds = crypto
    .createHash("md5")
    .update(`salt=${APP_LOGIN_DS_SALT}&t=${t}&r=${r}&b=&q=`)
    .digest("hex");
  const dsHeader = `${t},${r},${ds}`;

  const cookieStr = `stoken=${stoken}; ltuid_v2=${ltuid_v2}; ltmid_v2=${ltmid_v2}; mid=${ltmid_v2}`;

  const response = await fetch(GET_BY_STOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rpc-app_id": "c9oqaq3s3gu8",
      ds: dsHeader,
      Cookie: cookieStr,
    },
    body: JSON.stringify({ dst_token_types: [2, 4] }),
  });

  if (!response.ok) {
    throw new Error(`exchangeStokenForCookies HTTP error: ${response.status}`);
  }

  const data: any = await response.json();
  if (data.retcode !== 0) {
    throw new Error(`exchangeStokenForCookies failed: ${data.message}`);
  }

  let ltoken_v2 = "";
  let cookie_token_v2 = "";
  for (const token of data.data.tokens) {
    if (token.token_type === 2) ltoken_v2 = token.token;
    if (token.token_type === 4) cookie_token_v2 = token.token;
  }

  return { ltoken_v2, cookie_token_v2 };
}

// Legacy web login (kept for fallback)
async function loginAccount(
  account: string,
  password: string,
  captchaResult?: any,
) {
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
    "x-rpc-aigis_v4": "true",
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
    const isV4 = !!captchaResult.lot_number;
    const mmtType = Number(captchaResult.riskType) || (isV4 ? 2 : 1);

    const aigisPayload = {
      session_id: captchaResult.session_id,
      mmt_type: mmtType,
      data: JSON.stringify(
        isV4
          ? {
              gt: captchaResult.captcha_id,
              lot_number: captchaResult.lot_number,
              pass_token: captchaResult.pass_token,
              gen_time: captchaResult.gen_time,
              captcha_output: captchaResult.captcha_output,
              use_v4: true,
            }
          : {
              geetest_challenge: captchaResult.geetest_challenge,
              geetest_validate: captchaResult.geetest_validate,
              geetest_seccode: captchaResult.geetest_seccode,
              success: 1,
              new_captcha: 1,
            },
      ),
    };

    headers["x-rpc-aigis"] = Buffer.from(JSON.stringify(aigisPayload)).toString(
      "base64",
    );
  }

  const response = await fetch(WEB_LOGIN_URL, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const responseData: any = await response.json();
  const aigisHeader = response.headers.get("x-rpc-aigis");

  if (
    responseData.retcode === 1034 ||
    responseData.message === "Human-machine verification required." ||
    responseData.retcode === -3101
  ) {
    let captchaData = responseData.data?.captcha || responseData.data;
    let aigisData: any = {};

    if (aigisHeader) {
      aigisData = JSON.parse(aigisHeader);
      if (typeof aigisData.data === "string") {
        captchaData = JSON.parse(aigisData.data);
      } else {
        captchaData = aigisData.data;
      }
    }

    return {
      captcha: true,
      data: {
        captcha: {
          geetestId: captchaData?.gt || responseData.data?.captcha?.geetestId,
          challenge:
            captchaData?.challenge || responseData.data?.captcha?.challenge,
          riskType: aigisData?.mmt_type || responseData.data?.captcha?.riskType,
          risk_type: captchaData?.risk_type,
          success: captchaData?.success,
          new_captcha: captchaData?.new_captcha,
          aigisSessionId: aigisData?.session_id,
        },
      },
    };
  }

  if (responseData.retcode !== 0) {
    console.error("[Login] Hoyoverse Login Failed:", responseData);
    throw new Error(`登入失敗: ${responseData.message}`);
  }

  const result = response.headers;
  const cookie = parseCookie(result.get("set-cookie") || "");
  const { uid, nickname } = await getUserGameUid(cookie);

  return { cookie, uid, nickname };
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
