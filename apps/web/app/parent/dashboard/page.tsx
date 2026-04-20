'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AssistantWidget } from '../../../components/assistant-widget';
import { apiRequest, getAuthToken, getCurrentUser } from '../../../lib/api';

type User = {
  id: string;
  role: string;
  displayName: string;
};

type ChildProfile = {
  id: string;
  nickname: string;
  grade: number;
  enrollments: Array<{ subject: string; enabled: boolean; textbookVersionId: string }>;
};

type Volume = {
  id: string;
  subject: string;
  displayName: string;
};

export default function ParentDashboardPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [childrenProfiles, setChildrenProfiles] = React.useState<ChildProfile[]>([]);
  const [volumes, setVolumes] = React.useState<Volume[]>([]);
  const [nickname, setNickname] = React.useState('小明');
  const [grade, setGrade] = React.useState(3);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function bootstrap() {
      try {
        setError(null);
        const currentUser = getCurrentUser<User>();
        if (!currentUser) {
          router.push('/parent/login');
          return;
        }

        setUser(currentUser);
        const [childrenResult, volumesResult] = await Promise.all([
          apiRequest<ChildProfile[]>(`/parents/${currentUser.id}/students`, {}, getAuthToken()),
          apiRequest<Volume[]>('/textbooks', {}),
        ]);
        setChildrenProfiles(childrenResult);
        setVolumes(volumesResult.filter((item) => item.subject === 'math'));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '家长控制台加载失败');
      }
    }

    void bootstrap();
  }, [router]);

  async function createStudent() {
    if (!user) {
      return;
    }

    try {
      setError(null);
      const mathVolume = volumes[0];
      const created = await apiRequest<{ profile: ChildProfile }>(
        '/students',
        {
          method: 'POST',
          body: JSON.stringify({
            nickname,
            grade,
            preferredSessionMinutes: 20,
            defaultVersionMap: {
              chinese: 'chinese-dev-version',
              math: mathVolume?.id ?? 'math-dev-version',
              english: 'english-dev-version',
            },
          }),
        },
        getAuthToken(),
      );

      setChildrenProfiles((items) => [...items, created.profile]);
      setMessage(`已创建学生档案：${created.profile.nickname}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建学生档案失败');
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 920 }}>
      <h1>家长控制台</h1>
      <p style={{ color: '#475569' }}>这里可以建学生档案、进入学生任务页，也能通过悬浮助教快速理解怎么陪孩子。</p>

      <section style={{ marginTop: 28, padding: 20, borderRadius: 20, background: '#ffffff', border: '1px solid #e2e8f0' }}>
        <h2>创建学生档案</h2>
        <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="学生昵称" />
          <input
            type="number"
            value={grade}
            onChange={(event) => setGrade(Number(event.target.value))}
            placeholder="年级"
          />
          <button
            onClick={createStudent}
            style={{ border: 'none', borderRadius: 12, padding: '10px 14px', background: '#0f766e', color: '#fff' }}
          >
            创建
          </button>
          {message ? <div style={{ color: '#0f766e' }}>{message}</div> : null}
          {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>孩子列表</h2>
        <div style={{ display: 'grid', gap: 16 }}>
          {childrenProfiles.map((child) => (
            <div key={child.id} style={{ padding: 20, borderRadius: 20, background: '#fff', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{child.nickname}</div>
              <div style={{ color: '#475569', marginTop: 6 }}>年级：{child.grade}</div>
              <div style={{ marginTop: 12 }}>
                <a
                  href={`/student/mission?studentId=${child.id}`}
                  style={{ display: 'inline-block', padding: '10px 14px', borderRadius: 12, background: '#0f172a', color: '#fff' }}
                >
                  进入学生任务页
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <AssistantWidget
        userRole="parent"
        studentId={childrenProfiles[0]?.id ?? null}
        pageContext="weekly_report"
        title="家长助教"
        subtitle="问我：现在我该怎么陪孩子"
      />
    </main>
  );
}
