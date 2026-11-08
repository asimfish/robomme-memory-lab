# Astra Memory Lab

Franka + Astra 记忆 harness 的实验设计与记录网页。纯静态 HTML / CSS / JavaScript，适合 GitHub Pages 项目路径，无运行时依赖、数据库或访问令牌。

## 页面

- 实验总览与主要 Baseline。
- T1–T7 核心任务、T8 可选任务、逐任务设置与准备进度。
- RoboMME-Plus 全部 16 项任务的设计对应和明确缺口。
- 逐回合实验记录、按条件汇总的成功率和有效样本数。
- 评测协议、预算估算、JSON / CSV 导入导出。

## 本地运行

需要 Node.js 22 与 Python 3。

~~~sh
npm run check
npm test
npm run serve
~~~

打开 http://localhost:4173。请通过 HTTP 加载网页数据。

## 发布到 GitHub Pages

1. 创建仓库，把这些文件提交到 main 分支。
2. 在仓库 Settings → Pages → Build and deployment → Source 选择 GitHub Actions。
3. 运行 Actions → Publish experiment board，或推送一次修改。
4. 工作流只上传 site/，检查脚本与数据验证通过后部署。

项目站点通常为 https://OWNER.github.io/REPOSITORY/，以 Pages 返回的实际地址为准。启用 Pages 的仓库必须符合当前 GitHub 账户和仓库类型的要求。

## 日常维护

共享数据为 [site/data/project.json](site/data/project.json)。

**直接维护：** 在 GitHub 编辑这个 JSON 并提交。任务的状态、负责人、条件、道具、指标、备注均在任务对象中，逐回合结果在 trials 中。

**从网页维护：**

1. 在网页勾选准备项、修改状态与备注，或录入执行记录。
2. 网页修改仅保存到当前浏览器的本机草稿，其他人不会立即看到。
3. 点击“导出 project.json”，替换仓库的 site/data/project.json 并提交。
4. Actions 自动验证和发布。确认提交成功后，可在网页“恢复仓库版本”清除旧本机草稿。

导入 JSON 会整体替换本机草稿。多人协作时先拉取最新仓库文件，再合并修改。网页会检测已有本机草稿是否基于旧仓库版本，但不自动合并冲突。

视频和原始采集保留在各自存储位置；网页只记录链接。访问令牌、登录信息或未授权发布的文件不应进入仓库。

## 统计口径

- 初始计划没有任何真实实验结果；“待测”不等于 0%。
- 只有正式测试且非无效回合的执行进入正式 SR 分母。
- success 为自主成功；failure 与 intervened 均不算自主成功。
- invalid 必须保留排除理由；排除规则需要在正式测试前确定。
- 同一任务、条件、方法、场景、重复编号和阶段不能重复录入。
- 每条件每方法无重复场景时展示 95% Wilson 区间；有重复场景则不显示假设独立执行的区间。
- 场景配对差异及重复场景的聚类区间需另外分析，本页不把相关执行当独立样本。
- 结果列表按结果类型筛选不会改变 SR 汇总的分母。

## 数据版本

schemaVersion 当前为 1。meta.repositoryUrl 用于生成源码与 GitHub 编辑入口。每次录入建议填写准确模型版本和提示 / 配置版本。

任务条件中的建议数量不代表已经冻结的正式 protocol。覆盖矩阵只描述设计对应关系，缺口包括 SwingXtimes、InsertPeg 及部分动态 / 工具变体。

## 文件

~~~text
site/                     GitHub Pages 实际发布内容
  data/project.json       方案、任务、进度与真实记录
  index.html
  styles.css
  app.js
  model.js                数据验证、导出与统计
scripts/check.mjs         静态文件与数据检查
tests/model.test.mjs      记录、统计与导入边界检查
.github/workflows/pages.yml
~~~

网页不提供匿名访客直接写入 GitHub 的能力；共享修改通过 Git 提交管理。工作区的 .local/ 仅供本机工具和临时验证，已排除在 Git 之外。
