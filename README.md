# 又一个放置RPG · 简体中文汉化版

> 本仓库是 [miktaew/yet-another-idle-rpg](https://github.com/miktaew/yet-another-idle-rpg) 的**简体中文汉化分支**。
> 游戏本体、美术与剧情版权归原作者 **Miktaew** 所有，遵循仓库内 MIT LICENSE；本仓库仅在此基础上追加简体中文文本与少量本地化适配。
>
> **在线游玩：https://linlei0102.github.io/yet-another-idle-rpg/**
> 更新日志（中文）：/changelog.html　帮助（中文）：/help.html

## 部署说明

本站由 GitHub Pages 从 **`gh-pages`** 分支托管。更新流程：

```bash
git push origin master            # 代码与汉化内容
git push origin master:gh-pages   # 同步到托管分支（Pages 自动重建，约 10–60 秒）
```

`master` 保留完整上游历史（本汉化是在上游 `v0.5.5.30` 之上追加的一次提交），`gh-pages` 始终与 `master` 指向同一提交。

## 汉化范围

- 界面、技能、物品、地点、对话、战斗日志、图鉴、任务、书籍、商店、制作等全部玩家可见文本
- `help.html` 与 `changelog.html` 全量中文化，并保留 `help-en.html` / `changelog-en.html` 英文原版，页面右上角可互切
- 内置语言切换：选项面板「中文界面 / Simplified Chinese」，默认中文；切回 English 走游戏自带语言包

## 与上游的差异

| 文件 | 作用 |
|---|---|
| `zh-cn.js` | 运行时覆盖层：按原文为键替换文本，含数字/数量/价格的句式规则 |
| `zh-cn-dict.js` | 词典（约 3.4k 条），由覆盖层加载 |
| `locales/chinese.js` | 游戏自带 i18n 的中文语言包（对话等结构化文本） |
| `src/main.js` | 语言选项、读档语言覆盖、重置提示分支 |
| `src/character.js` | 新角色默认名「英雄」 |
| `src/translation.js` | 语言包缺失时回退英文，避免卡加载 |
| `index.html` | 引入覆盖层与词典、新增语言选项、带内容哈希的缓存版本号 |

另有两处**存档兼容**修复（不影响玩法）：

- 存档导出/导入改为 UTF-8 安全的 base64 —— 角色名含中文时原生 `btoa` 会抛 `InvalidCharacterError`
- 旧存档地点 id 兼容：上游曾把 `Cat café` 改名为 `Cat cafe`，旧存档导入会报「地点找不到」

## 已知情况

- 上游 `console.warn/throw` 里的开发者调试文案（约 130 条）**故意不译**：它们只在控制台出现，翻译反而妨碍排错
- 少量专有名词保留原文：`EP`/`AP`/`HP`/`MP`/`XP`、作者名、`Miktaew`
- 文本以简体中文与全角标点为准；数值、版本号、时间格式保持原样

---

以下为上游 README 原文：

# yet another idle rpg
###### by Miktaew


### Still in development.

Official repo: https://github.com/miktaew/yet-another-idle-rpg  
Official release: https://miktaew.github.io/yet-another-idle-rpg/  
  
  
Dev repo: https://github.com/miktaew/yet-another-idle-rpg-dev  
Dev release: https://miktaew.github.io/yet-another-idle-rpg-dev/  


---
Be warned, the game balance remains a WIP
Using the "export" feature every now and then is highly recommended, even on main release, since there's always a risk of some gamebreaking bugs having made it through the testing undetected

---
##### Running
To run the project locally, you will need a server - even a most basic static server will be enough, as it's only about CORS policy. Npm module 'live-server' works perfectly for this purpose https://www.npmjs.com/package/live-server

##### Modifying/Modding and making standalone projects using this as an engine
Making actual changes in code will require either running the build script (`npm run build`) after installing esbuild, or simply changing script source in `index.html` from `dist/bundle.js` to `src/main.js`

When creating content or changing code logic, it's recommended to at the very least take a look at the dev repository, as there's always a possibility it already contains things you wanted to add, or has code changes that will make your work easier, or at least has a fix to a bug you found

Please keep in mind that the default branch you will see here is the `master` branch, while the one that's hosted is the `gh-pages` branch; on dev, the former might often have code that does yet not correspond to what you will see while playing

Consider also calling `Verify_Game_Objects()` in the console, which is a custom built-in tool that will go through most of the content, checking things like properties having acceptable values, or references to other objects being correct. While neither infallible nor covering *everything*, it might save you a lot of time and annoyance.

###### If you make an actual mod, it will be highly appreciated if you mention that it is a mod and not a completely original creation, as well as provide a link to the original. If you can, please also make make it as a fork of either repository, or at least let me know about its existence.


---

## 简体中文汉化（Chinese Localization）

本仓库为上游 `miktaew/yet-another-idle-rpg` 的简体中文汉化版，中文译名：**《又一个放置RPG》**。

- 汉化依据上游仓库：`LinLei0102/yet-another-idle-rpg`，commit `e3356432ad5112f30842cfe6a6b5c3a4ced77de9`（游戏版本 `v0.5.5.30`）
- 汉化路线：**路线 I（内置 i18n 语言包）+ 路线 O（运行时覆盖层）混合**
  - `locales/chinese.js`：对话、种族、属性、技能、生平共 602 个 key 的中文语言包（只翻 value，key 不动）
  - `zh-cn-dict.js` + `zh-cn.js`：源码里硬编码的展示文本（物品、地点、技能说明、提示框、UI 文案、动态数值模板）通过 DOM 覆盖层翻译，MutationObserver 微任务内同步替换，不闪英文
  - `help.html`：游戏内帮助页为独立静态页，不走覆盖层，直接按原文逐段替换翻译（127 段），保留原标记与折叠脚本；英文原文另存为 `help-en.html`，页面右上角「English / 中文」互跳

### 语言切换

游戏内 → 右下角齿轮（选项）→ 勾选框「中文界面 / Simplified Chinese」：

- **勾选**＝简体中文（默认），**取消勾选**＝切回英文原文对照
- 切换后页面自动重载；偏好写入 `localStorage["yairpg_language"]`，与存档中的旧语言值解耦

### 本地启动

游戏用 ES module 加载，必须通过 HTTP 打开（`file://` 会被 CORS 拦掉，表现为黑屏或脚本不执行）：

```bash
node tools/serve.mjs 8080        # 默认只监听 127.0.0.1
HOST=0.0.0.0 node tools/serve.mjs 8080   # 需要在局域网/手机上玩时
```

然后浏览器打开 <http://127.0.0.1:8080/>。

### 构建

仓库本身不含 `package.json`，构建需要 esbuild：

```bash
npm i esbuild                 # 在仓库外的父目录装，或自行放入 node_modules
node tools/build.mjs          # 打包 src/main.js → dist/bundle.js 并同步 index.html 的版本号
node tools/build_zh.mjs       # 由翻译分片生成 zh-cn-dict.js 与 locales/chinese.js
```

不想打包时，也可以把 `index.html` 里的 `dist/bundle.js` 换成 `src/main.js`（上游 README 记载的做法），语言包与覆盖层照常生效。

### 残局存档

`save/import.html` 提供免安装的存档导入页（存档已内联，离线双击可用）：

- 写入 `localStorage["save data"]` 这一个存档位，**不覆盖**其它存档位
- 导入后：等级 30、60 项技能高等级、61 个地点解锁，方便直接查看后期内容的汉化
- 导入前建议先在游戏内点「导出」备份自己的存档；恢复用「导入」载入备份文件

### 跟版维护

1. `git fetch upstream && git merge`（或 cherry-pick）上游改动
2. 跑 `node tools/extract.mjs yet-another-idle-rpg` 重新提取文案，与新词典做差集
3. 只翻译新增/变更条目，写入 `work/zh/*.json`，再执行 `node tools/build_zh.mjs`
4. 用 `node tools/sweep.mjs` 与 `node tools/verify-endgame.mjs` 复查残余英文
5. 上游新增 key 时，语言包缺键会**回退英文**（`src/translation.js` 已加 try/catch 兜底），不会显示 `undefined`，也不会卡在加载界面

### 已知限制

- 少量条目故意保留英文：`EP`/`AP`/`HP`/`XP` 等缩写、作者名 `Miktaew`、`mofu` 拟声、作者自留的 `(tbc)` 待补标记
- 中文比英文宽，部分密集面板（背包右侧价格、排序按钮）在窄分辨率下会有轻微挤压，属原始布局限制
- 存档结构随上游版本变化；残局存档文件名带版本号 `endgame-v0.5.5.30.json`，跨版本导入前请先备份

### 许可与致谢

游戏版权与许可见 `LICENSE`，归原作者 Miktaew 所有；汉化只覆盖展示文本层，未改动任何玩法逻辑与数值。字体沿用仓库自带的 `resources/fonts/Inkfree.ttf`。
