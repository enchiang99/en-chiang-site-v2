name: 一次性搬遷：把 V1 的照片抓進 V2 並壓縮

# 這個流程「不會」自動觸發，只能手動執行：
# 到 GitHub 網頁 → 這個 repo 的 Actions 分頁 → 左邊選這個流程的名字 → 右邊「Run workflow」按鈕。
#
# 用途：把目前資料檔（_data/、_about_en/、_about_daily/、_about_love/）裡
# 還在借用 https://enchiang.com/images/... 這個 V1（正式站）網址的照片，
# 下載下來、套用跟整批上傳一樣的自動壓縮／轉檔規則，存進這個 repo 自己的 images/ 資料夾，
# 然後把資料檔裡對應的網址改成本機路徑 /images/xxx。
#
# 安全性：只會「新增」處理過的照片，不會刪除 images/ 裡任何現有檔案，
# 所以透過整批上傳 zip 或後台單張上傳、本來就已經在這個 repo 裡的照片完全不受影響。
# 可以重複執行，沒抓到的（例如下載失敗）下次還會再試一次；已經搬過的不會重複處理。
on:
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - name: 取出 repo 內容
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: 設定 Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: 安裝圖片壓縮套件（sharp）
        run: npm install sharp@0.33

      - name: 下載 V1 的照片、壓縮、更新資料檔網址
        run: node scripts/migrate-v1-images.js

      - name: 重新產生 images/images-README.md（照片總覽 + 可複製網址）
        run: node scripts/gen-images-readme.js

      - name: 把結果 commit 回去
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          if git diff --cached --quiet; then
            echo "沒有變動，不需要 commit。"
          else
            git commit -m "一次性搬遷：把 V1 的照片抓進 V2 並壓縮，資料檔網址改成本機路徑"
            git push
          fi
