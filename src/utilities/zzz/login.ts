import NodeRSA from 'node-rsa';

import { getUserGameUid, parseCookie } from '@/utilities';

import { Account } from '@/types';

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
  key.setOptions({ encryptionScheme: 'pkcs1' });

  return key.encrypt(source, 'base64');
}

async function loginAccount(account: string, password: string): Promise<Account | null> {
  const URL = 'https://sg-public-api.hoyolab.com/account/ma-passport/api/webLoginByPassword';

  const payload = {
    account: encrypt(account),
    password: encrypt(password),
    token_type: 6,
  };

  const headers = {
    'x-rpc-app_id': 'c9oqaq3s3gu8',
    'x-rpc-client_type': '4',
    'x-rpc-sdk_version': '2.14.1',
    'x-rpc-game_biz': 'bbs_oversea',
    'x-rpc-source': 'v2.webLogin',
    'x-rpc-referrer': 'https://www.hoyolab.com',
    'Origin': 'https://account.hoyolab.com',
    'Referer': 'https://account.hoyolab.com/',
  };

  try {
    const response = await fetch(URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = (await response.json()) as { retcode: number; message: string };
    if (responseData.retcode !== 0) {
      throw new Error(`登入失敗: ${responseData.message}`);
    }

    const result = response.headers;
    const cookie = result.get('set-cookie') ?? '';
    const parsedCookie = parseCookie(cookie);

    const { uid, nickname } = await getUserGameUid(cookie);

    return { cookie, uid, nickname };
  } catch (error) {
    throw error;
    return null;
  }
}

export default loginAccount;
