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

    console.log(
      "[Login-V4-v6] Final Aigis Header (Decoded):",
      JSON.stringify(aigisPayload, null, 2),
    );
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
    const aigisHeader = response.headers.get("x-rpc-aigis");

    // Check for Geetest
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
            riskType:
              aigisData?.mmt_type || responseData.data?.captcha?.riskType,
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
