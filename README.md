# GitHub Pages 部署說明

這個專案已整理成可直接部署到 GitHub Pages 的靜態網站版本，發佈目錄是 [`docs/`](C:\Users\4C\Documents\考古題\docs)。

## 本機重新產生題庫

如果你更新了 [`題庫.txt`](C:\Users\4C\Documents\考古題\題庫.txt)，先執行：

```powershell
& "C:\Users\4C\AppData\Local\Programs\Python\Python314\python.exe" "C:\Users\4C\Documents\考古題\clean_questions.py"
```

這會更新：

- [`docs/questions.json`](C:\Users\4C\Documents\考古題\docs\questions.json)
- [`docs/cleaning_report.json`](C:\Users\4C\Documents\考古題\docs\cleaning_report.json)

## 部署到 GitHub Pages

1. 把整個專案推到 GitHub repository
2. 進入該 repository 的 `Settings`
3. 打開 `Pages`
4. 在 `Build and deployment` 選：
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/docs`
5. 儲存後等待 GitHub 發佈

發佈網址通常會是：

```text
https://你的帳號.github.io/你的-repo-名稱/
```

## 專案結構

- [`docs/index.html`](C:\Users\4C\Documents\考古題\docs\index.html): 首頁
- [`docs/app.js`](C:\Users\4C\Documents\考古題\docs\app.js): 測驗邏輯
- [`docs/style.css`](C:\Users\4C\Documents\考古題\docs\style.css): 介面樣式
- [`docs/questions.json`](C:\Users\4C\Documents\考古題\docs\questions.json): 題庫資料

## 注意事項

- GitHub Pages 是靜態託管，所以現在不需要 Python 常駐伺服器。
- 網站中的 `questions.json` 採相對路徑讀取，可直接在 GitHub Pages 的 repo 子路徑下使用。
- 如果你用本機直接雙擊 `index.html` 開啟，瀏覽器可能因為 `fetch` 安全限制讀不到 JSON；放到 GitHub Pages 上就不會有這個問題。
