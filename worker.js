/**
 * En Chiang 個人網站專用 — Decap CMS × GitHub OAuth Worker
 *
 * 這支程式的唯一工作：讓 /admin/ 後台可以用「GitHub 帳號登入」，
 * 並且安全地完成 GitHub 要求的「用 client secret 換取 access token」這一步。
 * 這一步不能在瀏覽器裡做（client secret 會被任何人看到原始碼），
 * 所以需要這支跑在 Cloudflare 的小程式當中介。
 *
 * 跟炎香樓現在用的是同一套架構，但這是完全獨立的一份，
 * 有自己的 GitHub OAuth App、自己的 Client ID / Secret，
 * 跟炎香樓那邊的帳號、Worker 完全無關，互不影響。
 *
 * ------------------------------------------------------------------
 * 部署後需要在 Cloudflare 的 Worker 設定裡新增兩個「Secret」變數：
 *   GITHUB_CLIENT_ID      → GitHub OAuth App 的 Client ID
 *   GITHUB_CLIENT_SECRET  → GitHub OAuth App 的 Client Secret
 * 這兩個值哪裡拿、怎麼設定，請看隨附的「設定步驟.md」。
 * ------------------------------------------------------------------
 */

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

function randomState() {
  return crypto.randomUUID();
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handleAuth(url, env) {
  const scope = url.searchParams.get("scope") || "repo,user";
  const state = randomState();
  const redirectUri = `${url.origin}/callback`;

  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);

  const headers = new Headers({
    Location: authorizeUrl.toString(),
    // state 存進一個短效 cookie，callback 那邊會比對，防止 CSRF
    "Set-Cookie": `oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,
  });
  return new Response(null, { status: 302, headers });
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function handleCallback(request, url, env) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(request, "oauth_state");

  if (!code) {
    return htmlResponse(renderResultPage(false, "缺少 GitHub 回傳的 code"), 400);
  }
  if (!state || !savedState || state !== savedState) {
    return htmlResponse(renderResultPage(false, "驗證失敗（state 不符），請重新登入一次"), 400);
  }

  const tokenRes = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    return htmlResponse(
      renderResultPage(false, tokenData.error_description || "跟 GitHub 交換 token 失敗"),
      400
    );
  }

  return htmlResponse(renderResultPage(true, null, tokenData.access_token));
}

/**
 * 這個回傳的 HTML 會在登入彈出視窗裡執行，
 * 用 postMessage 把 token 傳回 /admin/ 那個主視窗 —
 * 這是 Decap CMS 官方規定的握手方式，格式不能改。
 */
function renderResultPage(success, errorMessage, token) {
  const payload = success
    ? { token, provider: "github" }
    : { message: errorMessage || "登入失敗" };
  const messageType = success ? "success" : "error";

  return `<!doctype html>
<html>
<body>
<script>
  (function() {
    function receiveMessage(e) {
      window.opener.postMessage(
        'authorization:github:${messageType}:${JSON.stringify(payload)}',
        e.origin
      );
      window.removeEventListener("message", receiveMessage, false);
    }
    window.addEventListener("message", receiveMessage, false);
    window.opener.postMessage("authorizing:github", "*");
  })();
</script>
${success ? "登入成功，這個視窗可以關閉了。" : "登入失敗：" + (errorMessage || "")}
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth") {
      return handleAuth(url, env);
    }
    if (url.pathname === "/callback") {
      return handleCallback(request, url, env);
    }
    return new Response(
      "En Chiang CMS 登入用 Worker 正常運作中。\n請從 /admin/ 後台的「Login with GitHub」按鈕進入，不要直接開這個網址。",
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  },
};
