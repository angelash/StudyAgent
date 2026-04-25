# 题源许可与接入索引

最后核验日期：`2026-04-25`

本文件用于沉淀后续题库扩充时可以直接调取的外部题源索引。代码侧同步注册表位于：

- `apps/api/src/modules/content/open-resource-registry.ts`

## 可作为开放内容补充的来源

| 来源 | 适用学科 | 建议分类 | 许可/边界 | 官方链接 |
|---|---|---|---|---|
| OpenStax | 英语、数学 | `B_OPEN` | 书目级开放许可，导入时需保留署名与具体 license | https://help.openstax.org/s/article/Openstax-textbook-licensing-and-customization |
| OER Commons | 语文、数学、英语 | `B_OPEN` | 仅引入明确开放许可条目，按资源单独保留 license | https://help.oercommons.org/support/solutions/articles/42000107074-oer-commons-collection-policy |

## 仅在非商业边界下谨慎使用的来源

| 来源 | 适用学科 | 建议分类 | 边界说明 | 官方链接 |
|---|---|---|---|---|
| CK-12 | 数学、英语 | `B_OPEN` | 适合作为开放内容参考，但需核对非商业及素材边界，不作为主线题源 | https://info.ck12.org/terms-of-use |

## 只可做参考、不纳入题库导入的来源

| 来源 | 建议分类 | 原因 | 官方链接 |
|---|---|---|---|
| 国家中小学智慧教育平台 | `C_PUBLIC_REFERENCE_ONLY` | 适合教研参考与链接跳转，未获授权前不做批量抓取或重建型题库 | https://user.smartedu.cn/register |
| Khan Academy | `C_PUBLIC_REFERENCE_ONLY` | 官方条款明确限制 scraping 以及将内容用于训练/开发 AI | https://support.khanacademy.org/hc/en-us/articles/42929097425037-What-s-allowed-and-not-allowed-under-Khan-Academy-s-Terms-of-Service |

## 接入策略

1. 主线题库优先使用 `A_INTERNAL`：本地教材、教材候选题、内部原创与教研改写题。
2. 开放资源只作为 `B_OPEN` 补充来源，且必须保留 `sourceName`、`sourcePathOrUrl`、`licenseName`。
3. 公开可访问但未明确授权的资源，统一归档为 `C_PUBLIC_REFERENCE_ONLY`，只能做教研参考。
4. 若后续接入商业合作方，统一纳入 `D_COMMERCIAL_PARTNER`，并保留合同或 API 授权边界。

## 当前系统使用方式

1. 题库补齐服务会优先引用本地教材作为主来源。
2. 当知识点缺少本地教材上下文时，可退回到开放内容索引选择 `B_OPEN` 资源做补充参考。
3. 所有生成题都会在 `QuestionSourceRecord` 中写入来源路径、许可类别与备注。
