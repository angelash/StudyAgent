# 页面与路由职责

Next.js App Router 静态提取。页面存在不意味着所有身份都可进入；权限由前端会话与后端Guard/领域断言共同决定。

## /admin/accounts

类型：页面。实现：[apps/web/app/admin/accounts/page.tsx](../../../apps/web/app/admin/accounts/page.tsx)。

- 直接引用：`react`、`next/link`、`../../../lib/api`、`../../../components/study-nav`、`../../student/assessment/studio.css`、`../workbench.css`

## /admin/analytics

类型：页面。实现：[apps/web/app/admin/analytics/page.tsx](../../../apps/web/app/admin/analytics/page.tsx)。

- 直接引用：`react`、`next/link`、`next/navigation`、`../../../lib/api`、`@study-agent/contracts`

## /admin/content

类型：页面。实现：[apps/web/app/admin/content/page.tsx](../../../apps/web/app/admin/content/page.tsx)。

- 直接引用：`react`、`next/link`、`@study-agent/contracts`、`../../../components/formula-input`、`../../../components/question-renderer`、`../../../lib/api`

## /admin/curriculum

类型：页面。实现：[apps/web/app/admin/curriculum/page.tsx](../../../apps/web/app/admin/curriculum/page.tsx)。

- 直接引用：`react`、`next/link`、`@study-agent/contracts`、`../../../lib/api`、`../../../components/study-nav`、`./package-panel`、`./teaching-editor`、`./component-binding-editor`、`./material-coverage`、`./mapping-worklist`、`../../student/assessment/studio.css`、`../workbench.css`、`./curriculum.css`

## /admin/gesp

类型：页面。实现：[apps/web/app/admin/gesp/page.tsx](../../../apps/web/app/admin/gesp/page.tsx)。

- 直接引用：`react`、`next/link`、`@study-agent/contracts`、`../../../lib/api`、`../../../lib/session-user`、`../../../components/study-nav`、`../../student/assessment/studio.css`、`../workbench.css`、`./gesp.css`

## /admin/imports

类型：页面。实现：[apps/web/app/admin/imports/page.tsx](../../../apps/web/app/admin/imports/page.tsx)。

- 直接引用：`react`、`next/link`、`@study-agent/contracts`、`../../../lib/api`、`../../../components/study-nav`、`../../student/assessment/studio.css`、`../workbench.css`、`./imports.css`

## /admin/measurement

类型：页面。实现：[apps/web/app/admin/measurement/page.tsx](../../../apps/web/app/admin/measurement/page.tsx)。

- 直接引用：`react`、`next/link`、`@study-agent/contracts`、`../../../lib/api`、`../../../components/study-nav`、`../../../components/rich-math`、`../../../components/question-renderer`、`../../student/assessment/studio.css`、`../workbench.css`、`./measurement.css`

## /admin/reviews

类型：页面。实现：[apps/web/app/admin/reviews/page.tsx](../../../apps/web/app/admin/reviews/page.tsx)。

- 直接引用：`react`、`next/link`、`@study-agent/contracts`、`../../../lib/api`、`../../../lib/learning`、`../../../components/question-renderer`、`../../../components/answer-evidence-view`、`../../../components/study-nav`、`../../student/assessment/studio.css`、`../workbench.css`、`./reviews.css`

## /learn

类型：页面。实现：[apps/web/app/learn/page.tsx](../../../apps/web/app/learn/page.tsx)。

- 直接引用：`./screen`

## /library

类型：页面。实现：[apps/web/app/library/page.tsx](../../../apps/web/app/library/page.tsx)。

- 直接引用：`./studio`

## /

类型：页面。实现：[apps/web/app/page.tsx](../../../apps/web/app/page.tsx)。

- 直接引用：`next/link`、`../components/study-nav`、`./student/assessment/studio.css`、`./student/today/today.css`、`./welcome.css`

## /parent/access

类型：页面。实现：[apps/web/app/parent/access/page.tsx](../../../apps/web/app/parent/access/page.tsx)。

- 直接引用：`react`、`next/link`、`@study-agent/contracts`、`../../../lib/api`、`../../../lib/learning`、`../../../components/study-nav`、`../../../lib/session-user`、`../../../components/student-learning-access`、`../../student/assessment/studio.css`、`../../admin/workbench.css`、`./access.css`

## /parent/dashboard

类型：页面。实现：[apps/web/app/parent/dashboard/page.tsx](../../../apps/web/app/parent/dashboard/page.tsx)。

- 直接引用：`./studio`

## /parent/data

类型：页面。实现：[apps/web/app/parent/data/page.tsx](../../../apps/web/app/parent/data/page.tsx)。

- 直接引用：`react`、`next/link`、`@study-agent/contracts`、`../../../lib/api`、`../../../lib/session-user`、`../../../components/study-nav`、`../../student/assessment/studio.css`、`./privacy.css`

## /parent/gesp

类型：页面。实现：[apps/web/app/parent/gesp/page.tsx](../../../apps/web/app/parent/gesp/page.tsx)。

- 直接引用：`react`、`next/link`、`../../../components/study-nav`、`../../../lib/api`、`../../../lib/session-user`、`../../student/gesp/gesp-student.css`

## /parent/login

类型：页面。实现：[apps/web/app/parent/login/page.tsx](../../../apps/web/app/parent/login/page.tsx)。

- 直接引用：`react`、`next/link`、`next/navigation`、`../../../lib/api`、`../../../lib/session-user`、`../../../components/learning-login.css`

## /student/assessment

类型：页面。实现：[apps/web/app/student/assessment/page.tsx](../../../apps/web/app/student/assessment/page.tsx)。

- 直接引用：`./studio`

## /student/gesp

类型：页面。实现：[apps/web/app/student/gesp/page.tsx](../../../apps/web/app/student/gesp/page.tsx)。

- 直接引用：`react`、`next/link`、`../../../components/study-nav`、`../../../lib/api`、`../../../lib/session-user`、`./gesp-student.css`

## /student/knowledge

类型：页面。实现：[apps/web/app/student/knowledge/page.tsx](../../../apps/web/app/student/knowledge/page.tsx)。

- 直接引用：`next/navigation`

## /student/login

类型：页面。实现：[apps/web/app/student/login/page.tsx](../../../apps/web/app/student/login/page.tsx)。

- 直接引用：`react`、`next/link`、`next/navigation`、`../../../lib/api`、`../../../lib/session-user`、`../../../components/learning-login.css`

## /student/mission

类型：页面。实现：[apps/web/app/student/mission/page.tsx](../../../apps/web/app/student/mission/page.tsx)。

- 直接引用：`next/navigation`

## /student/today

类型：页面。实现：[apps/web/app/student/today/page.tsx](../../../apps/web/app/student/today/page.tsx)。

- 直接引用：`./studio`

## /studio/classroom

类型：页面。实现：[apps/web/app/studio/classroom/page.tsx](../../../apps/web/app/studio/classroom/page.tsx)。

- 直接引用：`./workbench`

## /studio/classroom/runner

类型：受控HTTP处理器。实现：[apps/web/app/studio/classroom/runner/route.ts](../../../apps/web/app/studio/classroom/runner/route.ts)。

- 直接引用：

## /studio

类型：页面。实现：[apps/web/app/studio/page.tsx](../../../apps/web/app/studio/page.tsx)。

- 直接引用：`./studio`

## /studio/projects

类型：页面。实现：[apps/web/app/studio/projects/page.tsx](../../../apps/web/app/studio/projects/page.tsx)。

- 直接引用：`./workbench`

## /studio/source-courses

类型：页面。实现：[apps/web/app/studio/source-courses/page.tsx](../../../apps/web/app/studio/source-courses/page.tsx)。

- 直接引用：`./workbench`

## /studio/whiteboards

类型：页面。实现：[apps/web/app/studio/whiteboards/page.tsx](../../../apps/web/app/studio/whiteboards/page.tsx)。

- 直接引用：`./workbench`
